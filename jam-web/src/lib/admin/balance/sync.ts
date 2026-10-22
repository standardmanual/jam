/**
 * 밸런스 설정 «동기화» 구역의 연결 (티켓 20261022_1132 2회, 운영 로직 6.2·6.7·19.1절)
 *
 * `jam_policy` id=1 한 행 중 **동기화 아이템 배지 발급 값**을 편집한다: 확정 개수 2칸(일반 활동·등산), 보너스 3칸(기회·확률 나눗수·확률 상한),
 * 등급 확률 4칸(합 100), 그리고 동기화와 캡슐이 **한 값**으로 쓰는 보정 `common_streak_threshold`와 잠길 확률 `locked_roll_probability`(가정 아). 이 두 칸은 캡슐 구역에서
 * 편집하지 않고 안내만 둔다. 잠긴 아이템 배지 등급별 최소값(`locked_min_*`)은 같은 행이지만 7-2 구역이다.
 *
 * 열한 칸은 모두 확률 안내 페이지가 읽는 칸이다(`lib/probability/disclosure.ts`의 `JAM_COLUMNS`). **«확률 안내에 반영되는 칸»은 그 목록에서 가져오고 여기에 다시 적지 않는다**(단일 원천).
 * 그래서 이 구역에서 어느 칸을 바꿔도 저장 전 확인창이 뜬다.
 *
 * 0개를 허용한다(가정 바): 확정 개수와 보너스 기회가 모두 0이면 «아이템 배지가 나오지 않아요» 경고만 보이고 막지 않는다.
 * 읽기·쓰기는 잼 구역(`jam.ts`)과 같은 방식이다 — **가공하지 않은 행**을 읽고(비정상 값을 기본값으로 바꿔 보이지 않는다) `updated_at` 조건으로 갱신한다.
 * 잼 구역과 이 구역은 **같은 행을 쓰므로 수정 시각도 같다**: 한쪽을 저장하면 다른 쪽 화면의 수정 시각이 낡아 «다른 사람이 먼저 바꿨어요»(409)가 한 번 뜰 수 있다(안전한 쪽 오류).
 */
import { JAM_COLUMNS } from '@/lib/probability/disclosure'
import { DEFAULT_JAM_POLICY, VALIDATORS, type JamPolicy } from '@/lib/jam/policy'
import type { Database } from '@/types/database.generated'
import { dbNumber, validateSumTo100 } from './fields'
import { INTEGER_MAX, type BalanceFieldDef, type BalanceSectionBinding, type BalanceValues } from './types'

export const SYNC_SECTION_ID = 'sync'

/** 이 구역이 편집하는 `jam_policy` 칸. 화면 순서와 같다. */
export const SYNC_BALANCE_KEYS = [
  'sync_item_guaranteed',
  'sync_item_guaranteed_hiking',
  'sync_item_bonus_rolls',
  'sync_item_bonus_jam_divisor',
  'sync_item_bonus_max_probability',
  'sync_rarity_common',
  'sync_rarity_rare',
  'sync_rarity_epic',
  'sync_rarity_mystic',
  'common_streak_threshold',
  'locked_roll_probability',
] as const satisfies readonly (keyof JamPolicy)[]

export type SyncBalanceKey = (typeof SYNC_BALANCE_KEYS)[number]

/** 등급 확률 네 칸. 합이 100이어야 한다. */
export const SYNC_RARITY_KEYS = ['sync_rarity_common', 'sync_rarity_rare', 'sync_rarity_epic', 'sync_rarity_mystic'] as const

/** 확률 안내 페이지가 읽는 `jam_policy` 칸(`JAM_COLUMNS`) — 이 칸을 바꾸면 확률 안내가 함께 바뀐다. */
const DISCLOSED = new Set<string>(JAM_COLUMNS)

const COUNT_GROUP = '확정으로 받는 개수'
const BONUS_GROUP = '보너스'
const RARITY_GROUP = '등급 확률'
const SHARED_GROUP = '캡슐과 함께 쓰는 값'

const PROBABILITY_HINT = '0과 1 사이의 소수로 써요. 0.25는 25%예요.'

type SyncFieldInit = Omit<BalanceFieldDef, 'affectsDisclosure' | 'defaultValue'> & { key: SyncBalanceKey }

function syncField(init: SyncFieldInit): BalanceFieldDef {
  return { ...init, defaultValue: DEFAULT_JAM_POLICY[init.key], affectsDisclosure: DISCLOSED.has(init.key) }
}

/**
 * 칸 정의. 범위는 마이그레이션 227·231의 CHECK와 같다: 개수·기회는 0 이상 정수(0 허용), 확률 나눗수·보정 횟수는 1 이상 정수,
 * 확률 상한과 잠길 확률은 0~1(`NUMERIC(4,3)`, 소수 셋째 자리), 등급 확률은 0 이상(`NUMERIC(6,3)`)이고 합이 100이라 한 칸이 100을 넘을 수 없다.
 */
export const SYNC_FIELDS: readonly BalanceFieldDef[] = [
  syncField({
    key: 'sync_item_guaranteed',
    label: '일반 활동',
    unit: '개',
    hint: '활동 하나마다 확정으로 받는 아이템 배지 수예요. 등산은 아래 칸을 따라요. 0도 쓸 수 있어요.',
    group: COUNT_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
  }),
  syncField({
    key: 'sync_item_guaranteed_hiking',
    label: '등산 활동',
    unit: '개',
    hint: '등산 활동 하나마다 확정으로 받는 아이템 배지 수예요.',
    group: COUNT_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
  }),
  syncField({
    key: 'sync_item_bonus_rolls',
    label: '보너스 기회',
    unit: '번',
    hint: '활동 하나마다 보너스를 굴리는 횟수예요. 0이면 보너스가 없어요.',
    group: BONUS_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
  }),
  syncField({
    key: 'sync_item_bonus_jam_divisor',
    label: '확률 나눗수',
    unit: '잼',
    hint: '보너스 한 번의 확률은 활동의 잼 ÷ 이 값이에요.',
    group: BONUS_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
  }),
  syncField({
    key: 'sync_item_bonus_max_probability',
    label: '확률 상한',
    hint: `보너스 한 번의 확률이 넘을 수 없는 값이에요. ${PROBABILITY_HINT}`,
    group: BONUS_GROUP,
    decimals: 3,
    min: 0,
    max: 1,
  }),
  syncField({ key: 'sync_rarity_common', label: 'Common', unit: '%', group: RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  syncField({ key: 'sync_rarity_rare', label: 'Rare', unit: '%', group: RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  syncField({ key: 'sync_rarity_epic', label: 'Epic', unit: '%', group: RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  syncField({ key: 'sync_rarity_mystic', label: 'Mystic', unit: '%', group: RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  syncField({
    key: 'common_streak_threshold',
    label: 'Common 연속 보정',
    unit: '번',
    hint: 'Common 아이템 배지가 이만큼 이어서 나오면 그다음은 Rare 이상이에요. 동기화와 캡슐에서 나온 것을 합쳐 세는 한 값이에요.',
    group: SHARED_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
  }),
  syncField({
    key: 'locked_roll_probability',
    label: '잠긴 채 받을 확률',
    hint: `동기화와 캡슐에서 나온 아이템 배지가 잠긴 채로 정해질 확률이에요. 두 구역이 쓰는 한 값이에요. ${PROBABILITY_HINT}`,
    group: SHARED_GROUP,
    decimals: 3,
    min: 0,
    max: 1,
  }),
]

/** 확정 개수와 보너스 기회가 모두 0이면 동기화로는 아이템 배지가 나오지 않는다(막지는 않는다, 가정 바). */
export const SYNC_NO_ITEM_WARNING =
  '아이템 배지가 나오지 않아요. 확정 개수(일반 활동·등산)와 보너스 기회가 모두 0이에요. 나오게 하려면 하나를 1 이상으로 바꿔 주세요. 의도한 설정이면 그대로 저장할 수 있어요.'

type JamPolicyUpdate = Database['public']['Tables']['jam_policy']['Update']

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다. `SYNC_BALANCE_KEYS`와 같아야 하고 시험이 지킨다). */
export const SYNC_SELECT =
  'sync_item_guaranteed, sync_item_guaranteed_hiking, sync_item_bonus_rolls, sync_item_bonus_jam_divisor, sync_item_bonus_max_probability, sync_rarity_common, sync_rarity_rare, sync_rarity_epic, sync_rarity_mystic, common_streak_threshold, locked_roll_probability, updated_at'

export const SYNC_BINDING: BalanceSectionBinding = {
  id: SYNC_SECTION_ID,
  fields: SYNC_FIELDS,
  validators: Object.fromEntries(SYNC_BALANCE_KEYS.map((key) => [key, VALIDATORS[key]])),
  validateTogether: (values) => validateSumTo100(values, SYNC_RARITY_KEYS),
  zeroWarnings: [{ keys: ['sync_item_guaranteed', 'sync_item_guaranteed_hiking', 'sync_item_bonus_rolls'], message: SYNC_NO_ITEM_WARNING }],

  async read(service) {
    const { data, error } = await service.from('jam_policy').select(SYNC_SELECT).eq('id', 1).maybeSingle()
    if (error) throw new Error(`동기화 정책 조회 실패: ${error.message}`)
    if (!data) throw new Error('동기화 정책 조회 실패: id=1 행이 없음')
    const row: Record<string, unknown> = data
    const values: BalanceValues = {}
    for (const key of SYNC_BALANCE_KEYS) {
      const n = dbNumber(row[key])
      if (n === null) throw new Error(`동기화 정책 조회 실패: ${key} 값을 숫자로 읽을 수 없음`)
      values[key] = n
    }
    return { values, updatedAt: data.updated_at }
  },

  async write(service, input) {
    const update: JamPolicyUpdate = { updated_at: input.nextUpdatedAt }
    for (const key of SYNC_BALANCE_KEYS) {
      const value = input.values[key]
      if (value !== undefined) update[key] = value
    }
    const { data, error } = await service
      .from('jam_policy')
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
