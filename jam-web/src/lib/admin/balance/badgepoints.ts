/**
 * 밸런스 설정 «배지와 포인트» 구역의 연결 (티켓 20261022_1135 1회, 운영 로직 10.5·11.4·14.1·19.1절)
 *
 * `badge_point_policy` id=1 한 행의 **5칸**(마이그레이션 288, 0 이상 정수)을 편집한다: 등급별 포인트 4칸(Common·Rare·Epic·Mystic)과 레벨형 액티비티 배지의 레벨마다 포인트 1칸.
 * 읽는 곳은 `lib/badge/pointPolicy.ts`(`getBadgePointPolicy`)다 — 어드민 배지 양식의 새 배지 포인트 기본값과, 배지 생성 API가 `point_reward`를 생략했을 때 채우는 값이다.
 * **이미 있는 배지의 `badges.point_reward`는 바뀌지 않는다.** 지급 코드는 배지를 받는 때 `badges.point_reward`를 읽으므로 이 값을 바꿔도 이미 받은 배지에 소급되지 않는다.
 * 기존 배지에 일괄 값을 적용하는 일은 별도 SQL(2회)이 맡는다. 숨김 배지는 제약상 항상 0이라 칸이 없다.
 *
 * 읽기·쓰기는 잠긴 아이템 배지 구역(`locked.ts`)과 같은 방식이다 — **가공하지 않은 행**을 읽고(비정상 값을 기본값으로 바꿔 보이지 않는다. 그래서 `getBadgePointPolicy`의 폴백을 쓰지 않는다)
 * `updated_at` 조건으로 갱신한다. 행이 하나뿐이라 구역의 수정 시각이 곧 그 행의 `updated_at`이다.
 * 등급 사이 순서(Common < Rare < …)와 합계는 검사하지 않는다(«등급마다 커진다»는 기본값이지 규칙이 아니다). 확률 안내 페이지가 읽는 칸이 없어 확인창은 쓰지 않는다.
 */
import {
  BADGE_POINT_POLICY_KEYS,
  DEFAULT_BADGE_POINT_POLICY,
  isValidBadgePoints,
} from '@/lib/badge/pointPolicy'
import type { Database } from '@/types/database.generated'
import { dbNumber } from './fields'
import { INTEGER_MAX, type BalanceFieldDef, type BalanceSectionBinding, type BalanceValues } from './types'

export const BADGEPOINTS_SECTION_ID = 'badgepoints'

/** 이 구역이 편집하는 `badge_point_policy` 칸. 화면 순서와 같고 `BadgePointPolicy`의 키 전부다. */
export const BADGEPOINTS_BALANCE_KEYS = BADGE_POINT_POLICY_KEYS

export type BadgePointsBalanceKey = (typeof BADGEPOINTS_BALANCE_KEYS)[number]

export const RARITY_POINTS_GROUP = '등급별 포인트'
export const LEVELED_POINTS_GROUP = '레벨형'

type BadgePointsFieldInit = Pick<BalanceFieldDef, 'label' | 'group' | 'hint'> & { key: BadgePointsBalanceKey }

function badgePointsField({ key, label, group, hint }: BadgePointsFieldInit): BalanceFieldDef {
  return {
    key,
    label,
    unit: '포인트',
    hint,
    group,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_BADGE_POINT_POLICY[key],
    affectsDisclosure: false,
  }
}

const rarityHint = (rarity: string) => `새 ${rarity} 배지의 기본값이에요. 이미 있는 배지는 바뀌지 않아요.`

/** 칸 정의. 범위는 마이그레이션 288의 CHECK와 같다: 0 이상 정수(정수 상한은 DB `INTEGER` 한계). 0이면 포인트를 주지 않는다. */
export const BADGEPOINTS_FIELDS: readonly BalanceFieldDef[] = [
  badgePointsField({ key: 'common_points', label: 'Common', group: RARITY_POINTS_GROUP, hint: rarityHint('Common') }),
  badgePointsField({ key: 'rare_points', label: 'Rare', group: RARITY_POINTS_GROUP, hint: rarityHint('Rare') }),
  badgePointsField({ key: 'epic_points', label: 'Epic', group: RARITY_POINTS_GROUP, hint: rarityHint('Epic') }),
  badgePointsField({ key: 'mystic_points', label: 'Mystic', group: RARITY_POINTS_GROUP, hint: rarityHint('Mystic') }),
  badgePointsField({
    key: 'leveled_points',
    label: '레벨마다',
    group: LEVELED_POINTS_GROUP,
    hint: '새 레벨형 배지의 기본값이에요. 레벨마다 이만큼 받고, 이미 있는 배지는 바뀌지 않아요.',
  }),
]

type BadgePointPolicyUpdate = Database['public']['Tables']['badge_point_policy']['Update']

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다. `BADGEPOINTS_BALANCE_KEYS`와 같아야 하고 시험이 지킨다). */
export const BADGEPOINTS_SELECT = 'common_points, rare_points, epic_points, mystic_points, leveled_points, updated_at'

export const BADGEPOINTS_BINDING: BalanceSectionBinding = {
  id: BADGEPOINTS_SECTION_ID,
  fields: BADGEPOINTS_FIELDS,
  validators: Object.fromEntries(BADGEPOINTS_BALANCE_KEYS.map((key) => [key, isValidBadgePoints])),

  async read(service) {
    const { data, error } = await service.from('badge_point_policy').select(BADGEPOINTS_SELECT).eq('id', 1).maybeSingle()
    if (error) throw new Error(`배지 포인트 조회 실패: ${error.message}`)
    if (!data) throw new Error('배지 포인트 조회 실패: id=1 행이 없음')
    const row: Record<string, unknown> = data
    const values: BalanceValues = {}
    for (const key of BADGEPOINTS_BALANCE_KEYS) {
      const n = dbNumber(row[key])
      if (n === null) throw new Error(`배지 포인트 조회 실패: ${key} 값을 숫자로 읽을 수 없음`)
      values[key] = n
    }
    return { values, updatedAt: data.updated_at }
  },

  async write(service, input) {
    const update: BadgePointPolicyUpdate = { updated_at: input.nextUpdatedAt }
    for (const key of BADGEPOINTS_BALANCE_KEYS) {
      const value = input.values[key]
      if (value !== undefined) update[key] = value
    }
    const { data, error } = await service
      .from('badge_point_policy')
      .update(update)
      .eq('id', 1)
      .eq('updated_at', input.expectedUpdatedAt)
      .select('updated_at')
    if (error) return { ok: false, reason: 'error', message: error.message }
    const row = data?.[0]
    if (!row) return { ok: false, reason: 'conflict' }
    return { ok: true, updatedAt: row.updated_at }
  },
}
