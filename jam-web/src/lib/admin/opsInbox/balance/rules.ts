/**
 * 밸런스 규칙의 키·값 형식과 `ops_rules` 행 해석 (티켓 20260930_1459 조각 A, 순수 함수).
 *
 * 규칙표·초기값·읽는 자리의 정본은 `docs/specs/prd/ops-tool/PRD.md` §5.2다. 값은 DB(`ops_rules`, 마이그레이션 207)에 있고
 * 이 파일은 그 행을 읽어 타입이 있는 값으로 바꾼다. **값 모양이 틀린 규칙은 그 규칙만 「읽을 수 없음」으로 두고** 다른 규칙은
 * 그대로 계산한다(평가가 「점검 못 함」으로 보여 준다). 규칙 행이 아예 없으면 그 규칙은 만들지 않은 것으로 본다.
 *
 * 화면(클라이언트 부품)이 규칙 이름·종류 이름표와 제외 상태를 읽으므로 이 파일은 **서버 전용 코드를 끌어오지 않는다**
 * (JAM! 행동 지표 키를 쓰는 배지 종류 판정은 `evaluate.ts`에 있다).
 */
// ── 규칙 키 ─────────────────────────────────────────────────────────────────────────────────────

/** 밸런스 규칙 8개(PRD §5.2). 순서가 화면과 평가 결과의 순서다. */
export const BALANCE_RULE_KEYS = [
  'open_collections_max',
  'weekly_new_collections_max',
  'rolling_new_collections_max',
  'launch_lead_days_min',
  'point_reward_max',
  'single_action_points',
  'count_ladder_points',
  'economy_keys',
] as const

export type BalanceRuleKey = (typeof BALANCE_RULE_KEYS)[number]

/** `ops_rules.rule_group` 허용값. `signal`은 조각 C가 같은 테이블에 넣는 신호 기준값이다. */
export const OPS_RULE_GROUPS = ['balance', 'signal'] as const

/** 경고 수준. DB의 `level` 값이다: `info`는 「참고」, `warn`은 「주의」. 툴은 「중단」을 쓰지 않는다. */
export const BALANCE_LEVELS = ['info', 'warn'] as const
export type BalanceLevel = (typeof BALANCE_LEVELS)[number]

export const BALANCE_LEVEL_LABELS: Record<BalanceLevel, string> = { info: '참고', warn: '주의' }

export function isBalanceRuleKey(value: unknown): value is BalanceRuleKey {
  return typeof value === 'string' && (BALANCE_RULE_KEYS as readonly string[]).includes(value)
}

// ── 이름·설명 ───────────────────────────────────────────────────────────────────────────────────

export const BALANCE_RULE_NAMES: Record<BalanceRuleKey, string> = {
  open_collections_max: '동시 개방 컬렉션 수',
  weekly_new_collections_max: '한 주 신규 개방 수',
  rolling_new_collections_max: '28일 신규 개방 수',
  launch_lead_days_min: '개방 리드타임',
  point_reward_max: '항목별 포인트',
  single_action_points: '한 번의 행동으로 받는 포인트 합',
  count_ladder_points: '파밍 방지',
  economy_keys: '경제 수치 불변',
}

/** 「~을/를 확인하지 못했어요」 문장에 쓰는 목적어(조사까지 적어 두어 받침 계산을 하지 않는다). */
export const BALANCE_RULE_OBJECTS: Record<BalanceRuleKey, string> = {
  open_collections_max: '동시 개방 컬렉션 수를',
  weekly_new_collections_max: '한 주 신규 개방 수를',
  rolling_new_collections_max: '28일 신규 개방 수를',
  launch_lead_days_min: '개방 리드타임을',
  point_reward_max: '항목별 포인트를',
  single_action_points: '한 번의 행동으로 받는 포인트 합을',
  count_ladder_points: '파밍 방지를',
  economy_keys: '경제 수치 불변을',
}

export const BALANCE_RULE_DESCRIPTIONS: Record<BalanceRuleKey, string> = {
  open_collections_max: '새 컬렉션이 열릴 때 함께 열려 있을 컬렉션 수의 한도예요',
  weekly_new_collections_max: '같은 주(월~일)에 새로 여는 컬렉션 수의 한도예요',
  rolling_new_collections_max: '공개 시각부터 거슬러 28일 안에 새로 여는 컬렉션 수의 한도예요',
  launch_lead_days_min: '새 컬렉션을 공개하기 전에 미리 알려야 하는 최소 일수예요',
  point_reward_max: '항목 하나가 주는 포인트의 한도예요(종류마다 따로 정해요)',
  single_action_points: '한 번의 행동으로 받는 포인트 합의 한도예요(항목별 포인트 값을 따라요)',
  count_ladder_points: '같은 계열 횟수형 배지의 단계별 포인트 합의 한도예요(달성형 값을 따라요)',
  economy_keys: '기획에서 바꾸지 않는 경제 정책 값의 이름 목록이에요',
}

/**
 * 평가에서 빼는 항목 상태: 반려·취소·실패한 항목은 열리지 않으므로 세지도 점검하지도 않는다.
 * 화면(클라이언트 부품)도 읽는 값이라 서버 전용 코드를 끌어오지 않는 이 파일에 둔다.
 */
export const BALANCE_SKIPPED_STATUSES: readonly string[] = ['rejected', 'cancelled', 'failed']

export function isBalanceSkippedStatus(status: string): boolean {
  return BALANCE_SKIPPED_STATUSES.includes(status)
}

// ── 포인트 종류(R5) ─────────────────────────────────────────────────────────────────────────────

/** R5가 한도를 따로 두는 항목 종류 5개. */
export const POINT_KINDS = ['count_badge', 'achievement_badge', 'mission', 'collection_completion', 'recipe'] as const
export type PointKind = (typeof POINT_KINDS)[number]

export const POINT_KIND_LABELS: Record<PointKind, string> = {
  count_badge: '횟수형 JAM! 배지',
  achievement_badge: '달성형 JAM! 배지',
  mission: '미션',
  collection_completion: '컬렉션 완성',
  recipe: '레시피',
}

// ── 값 타입 ─────────────────────────────────────────────────────────────────────────────────────

/** 최댓값 규칙의 값(R1~R3, R5의 종류별 값). `provisional`은 실측 없이 정한 임시값 표시다. */
export interface MaxValue {
  max: number
  provisional: boolean
}

/** R4의 값. */
export interface MinDaysValue {
  minDays: number
  provisional: boolean
}

/** R5의 값. 종류 하나의 값이 틀리면 그 종류만 `null`이다(다른 종류는 그대로 계산한다). */
export interface PointRewardValue {
  kinds: Record<PointKind, MaxValue | null>
}

/** R8의 값. */
export interface EconomyKeysValue {
  keys: string[]
}

/** 값 없는 규칙(R6·R7)은 R5를 따른다. */
export type EmptyValue = Record<string, never>

/**
 * 읽은 규칙 한 건. `readable: false`는 값 모양이 틀린 규칙이다(그 규칙만 「점검 못 함」).
 * `enabled: false`인 규칙은 계산하지도, 세지도 않는다.
 */
export type RuleEntry<V> =
  | { readable: true; enabled: boolean; level: BalanceLevel; value: V }
  | { readable: false; enabled: boolean; level: BalanceLevel }

export interface BalanceRules {
  open_collections_max?: RuleEntry<MaxValue>
  weekly_new_collections_max?: RuleEntry<MaxValue>
  rolling_new_collections_max?: RuleEntry<MaxValue>
  launch_lead_days_min?: RuleEntry<MinDaysValue>
  point_reward_max?: RuleEntry<PointRewardValue>
  single_action_points?: RuleEntry<EmptyValue>
  count_ladder_points?: RuleEntry<EmptyValue>
  economy_keys?: RuleEntry<EconomyKeysValue>
}

/** `ops_rules`에서 읽는 열. 설정 화면(조각 B)이 쓰는 열(`updated_at`·`updated_by`·`previous_value`)은 평가에 필요 없다. */
export interface OpsRuleRow {
  rule_key: string
  rule_group: string
  value: unknown
  level: string
  enabled: boolean
}

export const OPS_RULE_COLUMNS = 'rule_key, rule_group, value, level, enabled'

// ── 값 해석 ─────────────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** `provisional`은 없으면 `false`다. 있는데 불리언이 아니면 읽을 수 없다(`null`). */
function readProvisional(source: Record<string, unknown>): boolean | null {
  if (source.provisional === undefined) return false
  return typeof source.provisional === 'boolean' ? source.provisional : null
}

function parseMaxValue(raw: unknown): MaxValue | null {
  if (!isRecord(raw) || !isNonNegativeNumber(raw.max)) return null
  const provisional = readProvisional(raw)
  return provisional === null ? null : { max: raw.max, provisional }
}

function parseMinDaysValue(raw: unknown): MinDaysValue | null {
  if (!isRecord(raw) || !isNonNegativeNumber(raw.min_days)) return null
  const provisional = readProvisional(raw)
  return provisional === null ? null : { minDays: raw.min_days, provisional }
}

function parsePointRewardValue(raw: unknown): PointRewardValue | null {
  if (!isRecord(raw) || !isRecord(raw.kinds)) return null
  const kinds = {} as Record<PointKind, MaxValue | null>
  for (const kind of POINT_KINDS) kinds[kind] = parseMaxValue(raw.kinds[kind])
  return { kinds }
}

function parseEconomyKeysValue(raw: unknown): EconomyKeysValue | null {
  if (!isRecord(raw) || !Array.isArray(raw.keys)) return null
  if (!raw.keys.every((key) => typeof key === 'string' && key.length > 0)) return null
  return { keys: raw.keys as string[] }
}

function parseEmptyValue(raw: unknown): EmptyValue | null {
  return isRecord(raw) ? {} : null
}

function entryOf<V>(row: OpsRuleRow, parse: (raw: unknown) => V | null): RuleEntry<V> {
  const level: BalanceLevel = row.level === 'info' ? 'info' : 'warn'
  const levelValid = row.level === 'info' || row.level === 'warn'
  const value = levelValid ? parse(row.value) : null
  return value === null
    ? { readable: false, enabled: row.enabled === true, level }
    : { readable: true, enabled: row.enabled === true, level, value }
}

/**
 * `ops_rules` 행을 규칙 8개로 읽는다. 밸런스 규칙 행(`rule_group = 'balance'`이고 키가 8개 중 하나)이 하나도 없으면 `null`이다 —
 * 규칙 테이블이 비어 있는 것은 평가 실패다(PRD §5.2). 같은 키가 둘 이상이면 앞의 행을 쓴다(키는 기본키라 DB에서는 생기지 않는다).
 */
export function parseBalanceRules(rows: readonly OpsRuleRow[]): BalanceRules | null {
  const rules: BalanceRules = {}
  let found = 0
  for (const row of rows) {
    if (row.rule_group !== 'balance' || !isBalanceRuleKey(row.rule_key) || rules[row.rule_key] !== undefined) continue
    found += 1
    switch (row.rule_key) {
      case 'open_collections_max':
      case 'weekly_new_collections_max':
      case 'rolling_new_collections_max':
        rules[row.rule_key] = entryOf(row, parseMaxValue)
        break
      case 'launch_lead_days_min':
        rules.launch_lead_days_min = entryOf(row, parseMinDaysValue)
        break
      case 'point_reward_max':
        rules.point_reward_max = entryOf(row, parsePointRewardValue)
        break
      case 'single_action_points':
      case 'count_ladder_points':
        rules[row.rule_key] = entryOf(row, parseEmptyValue)
        break
      case 'economy_keys':
        rules.economy_keys = entryOf(row, parseEconomyKeysValue)
        break
    }
  }
  return found === 0 ? null : rules
}
