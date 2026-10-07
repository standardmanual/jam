/**
 * 밸런스 규칙 평가 (티켓 20260930_1459 조각 A, 순수 함수). 규칙표·평가 방식의 정본은 `docs/specs/prd/ops-tool/PRD.md` §5.2다.
 *
 * `evaluateBundleBalance(items, rules, state, nowIso)`는 묶음 하나의 항목을 규칙 값과 서비스 상태로 재서 경고 목록,
 * 「점검 못 함」 목록, 항목마다 확인한 켜 둔 규칙 수를 돌려준다. 결과를 저장하지 않는다(기획 상세를 열 때마다 새로 계산한다).
 * 1502의 운영 홈·일정표도 이 결과를 읽어 표시만 하고 규칙 계산을 따로 만들지 않는다.
 *
 * - 항목 값은 수정본이 있으면 수정본, 없으면 제출 원본이다(`itemField`). 반려·취소·실패한 항목은 세지도 점검하지도 않는다.
 * - 끈 규칙은 계산하지도 세지도 않는다. 규칙 행이 없는 규칙은 만들지 않은 것으로 본다.
 * - 수치를 읽을 수 없으면 통과로 보지 않고 「점검 못 함」(참고)이다. 값 모양이 틀린 규칙, 읽지 못한 서비스 상태도 같다.
 * - R2·R3·R7의 경고는 항목 키를 비운다(묶음 알림). 나머지 경고와 모든 「점검 못 함」은 그 항목에 붙는다(규칙 값이 틀린 것만 비움).
 *   「항목 키」는 항목 행 ID(`ops_bundle_items.id`)다. 제출자가 정하는 `item_key`는 겹칠 수 있어 쓰지 않는다.
 */
import { JAM_ACTION_CONDITION_KEYS } from '@/lib/badge-engine/jamActionBadges'
import { isItemBookDroppable, type ItemBookVisibilityFields } from '@/lib/itembook/visibility'
import { KST_OFFSET_MS } from '@/lib/notifications/kst'
import { OPS_POST_APPROVAL_ITEM_STATUSES } from '@/lib/admin/opsInbox/constants'
import { asRecord, itemField, linksOf, type ViewableItem } from '@/lib/admin/opsInbox/itemView'
import { isIsoDateTime } from '@/lib/admin/opsInbox/validate'
import {
  BALANCE_RULE_KEYS,
  BALANCE_SKIPPED_STATUSES,
  type BalanceLevel,
  type BalanceRuleKey,
  type BalanceRules,
  type MaxValue,
  type PointKind,
  type RuleEntry,
} from './rules'
import {
  countLadderMessage,
  economyKeysMessage,
  leadTimeMessage,
  openCollectionsMessage,
  pointRewardMessage,
  rollingNewMessage,
  singleActionMessage,
  unreadableMessage,
  weeklyNewMessage,
  type UnreadableCause,
} from './messages'
import type { BalanceReferences, BalanceState } from './state'

const DAY_MS = 24 * 60 * 60 * 1000
const ROLLING_DAYS = 28

/** 승인 이후 상태. R4의 기준 시각이 지금이 아니라 승인 시각이 된다. */
const APPROVED_STATUSES: readonly string[] = OPS_POST_APPROVAL_ITEM_STATUSES

// ── 입력·출력 ───────────────────────────────────────────────────────────────────────────────────

/** 평가가 읽는 항목. 기획 상세의 항목 기록(`OpsItemRecord`)에 승인 시각을 더한 모양이다. */
export interface BalanceItemInput extends ViewableItem {
  /** 항목 행 ID. 결과의 「항목 키」다. */
  id: string
  position: number
  /** 제출자가 정한 값. 같은 묶음의 다른 항목이 `links`로 가리키는 데만 쓴다. */
  itemKey: string | null
  kind: string | null
  status: string
  startsAt: string | null
  endsAt: string | null
  /** 가장 최근 승인 결정의 시각. 승인 전이면 `null`. */
  approvedAt: string | null
  /**
   * 항목이 만든 자원을 가리키는 키(`ops_bundle_items.created_resource`, §8.5). 아직 만들지 않았거나 읽지 않았으면 비어 있다.
   * R7이 이미 만든 JAM! 배지(`badge_id`)를 DB에서 세고 항목에서 다시 세지 않는 데 쓴다(티켓 20261004_1756 가정 8).
   */
  createdResource?: unknown
}

/** 결과 한 건(PRD §5.2). 경고와 「점검 못 함」이 같은 모양이다. */
export interface BalanceWarning {
  ruleKey: BalanceRuleKey
  /** 참고(`info`) · 주의(`warn`). 「점검 못 함」은 늘 `info`다. */
  level: BalanceLevel
  /** 항목 행 ID. 묶음 전체에 걸린 결과면 `null`. */
  itemId: string | null
  /** 쉬운 문장(무엇이 · 얼마나 · 기준). */
  message: string
  /** 잰 값. 「점검 못 함」은 `null`, R8은 찾은 키 이름을 쉼표로 이은 글이다. */
  measured: number | string | null
  /** 기준값. 「점검 못 함」과 R8은 `null`. */
  limit: number | string | null
  /** 실측 없이 정한 임시값 규칙의 결과인지(화면의 「임시값·실측 전」 칩). */
  provisional: boolean
}

export interface BalanceEvaluation {
  warnings: BalanceWarning[]
  /** 「점검 못 함」(참고). */
  unreadable: BalanceWarning[]
  /** 항목 행 ID → 그 항목에 적용되는 켜 둔 규칙 수. 평가에서 뺀 항목은 0이다. */
  checkedRuleCountByItem: Record<string, number>
}

/**
 * 횟수형 JAM! 배지인지: `condition_json`에 JAM! 행동 지표 키(`JAM_ACTION_CONDITION_KEYS`) 가운데 `recipe_first_success`가 아닌
 * 키가 있으면 횟수형이고, 그 밖의 JAM! 배지는 달성형이다(PRD §5.2). 조건 값이 객체가 아니면 판정할 수 없어 `null`이다.
 */
export function isCountBadgeCondition(conditionJson: unknown): boolean | null {
  const record = asRecord(conditionJson)
  if (!record) return null
  return JAM_ACTION_CONDITION_KEYS.some((key) => key !== 'recipe_first_success' && key in record)
}

// ── 읽기 도우미 ─────────────────────────────────────────────────────────────────────────────────

/** 값을 읽었는지, 못 읽었다면 까닭이 무엇인지. */
export type ReadResult<T> = { ok: true; value: T } | { ok: false; cause: UnreadableCause }

function ok<T>(value: T): ReadResult<T> {
  return { ok: true, value }
}

function fail<T>(cause: UnreadableCause): ReadResult<T> {
  return { ok: false, cause }
}

/**
 * 시각 하나를 읽는다. 제출·수정 값(`raw`)이 시간대가 붙은 ISO면 그 값, 값이 비어 있으면 열(`column`, 직접 수정 때 같이 갱신된다),
 * 값이 있는데 ISO가 아니면 형식 오류다. 돌려주는 값은 epoch ms다.
 */
export function readTimeValue(raw: unknown, column: string | null | undefined, which: 'start' | 'end'): ReadResult<number> {
  if (isIsoDateTime(raw)) return ok(Date.parse(raw))
  if (raw === undefined || raw === null || raw === '') {
    const ms = column ? Date.parse(column) : NaN
    if (Number.isFinite(ms)) return ok(ms)
    return fail(which === 'start' ? 'start_missing' : 'end_missing')
  }
  return fail(which === 'start' ? 'start_invalid' : 'end_invalid')
}

function readItemTime(item: BalanceItemInput, field: 'starts_at' | 'ends_at'): ReadResult<number> {
  return field === 'starts_at'
    ? readTimeValue(itemField(item, 'starts_at'), item.startsAt, 'start')
    : readTimeValue(itemField(item, 'ends_at'), item.endsAt, 'end')
}

type ResourceRead = { kind: 'ok'; record: Record<string, unknown> } | { kind: 'absent' } | { kind: 'invalid' }

/** 항목의 `resource`(만들 자원의 필드). 없으면 `absent`, 객체가 아니면 `invalid`. */
function readResource(item: ViewableItem): ResourceRead {
  const value = itemField(item, 'resource')
  if (value === undefined || value === null) return { kind: 'absent' }
  const record = asRecord(value)
  return record ? { kind: 'ok', record } : { kind: 'invalid' }
}

/**
 * 포인트 값 하나. `resource`나 그 키가 없으면 「없음」, 숫자가 아니면 「숫자 아님」이다.
 * 키가 있고 값이 `null`이면 포인트가 없다는 뜻이라 0으로 읽는다(DB의 `reward_points` NULL과 같다).
 */
function readPoints(item: ViewableItem, key: 'reward_points' | 'point_reward'): ReadResult<number> {
  const resource = readResource(item)
  if (resource.kind === 'absent') return fail('points_missing')
  if (resource.kind === 'invalid') return fail('points_invalid')
  const value = resource.record[key]
  if (value === undefined) return fail('points_missing')
  if (value === null) return ok(0)
  return typeof value === 'number' && Number.isFinite(value) ? ok(value) : fail('points_invalid')
}

/** JAM! 배지가 횟수형인지 달성형인지(`resource.condition_json`). 조건을 못 읽으면 판정할 수 없다. */
function readBadgeKind(item: ViewableItem): ReadResult<'count_badge' | 'achievement_badge'> {
  const resource = readResource(item)
  if (resource.kind !== 'ok') return fail('condition')
  const isCount = isCountBadgeCondition(resource.record.condition_json)
  if (isCount === null) return fail('condition')
  return ok(isCount ? 'count_badge' : 'achievement_badge')
}

/** 항목이 R5에서 어느 종류로 재어지는지. R5가 보지 않는 종류(홈피드 카드·드랍 일정·패턴 제안)면 `null`이다. */
function readPointKind(item: BalanceItemInput): ReadResult<PointKind> | null {
  switch (item.kind) {
    case 'collection_launch':
      return ok('collection_completion')
    case 'mission':
      return ok('mission')
    case 'recipe':
      return ok('recipe')
    case 'jam_badge':
      return readBadgeKind(item)
    default:
      return null
  }
}

function pointKeyOf(item: BalanceItemInput): 'reward_points' | 'point_reward' {
  return item.kind === 'jam_badge' ? 'point_reward' : 'reward_points'
}

// ── 시각 계산(KST) ──────────────────────────────────────────────────────────────────────────────

/** KST 날짜 `M/D`. */
function kstMonthDay(ms: number): string {
  const kst = new Date(ms + KST_OFFSET_MS)
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`
}

/** 그 시각이 든 주(월~일, KST)의 월요일 0시(UTC epoch로 읽은 KST 날짜)와 「10/12~10/18」 표기. */
function kstWeekOf(ms: number): { key: number; range: string } {
  const kst = new Date(ms + KST_OFFSET_MS)
  const dayStart = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate())
  const monday = dayStart - ((kst.getUTCDay() + 6) % 7) * DAY_MS
  const sunday = monday + 6 * DAY_MS
  const md = (epoch: number) => `${new Date(epoch).getUTCMonth() + 1}/${new Date(epoch).getUTCDate()}`
  return { key: monday, range: `${md(monday)}~${md(sunday)}` }
}

/** 그 시각에 노출 중인 컬렉션 수(R1의 DB 쪽 값, 항목 상세의 「지금 열린 컬렉션」). */
export function countOpenCollectionsAt(books: readonly ItemBookVisibilityFields[], atIso: string): number {
  return books.filter((book) => isItemBookDroppable(book, atIso)).length
}

// ── 외부 자원 참조 ──────────────────────────────────────────────────────────────────────────────

interface RewardRefs {
  /** 이미 있는 배지의 ID(서비스 상태에서 포인트를 읽는다). */
  ids: string[]
  /** `links`로 이어진 같은 묶음의 `jam_badge` 항목(그 항목의 `point_reward`를 읽는다). */
  linked: BalanceItemInput[]
}

/**
 * 미션·컬렉션 런칭 항목의 보상 배지. `resource.reward_badge_id`(컬렉션 런칭, 문자열) 또는 `resource.reward_badge_ids`(미션, 문자열 배열)와
 * `links`로 이어진 같은 묶음의 `jam_badge` 항목이다. 칸 모양이 틀리면 `null`(보상 배지를 읽을 수 없음)이다.
 */
function readRewardRefs(item: BalanceItemInput, live: readonly BalanceItemInput[]): RewardRefs | null {
  const resource = readResource(item)
  const ids: string[] = []
  if (resource.kind === 'invalid') return null
  if (resource.kind === 'ok') {
    const single = resource.record.reward_badge_id
    const many = resource.record.reward_badge_ids
    if (item.kind === 'collection_launch' && single !== undefined && single !== null) {
      if (typeof single !== 'string' || single.trim() === '') return null
      ids.push(single.trim())
    }
    if (item.kind === 'mission' && many !== undefined && many !== null) {
      if (!Array.isArray(many) || !many.every((id) => typeof id === 'string' && id.trim() !== '')) return null
      ids.push(...(many as string[]).map((id) => id.trim()))
    }
  }
  const linked: BalanceItemInput[] = []
  for (const key of linksOf(item)) {
    const target = live.find((other) => other.kind === 'jam_badge' && other.itemKey === key && other.id !== item.id)
    if (target && !linked.includes(target)) linked.push(target)
  }
  return { ids: [...new Set(ids)], linked }
}

function liveItemsOf(items: readonly BalanceItemInput[]): BalanceItemInput[] {
  return items.filter((item) => !BALANCE_SKIPPED_STATUSES.includes(item.status)).sort((a, b) => a.position - b.position)
}

/**
 * 평가가 서비스 상태에서 읽어야 하는 보상 배지 ID와 계열 이름을 모으고, 평가할 신규 개방 항목이 있는지 알린다(`loadBalanceState`의 입력).
 * 신규 개방 항목이 없는 묶음은 컬렉션·다른 묶음 조회가 필요 없다.
 */
export function collectBalanceReferences(items: readonly BalanceItemInput[]): BalanceReferences {
  const live = liveItemsOf(items)
  const rewardBadgeIds = new Set<string>()
  const familyKeys = new Set<string>()
  for (const item of live) {
    if (item.kind === 'mission' || item.kind === 'collection_launch') {
      for (const id of readRewardRefs(item, live)?.ids ?? []) rewardBadgeIds.add(id)
    }
    if (item.kind === 'jam_badge') {
      const family = readFamilyKey(item)
      if (family) familyKeys.add(family)
    }
  }
  return {
    rewardBadgeIds: [...rewardBadgeIds],
    familyKeys: [...familyKeys],
    hasLaunches: live.some((item) => item.kind === 'collection_launch'),
  }
}

/** `jam_badge` 항목이 이미 만든 배지의 ID(`created_resource.badge_id`). 아직 만들지 않았으면 `null`이다. */
function createdBadgeIdOf(item: BalanceItemInput): string | null {
  const value = asRecord(item.createdResource)?.badge_id
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** `collection_launch` 항목이 이미 만든 컬렉션의 ID(`created_resource.item_book_id`). 아직 만들지 않았으면 `null`이다(티켓 20261004_2039 가정 9). */
function createdBookIdOf(item: BalanceItemInput): string | null {
  const value = asRecord(item.createdResource)?.item_book_id
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** `resource.family_key`. 없거나 문자열이 아니거나 비어 있으면 계열이 없는 배지다(R7이 보지 않는다). */
function readFamilyKey(item: BalanceItemInput): string | null {
  const resource = readResource(item)
  if (resource.kind !== 'ok') return null
  const value = resource.record.family_key
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

// ── R8: 경제 정책 키 ────────────────────────────────────────────────────────────────────────────

const ECONOMY_SCAN_DEPTH = 4

/** `resource`·`knobs`(객체·배열을 안쪽까지)에서 경제 정책 키 이름을 찾는다. 처음 만난 순서로 중복 없이 돌려준다. */
function findEconomyKeys(item: ViewableItem, economyKeys: ReadonlySet<string>): string[] {
  const found = new Set<string>()
  const scan = (value: unknown, depth: number) => {
    if (depth > ECONOMY_SCAN_DEPTH || value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const entry of value) scan(entry, depth + 1)
      return
    }
    for (const [key, entry] of Object.entries(value)) {
      if (economyKeys.has(key)) found.add(key)
      scan(entry, depth + 1)
    }
  }
  scan(itemField(item, 'resource'), 1)
  scan(itemField(item, 'knobs'), 1)
  return [...found]
}

// ── 평가 ────────────────────────────────────────────────────────────────────────────────────────

type ReadableRule<V> = Extract<RuleEntry<V>, { readable: true }>

/** R7이 보는 항목: 계열 이름이 있고 횟수형이거나 횟수형인지 판정할 수 없는 JAM! 배지(달성형은 보지 않는다). */
function isLadderCandidate(item: BalanceItemInput): boolean {
  if (item.kind !== 'jam_badge' || readFamilyKey(item) === null) return false
  const badgeKind = readBadgeKind(item)
  return !badgeKind.ok || badgeKind.value === 'count_badge'
}

/**
 * 시간 축 위의 신규 개방 하나. 종료 시각을 못 읽으면 끝이 없는 개방으로 본다. `inDb`는 컬렉션이 이미 만들어져 DB 컬렉션 수(R1의 `books`)에
 * 들어 있다는 뜻이다 — R1은 이런 개방을 항목에서 다시 더하지 않고, R2·R3은 만들어졌든 아니든 모두 센다.
 */
interface Launch {
  startMs: number
  endMs: number | null
  own: boolean
  inDb: boolean
}

function parseOrNull(iso: string | null): number | null {
  if (iso === null) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/** 규칙 하나가 이 종류의 항목에 적용되는지(PRD §5.2 「규칙이 읽는 자리」). */
function ruleKeysFor(kind: string | null): readonly BalanceRuleKey[] {
  switch (kind) {
    case 'collection_launch':
      return [
        'open_collections_max',
        'weekly_new_collections_max',
        'rolling_new_collections_max',
        'launch_lead_days_min',
        'point_reward_max',
        'single_action_points',
        'economy_keys',
      ]
    case 'mission':
      return ['point_reward_max', 'single_action_points', 'economy_keys']
    case 'jam_badge':
      return ['point_reward_max', 'count_ladder_points', 'economy_keys']
    case 'recipe':
      return ['point_reward_max', 'economy_keys']
    default:
      return ['economy_keys']
  }
}

export function evaluateBundleBalance(
  items: readonly BalanceItemInput[],
  rules: BalanceRules,
  state: BalanceState,
  nowIso: string
): BalanceEvaluation {
  const warnings: BalanceWarning[] = []
  const unreadable: BalanceWarning[] = []
  const nowMs = Date.parse(nowIso)
  const live = liveItemsOf(items)

  function warn(
    key: BalanceRuleKey,
    entry: { level: BalanceLevel },
    itemId: string | null,
    message: string,
    measured: number | string | null,
    limit: number | string | null,
    provisional: boolean
  ) {
    warnings.push({ ruleKey: key, level: entry.level, itemId, message, measured, limit, provisional })
  }

  function skip(key: BalanceRuleKey, itemId: string | null, cause: UnreadableCause) {
    unreadable.push({
      ruleKey: key,
      level: 'info',
      itemId,
      message: unreadableMessage(key, cause),
      measured: null,
      limit: null,
      provisional: false,
    })
  }

  // 켜 둔 규칙 수: 항목 종류에 적용되는 규칙 가운데 행이 있고 켜져 있는 것. 평가에서 뺀 항목은 0이다.
  const checkedRuleCountByItem: Record<string, number> = {}
  for (const item of items) checkedRuleCountByItem[item.id] = 0
  for (const item of live) {
    let keys = ruleKeysFor(item.kind).filter((key) => rules[key]?.enabled === true)
    // 달성형 JAM! 배지는 R7(횟수형 사다리 합)이 보지 않는다.
    if (item.kind === 'jam_badge') {
      const badgeKind = readBadgeKind(item)
      if (badgeKind.ok && badgeKind.value === 'achievement_badge') keys = keys.filter((key) => key !== 'count_ladder_points')
    }
    checkedRuleCountByItem[item.id] = keys.length
  }

  // 값 모양이 틀린 규칙은 그 규칙을 쓰는 항목이 있을 때 묶음 줄 하나로만 알린다. 항목별 계산은 하지 않는다.
  const invalidRules = new Set<BalanceRuleKey>()
  /** 켜져 있고 이 묶음에 쓸 곳이 있고 값을 읽을 수 있는 규칙만 돌려준다. */
  function usable<V>(key: BalanceRuleKey, entry: RuleEntry<V> | undefined, applies: boolean): ReadableRule<V> | undefined {
    if (!entry || !entry.enabled || !applies) return undefined
    if (!entry.readable) {
      invalidRules.add(key)
      return undefined
    }
    return entry
  }

  const launches = live.filter((item) => item.kind === 'collection_launch')
  const times = new Map(launches.map((item) => [item.id, { start: readItemTime(item, 'starts_at'), end: readItemTime(item, 'ends_at') }]))

  // 시간 축: 이 묶음의 신규 개방(시작을 읽을 수 있는 것)과 다른 묶음의 신규 개방. R2·R3은 모두 세고(만들어진 것도 이미 한 개방이다),
  // R1은 `inDb`가 아닌 것만 더한다(만들어진 컬렉션은 DB에서 이미 센다). 이 묶음의 항목도 `created_resource.item_book_id`가 있으면 DB에서 세므로
  // 항목에서 다시 세지 않는다(예약 등록 뒤 다시 평가할 때 한 컬렉션이 두 번 세어지던 것을 고친다. 티켓 20261004_2039 가정 9).
  const timeline: Launch[] = []
  for (const item of launches) {
    const { start, end } = times.get(item.id)!
    if (start.ok) timeline.push({ startMs: start.value, endMs: end.ok ? end.value : null, own: true, inDb: createdBookIdOf(item) !== null })
  }
  if (state.otherLaunches.ok) {
    for (const other of state.otherLaunches.data) {
      const startMs = parseOrNull(other.startsAt)
      if (startMs !== null) timeline.push({ startMs, endMs: parseOrNull(other.endsAt), own: false, inDb: other.resourceCreated })
    }
  }

  // ── R1 동시 개방 컬렉션 수 ──
  const r1 = usable('open_collections_max', rules.open_collections_max, launches.length > 0)
  if (r1) {
    for (const item of launches) {
      const { start, end } = times.get(item.id)!
      if (!start.ok) skip('open_collections_max', item.id, start.cause)
      else if (!end.ok) skip('open_collections_max', item.id, end.cause)
      else if (!state.books.ok || !state.otherLaunches.ok) skip('open_collections_max', item.id, 'state')
      else {
        const at = start.value
        const dbOpen = countOpenCollectionsAt(state.books.data, new Date(at).toISOString())
        const pending = timeline.filter((l) => !l.inDb && l.startMs <= at && (l.endMs === null || l.endMs >= at)).length
        const total = dbOpen + pending
        if (total > r1.value.max) {
          warn(
            'open_collections_max',
            r1,
            item.id,
            openCollectionsMessage(new Date(at).toISOString(), total, r1.value.max),
            total,
            r1.value.max,
            r1.value.provisional
          )
        }
      }
    }
  }

  // ── R2 한 주 신규 개방 수 ──
  const r2 = usable('weekly_new_collections_max', rules.weekly_new_collections_max, launches.length > 0)
  if (r2) {
    const weeks = new Map<number, { range: string }>()
    for (const item of launches) {
      const { start } = times.get(item.id)!
      if (!start.ok) skip('weekly_new_collections_max', item.id, start.cause)
      else if (!state.otherLaunches.ok) skip('weekly_new_collections_max', item.id, 'state')
      else {
        const week = kstWeekOf(start.value)
        weeks.set(week.key, { range: week.range })
      }
    }
    for (const [key, { range }] of weeks) {
      const members = timeline.filter((l) => kstWeekOf(l.startMs).key === key).sort((a, b) => a.startMs - b.startMs)
      if (members.length > r2.value.max) {
        warn(
          'weekly_new_collections_max',
          r2,
          null,
          weeklyNewMessage(range, members.map((l) => kstMonthDay(l.startMs)), members.length, r2.value.max),
          members.length,
          r2.value.max,
          r2.value.provisional
        )
      }
    }
  }

  // ── R3 28일 신규 개방 수 ──
  const r3 = usable('rolling_new_collections_max', rules.rolling_new_collections_max, launches.length > 0)
  if (r3) {
    const anchors = new Set<number>()
    for (const item of launches) {
      const { start } = times.get(item.id)!
      if (!start.ok) skip('rolling_new_collections_max', item.id, start.cause)
      else if (!state.otherLaunches.ok) skip('rolling_new_collections_max', item.id, 'state')
      else anchors.add(start.value)
    }
    for (const anchor of [...anchors].sort((a, b) => a - b)) {
      const members = timeline.filter((l) => l.startMs >= anchor - ROLLING_DAYS * DAY_MS && l.startMs <= anchor)
      if (members.length > r3.value.max) {
        warn(
          'rolling_new_collections_max',
          r3,
          null,
          rollingNewMessage(kstMonthDay(anchor), members.length, members.filter((l) => !l.own).length, r3.value.max),
          members.length,
          r3.value.max,
          r3.value.provisional
        )
      }
    }
  }

  // ── R4 개방 리드타임 ──
  const r4 = usable('launch_lead_days_min', rules.launch_lead_days_min, launches.length > 0)
  if (r4) {
    for (const item of launches) {
      const { start } = times.get(item.id)!
      if (!start.ok) {
        skip('launch_lead_days_min', item.id, start.cause)
        continue
      }
      const afterApproval = APPROVED_STATUSES.includes(item.status)
      const approvedMs = afterApproval ? parseOrNull(item.approvedAt) : null
      const basisMs = approvedMs ?? nowMs
      const leadDays = (start.value - basisMs) / DAY_MS
      if (leadDays < r4.value.minDays) {
        warn(
          'launch_lead_days_min',
          r4,
          item.id,
          leadTimeMessage(leadDays, r4.value.minDays, approvedMs !== null),
          Math.floor(leadDays),
          r4.value.minDays,
          r4.value.provisional
        )
      }
    }
  }

  // ── R5 항목별 포인트 ──
  const pointItems = live.filter((item) => readPointKind(item) !== null)
  const r5 = usable('point_reward_max', rules.point_reward_max, pointItems.length > 0)
  if (r5) {
    for (const item of pointItems) {
      const kind = readPointKind(item)!
      const points = readPoints(item, pointKeyOf(item))
      if (!points.ok) skip('point_reward_max', item.id, points.cause)
      else if (!kind.ok) skip('point_reward_max', item.id, kind.cause)
      else {
        const limit = r5.value.kinds[kind.value]
        if (limit === null) skip('point_reward_max', item.id, 'rule_value')
        else if (points.value > limit.max) {
          warn('point_reward_max', r5, item.id, pointRewardMessage(kind.value, points.value, limit.max), points.value, limit.max, limit.provisional)
        }
      }
    }
  }

  // ── R6 한 번의 행동으로 받는 포인트 합 ──
  const comboItems = live.filter((item) => item.kind === 'mission' || item.kind === 'collection_launch')
  const r6 = usable('single_action_points', rules.single_action_points, comboItems.length > 0)
  if (r6) {
    const r5Entry = rules.point_reward_max
    for (const item of comboItems) {
      const category: 'mission' | 'collection_completion' = item.kind === 'mission' ? 'mission' : 'collection_completion'
      const refs = readRewardRefs(item, live)
      if (refs === null) {
        skip('single_action_points', item.id, 'reward_badge')
        continue
      }
      // 보상 배지가 하나도 없으면 합이 항목 자신의 포인트와 같아 R5가 이미 본다.
      if (refs.ids.length === 0 && refs.linked.length === 0) continue

      const own = readPoints(item, 'reward_points')
      if (!own.ok) {
        skip('single_action_points', item.id, own.cause)
        continue
      }
      if (refs.ids.length > 0 && !state.badgePoints.ok) {
        skip('single_action_points', item.id, 'state')
        continue
      }

      let badgePoints = 0
      let badgeUnreadable = false
      if (state.badgePoints.ok) {
        for (const id of refs.ids) {
          const points = state.badgePoints.data[id]
          if (points === undefined) badgeUnreadable = true
          else badgePoints += points
        }
      }
      for (const linked of refs.linked) {
        const points = readPoints(linked, 'point_reward')
        if (points.ok) badgePoints += points.value
        else badgeUnreadable = true
      }
      if (badgeUnreadable) {
        skip('single_action_points', item.id, 'reward_badge')
        continue
      }

      const limit: MaxValue | null | undefined =
        r5Entry && r5Entry.readable ? r5Entry.value.kinds[category] : null
      if (!limit) {
        skip('single_action_points', item.id, 'rule_value')
        continue
      }
      const sum = own.value + badgePoints
      if (sum > limit.max) {
        warn('single_action_points', r6, item.id, singleActionMessage(category, own.value, badgePoints, sum, limit.max), sum, limit.max, limit.provisional)
      }
    }
  }

  // ── R7 파밍 방지(횟수형 사다리 합) ──
  const ladderItems = live.filter(isLadderCandidate)
  const r7 = usable('count_ladder_points', rules.count_ladder_points, ladderItems.length > 0)
  if (r7) {
    const r5Entry = rules.point_reward_max
    const limit: MaxValue | null | undefined =
      r5Entry && r5Entry.readable ? r5Entry.value.kinds.achievement_badge : null
    const families = new Map<string, BalanceItemInput[]>()
    for (const item of ladderItems) {
      const family = readFamilyKey(item)!
      const group = families.get(family)
      if (group) group.push(item)
      else families.set(family, [item])
    }
    for (const [family, members] of families) {
      let skipped = false
      let ownSum = 0
      for (const item of members) {
        // 이미 만든 배지는 DB의 같은 계열 배지(`state.familyBadges`)에서 세므로 항목에서 다시 더하지 않는다(두 번 세기 방지. PRD §8.5의 컬렉션 규칙과 같다).
        if (createdBadgeIdOf(item) !== null) continue
        const badgeKind = readBadgeKind(item)
        const points = readPoints(item, 'point_reward')
        if (!badgeKind.ok) {
          skip('count_ladder_points', item.id, badgeKind.cause)
          skipped = true
        } else if (!points.ok) {
          skip('count_ladder_points', item.id, points.cause)
          skipped = true
        } else ownSum += points.value
      }
      if (skipped) continue
      if (!state.familyBadges.ok) {
        for (const item of members) skip('count_ladder_points', item.id, 'state')
        continue
      }
      if (!limit) {
        for (const item of members) skip('count_ladder_points', item.id, 'rule_value')
        continue
      }
      const existing = (state.familyBadges.data[family] ?? []).filter((badge) => badge.countType === true)
      const sum = ownSum + existing.reduce((total, badge) => total + badge.pointReward, 0)
      if (sum > limit.max) {
        warn('count_ladder_points', r7, null, countLadderMessage(family, sum, limit.max), sum, limit.max, limit.provisional)
      }
    }
  }

  // ── R8 경제 수치 불변 ──
  const r8 = usable('economy_keys', rules.economy_keys, live.length > 0)
  if (r8) {
    const economyKeys = new Set(r8.value.keys)
    for (const item of live) {
      const keys = findEconomyKeys(item, economyKeys)
      if (keys.length > 0) warn('economy_keys', r8, item.id, economyKeysMessage(keys), keys.join(', '), null, false)
    }
  }

  // 값 모양이 틀린 규칙: 규칙 순서대로 묶음 줄 하나씩.
  for (const key of [...invalidRules].sort((a, b) => BALANCE_RULE_KEYS.indexOf(a) - BALANCE_RULE_KEYS.indexOf(b))) skip(key, null, 'rule_value')

  return { warnings, unreadable, checkedRuleCountByItem }
}
