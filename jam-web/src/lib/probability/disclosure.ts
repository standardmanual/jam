/**
 * 확률 안내 페이지의 값 읽기 (티켓 20261021_1250 1회, 운영 로직 18.3절) — 서버 전용
 *
 * `capsule_policy`·`jam_policy`·`combine_policy`·`ambient_drop_config` 네 설정 표(모두 id=1 한 행)를 service_role 클라이언트로 읽어, 페이지가 그대로 그리는
 * 표 행과 문장(문자열)으로 바꾼다. 설정을 바꾸면 페이지도 따라 바뀌어야 하므로(운영 로직 18.3절) 값은 문자열로 적어 두지 않고 읽은 값에서 만든다.
 *
 * **읽기에 실패하면 기본값으로 대신하지 않는다.** `getCapsulePolicy`·`getJamPolicy`·`getCombinePolicy`·`getAmbientDropConfig`는 실패·행 없음에 코드 상수 사본을 조용히 돌려주는데,
 * 확률 안내에서는 틀린 확률을 보이는 것이 더 나쁘다. 그래서 이 파일은 표를 직접 읽고, 실패하거나 값이 검증을 통과하지 못하면 값 대신 `{ ok: false }`를 돌려준다.
 * 검증은 두 정책 파일의 칸별 검사(`VALIDATORS`)를 그대로 쓴다(`combine_policy`의 윗등급 확률은 0~1 검사를 여기서 한다). 코드 상수 사본(`DEFAULT_*`)은 가져오지 않는다.
 *
 * 필요한 칸만 이름으로 고른다(`select('*')` 금지). `jam_policy`에는 대량 수령 경보 기준(`mass_earn_alert_*`)이 같은 행에 있고,
 * 어뷰징 임계값은 공개하지 않는 것이 원칙이다(`(main)/philosophy` 원고).
 *
 * 등급 올리기 표는 `combine_policy.tier_up_probability` 한 칸만으로 만든다(티켓 20261023_1648 2회). 그래서 동기화·캡슐·보정 장치(`policy`)와 따로 실패한다:
 * 캡슐 설정을 못 읽어도 등급 올리기 표는 보이고, 반대로 `combine_policy`를 못 읽어도 나머지 섹션은 보인다.
 *
 * 단위가 표마다 다르다. `capsule_policy`·`jam_policy`의 등급은 퍼센트(70), 확률 칸은 0~1이고, `ambient_drop_config`의 `rarity_*`는 0~1(합 1),
 * `combine_policy.tier_up_probability`는 0~1이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { VALIDATORS as CAPSULE_VALIDATORS, type CapsulePolicy } from '@/lib/capsule/policy'
import { TIER_UP_MATERIAL_COUNT, TIER_UP_MATERIAL_RARITIES, tierUpProbabilities } from '@/lib/combine/tierUpOdds'
import { VALIDATORS as JAM_VALIDATORS, type JamPolicy } from '@/lib/jam/policy'
import type { BadgeRarity } from '@/types/database'

/** 표 한 줄 — 라벨과 값 모두 화면에 그대로 쓰는 문자열이다 */
export interface DisclosureRow {
  label: string
  value: string
}

/** 개수·잠김 표와 등급 표 */
export interface DisclosureTables {
  counts: DisclosureRow[]
  rarity: DisclosureRow[]
}

/** 등급 올리기 표 하나 — 넣은 등급 하나의 결과 등급 확률. 제목과 caption도 화면에 그대로 쓰는 문자열이다 */
export interface TierUpMaterialDisclosure {
  heading: string
  caption: string
  rows: DisclosureRow[]
}

/** 등급 올리기 — 재료 등급별 결과 등급 표 */
export interface TierUpDisclosure {
  materials: TierUpMaterialDisclosure[]
}

export interface PolicyDisclosure {
  sync: DisclosureTables
  capsule: DisclosureTables
  /** 보정 장치 문장(접지 않고 목록으로 보인다) */
  pity: string[]
}

export type AmbientDisclosure = { mode: 'explicit'; rarity: DisclosureRow[] } | { mode: 'random' }

export type DisclosureResult<T> = { ok: true; data: T } | { ok: false }

export interface ProbabilityDisclosure {
  /** 동기화·캡슐·보정 장치 세 섹션이 함께 쓴다. 두 정책 표 중 하나라도 못 읽으면 `ok: false` */
  policy: DisclosureResult<PolicyDisclosure>
  /** 등급 올리기 섹션. `combine_policy`만 읽어 `policy`와 따로 실패한다 */
  tierUp: DisclosureResult<TierUpDisclosure>
  ambient: DisclosureResult<AmbientDisclosure>
}

type CapsuleColumn =
  | 'guaranteed_count'
  | 'bonus_count'
  | 'bonus_probability'
  | 'other_tribe_probability'
  | 'rarity_common'
  | 'rarity_rare'
  | 'rarity_epic'
  | 'rarity_mystic'
  | 'pity_epic_threshold'

type JamColumn =
  | 'sync_item_guaranteed'
  | 'sync_item_guaranteed_hiking'
  | 'sync_item_bonus_rolls'
  | 'sync_item_bonus_jam_divisor'
  | 'sync_item_bonus_max_probability'
  | 'sync_rarity_common'
  | 'sync_rarity_rare'
  | 'sync_rarity_epic'
  | 'sync_rarity_mystic'
  | 'common_streak_threshold'
  | 'locked_roll_probability'

type CombineColumn = 'tier_up_probability'

type AmbientColumn = 'rarity_common' | 'rarity_rare' | 'rarity_epic' | 'rarity_mystic'

export type CapsuleDisclosureInput = Pick<CapsulePolicy, CapsuleColumn>
export type JamDisclosureInput = Pick<JamPolicy, JamColumn>
export interface AmbientDisclosureInput {
  rarity_mode: 'explicit' | 'random'
  rarity_common: number
  rarity_rare: number
  rarity_epic: number
  rarity_mystic: number
}

/**
 * 확률 안내 페이지가 읽는 `capsule_policy` 칸 — «확률 안내에 반영되는 칸»의 단일 원천이다.
 * 어드민 밸런스 설정(`lib/admin/balance`)이 이 목록으로 저장 전 확인창이 필요한 칸을 가른다(티켓 20261022_1132 2회).
 */
export const CAPSULE_COLUMNS: readonly CapsuleColumn[] = [
  'guaranteed_count',
  'bonus_count',
  'bonus_probability',
  'other_tribe_probability',
  'rarity_common',
  'rarity_rare',
  'rarity_epic',
  'rarity_mystic',
  'pity_epic_threshold',
]

/** 확률 안내 페이지가 읽는 `jam_policy` 칸 — 위 `CAPSULE_COLUMNS`와 같은 용도의 단일 원천이다. */
export const JAM_COLUMNS: readonly JamColumn[] = [
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
]

/** 확률 안내 페이지가 읽는 `combine_policy` 칸 — 위 `CAPSULE_COLUMNS`·`JAM_COLUMNS`와 같은 용도의 단일 원천이다. */
export const COMBINE_COLUMNS: readonly CombineColumn[] = ['tier_up_probability']

const AMBIENT_COLUMNS: readonly AmbientColumn[] = ['rarity_common', 'rarity_rare', 'rarity_epic', 'rarity_mystic']

/** 등급 확률 합계 허용 오차 — 정책 로더와 DB 제약(`*_rarity_sum_100`)이 쓰는 값과 같다 */
const RARITY_SUM_TOLERANCE = 0.001

const RARITY_LABELS = ['Common', 'Rare', 'Epic', 'Mystic'] as const

/** 0 이상 1 이하의 유한한 확률인가 */
const isFraction = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1

/** 퍼센트로 쓸 숫자 — 소수 둘째 자리까지 정리해 부동소수 오차(0.07*100=7.000000000000001)를 지운다 */
function percentText(percent: number): string {
  return `${Number(percent.toFixed(2))}%`
}

/** 0~1 확률을 퍼센트 문자열로 */
export function formatFraction(fraction: number): string {
  return percentText(fraction * 100)
}

/** 이미 퍼센트인 값(등급 확률 70)을 퍼센트 문자열로 */
export function formatPercentPoints(percent: number): string {
  return percentText(percent)
}

function rarityRows(values: readonly number[], format: (n: number) => string): DisclosureRow[] {
  return RARITY_LABELS.map((label, i) => ({ label, value: format(values[i]) }))
}

function sumIsValid(values: readonly number[], expected: number): boolean {
  return Math.abs(values.reduce((a, b) => a + b, 0) - expected) < RARITY_SUM_TOLERANCE
}

/** 동기화 표 — 개수, 보너스, 잠김, 등급 */
function buildSync(jam: JamDisclosureInput): DisclosureTables {
  const counts: DisclosureRow[] = [
    {
      label: '확정으로 받는 개수',
      value:
        jam.sync_item_guaranteed === jam.sync_item_guaranteed_hiking
          ? `${jam.sync_item_guaranteed}개`
          : `${jam.sync_item_guaranteed}개, 등산은 ${jam.sync_item_guaranteed_hiking}개`,
    },
    { label: '보너스 기회', value: jam.sync_item_bonus_rolls > 0 ? `${jam.sync_item_bonus_rolls}번` : '없음' },
  ]
  if (jam.sync_item_bonus_rolls > 0) {
    counts.push({
      label: '보너스 한 번의 확률',
      value: `활동의 잼 ÷ ${jam.sync_item_bonus_jam_divisor}, 최대 ${formatFraction(jam.sync_item_bonus_max_probability)}`,
    })
  }
  counts.push({ label: '잠긴 채 받을 확률', value: formatFraction(jam.locked_roll_probability) })

  return {
    counts,
    rarity: rarityRows(
      [jam.sync_rarity_common, jam.sync_rarity_rare, jam.sync_rarity_epic, jam.sync_rarity_mystic],
      formatPercentPoints
    ),
  }
}

/** 캡슐 표 — 개수, 소속, 잠김, 등급 */
function buildCapsule(capsule: CapsuleDisclosureInput, jam: JamDisclosureInput): DisclosureTables {
  const counts: DisclosureRow[] = [{ label: '확정으로 나오는 개수', value: `${capsule.guaranteed_count}개` }]
  counts.push(
    capsule.bonus_count > 0
      ? { label: `${capsule.bonus_count}개 더 나올 확률`, value: formatFraction(capsule.bonus_probability) }
      : { label: '더 나오는 개수', value: '없음' }
  )
  counts.push(
    { label: '다른 트라이브의 것일 확률', value: `아이템 배지마다 ${formatFraction(capsule.other_tribe_probability)}` },
    // 잠김은 동기화와 캡슐이 한 값(jam_policy.locked_roll_probability)이다 — 운영 로직 5.4·6.7절
    { label: '잠긴 채 나올 확률', value: formatFraction(jam.locked_roll_probability) },
    // 설정 값이 아니라 규칙이다(퀘스트 전 첫 캡슐의 첫 아이템 배지는 반드시 잠근다 — capsuleRoll.ts, 운영 로직 5.2절)
    { label: 'JAM! 시작하기에서 여는 첫 캡슐', value: '잠긴 아이템 배지 1개가 반드시 나와요' }
  )

  return {
    counts,
    rarity: rarityRows(
      [capsule.rarity_common, capsule.rarity_rare, capsule.rarity_epic, capsule.rarity_mystic],
      formatPercentPoints
    ),
  }
}

const RARITY_LABEL_BY_VALUE: Record<BadgeRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  mystic: 'Mystic',
}

/**
 * 등급 올리기 표 — 재료 등급(`TIER_UP_MATERIAL_RARITIES` 순서)마다 «넣은 등급 그대로»와 «바로 위 등급» 두 줄을 만든다.
 * 확률은 서버 굴림이 쓰는 `tierUpProbabilities`로 만들어 페이지와 실제 결과가 갈라지지 않는다. 확률 0인 줄도 지우지 않는다.
 *
 * @param tierUpProbability `combine_policy.tier_up_probability` (0~1)
 */
export function buildTierUpDisclosure(tierUpProbability: number): TierUpDisclosure {
  return {
    materials: TIER_UP_MATERIAL_RARITIES.map((material) => {
      const label = RARITY_LABEL_BY_VALUE[material]
      return {
        heading: `${label} ${TIER_UP_MATERIAL_COUNT}개를 넣으면`,
        caption: `${label} 아이템 배지 ${TIER_UP_MATERIAL_COUNT}개를 넣었을 때 받는 등급 확률`,
        rows: tierUpProbabilities(material, tierUpProbability).map(([rarity, probability]) => ({
          label: RARITY_LABEL_BY_VALUE[rarity],
          value: formatFraction(probability),
        })),
      }
    }),
  }
}

/** 보정 장치 — 접지 않고 사실 문장으로만 적는다. 몇 번 남았는지 같은 개인 정보는 싣지 않는다 */
function buildPity(capsule: CapsuleDisclosureInput, jam: JamDisclosureInput): string[] {
  return [
    `내가 캡슐을 ${capsule.pity_epic_threshold}번 여는 동안 Epic 이상이 나오지 않으면, 그다음 캡슐의 첫 아이템 배지는 Epic 이상으로 나와요.`,
    `Common 아이템 배지가 ${jam.common_streak_threshold}번 이어서 나오면, 그다음 아이템 배지는 Rare 이상으로 나와요. 동기화와 캡슐에서 나온 것을 합쳐서 세어요.`,
  ]
}

/**
 * 동기화·캡슐·보정 장치 표를 만든다. 등급 확률 합계가 100이 아니면 null이다(틀린 표를 보이지 않는다).
 */
export function buildPolicyDisclosure(capsule: CapsuleDisclosureInput, jam: JamDisclosureInput): PolicyDisclosure | null {
  const capsuleRarity = [capsule.rarity_common, capsule.rarity_rare, capsule.rarity_epic, capsule.rarity_mystic]
  const syncRarity = [jam.sync_rarity_common, jam.sync_rarity_rare, jam.sync_rarity_epic, jam.sync_rarity_mystic]
  if (!sumIsValid(capsuleRarity, 100) || !sumIsValid(syncRarity, 100)) return null
  return {
    sync: buildSync(jam),
    capsule: buildCapsule(capsule, jam),
    pity: buildPity(capsule, jam),
  }
}

/**
 * 시스템 드랍 표. explicit 모드면 등급 표(0%인 줄도 그대로), random 모드면 표 없이 모드만 돌려준다.
 * explicit인데 네 칸 합계가 1이 아니면 null이다.
 */
export function buildAmbientDisclosure(config: AmbientDisclosureInput): AmbientDisclosure | null {
  if (config.rarity_mode === 'random') return { mode: 'random' }
  const values = [config.rarity_common, config.rarity_rare, config.rarity_epic, config.rarity_mystic]
  if (!sumIsValid(values, 1)) return null
  return { mode: 'explicit', rarity: rarityRows(values, formatFraction) }
}

function toNumber(v: unknown): number {
  // NUMERIC 컬럼이 문자열로 내려올 수 있다(정책 로더와 같은 정규화)
  return typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
}

/** 칸마다 숫자로 바꾸고 검사한다. 하나라도 비정상이면 null — 그 칸만 기본값으로 대신하지 않는다 */
function parseRow<K extends string>(
  row: unknown,
  keys: readonly K[],
  validators: Record<K, (n: number) => boolean>
): Record<K, number> | null {
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  const out = {} as Record<K, number>
  for (const key of keys) {
    const n = toNumber(record[key])
    if (Number.isNaN(n) || !validators[key](n)) return null
    out[key] = n
  }
  return out
}

/** 한 행을 읽는다. 오류·행 없음·예외는 null이고 로그만 남긴다 */
async function readSingleRow(supabase: SupabaseClient, table: string, columns: readonly string[]): Promise<unknown> {
  try {
    const { data, error } = await supabase.from(table).select(columns.join(', ')).eq('id', 1).single()
    if (error) {
      console.error(`[probability-disclosure] ${table} 조회 실패:`, error)
      return null
    }
    if (!data) {
      console.error(`[probability-disclosure] ${table} id=1 행이 없음`)
      return null
    }
    return data
  } catch (e) {
    console.error(`[probability-disclosure] ${table} 조회 예외:`, e)
    return null
  }
}

async function loadPolicy(supabase: SupabaseClient): Promise<DisclosureResult<PolicyDisclosure>> {
  const [capsuleRow, jamRow] = await Promise.all([
    readSingleRow(supabase, 'capsule_policy', CAPSULE_COLUMNS),
    readSingleRow(supabase, 'jam_policy', JAM_COLUMNS),
  ])
  const capsule = parseRow<CapsuleColumn>(capsuleRow, CAPSULE_COLUMNS, CAPSULE_VALIDATORS)
  const jam = parseRow<JamColumn>(jamRow, JAM_COLUMNS, JAM_VALIDATORS)
  if (!capsule || !jam) {
    console.error('[probability-disclosure] 정책 값을 읽지 못하거나 검증을 통과하지 못해 값을 보이지 않는다')
    return { ok: false }
  }
  const data = buildPolicyDisclosure(capsule, jam)
  if (!data) {
    console.error('[probability-disclosure] 등급 확률 합계가 100이 아니라 값을 보이지 않는다')
    return { ok: false }
  }
  return { ok: true, data }
}

/**
 * 등급 올리기 표. `combine_policy.tier_up_probability` 한 칸을 엄격하게 읽는다 — `getCombinePolicy`의 기본값 폴백(0.7)을 쓰지 않는다.
 * 읽기 실패·행 없음·칸 없음(null)·숫자가 아님·0~1 밖이면 `{ ok: false }`다.
 */
async function loadTierUp(supabase: SupabaseClient): Promise<DisclosureResult<TierUpDisclosure>> {
  const row = await readSingleRow(supabase, 'combine_policy', COMBINE_COLUMNS)
  const combine = parseRow<CombineColumn>(row, COMBINE_COLUMNS, { tier_up_probability: isFraction })
  if (!combine) {
    console.error('[probability-disclosure] combine_policy 값을 읽지 못하거나 검증을 통과하지 못해 등급 올리기 값을 보이지 않는다')
    return { ok: false }
  }
  return { ok: true, data: buildTierUpDisclosure(combine.tier_up_probability) }
}

async function loadAmbient(supabase: SupabaseClient): Promise<DisclosureResult<AmbientDisclosure>> {
  const row = await readSingleRow(supabase, 'ambient_drop_config', ['rarity_mode', ...AMBIENT_COLUMNS])
  const mode = row && typeof row === 'object' ? (row as Record<string, unknown>).rarity_mode : undefined
  if (mode !== 'explicit' && mode !== 'random') {
    if (row) console.error('[probability-disclosure] ambient_drop_config.rarity_mode가 비정상이라 값을 보이지 않는다')
    return { ok: false }
  }
  // random 모드는 등급 칸을 쓰지 않는다 — 칸 검사는 explicit일 때만 한다
  if (mode === 'random') return { ok: true, data: { mode: 'random' } }
  const values = parseRow<AmbientColumn>(row, AMBIENT_COLUMNS, {
    rarity_common: isFraction,
    rarity_rare: isFraction,
    rarity_epic: isFraction,
    rarity_mystic: isFraction,
  })
  const data = values ? buildAmbientDisclosure({ rarity_mode: mode, ...values }) : null
  if (!data) {
    console.error('[probability-disclosure] ambient_drop_config 등급 값이 비정상이라 값을 보이지 않는다')
    return { ok: false }
  }
  return { ok: true, data }
}

/**
 * 확률 안내 페이지가 그릴 값을 읽는다. 설정 표를 동시에 읽고, 정책(동기화·캡슐·보정 장치)·등급 올리기·시스템 드랍은 서로 따로 실패한다.
 *
 * @param client 이미 만들어 둔 Supabase 클라이언트. 생략하면 service_role 클라이언트를 새로 만든다.
 */
export async function loadProbabilityDisclosure(client?: SupabaseClient): Promise<ProbabilityDisclosure> {
  let supabase: SupabaseClient
  try {
    supabase = client ?? createServiceClient()
  } catch (e) {
    console.error('[probability-disclosure] 클라이언트 생성 실패:', e)
    return { policy: { ok: false }, tierUp: { ok: false }, ambient: { ok: false } }
  }
  const [policy, tierUp, ambient] = await Promise.all([loadPolicy(supabase), loadTierUp(supabase), loadAmbient(supabase)])
  return { policy, tierUp, ambient }
}
