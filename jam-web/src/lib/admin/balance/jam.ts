/**
 * 밸런스 설정 «잼» 구역의 연결 (티켓 20261022_1132 1회, 운영 로직 4.2·16.3·19.1절)
 *
 * `jam_policy` id=1 한 행 중 **강도 배율 3칸**(`intensity_*`)과 **대량 수령 경보 기준 3칸**(`mass_earn_alert_*`)만 편집한다(사용자 결정 3: 경보 기준 포함).
 * 동기화 칸·잠긴 아이템 배지 최소값 칸은 같은 행이지만 이 구역에서 다루지 않는다(동기화 구역은 2회, 잠긴 아이템 배지 칸은 7-2).
 *
 * 읽기는 **가공하지 않은 행**을 읽는다. 정식 읽기 경로 `getJamPolicy`는 비정상 값을 기본값으로 바꿔 돌려주는데, 편집 화면이 기본값을 저장된 값처럼 보이면
 * 안 되기 때문이다. 쓰기는 `updated_at` 조건 갱신이다(갱신 트리거가 없어 저장이 직접 올린다). 칸 검증 기준은 `lib/jam/policy.ts`의 `VALIDATORS`를 재사용한다.
 */
import { DEFAULT_JAM_POLICY, VALIDATORS, type JamPolicy } from '@/lib/jam/policy'
import type { Database } from '@/types/database.generated'
import { INTEGER_MAX, type BalanceFieldDef, type BalanceSectionBinding, type BalanceValues } from './types'

export const JAM_SECTION_ID = 'jam'

/** 이 구역이 편집하는 `jam_policy` 칸. 화면 순서와 같다. */
export const JAM_BALANCE_KEYS = [
  'intensity_light',
  'intensity_normal',
  'intensity_hard',
  'mass_earn_alert_multiplier',
  'mass_earn_alert_weeks',
  'mass_earn_alert_no_history_amount',
] as const satisfies readonly (keyof JamPolicy)[]

export type JamBalanceKey = (typeof JAM_BALANCE_KEYS)[number]

const INTENSITY_GROUP = '강도 배율'
const ALERT_GROUP = '대량 수령 경보 기준'

/**
 * 칸 정의. 범위는 마이그레이션 226의 CHECK와 같다: 배율은 0 이상 정수, 경보 배수는 0보다 크고 `NUMERIC(5,2)`(소수 둘째 자리, 999.99까지),
 * 기간·기준 잼은 1 이상 정수. 정수 상한은 DB `INTEGER` 한계다. 확률 안내 페이지(`/probability`)는 이 여섯 칸을 읽지 않는다.
 */
export const JAM_FIELDS: readonly BalanceFieldDef[] = [
  {
    key: 'intensity_light',
    label: '가벼움',
    unit: '배',
    hint: '걷기, 전기자전거',
    group: INTENSITY_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_JAM_POLICY.intensity_light,
    affectsDisclosure: false,
  },
  {
    key: 'intensity_normal',
    label: '보통',
    unit: '배',
    hint: '등산, 자전거',
    group: INTENSITY_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_JAM_POLICY.intensity_normal,
    affectsDisclosure: false,
  },
  {
    key: 'intensity_hard',
    label: '격함',
    unit: '배',
    hint: '러닝, 트레일러닝',
    group: INTENSITY_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_JAM_POLICY.intensity_hard,
    affectsDisclosure: false,
  },
  {
    key: 'mass_earn_alert_multiplier',
    label: '경보 배수',
    unit: '배',
    hint: '한 번의 동기화로 받은 잼이 지난 기간 주간 평균의 이 배수를 넘으면 경보',
    group: ALERT_GROUP,
    decimals: 2,
    min: 0.01,
    max: 999.99,
    defaultValue: DEFAULT_JAM_POLICY.mass_earn_alert_multiplier,
    affectsDisclosure: false,
  },
  {
    key: 'mass_earn_alert_weeks',
    label: '비교 기간',
    unit: '주',
    hint: '경보 비교에 쓰는 지난 기간',
    group: ALERT_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_JAM_POLICY.mass_earn_alert_weeks,
    affectsDisclosure: false,
  },
  {
    key: 'mass_earn_alert_no_history_amount',
    label: '지난 기록이 없을 때 기준',
    unit: '잼',
    hint: '지난 기록이 없는 유저는 한 번에 이만큼 넘게 받으면 경보',
    group: ALERT_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_JAM_POLICY.mass_earn_alert_no_history_amount,
    affectsDisclosure: false,
  },
]

type JamPolicyUpdate = Database['public']['Tables']['jam_policy']['Update']

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다. `JAM_BALANCE_KEYS`와 같아야 하고 시험이 지킨다). */
export const JAM_SELECT =
  'intensity_light, intensity_normal, intensity_hard, mass_earn_alert_multiplier, mass_earn_alert_weeks, mass_earn_alert_no_history_amount, updated_at'

/** NUMERIC 칸이 문자열로 내려올 수 있어 숫자로 읽는다. 숫자가 아니면 `null`. */
function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) ? n : null
}

export const JAM_BINDING: BalanceSectionBinding = {
  id: JAM_SECTION_ID,
  fields: JAM_FIELDS,
  validators: Object.fromEntries(JAM_BALANCE_KEYS.map((key) => [key, VALIDATORS[key]])),

  async read(service) {
    const { data, error } = await service.from('jam_policy').select(JAM_SELECT).eq('id', 1).maybeSingle()
    if (error) throw new Error(`잼 정책 조회 실패: ${error.message}`)
    if (!data) throw new Error('잼 정책 조회 실패: id=1 행이 없음')
    const row: Record<string, unknown> = data
    const values: BalanceValues = {}
    for (const key of JAM_BALANCE_KEYS) {
      const n = toNumber(row[key])
      if (n === null) throw new Error(`잼 정책 조회 실패: ${key} 값을 숫자로 읽을 수 없음`)
      values[key] = n
    }
    return { values, updatedAt: data.updated_at }
  },

  async write(service, input) {
    const update: JamPolicyUpdate = { updated_at: input.nextUpdatedAt }
    for (const key of JAM_BALANCE_KEYS) {
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
