/**
 * 운영 신호 13종의 이름표와 결과 타입 (티켓 20261001_1155, 순수 상수·타입).
 *
 * 신호는 모두 규칙으로 계산하고(AI 없음) 승인을 막지 않는다(운영툴 PRD §5). 13종의 순서는 PRD §5 표의 순서이고 이 파일의
 * `OPS_SIGNAL_CATALOG`가 유일한 원천이다 — 계산 결과(`compute.ts`)는 늘 이 순서로 13건을 돌려준다.
 *
 * 한 신호의 상태는 셋 가운데 하나다. 신호가 안 뜬 것(`clear`)과 확인하지 않은 것(`unchecked`)을 섞지 않는다 — 재료가 없는 신호를
 * 「안 뜸」으로 보이면 안전하다고 오해하기 때문이다(상위 티켓 20260930_1502 Q1).
 * - `raised`: 뜸. 결과가 한 건 이상 있다.
 * - `clear`: 안 뜸. 계산했고 걸린 것이 없다.
 * - `unchecked`: 확인 안 함. 사유는 `not_built`(계산 규칙을 아직 만들지 않음)·`not_started`(점검을 아직 시작하지 않음)·
 *   `load_failed`(재료를 읽지 못함) 셋 가운데 하나다.
 */

/** 신호 13종의 키. 순서가 곧 표시 순서다(PRD §5 표 순서). */
export const OPS_SIGNAL_KEYS = [
  'execution_failed',
  'missed_schedule',
  'routine_failed',
  'format_error',
  'empty_content',
  'no_new_content',
  'approval_deadline',
  'balance_warning',
  'excluded_items',
  'overlap',
  'monotony',
  'blocked_collection',
  'action_spike',
] as const

export type OpsSignalKey = (typeof OPS_SIGNAL_KEYS)[number]

/** 수준: 중단·주의·참고. */
export type OpsSignalLevel = 'stop' | 'warn' | 'info'

export const OPS_SIGNAL_LEVEL_LABELS: Record<OpsSignalLevel, string> = {
  stop: '중단',
  warn: '주의',
  info: '참고',
}

export interface OpsSignalDefinition {
  key: OpsSignalKey
  /** 운영자가 읽는 신호 이름(PRD §5 표의 「신호」 열과 같다). */
  name: string
  level: OpsSignalLevel
}

export const OPS_SIGNAL_CATALOG: readonly OpsSignalDefinition[] = [
  { key: 'execution_failed', name: '실행 실패', level: 'stop' },
  { key: 'missed_schedule', name: '예약 누락', level: 'stop' },
  { key: 'routine_failed', name: '루틴 실패', level: 'stop' },
  { key: 'format_error', name: '형식 오류', level: 'warn' },
  { key: 'empty_content', name: '비어 있는 컨텐츠', level: 'warn' },
  { key: 'no_new_content', name: '새 컨텐츠가 없는 날', level: 'warn' },
  { key: 'approval_deadline', name: '승인 마감 임박', level: 'warn' },
  { key: 'balance_warning', name: '밸런스 경고', level: 'warn' },
  { key: 'excluded_items', name: '에이전트가 뺀 항목', level: 'info' },
  { key: 'overlap', name: '겹침', level: 'info' },
  { key: 'monotony', name: '단조로운 흐름', level: 'info' },
  { key: 'blocked_collection', name: '획득 경로가 막힌 컬렉션', level: 'info' },
  { key: 'action_spike', name: '행동 횟수 급증', level: 'info' },
]

const DEFINITION_BY_KEY: ReadonlyMap<OpsSignalKey, OpsSignalDefinition> = new Map(
  OPS_SIGNAL_CATALOG.map((definition) => [definition.key, definition])
)

/** 키로 신호 정의를 찾는다. 13종 밖의 키는 없다(타입이 막는다). */
export function getOpsSignalDefinition(key: OpsSignalKey): OpsSignalDefinition {
  return DEFINITION_BY_KEY.get(key) as OpsSignalDefinition
}

export type OpsSignalState = 'raised' | 'clear' | 'unchecked'

/** 확인하지 않은 사유. */
export type OpsSignalUncheckedReason = 'not_built' | 'not_started' | 'load_failed'

/** 「확인 안 함」의 글자. `label`은 칩에, `detail`은 설명에 쓴다. */
export const OPS_SIGNAL_UNCHECKED_TEXT: Record<OpsSignalUncheckedReason, { label: string; detail: string }> = {
  not_built: { label: '아직 확인하지 않아요', detail: '이 신호의 계산 규칙을 아직 만들지 않았어요.' },
  not_started: { label: '아직 확인하지 않아요', detail: '이 신호의 점검을 아직 시작하지 않았어요.' },
  load_failed: { label: '확인하지 못했어요', detail: '이 신호에 필요한 데이터를 읽지 못했어요.' },
}

/** 신호 결과 한 건. 신호 하나는 결과를 여러 건 가질 수 있다. */
export interface OpsSignalResult {
  /** 운영자가 읽는 쉬운 해요체 문장. */
  message: string
  /** 결과가 걸린 날짜(KST 달력 날짜 `YYYY-MM-DD`). 날짜가 없는 결과는 null. */
  date: string | null
  /** 묶음 DB 행 ID(`ops_bundles.id`). 운영 묶음과 관계없는 결과는 null. */
  bundleId: string | null
  /** 항목 DB 행 ID(`ops_bundle_items.id`). 항목과 관계없는 결과는 null. */
  itemId: string | null
  /** 시험 묶음의 항목이 들어 있는 결과(시험 묶음을 포함해서 볼 때만 생긴다). */
  isSample: boolean
  /**
   * 이 결과가 「걸리기 시작한」 시각(ISO). 매시 점검(티켓 20261001_1154)이 직전 한 시간 창에 새로 걸린 것만 고를 때 쓴다.
   * 예약 누락은 공개 시각 + 기준 분, 루틴 실패는 마감 시각, 실행 실패는 항목이 바뀐 시각이다. 시작 시각을 정의하지 않은 결과는 null이다.
   */
  onsetAt: string | null
}

/** 신호 한 종류의 계산 결과. */
export interface OpsSignalOutcome {
  key: OpsSignalKey
  name: string
  level: OpsSignalLevel
  state: OpsSignalState
  /** `state`가 `unchecked`일 때만 값이 있다. */
  uncheckedReason: OpsSignalUncheckedReason | null
  /** `state`가 `raised`일 때만 비어 있지 않다. */
  results: OpsSignalResult[]
}

/** 요일 이름. 번호는 0=일 … 6=토다. */
export const OPS_WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/** `YYYY-MM-DD` → 「10월 7일(화)」. 형식이 틀리면 받은 글자를 그대로 돌려준다. */
export function formatSignalDay(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return date
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return `${month}월 ${day}일(${OPS_WEEKDAY_LABELS[weekday]})`
}

/** 결과를 만든다. 값이 없는 칸은 null·false로 채운다. */
export function makeSignalResult(
  message: string,
  fields: Partial<Omit<OpsSignalResult, 'message'>> = {}
): OpsSignalResult {
  return {
    message,
    date: fields.date ?? null,
    bundleId: fields.bundleId ?? null,
    itemId: fields.itemId ?? null,
    isSample: fields.isSample ?? false,
    onsetAt: fields.onsetAt ?? null,
  }
}

/** 결과 목록을 날짜 순으로 정렬한다(날짜가 없는 결과는 맨 뒤, 같은 날짜는 들어온 순서를 지킨다). */
export function sortSignalResults(results: readonly OpsSignalResult[]): OpsSignalResult[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      if (a.result.date !== b.result.date) {
        if (a.result.date === null) return 1
        if (b.result.date === null) return -1
        return a.result.date < b.result.date ? -1 : 1
      }
      return a.index - b.index
    })
    .map(({ result }) => result)
}
