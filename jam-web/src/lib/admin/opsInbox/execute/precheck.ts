/**
 * 예약 등록 사전 점검 (티켓 20261002_1122, 상위 20260930_1500 ③-a). 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8.2다.
 *
 * `precheckBundle(items, { now, handlers })`는 묶음의 「승인됨」 항목을 넷으로 나눈다: 예약할 항목(`ready`) · 기다리는 중(`waiting`) ·
 * 못 하는 항목(`blocked`) · 실패로 닫을 항목(`failClose`). 쓰기 없는 순수 함수라 실행 API와 요약창([N개 예약 등록하기]의 N)이 같은 결과를 쓴다.
 *
 * 판정은 연결 그룹(`groups.ts`) 단위다. 그룹의 한 항목이 못 하는 항목이면 같은 그룹의 승인됨 항목도 모두 못 하고,
 * 결정 전 항목이 있으면 모두 기다린다. 한 항목에 둘 이상 걸리면 실패로 닫을 항목 > 못 하는 항목 > 기다리는 중 순으로 정한다
 * (사용자 확정 2026-10-02, 티켓 20261002_1123: 반려된 대상을 가리키는 항목은 어차피 예약될 수 없으니 「승인됨」에 남기지 않고 실패로 닫는다).
 * 실패로 닫을 항목은 그 항목이 혼자 갖는 이유로 같은 그룹의 다른 항목을 막지 않는다.
 *
 * 보지 않는 것: 제출 때 남은 형식 오류(`format_errors`)는 이 점검이 막지 않는다. 종류별 변환·검사(§8.4)가 실행 때 걸러 낸다(가정 1).
 * `pattern_proposal` 승인 항목은 예약 등록 대상이 아니라 `excluded`로 따로 돌려주고 N에 세지 않는다(가정 2).
 */
import { asRecord, isUndecidedStatus, itemField } from '@/lib/admin/opsInbox/itemView'
import { kindLabel } from '@/lib/admin/opsInbox/labels'
import { isIsoDateTime } from '@/lib/admin/registerChecks/bundleRules'
import {
  buildLinkGroups,
  isStoppedItem,
  orderForCreation,
  planLinkFills,
  referencersOf,
  type LinkConflict,
  type LinkFill,
  type LinkGroup,
} from './groups'
import { RESOURCE_KEY_BY_KIND, isExecutableKind, type ExecuteHandlerRegistry, type ExecuteItem } from './handlers'
import { EXECUTE_HANDLERS } from './registry'

/** 공개 시각까지 이만큼(10분) 남았거나 더 적으면 막는다. 정확히 10분 남아도 막는다(G6, 가정 5). */
export const EXECUTE_LEAD_MS = 10 * 60_000

/** 예약 등록 대상이 아닌 종류. 승인돼도 사전 점검 넷 밖이다. */
const PATTERN_PROPOSAL_KIND = 'pattern_proposal'

/** 요약창에 그대로 보이는 사유 문장. */
export const PRECHECK_MESSAGES = {
  waiting: '연결된 항목이 아직 결정 전이에요',
  startMissing: '공개 시각이 없어요',
  startInvalid: '공개 시각을 읽을 수 없어요',
  startPassed: '공개 시각이 이미 지났어요',
  startTooSoon: '공개 시각까지 10분보다 많이 남아야 해요',
  noHandler: '아직 연결하지 않은 종류예요',
  linkUnreadable: '연결을 읽을 수 없어요',
  groupBlocked: '연결된 항목을 예약할 수 없어요',
  targetResourceMissing: '연결된 항목이 만든 자원을 찾지 못했어요',
  startsDiffer: '연결된 항목의 공개 시각이 서로 달라요',
} as const

// ── 결과 ────────────────────────────────────────────────────────────────────────────────────────

export interface PrecheckBlocked {
  id: string
  /** 못 하는 이유. 하나 이상이다. */
  reasons: string[]
}

export interface PrecheckFailClose {
  id: string
  /** 실행하면 「실패」로 남길 사유(예: 「연결된 미션이 반려됐어요」). */
  reason: string
}

export interface PrecheckWarning {
  /** 경고가 가리키는 항목 ID. */
  itemIds: string[]
  message: string
}

export interface PrecheckGroup {
  /** 그룹 안 모든 항목의 ID(멈춘 항목 제외), 생성 순서(§8.3). 결정 전·이미 처리된 항목도 들어 있다. */
  itemIds: string[]
  /** 이 그룹에서 이번에 만들 항목(`ready`)의 ID, 생성 순서. 되돌림은 이 목록의 역순이다. */
  executeIds: string[]
  /** 만들 항목 ID → 채울 칸. 대상은 이번에 함께 만들거나 이미 만들어진 항목이다. 칸을 채울 쌍이 없으면 항목이 없다. */
  linkPlan: Record<string, LinkFill[]>
}

export interface PrecheckResult {
  /** 예약할 항목. 이 길이가 [N개 예약 등록하기]의 N이다. */
  ready: string[]
  /** 기다리는 중. 「승인됨」을 유지한다(사유는 `PRECHECK_MESSAGES.waiting`). */
  waiting: string[]
  /** 못 하는 항목과 이유. 「승인됨」을 유지한다. */
  blocked: PrecheckBlocked[]
  /** 실패로 닫을 항목. 실행하면 「실패」다. */
  failClose: PrecheckFailClose[]
  /** 예약 등록 대상이 아닌 승인 항목(`pattern_proposal`). */
  excluded: string[]
  groups: PrecheckGroup[]
  /** 막지 않고 알리는 경고(G4). */
  warnings: PrecheckWarning[]
}

// ── 읽기 도우미 ─────────────────────────────────────────────────────────────────────────────────

type StartRead = { ok: true; ms: number } | { ok: false; cause: 'missing' | 'invalid' }

/**
 * 공개 시각을 읽는다(밸런스 평가의 `readTimeValue`와 같은 규칙). 항목 값이 시간대가 붙은 ISO면 그 값, 비었으면 행 칸(직접 수정 때 같이 갱신된다),
 * 값이 있는데 ISO가 아니면 읽을 수 없음이다.
 */
function readStart(item: ExecuteItem): StartRead {
  const raw = itemField(item, 'starts_at')
  if (isIsoDateTime(raw)) return { ok: true, ms: Date.parse(raw) }
  if (raw === undefined || raw === null || raw === '') {
    const ms = item.starts_at ? Date.parse(item.starts_at) : NaN
    return Number.isFinite(ms) ? { ok: true, ms } : { ok: false, cause: 'missing' }
  }
  return { ok: false, cause: 'invalid' }
}

/** 받침이 있는 한글로 끝나는지. 「미션이」·「배지가」처럼 조사를 고르는 데 쓴다. */
function hasFinalConsonant(label: string): boolean {
  const code = label.charCodeAt(label.length - 1)
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0
}

function subjectOf(kind: string | null): string {
  const label = kindLabel(kind)
  return `${label}${hasFinalConsonant(label) ? '이' : '가'}`
}

const STOPPED_VERBS: Record<string, string> = { rejected: '반려됐어요', cancelled: '취소됐어요', failed: '실패했어요' }

/** 못 하는 이유 문장. 화면과 결정 기록에 그대로 나가므로 DB 칼럼 이름을 싣지 않는다. */
function conflictReason(conflict: LinkConflict): string {
  switch (conflict.code) {
    case 'multiple_targets':
      return `연결된 ${subjectOf(conflict.pair.to)} 둘 이상이라 ${kindLabel(conflict.pair.from)} 하나에 담을 수 없어요`
    case 'own_resource_field':
      return `이미 값이 들어 있는 칸이라 연결된 ${kindLabel(conflict.pair.to)} 항목으로 채울 수 없어요`
    case 'direct_selection':
      return '아이템을 직접 고른 드랍은 컬렉션과 연결할 수 없어요'
  }
}

/** 핸들러가 붙은 종류인지. `constructor` 같은 이름이 객체 기본 속성에 걸리지 않게 자기 속성만 본다. */
function hasHandler(handlers: ExecuteHandlerRegistry, kind: string | null): boolean {
  return kind !== null && Object.prototype.hasOwnProperty.call(handlers, kind) && handlers[kind] !== undefined
}

/** 이미 처리된 항목인지(준비중·예약됨·게재중·종료). 결정 전·승인됨은 아직 만들지 않았고, 멈춘 항목은 그룹에 없다. */
function isHandledItem(item: ExecuteItem): boolean {
  return !isUndecidedStatus(item.status) && item.status !== 'approved'
}

/** 이미 처리된 대상 항목이 `created_resource`에 자기 자원의 ID를 갖고 있는지(가정 6: 만든 ID를 거기서 읽는다). */
function hasCreatedResourceId(target: ExecuteItem): boolean {
  if (!isExecutableKind(target.kind)) return false
  const value = asRecord(target.created_resource)?.[RESOURCE_KEY_BY_KIND[target.kind]]
  return typeof value === 'string' && value.trim() !== ''
}

// ── 사전 점검 ───────────────────────────────────────────────────────────────────────────────────

/** 한 항목이 혼자 갖는 「못 하는」 이유(그룹 전파 전). */
function ownBlockReasons(item: ExecuteItem, nowMs: number, handlers: ExecuteHandlerRegistry): string[] {
  const reasons: string[] = []
  const start = readStart(item)
  if (!start.ok) {
    reasons.push(start.cause === 'missing' ? PRECHECK_MESSAGES.startMissing : PRECHECK_MESSAGES.startInvalid)
  } else if (start.ms - nowMs <= 0) {
    reasons.push(PRECHECK_MESSAGES.startPassed)
  } else if (start.ms - nowMs <= EXECUTE_LEAD_MS) {
    reasons.push(PRECHECK_MESSAGES.startTooSoon)
  }
  if (!hasHandler(handlers, item.kind)) reasons.push(PRECHECK_MESSAGES.noHandler)
  return reasons
}

/** 이미 공개됐거나 끝난 항목. 공개 시각이 서로 다른지 비교할 때 뺀다. */
function isPublishedItem(item: ExecuteItem): boolean {
  return item.status === 'live' || item.status === 'ended'
}

/** 같은 그룹의 공개 시각이 서로 다르면 경고한다. 이미 게재 중·종료된 항목은 뺀다(바꿀 수 없는 시각이라 알릴 이유가 없다). */
function startsDifferWarning(group: LinkGroup): PrecheckWarning | null {
  const times = group.items
    .filter((item) => item.kind !== PATTERN_PROPOSAL_KIND && !isPublishedItem(item))
    .flatMap((item) => {
      const start = readStart(item)
      return start.ok ? [{ id: item.id, ms: start.ms }] : []
    })
  if (new Set(times.map((time) => time.ms)).size < 2) return null
  return { itemIds: times.map((time) => time.id), message: PRECHECK_MESSAGES.startsDiffer }
}

/**
 * 묶음의 「승인됨」 항목을 예약할 항목·기다리는 중·못 하는 항목·실패로 닫을 항목으로 나눈다(PRD §8.2).
 * `items`는 한 묶음의 항목 전부다(결정 전·멈춘·이미 처리된 항목 포함: 그룹 판정에 필요하다). `handlers`를 생략하면 지금 연결된
 * 핸들러(`EXECUTE_HANDLERS`)를 쓴다. 결과의 ID 목록은 제출 순서다.
 */
export function precheckBundle(
  items: readonly ExecuteItem[],
  { now, handlers = EXECUTE_HANDLERS }: { now: Date; handlers?: ExecuteHandlerRegistry }
): PrecheckResult {
  const nowMs = now.getTime()
  const byId = new Map(items.map((item) => [item.id, item]))
  const stoppedIds = new Set(items.filter(isStoppedItem).map((item) => item.id))
  const stoppedReferences = referencersOf(items, stoppedIds)

  const result: PrecheckResult = { ready: [], waiting: [], blocked: [], failClose: [], excluded: [], groups: [], warnings: [] }
  const isClassified = (item: ExecuteItem) => item.status === 'approved' && item.kind !== PATTERN_PROPOSAL_KIND

  for (const group of buildLinkGroups(items)) {
    const classified = group.items.filter(isClassified)
    result.excluded.push(...group.items.filter((item) => item.status === 'approved' && item.kind === PATTERN_PROPOSAL_KIND).map((item) => item.id))

    const plan = planLinkFills(group)
    const hasUndecided = group.items.some((item) => isUndecidedStatus(item.status))
    const unreadableIds = new Set(group.unreadableItemIds)

    // 항목마다 혼자 갖는 이유.
    const reasonsById = new Map<string, string[]>()
    for (const item of classified) {
      const reasons = ownBlockReasons(item, nowMs, handlers)
      for (const conflict of plan.conflicts.filter((candidate) => candidate.itemId === item.id)) reasons.push(conflictReason(conflict))
      const fills = plan.fills.get(item.id) ?? []
      const missingResource = fills.some((fill) =>
        fill.targetItemIds.some((targetId) => {
          const target = byId.get(targetId)
          return target !== undefined && isHandledItem(target) && !hasCreatedResourceId(target)
        })
      )
      if (missingResource) reasons.push(PRECHECK_MESSAGES.targetResourceMissing)
      reasonsById.set(item.id, reasons)
    }

    // 그룹 전파: 그룹에 읽을 수 없는 연결이 있으면(가정 3) 승인됨 항목 모두 같은 사유로, 한 항목이라도 못 하면 나머지는
    // 「연결된 항목을 예약할 수 없어요」로 막는다.
    // 실패로 닫을 항목의 이유는 그 항목 혼자의 일이라 그룹으로 퍼지지 않는다.
    const anyOwnBlock = classified.some((item) => !stoppedReferences.has(item.id) && (reasonsById.get(item.id) as string[]).length > 0)
    for (const item of classified) {
      const reasons = reasonsById.get(item.id) as string[]
      if (unreadableIds.size > 0) reasons.push(PRECHECK_MESSAGES.linkUnreadable)
      if (reasons.length === 0 && anyOwnBlock) reasons.push(PRECHECK_MESSAGES.groupBlocked)
    }

    const readyInGroup = new Set<string>()
    for (const item of classified) {
      const reasons = reasonsById.get(item.id) as string[]
      const stoppedReference = stoppedReferences.get(item.id)
      if (stoppedReference) {
        const stopped = byId.get(stoppedReference.stoppedId)
        const subject = `${subjectOf(stopped?.kind ?? null)} ${STOPPED_VERBS[stopped?.status ?? ''] ?? '멈췄어요'}`
        result.failClose.push({
          id: item.id,
          reason: stoppedReference.direct ? `연결된 ${subject}` : `연결된 항목을 거쳐 이어진 ${subject}`,
        })
      } else if (reasons.length > 0) {
        result.blocked.push({ id: item.id, reasons })
      } else if (hasUndecided) {
        result.waiting.push(item.id)
      } else {
        readyInGroup.add(item.id)
        result.ready.push(item.id)
      }
    }

    const ordered = orderForCreation(group)
    const linkPlan: Record<string, LinkFill[]> = {}
    for (const id of readyInGroup) {
      const fills = plan.fills.get(id)
      if (fills && fills.length > 0) linkPlan[id] = fills
    }
    result.groups.push({
      itemIds: ordered.map((item) => item.id),
      executeIds: ordered.filter((item) => readyInGroup.has(item.id)).map((item) => item.id),
      linkPlan,
    })

    if (classified.length > 0) {
      const warning = startsDifferWarning(group)
      if (warning) result.warnings.push(warning)
    }
  }

  // 결과 목록은 제출 순서다.
  const position = (id: string) => byId.get(id)?.position ?? 0
  result.ready.sort((a, b) => position(a) - position(b))
  result.waiting.sort((a, b) => position(a) - position(b))
  result.excluded.sort((a, b) => position(a) - position(b))
  result.blocked.sort((a, b) => position(a.id) - position(b.id))
  result.failClose.sort((a, b) => position(a.id) - position(b.id))
  return result
}
