/**
 * 배지 포인트 일괄 값 로딩 (티켓 20261022_1135 1회, 운영 로직 10.5·11.4·14.1·19.1절)
 *
 * `badge_point_policy` id=1 한 행 싱글톤(마이그레이션 288)을 읽는다. 등급별(Common·Rare·Epic·Mystic) 포인트와 레벨형 액티비티의 레벨마다 포인트, 5칸이다.
 * 이 값은 **새 배지의 기본값**이다 — 어드민 배지 양식의 포인트 칸 초깃값과, 배지 생성 API가 `point_reward`를 생략했을 때 채우는 값으로만 읽힌다.
 * 이미 있는 배지의 `badges.point_reward`는 바뀌지 않고(기존 배지에 적용하는 일은 별도 SQL), 지급 코드는 배지를 받는 때 `badges.point_reward`를 읽는다.
 * 숨김 배지는 마이그레이션 243의 제약으로 항상 0이라 이 표에 칸이 없다(`lib/admin/badge-point-defaults.ts`가 0으로 처리한다).
 *
 * service_role 클라이언트 전용이고 서버에서만 쓴다. `jam/policy.ts`의 `getJamPolicy`와 같은 패턴이다 — 조회가 실패하거나 값이 비정상이면 코드 기본값으로 대체하고 로그를 남긴다.
 * 배지 양식이 열리고 배지가 만들어지는 일이 설정 조회 실패로 멈추면 안 되기 때문이다(표가 아직 없는 배포 구간 포함).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'

export interface BadgePointPolicy {
  /** Common 배지의 포인트 */
  common_points: number
  /** Rare 배지의 포인트 */
  rare_points: number
  /** Epic 배지의 포인트 */
  epic_points: number
  /** Mystic 배지의 포인트 */
  mystic_points: number
  /** 레벨형 액티비티 배지의 레벨마다 포인트 */
  leveled_points: number
}

/**
 * `badge_point_policy` id=1 행의 **미러** — 마이그레이션 288의 DEFAULT(운영 로직 10.5·11.4·14.1절)와 같아야 한다.
 * DB 기본값을 바꾸면 같은 티켓에서 이 상수도 함께 바꾼다(시험이 288 파일의 DEFAULT 리터럴과 대조한다). 한쪽만 바꾸면 폴백 경로와 정상 경로의 기본값이 갈린다.
 */
export const DEFAULT_BADGE_POINT_POLICY: BadgePointPolicy = {
  common_points: 10,
  rare_points: 20,
  epic_points: 50,
  mystic_points: 100,
  leveled_points: 10,
}

/** 칸 이름. 화면 순서(Common → Rare → Epic → Mystic → 레벨형)와 같다. */
export const BADGE_POINT_POLICY_KEYS = [
  'common_points',
  'rare_points',
  'epic_points',
  'mystic_points',
  'leveled_points',
] as const satisfies readonly (keyof BadgePointPolicy)[]

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다. `BADGE_POINT_POLICY_KEYS`와 같아야 하고 시험이 지킨다). */
export const BADGE_POINT_POLICY_SELECT = 'common_points, rare_points, epic_points, mystic_points, leveled_points'

/** 칸 값 검사 — DB CHECK(0 이상)와 같다. 통과하지 못하면 그 칸만 기본값으로 대체한다. */
export function isValidBadgePoints(n: number): boolean {
  return Number.isInteger(n) && n >= 0
}

/**
 * 배지 포인트 일괄 값을 읽는 **정식 경로**. 폴백·관측이 모두 여기에 있다.
 *
 * @param client 이미 만들어 둔 Supabase 클라이언트. 생략하면 service_role 클라이언트를 새로 만든다.
 */
export async function getBadgePointPolicy(client?: SupabaseClient): Promise<BadgePointPolicy> {
  try {
    const supabase = client ?? createServiceClient()
    const { data, error } = await supabase.from('badge_point_policy').select(BADGE_POINT_POLICY_SELECT).eq('id', 1).single()
    if (error) {
      console.error('[badge-point-policy] 조회 실패 — 기본값으로 폴백:', error)
      return { ...DEFAULT_BADGE_POINT_POLICY }
    }
    if (!data) {
      console.error('[badge-point-policy] id=1 행이 없음 — 기본값으로 폴백')
      return { ...DEFAULT_BADGE_POINT_POLICY }
    }

    const row = data as unknown as Record<string, unknown>
    const normalized = {} as BadgePointPolicy
    const fellBack: string[] = []
    for (const key of BADGE_POINT_POLICY_KEYS) {
      const v = row[key]
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      if (!isValidBadgePoints(n)) {
        normalized[key] = DEFAULT_BADGE_POINT_POLICY[key]
        fellBack.push(key)
        continue
      }
      normalized[key] = n
    }
    if (fellBack.length > 0) {
      console.error(`[badge-point-policy] DB 값을 읽지 못하거나 비정상이라 기본값으로 대체한 항목: ${fellBack.join(', ')}`)
    }
    return normalized
  } catch (e) {
    console.error('[badge-point-policy] 조회 중 예외 — 기본값으로 폴백:', e)
    return { ...DEFAULT_BADGE_POINT_POLICY }
  }
}
