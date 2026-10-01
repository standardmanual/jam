/**
 * 설정 화면(S7)의 밸런스 규칙 카드가 쓰는 순수 논리와 문구 (티켓 20260930_1459 조각 B, 채원 확정 설계 「조각 B (S7 운영 설정)」).
 *
 * 화면은 초안(`RuleDraft`)을 들고 있다가 이 파일의 함수로 칸 확인·결과 문장·저장 전 표시·저장 본문·R6·R7 파생 표시를 만든다. 서버 전용 코드를
 * 끌어오지 않는다(클라이언트 부품이 불러온다). 저장 입력의 확인은 서버가 쓰는 `rules.ts`의 `validateRuleValue`를 그대로 쓰므로 화면의 오류와
 * 서버 400의 `fieldErrors`가 같은 칸에 같은 문장으로 나온다.
 *
 * 문구는 채원 확정 설계를 따른다(해요체). 문구와 판정은 이 파일에서 테스트로 고정한다(`__tests__/settings.test.ts`).
 */
import type { Json } from '@/types/database.generated'
import { formatKstDayTime } from '@/lib/admin/opsInbox/labels'
import {
  BALANCE_LEVEL_LABELS,
  POINT_KINDS,
  POINT_KIND_LABELS,
  checkIntegerField,
  isBalanceRuleKey,
  parseRuleValue,
  validateRuleValue,
  type BalanceLevel,
  type BalanceRuleKey,
  type EconomyKeysValue,
  type MaxValue,
  type MinDaysValue,
  type OpsRuleRecord,
  type PointKind,
  type PointRewardValue,
  type RuleFieldErrors,
} from './rules'

// ── 구역·그룹 ───────────────────────────────────────────────────────────────────────────────────

export const SETTINGS_PAGE_TITLE = '운영 설정'
export const SETTINGS_PAGE_SUBTITLE = '운영툴이 알려 주는 기준을 확인하고 바꿔요'

export const BALANCE_SECTION_TITLE = '밸런스 규칙'
export const BALANCE_SECTION_DESCRIPTION = [
  '기획이 이 기준을 넘으면 기획 상세에 경고가 떠요. 경고는 승인을 막지 않아요.',
  '값을 바꾸면 기획 상세를 다음에 열 때부터 반영돼요. 에이전트의 주간 밸런스 점검도 같은 값을 읽어요.',
  '주의는 눈에 띄게, 참고는 가볍게 알려요.',
] as const

/** 밸런스 규칙 8개를 보이는 그룹 3개. 순서가 화면 순서다. */
export const BALANCE_RULE_GROUPS: ReadonlyArray<{ id: string; title: string; keys: readonly BalanceRuleKey[] }> = [
  {
    id: 'collection-launch',
    title: '컬렉션 개방',
    keys: ['open_collections_max', 'weekly_new_collections_max', 'rolling_new_collections_max', 'launch_lead_days_min'],
  },
  { id: 'point-size', title: '포인트 크기', keys: ['point_reward_max', 'single_action_points', 'count_ladder_points'] },
  { id: 'economy', title: '경제 수치 불변', keys: ['economy_keys'] },
]

/** 규칙 카드의 앵커 ID. S3의 「밸런스 규칙 보기」가 `#rule-<규칙 키>`로 온다. */
export function ruleAnchorId(ruleKey: string): string {
  return `rule-${ruleKey}`
}

export const SECTION_LOAD_FAILED = {
  title: '밸런스 규칙을 불러오지 못했어요',
  description: '서버에 문제가 있었을 수 있어요. 새로 고쳐 다시 불러와 주세요',
  retry: '새로 고치기',
} as const

export const SECTION_EMPTY = {
  title: '밸런스 규칙이 아직 등록되지 않았어요',
  description: '개발 쪽에 마이그레이션 적용을 요청해 주세요',
} as const

// ── 규칙 카드 문구 ──────────────────────────────────────────────────────────────────────────────

/** 규칙별 쉬운 설명. R2~R4는 결과 문장과 같은 뜻으로 썼다(채원 설계). */
export const RULE_EASY_DESCRIPTIONS: Record<BalanceRuleKey, string> = {
  open_collections_max: '컬렉션이 한꺼번에 너무 많이 열려 있지 않은지 봐요. 새 컬렉션을 여는 항목마다, 그 시각에 열려 있을 컬렉션이 기준보다 많으면 알려요.',
  weekly_new_collections_max: '같은 주(월~일)에 새로 여는 컬렉션이 기준보다 많으면 알려요.',
  rolling_new_collections_max: '공개 시각부터 거슬러 28일 안에 새로 여는 컬렉션이 기준보다 많으면 알려요. 예약·게재 중인 다른 기획도 같이 세요.',
  launch_lead_days_min: '새 컬렉션을 공개하기까지 남은 날이 기준보다 적으면 알려요.',
  point_reward_max: '항목 하나가 주는 포인트가 종류별 기준보다 크면 알려요.',
  single_action_points: '한 번의 행동으로 미션(또는 컬렉션 완성)과 보상 배지가 포인트를 함께 줄 때, 합이 기준을 넘으면 알려요.',
  count_ladder_points:
    '같은 계열의 횟수형 JAM! 배지 단계마다 주는 포인트를 모두 더한 값이 기준을 넘으면 알려요. 단계를 잘게 쪼개 포인트를 쓸어 담는 것을 막아요.',
  economy_keys: '드랍 확률·등급 비율·믹스 실패 보상 같은 경제 수치는 기획에서 바꾸지 않아요. 항목에 그런 값이 들어 있으면 알려요.',
}

export const ENABLED_LABELS = { on: '켜짐', off: '꺼짐' } as const
export const RULE_OFF_NOTE = '꺼 두면 이 규칙은 경고를 만들지 않아요'
export const ECONOMY_OFF_NOTE = '꺼 두면 항목에 드랍 확률 같은 경제 수치가 들어 있어도 알려 주지 않아요'
/** 조각 A 게이트 발견물 ③: R5를 끄면 보상 배지가 없는 항목의 포인트 초과는 어느 규칙에도 걸리지 않는다. */
export const POINT_REWARD_OFF_NOTE = 'R5를 끄면 보상 배지가 없는 항목의 포인트 초과는 알려 주지 않아요'
export const ECONOMY_READONLY_HINT = '드랍 확률·믹스 정책의 값 키 이름이 항목에 있으면 알려요'
export const DERIVED_ANCHOR_LABEL = '항목별 포인트(R5)에서 바꿔요'
export const DERIVED_UNREADABLE = '항목별 포인트(R5)의 값을 읽을 수 없어요'

export const LEVEL_FIELD_LABEL = '경고 수준'
export const PROVISIONAL_CHECK_LABEL = '임시값'
export const PROVISIONAL_HINT = '값을 바꿨어요. 실측으로 정한 값이면 임시값 표시를 꺼 주세요'
export const UNSAVED_CHIP_LABEL = '저장 전'

export const SAVE_LABEL = '저장하기'
export const SAVING_LABEL = '저장하는 중'
export const RETRY_SAVE_LABEL = '다시 저장하기'
export const CANCEL_CHANGES_LABEL = '바꾼 내용 취소'
export const REVERT_LABEL = '직전 값으로 되돌리기'
export const SAVED_LIVE_MESSAGE = '저장했어요'
export const SAVE_FAILED_TITLE = '저장하지 못했어요'
export const SAVE_FAILED_KEEP_NOTE = '입력한 값은 그대로 있어요'
export const CONFLICT_RELOAD_LABEL = '최신 값 불러오기'
export const CONFLICT_MESSAGE = '그사이 다른 곳에서 이 규칙이 바뀌었어요. 최신 값을 불러온 뒤 다시 바꿔 주세요'
export const RELOAD_FAILED_MESSAGE = '최신 값을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요'

/** 저장 성공 토스트: 제목 「<규칙 이름> 기준을 바꿨어요」 / 설명. */
export function savedToastTitle(ruleName: string): string {
  return `${ruleName} 기준을 바꿨어요`
}
export const SAVED_TOAST_DESCRIPTION = '기획 상세를 다음에 열 때부터 반영돼요'

export const OPEN_NOW_UNREADABLE = '열린 컬렉션 수를 읽지 못했어요'

// ── 칸 정의 ─────────────────────────────────────────────────────────────────────────────────────

/** 숫자 칸 하나의 정의. `path`는 서버 400 `fieldErrors`의 키와 같다. */
export interface RuleFieldSpec {
  path: string
  provisionalPath: string
  label: string
  unit: string
  min: 0 | 1
  /** R5 종류 줄이면 그 종류. */
  kind?: PointKind
}

const SINGLE_FIELD_LABELS: Partial<Record<BalanceRuleKey, { path: string; label: string; unit: string }>> = {
  open_collections_max: { path: 'max', label: '열어 둘 수 있는 컬렉션 최대 수', unit: '개' },
  weekly_new_collections_max: { path: 'max', label: '한 주에 새로 열 수 있는 컬렉션 최대 수', unit: '개' },
  rolling_new_collections_max: { path: 'max', label: '28일 동안 새로 열 수 있는 컬렉션 최대 수', unit: '개' },
  launch_lead_days_min: { path: 'min_days', label: '공개까지 남아 있어야 하는 최소 일수', unit: '일' },
}

/** 규칙의 숫자 칸 목록. R6·R7·R8은 값을 바꾸지 않아 비어 있다. R5는 종류 5줄이다. */
export function ruleFieldSpecs(key: BalanceRuleKey): RuleFieldSpec[] {
  if (key === 'point_reward_max') {
    return POINT_KINDS.map((kind) => ({
      path: `kinds.${kind}.max`,
      provisionalPath: `kinds.${kind}.provisional`,
      label: POINT_KIND_LABELS[kind],
      unit: '포인트',
      min: 0,
      kind,
    }))
  }
  const single = SINGLE_FIELD_LABELS[key]
  return single ? [{ path: single.path, provisionalPath: 'provisional', label: single.label, unit: single.unit, min: 1 }] : []
}

// ── 초안 ────────────────────────────────────────────────────────────────────────────────────────

/** 카드가 들고 있는 편집 중인 값. 숫자 칸은 입력한 글 그대로(`texts`)이고, 임시값 표시는 칸마다 하나다. */
export interface RuleDraft {
  enabled: boolean
  level: BalanceLevel
  /** 칸 경로 → 입력한 글. */
  texts: Record<string, string>
  /** 임시값 경로 → 켜짐. */
  provisional: Record<string, boolean>
}

function readFieldValue(key: BalanceRuleKey, parsed: ReturnType<typeof parseRuleValue>, spec: RuleFieldSpec): { number: number; provisional: boolean } | null {
  if (!parsed) return null
  if (key === 'launch_lead_days_min') {
    const value = parsed as MinDaysValue
    return { number: value.minDays, provisional: value.provisional }
  }
  if (key === 'point_reward_max') {
    const entry = (parsed as PointRewardValue).kinds[spec.kind as PointKind]
    return entry ? { number: entry.max, provisional: entry.provisional } : null
  }
  const value = parsed as MaxValue
  return { number: value.max, provisional: value.provisional }
}

/** 저장된 규칙에서 처음 초안을 만든다. 값 모양이 틀린 칸은 빈 글이다(저장하려면 다시 적어야 한다). */
export function draftFromRecord(record: OpsRuleRecord): RuleDraft {
  const draft: RuleDraft = { enabled: record.enabled, level: record.level, texts: {}, provisional: {} }
  if (!isBalanceRuleKey(record.ruleKey)) return draft
  const parsed = parseRuleValue(record.ruleKey, record.value)
  for (const spec of ruleFieldSpecs(record.ruleKey)) {
    const read = readFieldValue(record.ruleKey, parsed, spec)
    draft.texts[spec.path] = read ? String(read.number) : ''
    draft.provisional[spec.provisionalPath] = read ? read.provisional : false
  }
  return draft
}

/** 입력한 글을 검증 함수가 읽는 값으로 바꾼다: 빈 글은 그대로(빈 칸 오류), 정수 모양이면 숫자, 그 밖에는 글 그대로(정수 아님 오류). */
export function textToNumberInput(text: string): number | string {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  if (/^-?\d+$/.test(trimmed)) {
    const number = Number(trimmed)
    return Number.isSafeInteger(number) ? number : trimmed
  }
  return trimmed
}

/** 초안을 저장 요청의 `value`(검증 함수가 읽는 모양)로 만든다. 값 칸이 없는 규칙은 `undefined`다. */
export function valueInputFromDraft(key: BalanceRuleKey, draft: RuleDraft): unknown {
  const specs = ruleFieldSpecs(key)
  if (specs.length === 0) return undefined
  if (key === 'point_reward_max') {
    const kinds: Record<string, unknown> = {}
    for (const spec of specs) {
      kinds[spec.kind as PointKind] = {
        max: textToNumberInput(draft.texts[spec.path] ?? ''),
        provisional: draft.provisional[spec.provisionalPath] ?? false,
      }
    }
    return { kinds }
  }
  const spec = specs[0]
  return {
    [spec.path]: textToNumberInput(draft.texts[spec.path] ?? ''),
    provisional: draft.provisional[spec.provisionalPath] ?? false,
  }
}

/** 칸별 오류(저장 전 확인). 서버와 같은 `validateRuleValue`를 쓴다. 값 칸이 없는 규칙은 늘 비어 있다. */
export function draftFieldErrors(key: BalanceRuleKey, draft: RuleDraft): RuleFieldErrors {
  const input = valueInputFromDraft(key, draft)
  if (input === undefined) return {}
  const checked = validateRuleValue(key, input)
  return checked.ok ? {} : checked.fieldErrors
}

// ── 바뀐 것 ─────────────────────────────────────────────────────────────────────────────────────

export interface DraftChanges {
  enabled: boolean
  level: boolean
  /** 숫자 칸이나 임시값 표시가 하나라도 바뀌었는지. */
  value: boolean
  /** 바뀐 숫자 칸·임시값 경로. */
  paths: string[]
  any: boolean
}

/** 저장된 규칙과 초안을 견준다(「저장 전」 칩과 [저장하기] 활성의 근거). */
export function draftChanges(record: OpsRuleRecord, draft: RuleDraft): DraftChanges {
  const base = draftFromRecord(record)
  const paths: string[] = []
  for (const path of Object.keys(base.texts)) if ((draft.texts[path] ?? '') !== base.texts[path]) paths.push(path)
  for (const path of Object.keys(base.provisional)) if ((draft.provisional[path] ?? false) !== base.provisional[path]) paths.push(path)
  const enabled = draft.enabled !== base.enabled
  const level = draft.level !== base.level
  const value = paths.length > 0
  return { enabled, level, value, paths, any: enabled || level || value }
}

export interface RulePatchBody {
  value?: unknown
  level?: BalanceLevel
  enabled?: boolean
}

/** 바뀐 것만 담은 저장 본문(`expectedUpdatedAt`은 호출한 쪽이 붙인다). 바뀐 것이 없으면 빈 객체다. */
export function draftToPatch(record: OpsRuleRecord, draft: RuleDraft): RulePatchBody {
  if (!isBalanceRuleKey(record.ruleKey)) return {}
  const changes = draftChanges(record, draft)
  const body: RulePatchBody = {}
  if (changes.value) body.value = valueInputFromDraft(record.ruleKey, draft)
  if (changes.level) body.level = draft.level
  if (changes.enabled) body.enabled = draft.enabled
  return body
}

/** 임시값 표시가 켜진 칸의 값을 바꿨는지(힌트 「값을 바꿨어요. 실측으로 정한 값이면 임시값 표시를 꺼 주세요」의 조건). 저장은 막지 않는다. */
export function shouldHintProvisional(record: OpsRuleRecord, draft: RuleDraft): boolean {
  if (!isBalanceRuleKey(record.ruleKey)) return false
  const changes = draftChanges(record, draft)
  return ruleFieldSpecs(record.ruleKey).some(
    (spec) => changes.paths.includes(spec.path) && draft.provisional[spec.provisionalPath] === true
  )
}

// ── 결과 문장 ───────────────────────────────────────────────────────────────────────────────────

/** 칸의 글이 이 칸의 규칙(정수·최솟값)을 통과하면 그 숫자, 아니면 `null`. */
export function validFieldNumber(text: string, min: 0 | 1): number | null {
  const input = textToNumberInput(text)
  return checkIntegerField(input, min) === null ? (input as number) : null
}

/**
 * 값 아래 결과 문장(값을 고치는 동안 바로 바뀐다). 칸이 통과하지 못하면 `null`이다(그때는 입력 아래 오류 문장이 보인다).
 * R1 「열려 있을 컬렉션이 7개째가 되면 알려요」(값 6), R2 「한 주(월~일)에 2개째부터 알려요」(값 1), R3 「…28일 안에 3개째부터 알려요…」(값 2),
 * R4 「공개까지 28일보다 적게 남으면 알려요」, R5 「N 포인트를 넘으면 알려요」. R2·R3의 값은 허용하는 최대 수라 한 칸 위부터 알린다.
 */
export function resultSentence(key: BalanceRuleKey, spec: RuleFieldSpec, draft: RuleDraft): string | null {
  const n = validFieldNumber(draft.texts[spec.path] ?? '', spec.min)
  if (n === null) return null
  switch (key) {
    case 'open_collections_max':
      return `열려 있을 컬렉션이 ${n + 1}개째가 되면 알려요`
    case 'weekly_new_collections_max':
      return `한 주(월~일)에 ${n + 1}개째부터 알려요`
    case 'rolling_new_collections_max':
      return `공개 시각부터 거슬러 28일 안에 ${n + 1}개째부터 알려요. 예약·게재 중인 다른 기획도 같이 세요`
    case 'launch_lead_days_min':
      return `공개까지 ${n}일보다 적게 남으면 알려요`
    case 'point_reward_max':
      return `${n} 포인트를 넘으면 알려요`
    default:
      return null
  }
}

/**
 * R1의 「지금 서비스」 상자 문장. `maxText`는 초안의 값 칸 글이고 못 읽으면 기준 없이 열린 수만 말한다. 열린 수를 못 읽으면 그 사실만 말한다
 * (저장은 막지 않는다). 새 컬렉션 하나를 더 열면 열린 수 + 1개가 되므로 열린 수가 기준 이상이면 새 컬렉션을 여는 기획에는 경고가 뜬다.
 */
export function openCollectionsNote(open: number | null, maxText: string, level: BalanceLevel): string {
  if (open === null) return OPEN_NOW_UNREADABLE
  const max = validFieldNumber(maxText, 1)
  const head = `지금 열린 컬렉션은 ${open}개예요.`
  if (max === null) return head
  const levelWord = BALANCE_LEVEL_LABELS[level]
  if (open > max) return `${head} 기준(${max}개)보다 ${open - max}개 많아서 새 컬렉션을 여는 기획에는 ${levelWord}가 계속 떠요.`
  if (open === max) return `${head} 기준(${max}개)과 같아서 새 컬렉션을 하나 더 열면 ${levelWord}가 떠요.`
  return `${head} 기준(${max}개)까지 ${max - open}개 더 열 수 있어요.`
}

// ── R6·R7·R8 읽기 전용 표시 ─────────────────────────────────────────────────────────────────────

/** 저장된 R5 값을 읽는다(모양이 틀리면 `null`). */
export function readPointRewardValue(record: OpsRuleRecord | undefined): PointRewardValue | null {
  if (!record) return null
  return parseRuleValue('point_reward_max', record.value) as PointRewardValue | null
}

/**
 * R6·R7의 읽기 전용 값 문장. 따로 저장하지 않고 R5를 따르므로 R5를 저장하면 같이 바뀐다. R6 「미션 50 포인트 · 컬렉션 완성 20 포인트」,
 * R7 「100 포인트」(달성형 JAM! 배지 값). 해당 종류의 값을 읽을 수 없으면 `null`이다.
 */
export function derivedPointsText(key: 'single_action_points' | 'count_ladder_points', r5: PointRewardValue | null): string | null {
  if (!r5) return null
  if (key === 'count_ladder_points') {
    const limit = r5.kinds.achievement_badge
    return limit ? `${limit.max} 포인트` : null
  }
  const mission = r5.kinds.mission
  const completion = r5.kinds.collection_completion
  return mission && completion ? `미션 ${mission.max} 포인트 · 컬렉션 완성 ${completion.max} 포인트` : null
}

/** R8의 키 목록(읽기 전용 칩). 값 모양이 틀리면 빈 목록이다. */
export function economyKeysOf(record: OpsRuleRecord | undefined): string[] {
  if (!record) return []
  const parsed = parseRuleValue('economy_keys', record.value) as EconomyKeysValue | null
  return parsed ? parsed.keys : []
}

// ── 마지막 변경·직전 값 ─────────────────────────────────────────────────────────────────────────

/** 「직전 값」으로 보일 글. 규칙마다 모양이 달라 단위까지 적는다. 읽을 수 없으면 `null`이다. */
export function previousValueText(key: BalanceRuleKey, previous: Json | null): string | null {
  if (previous === null) return null
  const parsed = parseRuleValue(key, previous)
  if (!parsed) return null
  switch (key) {
    case 'open_collections_max':
    case 'weekly_new_collections_max':
    case 'rolling_new_collections_max':
      return `${(parsed as MaxValue).max}개`
    case 'launch_lead_days_min':
      return `${(parsed as MinDaysValue).minDays}일`
    case 'point_reward_max': {
      const kinds = (parsed as PointRewardValue).kinds
      const parts = POINT_KINDS.map((kind) => (kinds[kind] ? `${POINT_KIND_LABELS[kind]} ${kinds[kind]!.max}` : null))
      return parts.every((part) => part !== null) ? `${parts.join(' · ')} 포인트` : null
    }
    default:
      return null
  }
}

/** 직전 값으로 되돌릴 수 있는지: 직전 값이 있고 저장 규칙(`validateRuleValue`)을 통과한다. */
export function canRevertToPrevious(record: OpsRuleRecord): boolean {
  if (!isBalanceRuleKey(record.ruleKey) || record.previousValue === null) return false
  return validateRuleValue(record.ruleKey, record.previousValue).ok
}

export interface LastChangeLines {
  /** 「마지막으로 바꾼 사람 관리자 · 10/1(목) 15:20」. 한 번도 안 바꿨으면 「처음 값 그대로예요」. */
  changed: string
  /** 「직전 값 6개」. 한 번도 안 바꿨으면 `null`. 켜기·수준만 바꿨고 값은 그대로면 「값은 처음 그대로예요」. */
  previous: string | null
}

export function lastChangeLines(record: OpsRuleRecord): LastChangeLines {
  if (!record.edited) return { changed: '처음 값 그대로예요', previous: null }
  const when = formatKstDayTime(record.updatedAt)
  const changed = when ? `마지막으로 바꾼 사람 관리자 · ${when}` : '마지막으로 바꾼 사람 관리자'
  if (record.previousValue === null) return { changed, previous: '값은 처음 그대로예요' }
  const text = isBalanceRuleKey(record.ruleKey) ? previousValueText(record.ruleKey, record.previousValue) : null
  return { changed, previous: text ? `직전 값 ${text}` : '직전 값을 읽을 수 없어요' }
}

/** 규칙에 임시값 표시가 켜진 칸이 있는지(카드 제목 줄의 「임시값·실측 전」 칩). 값을 읽을 수 없으면 `false`다. */
export function recordHasProvisional(record: OpsRuleRecord): boolean {
  if (!isBalanceRuleKey(record.ruleKey)) return false
  const parsed = parseRuleValue(record.ruleKey, record.value)
  if (!parsed) return false
  return ruleFieldSpecs(record.ruleKey).some((spec) => readFieldValue(record.ruleKey as BalanceRuleKey, parsed, spec)?.provisional === true)
}
