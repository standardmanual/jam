/**
 * 설정 화면(S7) 「신호 기준값」 구역이 쓰는 순수 논리와 문구 (티켓 20260930_1459 조각 C, 채원 확정 설계 「조각 C」).
 *
 * 기준값의 기본값은 `thresholds.ts`와 운영툴 PRD §5.1 표에만 있다. 이 파일은 그 기준값 25개를 화면 칸으로 옮기는 표(칸 정의), 신호별 카드 9장의 구성,
 * 칸마다 허용하는 범위와 검증, 맞물린 값의 검증, 결과 문장, 저장 본문과 초안 비교를 맡는다. 서버 전용 코드를 끌어오지 않는다 — 화면(클라이언트 부품)과
 * 서버(`saveThresholds.ts`)가 **같은 검증 함수**를 쓰므로 화면의 오류와 서버 400의 `fieldErrors`가 같은 칸에 같은 문장으로 나온다.
 *
 * 저장 규칙: 바꾼 값만 `ops_rules`에 `rule_group = 'signal'` 행으로 남기고(행 키 = 기준값 키, 값 모양 `{"value": <값>}`), 기본값과 같아지면 그 행을 지운다.
 * 칸 하나의 값이 범위를 벗어나거나 모양이 틀린 행은 신호 계산이 버리고 기본값을 쓴다(`overrides.ts`). 이 파일의 `readStoredThresholdValue`가 그 판정이다.
 *
 * 문구는 채원 확정 설계를 따른다(해요체). 문구와 판정은 `__tests__/thresholdSettings.test.ts`가 고정한다.
 */
import type { Json } from '@/types/database.generated'
import { formatKstDayTime } from '@/lib/admin/opsInbox/labels'
import {
  OPS_SIGNAL_CATALOG,
  OPS_SIGNAL_LEVEL_LABELS,
  OPS_WEEKDAY_LABELS,
  type OpsSignalKey,
  type OpsSignalLevel,
} from '@/lib/admin/opsSignals/catalog'
import {
  DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES,
  OPS_SIGNAL_THRESHOLDS,
  OPS_SIGNAL_THRESHOLD_KEYS,
  type OpsSignalThresholdKey,
} from '@/lib/admin/opsSignals/thresholds'

// ── 구역·카드 문구 ──────────────────────────────────────────────────────────────────────────────

export const SIGNAL_SECTION_ID = 'signals'
export const SIGNAL_SECTION_TITLE = '신호 기준값'
export const SIGNAL_SECTION_DESCRIPTION = [
  '운영 신호가 언제 뜨는지 정하는 숫자와 시각이에요. 신호는 승인을 막지 않아요.',
  '바꾼 값만 저장하고, 나머지는 기본값을 써요. 바꾼 값은 다음 신호 계산부터 반영돼요.',
  '밸런스 경고의 기준은 「밸런스 규칙」 구역에서 바꿔요.',
] as const

export const SIGNAL_SECTION_LOAD_FAILED = {
  title: '신호 기준값을 불러오지 못했어요',
  description: '서버에 문제가 있었을 수 있어요. 새로 고쳐 다시 불러와 주세요',
  retry: '새로 고치기',
} as const

export const NOT_MEASURED_CHIP_LABEL = '실측 아님'
export const NOT_MEASURED_NOTE = '기본값은 추정한 값이에요. 운영하면서 실제 수치를 보고 조정해요'
export const SIGNAL_REVERT_LABEL = '기본값으로 되돌리기'
export const SIGNAL_CONFLICT_MESSAGE = '그사이 다른 곳에서 이 신호의 기준값이 바뀌었어요. 최신 값을 불러온 뒤 다시 바꿔 주세요'
export const SIGNAL_SAVED_TOAST_DESCRIPTION = '다음 신호 계산부터 반영돼요'
export const SIGNAL_REVERTED_LIVE_MESSAGE = '기본값으로 되돌렸어요'
export const UNREADABLE_STORED_MESSAGE = '저장된 값을 읽을 수 없어요. 새 값을 적거나 기본값으로 되돌려 주세요'
export const MIN_COUNT_LEGEND = '지표별 최소 건수(최근 7일 합계)'

export function changedCountChipLabel(count: number): string {
  return `바꾼 값 ${count}`
}
export function signalSavedToastTitle(signalName: string): string {
  return `${signalName} 기준을 바꿨어요`
}
export function signalRevertedToastTitle(signalName: string): string {
  return `${signalName} 기준을 기본값으로 되돌렸어요`
}

/** 카드의 앵커 ID. 구역 이동 링크나 주소의 `#signal-<신호 키>`로 온다. */
export function signalAnchorId(signal: string): string {
  return `signal-${signal}`
}

export const READONLY_TIME_TEXT = {
  unset: '아직 정해지지 않았어요',
  unreadable: '시각을 읽을 수 없어요',
} as const

// ── 칸 정의표 ───────────────────────────────────────────────────────────────────────────────────

export type ThresholdFieldKind = 'integer' | 'multiplier' | 'weekday' | 'readonly_time'

export interface ThresholdFieldSpec {
  key: OpsSignalThresholdKey
  signal: OpsSignalKey
  kind: ThresholdFieldKind
  /** 칸 이름표. `thresholds.ts`의 `label`을 쓰고, 화면에 맞지 않는 칸만 UI 전용 문구로 바꾼다(`UI_LABELS`). */
  label: string
  /** 입력 오른쪽 단위(요일·읽기 전용 시각은 빈 글). */
  unit: string
  /** 정수·배수 칸의 허용 범위(양 끝 포함). 요일·읽기 전용 칸은 쓰지 않는다. */
  min: number
  max: number
  /** 요일 칸에서 고를 수 있는 번호(보이는 순서). */
  weekdays: readonly number[]
  /** 칸 아래 안내 문구. */
  hint: string | null
  /** 행동 횟수 급증의 지표별 최소 건수 5칸은 한 `<fieldset>`이다. */
  inMinCountGroup: boolean
  readOnly: boolean
  notMeasured: boolean
}

const WEEKDAYS_MON_FIRST = [1, 2, 3, 4, 5, 6, 0] as const
const WEEKDAYS_MON_TO_SAT = [1, 2, 3, 4, 5, 6] as const
const HOUR_HINT = '한국 시각 24시간제예요. 0은 자정이에요'

/** 화면에 맞지 않는 칸 이름표만 바꾼다(요일 번호·읽기 전용 시각·지표별 최소 건수 5칸). */
const UI_LABELS: Partial<Record<OpsSignalThresholdKey, string>> = {
  weeklyRoutineWeekday: '주간 루틴 마감 요일',
  routineCheckStartsAt: '루틴 점검을 시작하는 시각',
  nextWeekCheckFromWeekday: '다음 주 편성을 검사하기 시작하는 요일',
  actionSpikeMinMixAttempt: '믹스 시도',
  actionSpikeMinUserDrop: '유저 드랍',
  actionSpikeMinPickup: '픽업',
  actionSpikeMinMissionComplete: '미션 완료',
  actionSpikeMinCollectionComplete: '컬렉션 완성',
}

interface FieldRule {
  kind: ThresholdFieldKind
  min?: number
  max?: number
  weekdays?: readonly number[]
  hint?: string
  inMinCountGroup?: boolean
}

const FIELD_RULES: Record<OpsSignalThresholdKey, FieldRule> = {
  failureLookbackDays: { kind: 'integer', min: 1, max: 30 },
  missedScheduleMinutes: { kind: 'integer', min: 1, max: 1440 },
  weeklyRoutineWeekday: { kind: 'weekday', weekdays: WEEKDAYS_MON_FIRST },
  weeklyRoutineDeadlineHour: { kind: 'integer', min: 0, max: 23, hint: HOUR_HINT },
  monthlyRoutineDay: { kind: 'integer', min: 1, max: 28, hint: '29일부터는 없는 달이 있어서 28일까지만 정할 수 있어요' },
  monthlyRoutineDeadlineHour: { kind: 'integer', min: 0, max: 23, hint: HOUR_HINT },
  routineCheckStartsAt: {
    kind: 'readonly_time',
    hint: '첫 주간 루틴을 돌릴 때 정해져요. 정해지기 전에는 루틴 실패를 확인하지 않아요. 여기서는 바꿀 수 없어요',
  },
  approvalDeadlineHours: { kind: 'integer', min: 1, max: 168 },
  nextWeekCheckFromWeekday: {
    kind: 'weekday',
    weekdays: WEEKDAYS_MON_TO_SAT,
    hint: '일요일에는 늘 다음 주도 검사해요. 그 전에도 다음 주 기획이 도착했으면 검사해요',
  },
  minLiveCards: { kind: 'integer', min: 1, max: 20 },
  maxLiveCards: { kind: 'integer', min: 1, max: 20 },
  minNewContentCards: { kind: 'integer', min: 1, max: 10 },
  overlapImageShapeCards: { kind: 'integer', min: 1, max: 20 },
  minNonImageShapeCards: { kind: 'integer', min: 1, max: 20 },
  maxNewUserCards: { kind: 'integer', min: 1, max: 20 },
  monotonyWindowDays: { kind: 'integer', min: 2, max: 14 },
  monotonySamePatternCount: { kind: 'integer', min: 2, max: 14 },
  monotonySameShapeDays: { kind: 'integer', min: 2, max: 14 },
  actionSpikeMultiplier: {
    kind: 'multiplier',
    min: 1.1,
    max: 10,
    hint: '소수 첫째 자리까지 적을 수 있어요 (예: 1.5)',
  },
  actionSpikeBaselineWeeks: { kind: 'integer', min: 1, max: 12 },
  actionSpikeMinMixAttempt: { kind: 'integer', min: 1, max: 10000, inMinCountGroup: true },
  actionSpikeMinUserDrop: { kind: 'integer', min: 1, max: 10000, inMinCountGroup: true },
  actionSpikeMinPickup: { kind: 'integer', min: 1, max: 10000, inMinCountGroup: true },
  actionSpikeMinMissionComplete: { kind: 'integer', min: 1, max: 10000, inMinCountGroup: true },
  actionSpikeMinCollectionComplete: { kind: 'integer', min: 1, max: 10000, inMinCountGroup: true },
}

function buildField(key: OpsSignalThresholdKey): ThresholdFieldSpec {
  const entry = OPS_SIGNAL_THRESHOLDS[key]
  const rule = FIELD_RULES[key]
  return {
    key,
    signal: entry.signal,
    kind: rule.kind,
    label: UI_LABELS[key] ?? entry.label,
    unit: rule.kind === 'weekday' || rule.kind === 'readonly_time' ? '' : entry.unit,
    min: rule.min ?? 0,
    max: rule.max ?? 0,
    weekdays: rule.weekdays ?? [],
    hint: rule.hint ?? null,
    inMinCountGroup: rule.inMinCountGroup === true,
    readOnly: rule.kind === 'readonly_time',
    notMeasured: entry.notMeasured,
  }
}

/** 기준값 25개의 칸 정의(`thresholds.ts`의 키 순서). 키가 늘면 `FIELD_RULES`의 타입이 막고 테스트가 키 수를 견준다. */
export const THRESHOLD_FIELDS: readonly ThresholdFieldSpec[] = OPS_SIGNAL_THRESHOLD_KEYS.map(buildField)

const FIELD_BY_KEY: ReadonlyMap<string, ThresholdFieldSpec> = new Map(THRESHOLD_FIELDS.map((field) => [field.key, field]))

/** 기준값 키의 칸 정의. 기준값 25개 밖의 키는 `undefined`다. */
export function thresholdField(key: string): ThresholdFieldSpec | undefined {
  return FIELD_BY_KEY.get(key)
}

export function isThresholdKey(key: unknown): key is OpsSignalThresholdKey {
  return typeof key === 'string' && FIELD_BY_KEY.has(key)
}

// ── 신호별 카드 9장 ─────────────────────────────────────────────────────────────────────────────

export interface SignalCardSpec {
  signal: OpsSignalKey
  name: string
  level: OpsSignalLevel
  /** 카드 안 칸 전부(읽기 전용 포함, 보이는 순서). */
  fields: readonly ThresholdFieldSpec[]
  /** 편집할 수 있는 칸. */
  editableFields: readonly ThresholdFieldSpec[]
  /** 편집 칸의 기본값이 추정한 값이면 참(「실측 아님」 칩). 한 카드 안에서 섞이지 않는다. */
  notMeasured: boolean
}

/** 기준값이 있는 신호만 카드가 된다(신호 순서는 `OPS_SIGNAL_CATALOG`). */
export const SIGNAL_CARDS: readonly SignalCardSpec[] = OPS_SIGNAL_CATALOG.flatMap((definition): SignalCardSpec[] => {
  const fields = THRESHOLD_FIELDS.filter((field) => field.signal === definition.key)
  if (fields.length === 0) return []
  const editableFields = fields.filter((field) => !field.readOnly)
  return [
    {
      signal: definition.key,
      name: definition.name,
      level: definition.level,
      fields,
      editableFields,
      notMeasured: editableFields.every((field) => field.notMeasured),
    },
  ]
})

export function signalCard(signal: string): SignalCardSpec | undefined {
  return SIGNAL_CARDS.find((card) => card.signal === signal)
}

/** 카드 9장을 보이는 그룹 3개(신호 수준)로 나눈다. */
export const SIGNAL_CARD_GROUPS: ReadonlyArray<{ level: OpsSignalLevel; title: string; cards: readonly SignalCardSpec[] }> = (
  ['stop', 'warn', 'info'] as const
).map((level) => ({
  level,
  title: `${OPS_SIGNAL_LEVEL_LABELS[level]} 신호`,
  cards: SIGNAL_CARDS.filter((card) => card.level === level),
}))

// ── 저장된 한 칸(응답·화면 공용 모양) ───────────────────────────────────────────────────────────

export type ThresholdValue = number | string | null

/**
 * 기준값 한 칸의 현재 상태(`GET /api/admin/ops-rules?group=signal`의 한 건이자 화면이 들고 있는 값). **관리자 사용자 ID는 싣지 않는다** —
 * 바꾼 값이 있는지(`changed`)만 알린다.
 */
export interface SignalThresholdRecord {
  /** 기준값 키(= `ops_rules.rule_key`). */
  ruleKey: OpsSignalThresholdKey
  group: 'signal'
  signal: OpsSignalKey
  readOnly: boolean
  /** 지금 신호 계산이 쓰는 값: 바꾼 값을 읽을 수 있으면 그 값, 아니면 기본값. */
  value: ThresholdValue
  defaultValue: ThresholdValue
  /** 바꾼 값 행이 있다(기본값과 같은 값은 행을 만들지 않는다). */
  changed: boolean
  /** 행은 있는데 값을 읽을 수 없다(모양이 틀렸거나 범위 밖). 이때 `value`는 기본값이고 신호 계산도 기본값을 쓴다. */
  unreadable: boolean
  /** 직전 값(값을 바꿀 때 이전 값, 첫 저장은 기본값). 없거나 읽을 수 없으면 `null`. */
  previousValue: ThresholdValue
  /** 행의 수정 시각. 행이 없으면 `null`이고 저장 요청의 `expectedUpdatedAt`도 `null`이다. */
  updatedAt: string | null
}

/** `ops_rules` 신호 행(저장 모양). */
export interface ThresholdRow {
  rule_key: string
  value: Json
  updated_at: string
  previous_value: Json | null
}

/** `ops_rules`에서 신호 기준값 행을 읽는 열. 관리자 ID(`updated_by`)는 읽지 않는다. */
export const THRESHOLD_ROW_COLUMNS = 'rule_key, value, updated_at, previous_value'

// ── 값 확인 ─────────────────────────────────────────────────────────────────────────────────────

export const THRESHOLD_ERRORS = {
  empty: '값을 적어 주세요',
  weekday: '요일을 골라 주세요',
  weekdayMonToSat: '월요일부터 토요일 중에서 골라 주세요',
  multiplier: '1.1 이상 10 이하의 숫자로 적어 주세요 (소수 첫째 자리까지, 예: 1.5)',
  readOnly: '이 값은 바꿀 수 없어요',
} as const

function isEmptyInput(raw: unknown): boolean {
  return raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')
}

function isTenthsNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value * 10 - Math.round(value * 10)) < 1e-9
}

function defaultNumber(key: OpsSignalThresholdKey): number {
  return DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES[key] as number
}

/**
 * 칸 하나의 값을 확인한다(서버와 화면이 함께 쓴다). 통과하면 `null`, 아니면 칸 아래에 보일 문장이다.
 * 정수 칸은 안전한 정수여야 하고(글자·소수는 「정수로 적어 주세요」), 범위 밖은 「<최소> 이상 <최대> 이하의 정수로」다. 배수 칸은 소수 첫째 자리까지다.
 * 요일 칸은 고를 수 있는 번호만 받는다. 글자로 온 숫자(`'6'`)는 정수로 보지 않는다 — 화면이 글자를 숫자로 바꿔 넘긴다(`textToThresholdInput`).
 */
export function checkThresholdInput(key: OpsSignalThresholdKey, raw: unknown): string | null {
  const field = FIELD_BY_KEY.get(key)
  if (!field || field.readOnly) return THRESHOLD_ERRORS.readOnly

  if (field.kind === 'weekday') {
    const message = key === 'nextWeekCheckFromWeekday' ? THRESHOLD_ERRORS.weekdayMonToSat : THRESHOLD_ERRORS.weekday
    return typeof raw === 'number' && Number.isInteger(raw) && field.weekdays.includes(raw) ? null : message
  }
  if (isEmptyInput(raw)) return THRESHOLD_ERRORS.empty

  if (field.kind === 'multiplier') {
    return isTenthsNumber(raw) && raw >= field.min && raw <= field.max ? null : THRESHOLD_ERRORS.multiplier
  }
  // integer
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw)) return `정수로 적어 주세요 (예: ${defaultNumber(key)})`
  if (raw < field.min || raw > field.max) {
    const range = `${field.min} 이상 ${field.max} 이하의 정수로 적어 주세요`
    return key === 'monthlyRoutineDay' ? `${range} (29일부터는 없는 달이 있어요)` : range
  }
  return null
}

/**
 * 저장된 행의 값(`{"value": <값>}`)을 읽는다. 값이 칸의 범위를 지키면 읽을 수 있고, 아니면(모양 틀림·범위 밖·0 같은 값) 읽을 수 없다.
 * 신호 계산(`overrides.ts`)과 설정 화면이 같은 판정을 쓴다. 읽기 전용 시각(`routineCheckStartsAt`)은 시각으로 읽히는 글이어야 한다.
 */
export function readStoredThresholdValue(
  key: OpsSignalThresholdKey,
  raw: unknown
): { ok: true; value: number | string } | { ok: false } {
  const field = FIELD_BY_KEY.get(key)
  if (!field || typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false }
  const value = (raw as Record<string, unknown>).value
  if (field.kind === 'readonly_time') {
    return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value)) ? { ok: true, value } : { ok: false }
  }
  if (typeof value !== 'number') return { ok: false }
  return checkThresholdInput(key, value) === null ? { ok: true, value } : { ok: false }
}

/** 맞물린 칸 쌍의 키. 서버가 요청에 없는 칸을 저장된 값·기본값으로 채워 함께 확인한다. */
export const INTERLOCKED_THRESHOLD_KEYS: readonly OpsSignalThresholdKey[] = [
  'minLiveCards',
  'maxLiveCards',
  'monotonyWindowDays',
  'monotonySamePatternCount',
  'monotonySameShapeDays',
]

/**
 * 맞물린 값의 확인(칸 하나씩이 아니라 함께 봐야 하는 것). 관련 칸 모두에 오류를 낸다.
 * - 최소 장수 ≤ 최대 장수
 * - 같은 패턴 횟수·같은 모양 연속 일수 ≤ 되돌아보는 기간
 * 값이 없는 칸(`undefined`)은 견주지 않는다.
 */
export function thresholdInterlockErrors(
  values: Partial<Record<OpsSignalThresholdKey, number>>
): Partial<Record<OpsSignalThresholdKey, string>> {
  const errors: Partial<Record<OpsSignalThresholdKey, string>> = {}
  const { minLiveCards: min, maxLiveCards: max, monotonyWindowDays: windowDays } = values
  const pattern = values.monotonySamePatternCount
  const shape = values.monotonySameShapeDays

  if (min !== undefined && max !== undefined && min > max) {
    errors.minLiveCards = `최소 장수는 최대 장수(${max}장)보다 클 수 없어요`
    errors.maxLiveCards = `최대 장수는 최소 장수(${min}장)보다 작을 수 없어요`
  }
  if (windowDays !== undefined) {
    const patternOver = pattern !== undefined && pattern > windowDays
    const shapeOver = shape !== undefined && shape > windowDays
    if (patternOver) errors.monotonySamePatternCount = `되돌아보는 기간(${windowDays}일)보다 클 수 없어요`
    if (shapeOver) errors.monotonySameShapeDays = `되돌아보는 기간(${windowDays}일)보다 클 수 없어요`
    if (patternOver || shapeOver) {
      const largest = Math.max(patternOver ? (pattern as number) : 0, shapeOver ? (shape as number) : 0)
      errors.monotonyWindowDays = `되돌아보는 기간은 ${largest}일보다 짧을 수 없어요`
    }
  }
  return errors
}

// ── 한 칸의 상태 만들기(저장 행 → 화면·응답 모양) ───────────────────────────────────────────────

/** 저장 행(없을 수 있다)을 칸 한 건으로 옮긴다. 행이 없으면 기본값 그대로다. */
export function toThresholdRecord(key: OpsSignalThresholdKey, row?: ThresholdRow): SignalThresholdRecord {
  const field = FIELD_BY_KEY.get(key) as ThresholdFieldSpec
  const defaultValue = DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES[key]
  const base = { ruleKey: key, group: 'signal' as const, signal: field.signal, readOnly: field.readOnly, defaultValue }
  if (!row) return { ...base, value: defaultValue, changed: false, unreadable: false, previousValue: null, updatedAt: null }

  const stored = readStoredThresholdValue(key, row.value)
  const previous = row.previous_value === null ? null : readStoredThresholdValue(key, row.previous_value)
  return {
    ...base,
    value: stored.ok ? stored.value : defaultValue,
    changed: true,
    unreadable: !stored.ok,
    previousValue: previous && previous.ok ? previous.value : null,
    updatedAt: row.updated_at,
  }
}

/** 키 → 칸 한 건. 화면과 서버가 카드 하나를 다룰 때 쓴다. */
export type SignalRecordMap = Readonly<Partial<Record<string, SignalThresholdRecord>>>

export function recordMapOf(records: readonly SignalThresholdRecord[]): Record<string, SignalThresholdRecord> {
  return Object.fromEntries(records.map((record) => [record.ruleKey, record]))
}

// ── 값 보이기 ───────────────────────────────────────────────────────────────────────────────────

function weekdayName(value: number): string {
  return `${OPS_WEEKDAY_LABELS[value] ?? value}요일`
}

/** 「30분」「12시」「화요일」「2배」처럼 단위까지 붙인 글(칸 아래 「기본값 30분」·「직전 값 45분」에 쓴다). */
export function formatThresholdDisplay(key: OpsSignalThresholdKey, value: ThresholdValue): string {
  const field = FIELD_BY_KEY.get(key) as ThresholdFieldSpec
  if (value === null) return '없음'
  if (field.kind === 'weekday' && typeof value === 'number') return weekdayName(value)
  if (field.kind === 'readonly_time' && typeof value === 'string') return formatKstDayTime(value) ?? value
  return `${value}${field.unit}`
}

/** 읽기 전용 시각 칸의 글(값 있음 「10/6(화) 09:00」, 없음, 못 읽음). */
export function readOnlyTimeText(record: SignalThresholdRecord | undefined): string {
  if (!record || (record.changed && record.unreadable)) return READONLY_TIME_TEXT.unreadable
  if (typeof record.value !== 'string') return READONLY_TIME_TEXT.unset
  return formatKstDayTime(record.value) ?? READONLY_TIME_TEXT.unreadable
}

/**
 * 바꾼 칸에만 보이는 줄. 「바꾼 값이에요 · 기본값 30분」, 직전 값이 있고 기본값과 다르면 「 · 직전 값 45분」이 붙는다.
 * 바꾼 값이 없거나 읽을 수 없는 칸은 `null`이다(읽을 수 없는 칸은 오류 문장이 대신한다).
 */
export function changedFieldLine(record: SignalThresholdRecord | undefined): string | null {
  if (!record || record.readOnly || !record.changed || record.unreadable) return null
  const base = `바꾼 값이에요 · 기본값 ${formatThresholdDisplay(record.ruleKey, record.defaultValue)}`
  if (record.previousValue === null || record.previousValue === record.defaultValue) return base
  return `${base} · 직전 값 ${formatThresholdDisplay(record.ruleKey, record.previousValue)}`
}

/** 카드에서 바꾼 값(읽을 수 있는 행)의 수. 「바꾼 값 N」 칩의 N이다. 읽기 전용 칸은 세지 않는다. */
export function signalChangedCount(card: SignalCardSpec, records: SignalRecordMap): number {
  return card.editableFields.filter((field) => {
    const record = records[field.key]
    return record?.changed === true && !record.unreadable
  }).length
}

/**
 * 카드 마지막 줄. 바꾼 값이 있으면 「마지막으로 바꾼 사람 관리자 · 10/1(목) 15:20」(바꾼 칸 가운데 가장 늦은 시각), 없으면 칸이 하나면
 * 「기본값 그대로예요」, 여럿이면 「모두 기본값 그대로예요」다. 읽을 수 없는 행만 있으면 줄을 두지 않는다(그 칸의 오류 문장이 알린다).
 */
export function signalLastChangeLine(card: SignalCardSpec, records: SignalRecordMap): string | null {
  const changed = card.editableFields
    .map((field) => records[field.key])
    .filter((record): record is SignalThresholdRecord => record?.changed === true && !record.unreadable && record.updatedAt !== null)
  if (changed.length > 0) {
    const latest = changed.reduce((a, b) => (Date.parse(b.updatedAt as string) > Date.parse(a.updatedAt as string) ? b : a))
    const when = formatKstDayTime(latest.updatedAt)
    return when ? `마지막으로 바꾼 사람 관리자 · ${when}` : '마지막으로 바꾼 사람 관리자'
  }
  if (card.editableFields.some((field) => records[field.key]?.unreadable === true)) return null
  return card.editableFields.length === 1 ? '기본값 그대로예요' : '모두 기본값 그대로예요'
}

// ── 초안 ────────────────────────────────────────────────────────────────────────────────────────

/** 카드가 들고 있는 편집 중인 값: 편집 칸 키 → 입력한 글(요일 칸은 번호 글). */
export type SignalDraft = Record<string, string>

/** 저장된 칸에서 처음 초안을 만든다. 읽을 수 없는 칸은 빈 글이다(저장하려면 다시 적거나 기본값으로 되돌려야 한다). */
export function draftFromSignalRecords(card: SignalCardSpec, records: SignalRecordMap): SignalDraft {
  const draft: SignalDraft = {}
  for (const field of card.editableFields) {
    const record = records[field.key]
    draft[field.key] = !record || record.unreadable ? '' : String(record.value)
  }
  return draft
}

/** 칸 하나를 기본값으로 되돌린 뒤의 초안: 그 칸만 기본값으로 바꾸고 **같은 카드 다른 칸의 입력 중 값은 그대로 둔다**. */
export function draftAfterRevert(draft: SignalDraft, reverted: SignalThresholdRecord): SignalDraft {
  return { ...draft, [reverted.ruleKey]: String(reverted.value) }
}

/** 입력한 글을 검증 함수가 읽는 값으로 바꾼다: 빈 글은 그대로(빈 칸 오류), 숫자 모양이면 숫자, 그 밖은 글 그대로(오류). 배수 칸만 소수를 받는다. */
export function textToThresholdInput(key: OpsSignalThresholdKey, text: string): number | string {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  const field = FIELD_BY_KEY.get(key)
  const pattern = field?.kind === 'multiplier' ? /^-?\d+(\.\d+)?$/ : /^-?\d+$/
  if (!pattern.test(trimmed)) return trimmed
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : trimmed
}

function numbersEqual(key: OpsSignalThresholdKey, text: string, base: string): boolean {
  if (text === base) return true
  const a = textToThresholdInput(key, text)
  const b = textToThresholdInput(key, base)
  return typeof a === 'number' && typeof b === 'number' && a === b
}

/** 저장된 값과 다르게 고친 편집 칸의 키. 숫자로 같은 값(「06」과 「6」)은 바꾼 것으로 보지 않는다. */
export function signalDraftChangedKeys(card: SignalCardSpec, records: SignalRecordMap, draft: SignalDraft): OpsSignalThresholdKey[] {
  const base = draftFromSignalRecords(card, records)
  return card.editableFields
    .filter((field) => !numbersEqual(field.key, (draft[field.key] ?? '').trim(), base[field.key]))
    .map((field) => field.key)
}

/** 확인 결과: 칸별 오류와, 오류가 없는 칸의 값(저장된 값을 안 고친 칸은 지금 값, 읽을 수 없는 칸은 기본값). */
export interface DraftCheck {
  errors: Partial<Record<OpsSignalThresholdKey, string>>
  /** 고친 칸 가운데 통과한 값. */
  typed: Partial<Record<OpsSignalThresholdKey, number>>
  /** 모든 편집 칸의 값(맞물림·결과 문장의 입력). 오류가 있는 칸은 비어 있다. */
  values: Partial<Record<OpsSignalThresholdKey, number>>
}

/**
 * 초안을 확인한다. **고친 칸만** 칸 규칙을 확인하고(안 고친 칸은 저장된 값이라 이미 통과했거나 읽을 수 없는 행이다 — 읽을 수 없는 행이 있다고 같은 카드의
 * 다른 칸 저장이 막히지 않는다), 맞물림은 고친 값과 저장된 값(읽을 수 없으면 기본값)을 합쳐서 확인한다.
 */
export function checkSignalDraft(card: SignalCardSpec, records: SignalRecordMap, draft: SignalDraft): DraftCheck {
  const changed = new Set<string>(signalDraftChangedKeys(card, records, draft))
  const errors: DraftCheck['errors'] = {}
  const typed: DraftCheck['typed'] = {}
  const values: DraftCheck['values'] = {}

  for (const field of card.editableFields) {
    const record = records[field.key]
    if (changed.has(field.key)) {
      const input = textToThresholdInput(field.key, draft[field.key] ?? '')
      const message = checkThresholdInput(field.key, input)
      if (message) errors[field.key] = message
      else {
        typed[field.key] = input as number
        values[field.key] = input as number
      }
    } else {
      values[field.key] = (record && !record.unreadable ? record.value : DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES[field.key]) as number
    }
  }
  const interlock = thresholdInterlockErrors(values)
  for (const [key, message] of Object.entries(interlock)) {
    if (errors[key as OpsSignalThresholdKey] === undefined) errors[key as OpsSignalThresholdKey] = message
  }
  return { errors, typed, values }
}

/** 저장 요청 본문: 고친 칸의 값과, 칸마다 화면이 본 수정 시각(행이 없으면 `null`). 오류가 있으면 호출하지 않는다. */
export interface SignalPatchBody {
  values: Record<string, number>
  expectedUpdatedAt: Record<string, string | null>
}

export function signalDraftToPatch(card: SignalCardSpec, records: SignalRecordMap, draft: SignalDraft): SignalPatchBody {
  const { typed } = checkSignalDraft(card, records, draft)
  const body: SignalPatchBody = { values: {}, expectedUpdatedAt: {} }
  for (const field of card.editableFields) {
    const value = typed[field.key]
    if (value === undefined) continue
    body.values[field.key] = value
    body.expectedUpdatedAt[field.key] = records[field.key]?.updatedAt ?? null
  }
  return body
}

// ── 결과 문장 ───────────────────────────────────────────────────────────────────────────────────

/**
 * 카드의 결과 문장(값을 고치는 동안 바로 바뀐다). 칸이 하나라도 틀리면 `null`이다(그때는 칸 아래 오류 문장만 보인다).
 * 문장은 채원 확정 설계의 9개다.
 */
export function signalResultSentence(card: SignalCardSpec, records: SignalRecordMap, draft: SignalDraft): string | null {
  const { errors, values } = checkSignalDraft(card, records, draft)
  if (Object.keys(errors).length > 0) return null
  const v = (key: OpsSignalThresholdKey) => values[key] as number

  switch (card.signal) {
    case 'execution_failed':
      return `최근 ${v('failureLookbackDays')}일 안에 실패로 바뀐 항목이 있으면 알려요`
    case 'missed_schedule':
      return `공개 시각이 지나고 ${v('missedScheduleMinutes')}분이 지나도 공개되지 않으면 알려요`
    case 'routine_failed':
      return `주간 루틴은 ${weekdayName(v('weeklyRoutineWeekday'))} ${v('weeklyRoutineDeadlineHour')}시까지, 월간 루틴은 매월 ${v('monthlyRoutineDay')}일 ${v('monthlyRoutineDeadlineHour')}시까지 기획안이 나오지 않으면 알려요`
    case 'empty_content':
      return `하루에 게재하는 카드가 ${v('minLiveCards')}장보다 적거나 ${v('maxLiveCards')}장보다 많은 날을 알려요. 다음 주 편성은 ${weekdayName(v('nextWeekCheckFromWeekday'))}부터 검사해요`
    case 'no_new_content':
      return `그날 새로 게재를 시작하는 홈피드 카드가 ${v('minNewContentCards')}장보다 적으면 알려요`
    case 'approval_deadline':
      return `공개 시각 ${v('approvalDeadlineHours')}시간 전까지 승인하지 않았거나 예약 등록하지 않은 항목이 있으면 알려요`
    case 'overlap':
      return `같은 날 이미지가 있는 모양의 카드가 ${v('overlapImageShapeCards')}장 이상이거나, 이미지가 없는 모양의 카드가 ${v('minNonImageShapeCards')}장보다 적거나, 신규 유저에게 보이는 카드가 ${v('maxNewUserCards')}장보다 많으면 알려요`
    case 'monotony':
      return `최근 ${v('monotonyWindowDays')}일의 대표 카드에서 같은 패턴·트라이브가 ${v('monotonySamePatternCount')}번 이상 나오거나 같은 모양이 ${v('monotonySameShapeDays')}일 연속 대표이면 알려요`
    case 'action_spike':
      return `최근 7일 합계가 직전 ${v('actionSpikeBaselineWeeks')}주 주평균의 ${v('actionSpikeMultiplier')}배 이상이고 지표별 최소 건수 이상이면 알려요`
    default:
      return null
  }
}
