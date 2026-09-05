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
 *  3. 실측(2026-09-05) 두 컬럼은 현재 전 유저에서 **같은 날짜**다. 차이는 재연동 시나리오에서만
 *     생기므로 위 단조성 논거가 유일한 선택 근거다.
 *
 * ## ⚠️ 「가입 이전 활동은 비정상 경로로만 들어온다」는 **사실이 아니다**
 *
 * 첫 싱크가 **정산**하는 건 최신 1건이지만 **저장**은 이력 전체를 한다. 그래서 가입 이전
 * 활동이 정상 경로로 대량 들어온다 — 프로덕션 실측(2026-09-05): 873건 중 **665건(76%)**이
 * `users.created_at` 이전이고, 유저별로 79%·84%·61%가 잘리며 한 유저는 **137건 전부**가
 * 가입 이전이다. (초안 주석이 이걸 「비정상 경로뿐」이라고 단정했으나 실데이터가 반증했다.)
 *
 * ## 알려진 귀결 — 첫 싱크 정산분이 누적 이력에서 빠진다
 *
 * 첫 싱크가 정산하는 «마지막 활동 1건»은 대개 가입 **직전** 활동이라 이 앵커 밖으로 나간다.
 * 그래서 그 활동으로 받은 배지는 남지만 누적 축(누적 거리·횟수 등)에는 잡히지 않는다.
 * 실측에서 한 유저는 35건 중 1건만 가입 이전인데 그 1건이 정확히 첫 싱크 정산분이다.
 *
 * **이건 결함이 아니라 두 확정 사항이 만나는 지점이다** — 마스터 티켓의 「과거 이력은 아예
 * 배제」와 「첫 싱크는 마지막 활동 1건만 정산」. 앵커를 그 1건까지 완화하는 안(= 가입 이전 활동
 * 중 가장 최근 것까지 포함)은 검토했으나 **채택하지 않았다**: 「가입 시점부터 카운트」를
 * 임의로 약화시키는 결정이고, 완화 여부는 스펙 소유자가 정할 사항이다.
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

  // 시간 오름차순 고정. 지금까지 정렬이 없었고 소비처들이 각자 방어적으로 정렬해 왔지만
  // (`calcMaxStreak`·`collectRepeatOccurrences`), 휴식 조건(티켓 20260905_0030 §4)은
  // **인접 활동 사이의 간격**을 보므로 정렬이 판정의 전제다. 여기서 한 번 고정해 두지 않으면
  // 「가끔만 틀리는」 판정이 된다(B2 개선 리뷰).
  const { data, error } = await query.order('start_date', { ascending: true })
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
