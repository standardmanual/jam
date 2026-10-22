/**
 * 밸런스 설정 «잠긴 아이템 배지» 구역의 연결 (티켓 20261022_1133 1회, 운영 로직 7.4·19.1절)
 *
 * `jam_policy` id=1 한 행 중 **잠긴 아이템 배지를 여는 데 필요한 양의 등급별 최소값 4칸**(`locked_min_*`)만 편집한다(마이그레이션 231, 1 이상 정수).
 * 읽는 곳은 `lib/drop-engine/lockAssignment.ts`(`minUnlockRequired`·`resolveUnlockRequired`)와 `lib/admin/badge-lock-guard.ts`다. 배지에 따로 정한 값이 있으면 그 값이 먼저다.
 * 잠길 확률(`locked_roll_probability`)은 동기화와 한 값이라 **동기화 구역에서 편집**하고 여기에는 안내만 둔다(가정 나, `LockedSection`).
 *
 * 읽기·쓰기는 잼 구역(`jam.ts`)과 같은 방식이다 — **가공하지 않은 행**을 읽고(비정상 값을 기본값으로 바꿔 보이지 않는다) `updated_at` 조건으로 갱신한다.
 * 잼·동기화 구역과 이 구역은 **같은 행을 쓰므로 수정 시각도 같다**: 한쪽을 저장하면 다른 쪽 화면의 수정 시각이 낡아 «다른 사람이 먼저 바꿨어요»(409)가 한 번 뜰 수 있다(안전한 쪽 오류).
 * 등급 사이 순서(Common < Rare < …)는 검사하지 않는다(가정 다: «등급마다 두 배»는 기본값이지 규칙이 아니다). 확률 안내 페이지가 읽는 칸이 없어 확인창은 쓰지 않는다(가정 차).
 */
import { DEFAULT_JAM_POLICY, VALIDATORS, type JamPolicy } from '@/lib/jam/policy'
import type { Database } from '@/types/database.generated'
import { dbNumber } from './fields'
import { INTEGER_MAX, type BalanceFieldDef, type BalanceSectionBinding, type BalanceValues } from './types'

export const LOCKED_SECTION_ID = 'locked'

/** 이 구역이 편집하는 `jam_policy` 칸. 화면 순서와 같다. */
export const LOCKED_BALANCE_KEYS = [
  'locked_min_common',
  'locked_min_rare',
  'locked_min_epic',
  'locked_min_mystic',
] as const satisfies readonly (keyof JamPolicy)[]

export type LockedBalanceKey = (typeof LOCKED_BALANCE_KEYS)[number]

const MIN_GROUP = '등급별 최소값'

type LockedFieldInit = Pick<BalanceFieldDef, 'label'> & { key: LockedBalanceKey }

function lockedField({ key, label }: LockedFieldInit): BalanceFieldDef {
  return {
    key,
    label,
    unit: '잼',
    group: MIN_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_JAM_POLICY[key],
    affectsDisclosure: false,
  }
}

/** 칸 정의. 범위는 마이그레이션 231의 CHECK와 같다: 1 이상 정수(정수 상한은 DB `INTEGER` 한계). */
export const LOCKED_FIELDS: readonly BalanceFieldDef[] = [
  lockedField({ key: 'locked_min_common', label: 'Common' }),
  lockedField({ key: 'locked_min_rare', label: 'Rare' }),
  lockedField({ key: 'locked_min_epic', label: 'Epic' }),
  lockedField({ key: 'locked_min_mystic', label: 'Mystic' }),
]

type JamPolicyUpdate = Database['public']['Tables']['jam_policy']['Update']

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다. `LOCKED_BALANCE_KEYS`와 같아야 하고 시험이 지킨다). */
export const LOCKED_SELECT = 'locked_min_common, locked_min_rare, locked_min_epic, locked_min_mystic, updated_at'

export const LOCKED_BINDING: BalanceSectionBinding = {
  id: LOCKED_SECTION_ID,
  fields: LOCKED_FIELDS,
  validators: Object.fromEntries(LOCKED_BALANCE_KEYS.map((key) => [key, VALIDATORS[key]])),

  async read(service) {
    const { data, error } = await service.from('jam_policy').select(LOCKED_SELECT).eq('id', 1).maybeSingle()
    if (error) throw new Error(`잠긴 아이템 배지 최소값 조회 실패: ${error.message}`)
    if (!data) throw new Error('잠긴 아이템 배지 최소값 조회 실패: id=1 행이 없음')
    const row: Record<string, unknown> = data
    const values: BalanceValues = {}
    for (const key of LOCKED_BALANCE_KEYS) {
      const n = dbNumber(row[key])
      if (n === null) throw new Error(`잠긴 아이템 배지 최소값 조회 실패: ${key} 값을 숫자로 읽을 수 없음`)
      values[key] = n
    }
    return { values, updatedAt: data.updated_at }
  },

  async write(service, input) {
    const update: JamPolicyUpdate = { updated_at: input.nextUpdatedAt }
    for (const key of LOCKED_BALANCE_KEYS) {
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
