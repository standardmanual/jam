/**
 * 공개 전 취소 (티켓 20261002_1256, 상위 20260930_1500 ④-b) — **서버 전용**이다. 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8.7이다.
 *
 * `previewCancel`은 함께 취소될 항목과 막는 항목을 돌려준다(쓰기 없음). `cancelItem`은 「예약됨」 항목 하나와 그 항목을 직접·거쳐 가리키는 「예약됨」 항목의
 * 자원을 공개 전에 지우고 항목을 「취소」로 둔다. 서비스 클라이언트와 핸들러 레지스트리는 인자로 받는다(라우트가 실제 것을, 테스트가 가짜를 넘긴다).
 * 실패해도 던지지 않고 `{ ok: false, status, error }`를 돌려준다. `notifyCancel`은 응답이 나간 뒤(`after`) 슬랙 글을 올린다.
 *
 * 지키는 규칙
 * - 범위는 `cancelSetOf`(`groups.ts`)가 정한다. 가리키는 항목 가운데 게재 중·준비중 항목이 있으면 아무것도 지우지 않고 409다. 종류에 핸들러가 없어도 409다.
 * - 시험 묶음은 자원 단계를 건너뛰고 상태만 바꾼다(`created_resource`가 `{ sample: true }`라 자원이 없다, §8.8).
 * - 실제 묶음은 되돌림 순서(`orderForUndo`, 가리키는 항목 먼저)로 핸들러의 `cancel`을 부르고 첫 실패에서 멈춘다. 첫 항목에서 실패하면 아무것도 지우지 않은 것이라
 *   공개됨·기록 있음은 409, 그 밖의 오류는 500이다. 앞 항목을 지운 뒤 실패하면 지운 항목만 「취소」로 두고 500 `{ error, cancelled }`와 `#jam-alert` 글을 남긴다.
 * - 자원 ID가 `created_resource`에 없는 「예약됨」 항목은 자원이 이미 없는 것으로 보고(`missing`) 상태만 바꾼다. 맞추기는 상태 맞추기(⑦)의 몫이다.
 * - 상태는 조건부 update(`scheduled` → `cancelled`)다. 바뀌지 않은 항목은 서버 로그만 남긴다.
 * - 결정 기록은 취소한 항목마다 `cancel` 1행, 같은 `batch_id`다. insert가 실패하면 자원과 상태는 그대로 두고 `decisionLogFailed`로 알린다.
 * - 응답·결정 기록·슬랙에는 핸들러의 `reason`(쉬운 문장)만 싣고, `detail`과 DB 오류 원문은 서버 로그에만 남긴다.
 * - 결정 기록의 `slack_result`는 `batch_id`와 `action`(`cancel`)으로 채운다. 요약과 알림이 같은 행을 쓰므로 알림이 있으면 알림의 결과가 남는다.
 */
import { OPS_DECISION_ACTION_CANCEL } from '@/lib/admin/opsInbox/constants'
import { asRecord } from '@/lib/admin/opsInbox/itemView'
import { removeOpsImageFiles } from '@/lib/admin/opsInbox/image'
import { kindLabel } from '@/lib/admin/opsInbox/labels'
import { formatCancelFailureMessage, formatCancelMessage } from '@/lib/admin/opsInbox/slack'
import { cancelSetOf, orderForUndo } from './groups'
import { isExecutableKind, type CancelResult, type ExecuteHandler, type ExecuteHandlerRegistry, type ExecuteItem, type ExecuteServiceClient } from './handlers'
import { EXECUTE_HANDLERS } from './registry'
import { itemLabelOf, loadBundleItems, postAndRecord, type ExecuteDeps, type RunFailure } from './run'

type ServiceClient = ExecuteServiceClient

const LOG = '[ops-inbox/cancel]'

const MESSAGES = {
  cancelFailed: '취소하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  previewFailed: '함께 취소될 항목을 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  itemNotFound: '찾을 수 없는 항목이에요.',
  notScheduled: '예약됨 항목만 취소할 수 있어요',
  noHandler: '아직 취소를 연결하지 않은 종류예요',
  blockedByLive: '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.',
  blockedByPreparing: '예약 등록이 진행 중인 항목이 있어요. 잠시 뒤 다시 시도해 주세요.',
  partial: '일부만 취소했어요. 나머지는 취소하지 못했어요. 화면을 새로 고쳐 확인해 주세요.',
  finishFailed: '항목 상태를 바꾸지 못했어요. 잠시 뒤 화면을 새로 고쳐 확인해 주세요.',
  stateChanged: '그사이 항목 상태가 바뀌어 취소하지 못했어요. 화면을 새로 고쳐 확인해 주세요.',
  // 슬랙 글에 나가는 항목별 사유
  statusNotSaved: '자원은 지웠지만 항목 상태를 바꾸지 못했어요',
  unexpected: '취소 중 오류가 났어요',
} as const

// ── 결과 ─────────────────────────────────────────────────────────────────────────────────────────

/** 막는 항목 한 건. `reason`은 화면에 그대로 나가는 쉬운 문장이다. */
export interface CancelBlocker {
  id: string
  reason: string
}

export interface CancelPreviewSuccess {
  ok: true
  body: {
    ok: true
    dryRun: true
    /** 취소될 항목(시작 항목 포함, 제출 순서). 막는 항목이 있으면 실제로는 아무것도 취소되지 않는다. */
    cancelIds: string[]
    blockers: CancelBlocker[]
  }
}

/** 슬랙 글 재료. 응답이 나간 뒤 `notifyCancel`이 쓴다. */
export interface CancelNotification {
  batchId: string
  isSample: boolean
  /** 취소한 항목 이름(「종류 · 공개 시각(KST)」). */
  cancelledLabels: string[]
  /** 취소를 끝내지 못한 항목의 이름과 사유. 부분 실패와 상태 저장 실패가 들어온다. */
  problems: Array<{ itemLabel: string; reason: string }>
  decisionLogFailed: boolean
}

export interface CancelSuccess {
  ok: true
  body: {
    ok: true
    /** 취소한 항목 ID(되돌림 순서: 가리키는 항목이 먼저). */
    cancelled: string[]
    /** 취소한 항목 가운데 자원이 이미 없던 항목 ID. */
    missing: string[]
    /** 취소는 했는데 결정 기록을 남기지 못했다. 있을 때만 `true`다. */
    decisionLogFailed?: true
  }
  batchId: string
  slack: CancelNotification
}

/** 일부만 지우고 멈춘 경우처럼 알림이 필요한 실패만 `slack`을 갖는다. */
export type CancelFailure = RunFailure & { slack?: CancelNotification }

// ── 도우미 ───────────────────────────────────────────────────────────────────────────────────────

function fail(status: RunFailure['status'], error: string, extra?: Record<string, unknown>): RunFailure {
  return { ok: false, status, error, ...(extra ? { extra } : {}) }
}

function logError(what: string, error: { message: string } | null | undefined) {
  console.error(`${LOG} ${what}:`, error?.message ?? 'unknown')
}

function isRunFailure<T extends object>(value: T | RunFailure): value is RunFailure {
  return 'ok' in value && (value as { ok?: unknown }).ok === false
}

/** 항목이 `created_resource`에 적어 둔 자원 ID. 없으면 null이다. */
function resourceIdOf(item: ExecuteItem, handler: ExecuteHandler): string | null {
  const value = asRecord(item.created_resource)?.[handler.resourceKey]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** 핸들러 계약은 던지지 않는 것이다. 던지면 오류 실패로 바꿔 흐름이 멈춘 자리를 알린다. */
async function cancelResource(handler: ExecuteHandler, service: ServiceClient, resourceId: string, now: Date): Promise<CancelResult> {
  try {
    return await handler.cancel(service, resourceId, { now })
  } catch (err) {
    return { ok: false, code: 'error', failure: { reason: MESSAGES.unexpected, detail: err instanceof Error ? err.message : 'unknown' } }
  }
}

// ── 취소 범위 ────────────────────────────────────────────────────────────────────────────────────

interface CancelPlan {
  isSample: boolean
  /** 취소할 항목 ID(시작 항목 포함, 제출 순서). */
  cancelIds: string[]
  /** 취소할 항목을 되돌림 순서(가리키는 항목 먼저)로 늘어놓은 것. */
  ordered: ExecuteItem[]
  blockers: Array<CancelBlocker & { status: 'live' | 'preparing' }>
}

/** 묶음을 읽어 취소 범위를 정한다. 쓰기 없음. 항목이 묶음에 없으면 404, 「예약됨」이 아니면 409다. */
async function planCancel(service: ServiceClient, bundleId: string, itemId: string, failMessage: string): Promise<CancelPlan | RunFailure> {
  const loaded = await loadBundleItems(service, bundleId, failMessage)
  if (isRunFailure(loaded)) return loaded
  const byId = new Map(loaded.items.map((item) => [item.id, item]))
  const target = byId.get(itemId)
  if (!target) return fail(404, MESSAGES.itemNotFound)
  if (target.status !== 'scheduled') return fail(409, MESSAGES.notScheduled)

  const set = cancelSetOf(loaded.items, itemId)
  return {
    isSample: loaded.isSample,
    cancelIds: set.cancelIds,
    ordered: orderForUndo({ items: set.cancelIds.map((id) => byId.get(id) as ExecuteItem) }),
    blockers: set.blockers.map(({ id, status }) => ({ id, status, reason: status === 'live' ? MESSAGES.blockedByLive : MESSAGES.blockedByPreparing })),
  }
}

/** 게재 중인 항목이 있으면 그 문장을 먼저 보인다(운영자가 해야 할 일이 따로 있다). */
function blockerMessage(blockers: CancelPlan['blockers']): string {
  return (blockers.find((blocker) => blocker.status === 'live') ?? blockers[0]).reason
}

/** 항목 종류의 핸들러. 예약 등록 대상 종류만 찾는다(`kind`는 제출 문자열이라 `constructor` 같은 이름이 레지스트리 객체의 기본 속성을 집지 않게 한다). */
function handlerOf(handlers: ExecuteHandlerRegistry, item: ExecuteItem): ExecuteHandler | undefined {
  return isExecutableKind(item.kind) ? handlers[item.kind] : undefined
}

const hasNoHandler = (plan: CancelPlan, handlers: ExecuteHandlerRegistry) => plan.ordered.some((item) => !handlerOf(handlers, item))

// ── 미리 보기 ────────────────────────────────────────────────────────────────────────────────────

/** 미리 보기 요청(`{ dryRun: true }`). 쓰기 없이 취소될 항목과 막는 항목을 돌려준다. 막는 항목이 있어도 200이다(확인창이 보인다). */
export async function previewCancel(
  service: ServiceClient,
  input: { bundleId: string; itemId: string },
  deps: Partial<ExecuteDeps> = {}
): Promise<CancelPreviewSuccess | RunFailure> {
  const handlers = deps.handlers ?? EXECUTE_HANDLERS
  const plan = await planCancel(service, input.bundleId, input.itemId, MESSAGES.previewFailed)
  if (isRunFailure(plan)) return plan
  if (plan.blockers.length === 0 && hasNoHandler(plan, handlers)) return fail(409, MESSAGES.noHandler)
  return {
    ok: true,
    body: { ok: true, dryRun: true, cancelIds: plan.cancelIds, blockers: plan.blockers.map(({ id, reason }) => ({ id, reason })) },
  }
}

// ── 취소 ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * 취소 요청(`{ reason? }`). `reason`은 라우트가 다듬은 값(500자 이하, 없으면 `null`)이다.
 * 자원을 지운 항목만 상태를 「취소」로 바꾸고 결정 기록을 남긴다.
 */
export async function cancelItem(
  service: ServiceClient,
  input: { bundleId: string; itemId: string; actor: string; reason: string | null },
  deps: Partial<ExecuteDeps> = {}
): Promise<CancelSuccess | CancelFailure> {
  const { bundleId, itemId, actor, reason } = input
  const handlers = deps.handlers ?? EXECUTE_HANDLERS
  const now = deps.now ?? (() => new Date())

  const plan = await planCancel(service, bundleId, itemId, MESSAGES.cancelFailed)
  if (isRunFailure(plan)) return plan
  if (plan.blockers.length > 0) {
    return fail(409, blockerMessage(plan.blockers), { blockers: plan.blockers.map(({ id, reason: why }) => ({ id, reason: why })) })
  }
  if (hasNoHandler(plan, handlers)) return fail(409, MESSAGES.noHandler)

  // 자원 단계: 시험 묶음은 건너뛴다. 첫 실패에서 멈추고, 그 앞에서 지운 항목은 `done`에 남는다.
  const done: ExecuteItem[] = []
  const missing = new Set<string>()
  let stopped: { item: ExecuteItem; result: Extract<CancelResult, { ok: false }> } | null = null
  const cancelNow = now()
  for (const item of plan.ordered) {
    if (plan.isSample) {
      done.push(item)
      continue
    }
    const handler = handlerOf(handlers, item) as ExecuteHandler
    const resourceId = resourceIdOf(item, handler)
    if (!resourceId) {
      console.error(`${LOG} 자원 ID가 없는 예약됨 항목이에요. 자원이 이미 없는 것으로 보고 상태만 바꿔요(${kindLabel(item.kind)})`)
      missing.add(item.id)
      await removeOpsImageFiles(service, { kind: item.kind, itemId: item.id })
      done.push(item)
      continue
    }
    const result = await cancelResource(handler, service, resourceId, cancelNow)
    if (!result.ok) {
      console.error(`${LOG} 자원 취소 실패(${kindLabel(item.kind)}, ${result.code}):`, result.failure.detail ?? result.failure.reason)
      stopped = { item, result }
      break
    }
    if (result.missing) missing.add(item.id)
    await removeOpsImageFiles(service, { kind: item.kind, itemId: item.id })
    done.push(item)
  }

  // 첫 항목에서 실패하면 아무것도 지우지 않은 것이다.
  if (stopped && done.length === 0) {
    return stopped.result.code === 'error' ? fail(500, MESSAGES.cancelFailed) : fail(409, stopped.result.failure.reason)
  }

  const problems: CancelNotification['problems'] = stopped ? [{ itemLabel: itemLabelOf(stopped.item), reason: stopped.result.failure.reason }] : []

  // 상태: 지운 항목만 조건부로 「취소」로 둔다.
  let cancelled: ExecuteItem[] = []
  let statusFailed = false
  if (done.length > 0) {
    const updated = await service
      .from('ops_bundle_items')
      .update({ status: 'cancelled', updated_at: now().toISOString() })
      .eq('bundle_id', bundleId)
      .eq('status', 'scheduled')
      .in('id', done.map((item) => item.id))
      .select('id')
    if (updated.error) {
      logError('취소 상태 저장 실패(자원은 지웠고 항목은 예약됨으로 남아 있어요)', updated.error)
      statusFailed = true
      problems.push(...done.map((item) => ({ itemLabel: itemLabelOf(item), reason: MESSAGES.statusNotSaved })))
    } else {
      const changed = new Set((updated.data ?? []).map((row) => row.id))
      cancelled = done.filter((item) => changed.has(item.id))
      for (const item of done.filter((entry) => !changed.has(entry.id))) {
        console.error(`${LOG} 그사이 다른 곳에서 바뀌어 취소 상태로 옮기지 못했어요(${kindLabel(item.kind)})`)
      }
    }
  }

  // 결정 기록: 취소한 항목마다 `cancel` 1행. 자원을 이미 지웠으므로 실패해도 되돌리지 않고 알린다.
  const batchId = crypto.randomUUID()
  let decisionLogFailed = false
  if (cancelled.length > 0) {
    const inserted = await service
      .from('ops_decisions')
      .insert(cancelled.map((item) => ({ bundle_id: bundleId, item_id: item.id, action: OPS_DECISION_ACTION_CANCEL, actor, reason, batch_id: batchId })))
      .select('id')
    decisionLogFailed = Boolean(inserted.error)
    if (inserted.error) logError('결정 기록 저장 실패(자원과 상태는 그대로예요)', inserted.error)
  }

  const slack: CancelNotification = { batchId, isSample: plan.isSample, cancelledLabels: cancelled.map(itemLabelOf), problems, decisionLogFailed }
  const cancelledIds = cancelled.map((item) => item.id)
  if (stopped) return { ...fail(500, MESSAGES.partial, { cancelled: cancelledIds }), slack }
  if (statusFailed) return { ...fail(500, MESSAGES.finishFailed, { cancelled: cancelledIds }), slack }
  if (cancelled.length === 0) return fail(409, MESSAGES.stateChanged)

  return {
    ok: true,
    body: {
      ok: true,
      cancelled: cancelledIds,
      missing: cancelled.filter((item) => missing.has(item.id)).map((item) => item.id),
      ...(decisionLogFailed ? { decisionLogFailed: true as const } : {}),
    },
    batchId,
    slack,
  }
}

// ── 슬랙 알림 ────────────────────────────────────────────────────────────────────────────────────

/**
 * 응답이 나간 뒤(`after`) 취소한 항목이 있으면 요약 한 건을 `#jam-report`에, 끝내지 못한 항목이나 결정 기록 실패가 있으면 한 건을 `#jam-alert`에 올린다.
 * 결과는 `batch_id`와 `action`(`cancel`)으로 채운다. **던지지 않는다** — 슬랙이 실패해도 취소는 그대로다.
 */
export async function notifyCancel(service: ServiceClient, slack: CancelNotification): Promise<void> {
  if (slack.cancelledLabels.length > 0) {
    await postAndRecord(service, slack, 'report', OPS_DECISION_ACTION_CANCEL, formatCancelMessage({ isSample: slack.isSample, itemLabels: slack.cancelledLabels }))
  }
  if (slack.problems.length === 0 && !slack.decisionLogFailed) return
  await postAndRecord(
    service,
    slack,
    'alert',
    OPS_DECISION_ACTION_CANCEL,
    formatCancelFailureMessage({ isSample: slack.isSample, cancelled: slack.cancelledLabels.length, problems: slack.problems, decisionLogFailed: slack.decisionLogFailed })
  )
}
