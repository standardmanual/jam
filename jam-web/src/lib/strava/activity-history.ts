/**
 * strava_activities에 저장된 유저의 정규화 활동 이력 조회.
 * 배지/미션의 누적·기간 조건(주 N회, 연속 N일, 월 N km 등)을 "이번 동기화 배치"가
 * 아니라 실제 이력 전체 기준으로 평가하기 위한 소스.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedActivity } from '@/types/strava'
import type { StravaActivityRow } from '@/types/database'

/**
 * 가입 시점 앵커 — 누적 조건이 바라보는 이력의 시작점 (티켓 20260905_0030 §5).
 *
 * v5 확정 사항은 「과거 이력은 아예 배제 — 가입 시점부터 카운트」다. 지금까지는
 * `getActivityHistory`의 3번째 인자를 아무도 넘기지 않아 **"strava_activities에는 가입 이후
 * 활동만 들어 있다"는 암묵적 불변식**에 기대고 있었다. 어드민 재동기화·백필·시뮬레이터가
 * 과거 활동을 주입하면 그 불변식이 즉시 깨지고 누적 조건이 소급 충족된다.
 *
 * **앵커 컬럼은 `users.created_at`이다.** `strava_connections.created_at`을 쓰지 않은 이유:
 *  1. 마스터 티켓의 확정 문구가 「가입 시점」이고, JAM! 가입 시각을 담는 컬럼은 이것 하나다.
 *  2. **앵커는 단조여야 한다.** `users` 행은 유저당 하나이고 재생성되지 않는다. 반면
 *     `strava_connections`는 다른 Strava 계정으로 연동하면 새 행이 되어 `created_at`이 앞으로
 *     점프하고, 그 순간 이미 쌓인 정당한 이력이 평가 창에서 통째로 빠진다(누적 진행률 되감김).
 *  3. 「가입 후 연동 전」 구간의 활동이 창에 남는 것은 사실이나, 정상 경로로는 들어오지
 *     않는다 — 첫 싱크는 최신 1건만 반영한다(`sync.ts`). 남는 건 백필/시뮬레이터라는
 *     비정상 경로뿐이고, 그건 앵커가 아니라 그 경로 자체에서 다룰 문제다.
 *
 * 조회 실패·값 없음은 `undefined`로 폴백한다(= 필터 없음, 기존 동작). 여기서 빈 이력으로
 * 떨어뜨리면 일시적 DB 오류가 「배지가 사라졌다」로 보인다.
 */
export async function getSignupAnchorDate(
  supabase: SupabaseClient,
  userId: string
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('users')
    .select('created_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[getSignupAnchorDate] 가입 시각 조회 오류 — 앵커 없이 진행:', error)
    return undefined
  }
  return (data as { created_at?: string | null } | null)?.created_at ?? undefined
}

export async function getActivityHistory(
  supabase: SupabaseClient,
  userId: string,
  sinceDate?: string
): Promise<NormalizedActivity[]> {
  let query = supabase
    .from('strava_activities')
    .select('normalized, start_date')
    .eq('user_id', userId)

  if (sinceDate) {
    query = query.gte('start_date', sinceDate)
  }

  const { data, error } = await query
  if (error) {
    console.error('[getActivityHistory] 조회 오류 — 빈 이력으로 폴백:', error)
    return []
  }

  return (data as Pick<StravaActivityRow, 'normalized' | 'start_date'>[])
    .map((row) => row.normalized as NormalizedActivity)
    .filter((a): a is NormalizedActivity => Boolean(a && a.stravaId))
}

/** 이력 + 이번 배치를 strava_id 기준으로 중복 없이 합친다 (배치가 아직 이력에 기록되기 전이므로 필요) */
export function mergeActivityHistory(
  history: NormalizedActivity[],
  batch: NormalizedActivity[]
): NormalizedActivity[] {
  const byId = new Map<number, NormalizedActivity>()
  for (const a of history) byId.set(a.stravaId, a)
  for (const a of batch) byId.set(a.stravaId, a) // 배치가 최신이므로 우선
  return Array.from(byId.values())
}
