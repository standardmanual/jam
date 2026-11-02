/**
 * 배지 읽기 API의 입력 읽기 (티켓 20261102_1602). 저장하지 않는다.
 *
 * - `badges`: `type = 'activity'`이고 삭제·숨김이 아닌 것(계열 화면과 같은 칸 + `is_hidden`).
 * - `user_activity_badges`: `id`·`badge_id` 두 칸만 읽어 배지별 행 수로 센다. `user_id` 등 유저 칸은 select 목록에 없다.
 * 모든 읽기는 `fetchAllRows`(1,000행 쪽 읽기)를 거친다. 원천 하나라도 읽지 못하면 던진다(획득 수 0으로 바꿔 숨기지 않는다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/db/fetchAllRows'
import type { OpsBadgeInput } from './compute'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 계열 화면(`FAMILY_BADGE_COLUMNS`)과 같은 칸 + `is_hidden` */
const BADGE_COLUMNS =
  'id, name, description, rarity, level, family_key, sort_order, image_url, condition_json, activity_types, deleted_at, admin_category, is_hidden'

export const BADGES_LOAD_FAILED_MESSAGE = '배지 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

export interface BadgeInputs {
  badges: OpsBadgeInput[]
  earnedByBadge: Map<string, number>
}

export async function loadBadgeInputs(supabase: ServiceClient): Promise<BadgeInputs> {
  const [rawBadges, earns] = await Promise.all([
    fetchAllRows('ops-badges:badges', 'id', () =>
      supabase
        .from('badges')
        .select(BADGE_COLUMNS)
        .eq('type', 'activity')
        .is('deleted_at', null)
        .eq('is_hidden', false)
    ),
    fetchAllRows<{ id: string; badge_id: string }>('ops-badges:earns', 'id', () =>
      supabase.from('user_activity_badges').select('id, badge_id')
    ),
  ])

  // 생성 타입의 `condition_json`은 Json이라 도메인 타입(BadgeCondition)과 모양만 다르다 — 계열 화면(`badge-families-query.ts`)과 같은 캐스팅이다.
  const badges = rawBadges as unknown as OpsBadgeInput[]
  const earnedByBadge = new Map<string, number>()
  for (const earn of earns) earnedByBadge.set(earn.badge_id, (earnedByBadge.get(earn.badge_id) ?? 0) + 1)
  return { badges, earnedByBadge }
}
