/**
 * 공개 뒤 「지금 종료」 (티켓 20261006_0950, 상위 20260930_1500 ⑪-a) — **서버 전용**이다. 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8.7·§11.7이다.
 *
 * `previewEnd`는 확인창이 먼저 부르는 미리 보기다(쓰기 없음): 이 항목을 직접 가리키는 게재 중 항목과 미션·컬렉션의 영향 유저 수를 돌려준다.
 * `endItem`은 「게재중」 항목 하나의 자원 종료 시각을 지금으로 바꾸고 항목을 「종료」로 닫는다. 서비스 클라이언트와 핸들러 레지스트리는 인자로 받는다(라우트가 실제 것을, 테스트가 가짜를 넘긴다).
 * 실패해도 던지지 않고 `{ ok: false, status, error }`를 돌려준다. `notifyEnd`는 응답이 나간 뒤(`after`) 슬랙 글을 올린다. 틀은 공개 전 취소(`cancel.ts`)다.
 *
 * 지키는 규칙
 * - 처리 순서: 항목 읽기 → 조건부 상태 update(선점: `status = 'live'` 조건으로 `ended`, `ends_at`도 지금으로) → 자원 종료(핸들러 `end`) → 결정 기록 → 응답 → 응답 뒤 슬랙.
 *   선점이 0행이면 409다(두 번 눌러도 자원은 한 번만 바뀐다). 상태 맞추기(⑦)가 같은 순간 먼저 닫았어도 같은 409다.
 * - 자원 종료가 실패하면(`not_published`·`changed`·`error`) 항목을 `live`와 원래 `ends_at`으로 되돌린다(`status = 'ended'` 조건). 되돌림까지 성공하면 `not_published`는 409, 그 밖은 500이고 슬랙은 없다.
 *   되돌림도 실패하면 항목은 「종료」인데 자원은 아직 게재 중이다: 500과 `#jam-alert` 글을 남긴다(상태 맞추기는 「종료」 항목을 읽지 않으므로 사람이 확인해야 한다).
 *   이 500 응답에는 `itemEnded: true`가 실린다(화면이 항목이 「종료」로 바뀐 것을 알고 서버 문장을 토스트로 보인다, 티켓 20261006_1038).
 * - 자원이 이미 끝났거나(`alreadyEnded`) 없으면(`missing`, 자원 ID가 비어 있는 항목 포함) 자원은 건드리지 않고 항목만 닫는다(공개 전 취소의 「이미 없음」과 같은 해석).
 * - 시험 묶음은 자원 단계를 건너뛰고 상태만 바꾼다(`created_resource`가 `{ sample: true }`라 자원이 없다, §8.8).
 * - 핸들러에 `end`가 없는 종류(드랍 예약)는 409다. 이 항목만 끝낸다: 이 항목을 가리키는 게재 중 항목은 그대로 두고 막지도 않는다(미리 보기가 알려 줄 뿐이다).
 * - 결정 기록은 `end` 1행이고 `diff`에 `{ ends_at: { before, after } }`가 있다. insert가 실패하면 자원과 상태는 그대로 두고 `decisionLogFailed`로 알린다.
 * - 응답·결정 기록·슬랙에는 고정 문장만 싣고, `detail`과 DB 오류 원문은 서버 로그에만 남긴다.
 * - 결정 기록의 `slack_result`는 `batch_id`와 `action`(`end`)으로 채운다.
 */
import { OPS_DECISION_ACTION_END } from '@/lib/admin/opsInbox/constants'
import { asRecord } from '@/lib/admin/opsInbox/itemView'
import { kindLabel } from '@/lib/admin/opsInbox/labels'
import { formatEndFailureMessage, formatEndMessage } from '@/lib/admin/opsInbox/slack'
import { countCollectionFillingUsers, countMissionImpact } from './endImpact'
import { pointingLiveOf } from './groups'
import { isExecutableKind, type EndResult, type ExecuteHandler, type ExecuteHandlerRegistry, type ExecuteItem, type ExecuteServiceClient } from './handlers'
import { EXECUTE_HANDLERS } from './registry'
import { itemLabelOf, loadBundleItems, postAndRecord, type ExecuteDeps, type RunFailure } from './run'

type ServiceClient = ExecuteServiceClient

const LOG = '[ops-inbox/end]'

/** 응답 `error`는 화면에 그대로 나간다(DB 오류 원문은 싣지 않는다). 슬랙 글에 나가는 사유는 아래 두 줄이다. */
const MESSAGES = {
  endFailed: '지금 종료하지 못했어요. 자원은 그대로 게재 중이에요. 잠시 뒤 다시 눌러 주세요.',
  revertFailed: '지금 종료하지 못했어요. 항목은 종료로 바뀌었지만 자원은 아직 게재 중이에요. 기존 어드민에서 종료 시각을 확인해 주세요.',
  previewFailed: '지금 종료할 항목을 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  itemNotFound: '찾을 수 없는 항목이에요.',
  notLive: '게재중인 항목만 지금 종료할 수 있어요.',
  noEnd: '이 종류는 지금 종료가 없어요. 놓인 드랍은 그대로 둬요.',
  // 슬랙 글에 나가는 사유
  slackRevertFailed: '항목은 종료로 바뀌었지만 자원은 아직 게재 중이에요',
  unexpected: '지금 종료 중 오류가 났어요',
} as const

// ── 결과 ─────────────────────────────────────────────────────────────────────────────────────────

/** 미리 보기가 알리는 게재 중 항목 한 건. `label`은 「종류 · 공개 시각(KST)」이다. */
export interface EndPointedItem {
  id: string
  kind: string | null
  label: string
}

/**
 * 영향 유저 수. 미션은 `participants`·`inProgressUsers`, 컬렉션은 `fillingUsers`이고, 숫자가 없는 종류(카드·배지·레시피)와 시험 묶음은 빈 객체다.
 * 세기가 실패하면 `null`이다(미리 보기는 막지 않는다).
 */
export type EndImpact = { participants?: number; inProgressUsers?: number; fillingUsers?: number } | null

export interface EndPreviewSuccess {
  ok: true
  body: {
    ok: true
    dryRun: true
    isSample: boolean
    kind: string | null
    /** 이 항목을 연결 칸으로 직접 가리키는 게재 중 항목(함께 끝내지 않는다). */
    pointedByLive: EndPointedItem[]
    impact: EndImpact
  }
}

/** 슬랙 글 재료. 응답이 나간 뒤 `notifyEnd`가 쓴다. */
export interface EndNotification {
  batchId: string
  isSample: boolean
  /** 항목 이름(「종류 · 공개 시각(KST)」). */
  itemLabel: string
  /** 운영자가 적은 사유. 없으면 `null`. */
  reason: string | null
  /** 종료를 끝냈으면 그 결과, 끝내지 못했으면 `null`이다(`#jam-report` 글은 끝냈을 때만 나간다). */
  resourceState: 'ended' | 'alreadyEnded' | 'missing' | null
  /** 끝내지 못한 사유(쉬운 문장). 없으면 `null`. */
  problem: string | null
  decisionLogFailed: boolean
}

export interface EndSuccess {
  ok: true
  body: {
    ok: true
    itemId: string
    /** `ended`: 이번에 자원의 종료 시각을 바꿨다. `alreadyEnded`·`missing`: 자원은 건드리지 않았다(이미 끝나 있었거나 이미 없었다). */
    resourceState: 'ended' | 'alreadyEnded' | 'missing'
    /** 종료는 했는데 결정 기록을 남기지 못했다. 있을 때만 `true`다. */
    decisionLogFailed?: true
  }
  batchId: string
  slack: EndNotification
}

/** 되돌림까지 실패한 500처럼 알림이 필요한 실패만 `slack`을 갖는다. */
export type EndFailure = RunFailure & { slack?: EndNotification }

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

/** 항목 종류의 핸들러. 예약 등록 대상 종류만 찾는다(`kind`는 제출 문자열이라 `constructor` 같은 이름이 레지스트리 객체의 기본 속성을 집지 않게 한다). */
function handlerOf(handlers: ExecuteHandlerRegistry, item: ExecuteItem): ExecuteHandler | undefined {
  return isExecutableKind(item.kind) ? handlers[item.kind] : undefined
}

/** 항목이 `created_resource`에 적어 둔 자원 ID. 없으면 null이다. */
function resourceIdOf(item: ExecuteItem, handler: ExecuteHandler): string | null {
  const value = asRecord(item.created_resource)?.[handler.resourceKey]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** 핸들러 계약은 던지지 않는 것이다. 던지면 오류 실패로 바꿔 흐름이 멈춘 자리를 알린다. */
async function endResource(end: NonNullable<ExecuteHandler['end']>, service: ServiceClient, resourceId: string, now: Date): Promise<EndResult> {
  try {
    return await end(service, resourceId, { now })
  } catch (err) {
    return { ok: false, code: 'error', failure: { reason: MESSAGES.unexpected, detail: err instanceof Error ? err.message : 'unknown' } }
  }
}

interface EndTarget {
  isSample: boolean
  items: ExecuteItem[]
  target: ExecuteItem
  /** 지금 종료가 있는 종류의 핸들러. */
  handler: ExecuteHandler & { end: NonNullable<ExecuteHandler['end']> }
}

/** 묶음을 읽어 대상 항목을 정한다. 쓰기 없음. 항목이 묶음에 없으면 404, 「게재중」이 아니거나 지금 종료가 없는 종류면 409다. */
async function planEnd(service: ServiceClient, bundleId: string, itemId: string, handlers: ExecuteHandlerRegistry, failMessage: string): Promise<EndTarget | RunFailure> {
  const loaded = await loadBundleItems(service, bundleId, failMessage)
  if (isRunFailure(loaded)) return loaded
  const target = loaded.items.find((item) => item.id === itemId)
  if (!target) return fail(404, MESSAGES.itemNotFound)
  if (target.status !== 'live') return fail(409, MESSAGES.notLive)
  const handler = handlerOf(handlers, target)
  if (!handler || typeof handler.end !== 'function') return fail(409, MESSAGES.noEnd)
  return { isSample: loaded.isSample, items: loaded.items, target, handler: handler as EndTarget['handler'] }
}

// ── 미리 보기 ────────────────────────────────────────────────────────────────────────────────────

/** 영향 유저 수. 미션·컬렉션만 세고(자원 ID가 있을 때), 시험 묶음은 세지 않는다. 세다 실패하면 `null`이다. */
async function impactOf(service: ServiceClient, plan: EndTarget): Promise<EndImpact> {
  if (plan.isSample) return {}
  const kind = plan.target.kind
  if (kind !== 'mission' && kind !== 'collection_launch') return {}
  const resourceId = resourceIdOf(plan.target, plan.handler)
  if (!resourceId) return {}
  try {
    if (kind === 'mission') return await countMissionImpact(service, resourceId)
    return { fillingUsers: await countCollectionFillingUsers(service, resourceId) }
  } catch (err) {
    console.error(`${LOG} 영향 유저 수를 세지 못했어요(${kindLabel(kind)}):`, err instanceof Error ? err.message : 'unknown')
    return null
  }
}

/**
 * 미리 보기 요청(`{ dryRun: true }`). 쓰기 없이 이 항목을 직접 가리키는 게재 중 항목과 영향 유저 수를 돌려준다. 확인창이 먼저 부른다.
 * 게재중이 아닌 항목·지금 종료가 없는 종류는 실행과 같은 409다(확인창이 열리지 않는다). 영향 유저 수 세기가 실패해도 200이다(`impact: null`).
 */
export async function previewEnd(
  service: ServiceClient,
  input: { bundleId: string; itemId: string },
  deps: Partial<ExecuteDeps> = {}
): Promise<EndPreviewSuccess | RunFailure> {
  const plan = await planEnd(service, input.bundleId, input.itemId, deps.handlers ?? EXECUTE_HANDLERS, MESSAGES.previewFailed)
  if (isRunFailure(plan)) return plan
  return {
    ok: true,
    body: {
      ok: true,
      dryRun: true,
      isSample: plan.isSample,
      kind: plan.target.kind,
      pointedByLive: pointingLiveOf(plan.items, plan.target.id).map((item) => ({ id: item.id, kind: item.kind, label: itemLabelOf(item) })),
      impact: await impactOf(service, plan),
    },
  }
}

// ── 지금 종료 ────────────────────────────────────────────────────────────────────────────────────

/** 선점했던 항목을 `live`와 원래 `ends_at`으로 되돌린다(`status = 'ended'` 조건). 되돌렸으면 true, 오류면 false다. */
async function revertItem(service: ServiceClient, bundleId: string, target: ExecuteItem, stamp: string): Promise<boolean> {
  try {
    const reverted = await service
      .from('ops_bundle_items')
      .update({ status: 'live', ends_at: target.ends_at, updated_at: stamp })
      .eq('id', target.id)
      .eq('bundle_id', bundleId)
      .eq('status', 'ended')
      .select('id')
    if (reverted.error) {
      logError('되돌리기 실패(항목은 종료로 남았고 자원은 아직 게재 중이에요)', reverted.error)
      return false
    }
    return true
  } catch (err) {
    console.error(`${LOG} 되돌리다 예외가 났어요:`, err instanceof Error ? err.name : 'unknown')
    return false
  }
}

/**
 * 지금 종료 요청(`{ reason? }`). `reason`은 라우트가 다듬은 값(500자 이하, 없으면 `null`)이다.
 * 항목을 먼저 「종료」로 선점하고 자원의 종료 시각을 지금으로 바꾼다. 자원 종료가 실패하면 항목을 되돌린다.
 */
export async function endItem(
  service: ServiceClient,
  input: { bundleId: string; itemId: string; actor: string; reason: string | null },
  deps: Partial<ExecuteDeps> = {}
): Promise<EndSuccess | EndFailure> {
  const { bundleId, itemId, actor, reason } = input
  const handlers = deps.handlers ?? EXECUTE_HANDLERS
  const now = deps.now ?? (() => new Date())

  const plan = await planEnd(service, bundleId, itemId, handlers, MESSAGES.endFailed)
  if (isRunFailure(plan)) return plan
  const { target, handler, isSample } = plan
  const itemLabel = itemLabelOf(target)

  // 선점: 게재중인 항목만 「종료」로 바꾸고 `ends_at`도 지금으로 둔다. 0행이면 다른 곳(두 번째 요청·상태 맞추기)이 먼저 바꾼 것이다.
  const endNow = now()
  const stamp = endNow.toISOString()
  const claimed = await service
    .from('ops_bundle_items')
    .update({ status: 'ended', ends_at: stamp, updated_at: stamp })
    .eq('id', itemId)
    .eq('bundle_id', bundleId)
    .eq('status', 'live')
    .select('id')
  if (claimed.error) {
    logError('종료 상태 저장 실패(아무것도 바뀌지 않았어요)', claimed.error)
    return fail(500, MESSAGES.endFailed)
  }
  if (!claimed.data || claimed.data.length === 0) return fail(409, MESSAGES.notLive)

  // 자원 단계: 시험 묶음은 건너뛴다. 자원 ID가 비어 있으면 자원이 이미 없는 것으로 보고 항목만 닫는다.
  let resourceState: 'ended' | 'alreadyEnded' | 'missing' = 'ended'
  if (!isSample) {
    const resourceId = resourceIdOf(target, handler)
    if (!resourceId) {
      console.error(`${LOG} 자원 ID가 없는 게재중 항목이에요. 자원이 이미 없는 것으로 보고 상태만 바꿔요(${kindLabel(target.kind)})`)
      resourceState = 'missing'
    } else {
      const result = await endResource(handler.end, service, resourceId, endNow)
      if (!result.ok) {
        console.error(`${LOG} 자원 종료 실패(${kindLabel(target.kind)}, ${result.code}):`, result.failure.detail ?? result.failure.reason)
        const reverted = await revertItem(service, bundleId, target, stamp)
        if (!reverted) {
          return {
            ...fail(500, MESSAGES.revertFailed, { itemEnded: true }),
            slack: { batchId: crypto.randomUUID(), isSample, itemLabel, reason, resourceState: null, problem: MESSAGES.slackRevertFailed, decisionLogFailed: false },
          }
        }
        return result.code === 'not_published' ? fail(409, MESSAGES.notLive) : fail(500, MESSAGES.endFailed)
      }
      resourceState = result.state
    }
  }

  // 결정 기록: `end` 1행. 자원을 이미 끝냈으므로 실패해도 되돌리지 않고 알린다.
  const batchId = crypto.randomUUID()
  const inserted = await service
    .from('ops_decisions')
    .insert({ bundle_id: bundleId, item_id: itemId, action: OPS_DECISION_ACTION_END, actor, reason, diff: { ends_at: { before: target.ends_at, after: stamp } }, batch_id: batchId })
    .select('id')
  const decisionLogFailed = Boolean(inserted.error)
  if (inserted.error) logError('결정 기록 저장 실패(자원과 상태는 그대로예요)', inserted.error)

  return {
    ok: true,
    body: { ok: true, itemId, resourceState, ...(decisionLogFailed ? { decisionLogFailed: true as const } : {}) },
    batchId,
    slack: { batchId, isSample, itemLabel, reason, resourceState, problem: null, decisionLogFailed },
  }
}

// ── 슬랙 알림 ────────────────────────────────────────────────────────────────────────────────────

/**
 * 응답이 나간 뒤(`after`) 종료를 끝냈으면 한 건을 `#jam-report`에, 끝내지 못한 일(되돌림 실패)이나 결정 기록 실패가 있으면 한 건을 `#jam-alert`에 올린다.
 * 결과는 `batch_id`와 `action`(`end`)으로 채운다. **던지지 않는다** — 슬랙이 실패해도 종료는 그대로다.
 */
export async function notifyEnd(service: ServiceClient, slack: EndNotification): Promise<void> {
  if (slack.resourceState !== null) {
    await postAndRecord(
      service,
      slack,
      'report',
      OPS_DECISION_ACTION_END,
      formatEndMessage({ isSample: slack.isSample, itemLabel: slack.itemLabel, reason: slack.reason, resourceState: slack.resourceState })
    )
  }
  if (slack.problem === null && !slack.decisionLogFailed) return
  await postAndRecord(
    service,
    slack,
    'alert',
    OPS_DECISION_ACTION_END,
    formatEndFailureMessage({
      isSample: slack.isSample,
      problem: slack.problem === null ? null : { itemLabel: slack.itemLabel, reason: slack.problem },
      decisionLogFailed: slack.decisionLogFailed,
    })
  )
}
