/**
 * 예약 등록 실행 (티켓 20261002_1123, 상위 20260930_1500 ③-b) — **서버 전용**이다. 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8.2다.
 *
 * `dryRunExecution`은 사전 점검 결과를 돌려준다(쓰기 없음). `executeBundle`은 요청한 항목 가운데 지금도 예약할 수 있는 항목을 실행한다:
 * 선점(`approved` → `preparing`) → 그룹마다 등록 전 검증 → 생성(실패하면 이번에 만든 자원을 역순으로 `undo`) → 상태 갱신 → 결정 기록.
 * 서비스 클라이언트와 핸들러 레지스트리는 인자로 받는다(라우트가 실제 것을, 테스트가 가짜를 넘긴다). 실패해도 던지지 않고
 * `{ ok: false, status, error }`를 돌려준다. 실제 종류별 핸들러는 뒤 조각이 `EXECUTE_HANDLERS`에 붙인다.
 *
 * 지키는 규칙
 * - 선점은 조건부 update다(`status = 'approved'`). 하나도 차지하지 못하면 409라 같은 묶음을 두 번 실행해도 한 번만 반영된다.
 *   그룹의 일부만 차지했으면(동시 실행) 차지한 항목을 `approved`로 되돌리고 그 그룹을 건너뛴다.
 * - 연결 그룹은 함께 예약한다. 요청에 그룹의 예약할 항목이 다 있지 않으면 그 그룹은 건너뛴다(대상이 만든 ID를 채울 수 없다).
 * - 그룹의 검증·생성 중 하나라도 실패하면 이번에 만든 자원을 역순으로 지우고 그룹 전체를 「실패」로 둔다. 다른 그룹은 계속한다.
 * - 실패로 닫을 항목(반려·취소·실패한 대상을 가리키는 항목)은 요청에 없어도 실행 때 함께 `failed`로 닫는다. 실행한 그룹이 없으면 닫지 않는다.
 * - 자원을 만든 뒤 결정 기록 insert가 실패하면 자원과 상태는 그대로 두고 `decisionLogFailed`로 알린다(되돌리면 자원을 지워야 한다).
 * - 응답·결정 기록·슬랙에는 핸들러의 `reason`(쉬운 문장)만 싣고, `detail`과 DB 오류 원문은 서버 로그에만 남긴다.
 * - 시험 묶음은 검증까지 하고 자원은 만들지 않는다. 성공한 항목의 `created_resource`는 `{ "sample": true }`다(§8.8).
 * - 결정 기록은 insert만 하고 뒤에 `slack_result` 열만 채운다(`notifyExecution`). 제출 원본(`original`)은 건드리지 않는다.
 */
import type { Json } from '@/types/database.generated'
import { isUuid } from '@/lib/admin/uuid'
import { MAX_DECISION_REASON_CHARS, MAX_ITEMS, OPS_DECISION_ACTION_EXECUTE, OPS_DECISION_ACTION_FAIL } from '@/lib/admin/opsInbox/constants'
import { asRecord } from '@/lib/admin/opsInbox/itemView'
import { formatKstDayTime, kindLabel } from '@/lib/admin/opsInbox/labels'
import { formatExecuteFailureMessage, formatExecuteSummaryMessage, postOpsSlack, type OpsSlackChannel, type OpsSlackResult } from '@/lib/admin/opsInbox/slack'
import {
  EXECUTE_HANDLERS,
  RESOURCE_KEY_BY_KIND,
  asRegisterChecksClient,
  isExecutableKind,
  type ExecuteFailure,
  type ExecuteHandler,
  type ExecuteHandlerRegistry,
  type ExecuteItem,
  type ExecuteLinkedIds,
  type ExecuteOutcome,
  type ExecutePrepared,
  type ExecuteServiceClient,
} from './handlers'
import { PRECHECK_MESSAGES, precheckBundle, type PrecheckGroup, type PrecheckResult } from './precheck'

type ServiceClient = ExecuteServiceClient

const LOG = '[ops-inbox/execute]'

const MESSAGES = {
  executeFailed: '예약 등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  dryRunFailed: '사전 점검을 하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  bundleNotFound: '찾을 수 없는 기획이에요.',
  pickItems: '예약할 항목을 골라 주세요.',
  badItemId: '항목 ID 형식이 올바르지 않아요.',
  notInBundle: '이 기획의 항목이 아니에요.',
  nothingToRun: '예약할 수 있는 항목이 없어요. 이미 다른 곳에서 처리했거나 그사이 바뀐 항목이에요.',
  alreadyHandled: '이미 다른 곳에서 처리한 항목이에요',
  notExecutableKind: '예약 등록 대상이 아닌 종류예요',
  changed: '그사이 상태가 바뀌어 건너뛰었어요',
  partialGroup: '함께 예약할 연결 항목이 요청에 없어서 건너뛰었어요',
  concurrent: '다른 곳에서 동시에 처리해서 건너뛰었어요',
  closeFailed: '실패로 닫지 못해 건너뛰었어요. 다시 눌러 주세요',
  groupFailed: '연결된 항목을 만들지 못해 함께 실패했어요',
  undoFailed: '되돌리지 못한 자원이 있어요',
  unexpected: '예약 등록 중 오류가 났어요',
  saveFailed: '예약 등록 중 저장하지 못했어요',
  stateChanged: '항목 상태가 바뀌어 예약 등록을 멈췄어요',
  finishFailed: '예약 등록을 마무리하지 못했어요',
} as const

// ── 결과 ─────────────────────────────────────────────────────────────────────────────────────────

export interface ItemReason {
  id: string
  /** 화면·결정 기록·슬랙에 그대로 나가는 쉬운 문장. */
  reason: string
}

export interface RunFailure {
  ok: false
  status: 400 | 404 | 409 | 500
  error: string
  /** 응답 본문에 함께 실을 값(건너뛴 항목 등). */
  extra?: Record<string, unknown>
}

export interface DryRunSuccess {
  ok: true
  body: { ok: true; dryRun: true } & PrecheckResult
}

/** 슬랙 글 재료. 응답이 나간 뒤 `notifyExecution`이 쓴다. */
export interface ExecuteNotification {
  batchId: string
  isSample: boolean
  scheduled: number
  /** 사전 점검에서 실행하지 못한 승인 항목(기다리는 중·못 하는 항목)과 그사이 바뀌어 건너뛴 항목의 합. */
  excluded: number
  failures: Array<{ itemLabel: string; reason: string }>
  decisionLogFailed: boolean
}

export interface ExecuteSuccess {
  ok: true
  body: {
    ok: true
    /** 예약된 항목 ID. */
    scheduled: string[]
    failed: ItemReason[]
    skipped: ItemReason[]
    excludedCount: number
    /** 자원은 만들었는데 결정 기록을 남기지 못했다. 있을 때만 `true`다. */
    decisionLogFailed?: true
  }
  batchId: string
  slack: ExecuteNotification
}

export interface ExecuteDeps {
  handlers: ExecuteHandlerRegistry
  now: () => Date
}

function fail(status: RunFailure['status'], error: string, extra?: Record<string, unknown>): RunFailure {
  return { ok: false, status, error, ...(extra ? { extra } : {}) }
}

function logError(what: string, error: { message: string } | null | undefined) {
  console.error(`${LOG} ${what}:`, error?.message ?? 'unknown')
}

function isRunFailure<T extends object>(value: T | RunFailure): value is RunFailure {
  return 'ok' in value && (value as { ok?: unknown }).ok === false
}

// ── 읽기 재료 ────────────────────────────────────────────────────────────────────────────────────

/** `ExecuteItem`의 열 전부. 결정 처리(`decide.ts`)의 목록과 달리 `created_resource`·`pattern_no`가 들어 있다. */
const ITEM_COLUMNS =
  'id, bundle_id, position, item_key, kind, status, starts_at, ends_at, pattern_no, original, edited, created_resource, format_errors, updated_at'

async function loadBundleItems(
  service: ServiceClient,
  bundleId: string,
  failMessage: string
): Promise<{ isSample: boolean; items: ExecuteItem[] } | RunFailure> {
  const bundle = await service.from('ops_bundles').select('id, is_sample').eq('id', bundleId).maybeSingle()
  if (bundle.error) {
    logError('묶음 조회 실패', bundle.error)
    return fail(500, failMessage)
  }
  if (!bundle.data) return fail(404, MESSAGES.bundleNotFound)

  const listed = await service.from('ops_bundle_items').select(ITEM_COLUMNS).eq('bundle_id', bundleId)
  if (listed.error) {
    logError('항목 조회 실패', listed.error)
    return fail(500, failMessage)
  }
  return { isSample: bundle.data.is_sample, items: listed.data ?? [] }
}

/** 「종류 · 공개 시각(KST)」. 슬랙 글의 항목 이름이다(`author`·`item_key`는 자기 신고라 쓰지 않는다). */
function itemLabelOf(item: Pick<ExecuteItem, 'kind' | 'starts_at'>): string {
  return [kindLabel(item.kind), formatKstDayTime(item.starts_at)].filter(Boolean).join(' · ')
}

// ── 사전 점검 ────────────────────────────────────────────────────────────────────────────────────

/** 사전 점검 요청(`{ dryRun: true }`). 쓰기 없이 `precheckBundle` 결과를 돌려준다. */
export async function dryRunExecution(service: ServiceClient, bundleId: string, deps: Partial<ExecuteDeps> = {}): Promise<DryRunSuccess | RunFailure> {
  const loaded = await loadBundleItems(service, bundleId, MESSAGES.dryRunFailed)
  if (isRunFailure(loaded)) return loaded
  const result = precheckBundle(loaded.items, { now: (deps.now ?? (() => new Date()))(), handlers: deps.handlers ?? EXECUTE_HANDLERS })
  return { ok: true, body: { ok: true, dryRun: true, ...result } }
}

// ── 핸들러 호출 ──────────────────────────────────────────────────────────────────────────────────

/** 핸들러 계약은 던지지 않는 것이다. 던지면 그룹 실패로 바꿔 항목이 「준비중」에 남지 않게 한다. */
async function guarded<T>(run: () => T | Promise<T>, onThrow: (failure: ExecuteFailure) => T): Promise<T> {
  try {
    return await run()
  } catch (err) {
    return onThrow({ reason: MESSAGES.unexpected, detail: err instanceof Error ? err.message : 'unknown' })
  }
}

const asFailedOutcome = <T>(failure: ExecuteFailure): ExecuteOutcome<T> => ({ ok: false, failure })

/** 사유를 다듬는다. 비면 일반 문장, 길면 결정 기록 사유 상한으로 자른다. */
function cleanReason(reason: string): string {
  const trimmed = reason.trim() || MESSAGES.unexpected
  return trimmed.length > MAX_DECISION_REASON_CHARS ? `${trimmed.slice(0, MAX_DECISION_REASON_CHARS - 1)}…` : trimmed
}

function joinSentences(first: string, second: string): string {
  return `${first.replace(/[.\s]+$/, '')}. ${second}`
}

// ── 그룹 실행 ────────────────────────────────────────────────────────────────────────────────────

interface RunContext {
  service: ServiceClient
  bundleId: string
  actor: string
  isSample: boolean
  handlers: ExecuteHandlerRegistry
  byId: ReadonlyMap<string, ExecuteItem>
  stamp: () => string
}

type GroupResult = { ok: true } | { ok: false; failed: ItemReason[] }

interface CreatedResource {
  item: ExecuteItem
  handler: ExecuteHandler
  resourceId: string
}

/** 이미 처리된 항목이 `created_resource`에 적어 둔 자원 ID. 없으면 null이다. */
function existingResourceId(item: ExecuteItem | undefined): string | null {
  if (!item || !isExecutableKind(item.kind)) return null
  const value = asRecord(item.created_resource)?.[RESOURCE_KEY_BY_KIND[item.kind]]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * 이 항목의 연결 칸에 넣을 ID. 대상이 이번 실행에서 만드는 항목이면 `resourceIds`(검증 때는 미리 정한 ID, 생성 때는 만들어진 ID),
 * 이미 처리된 항목이면 그 항목의 `created_resource`다.
 */
function linkedIdsFor(
  ctx: RunContext,
  group: PrecheckGroup,
  item: ExecuteItem,
  resourceIds: ReadonlyMap<string, string>
): ExecuteOutcome<ExecuteLinkedIds> {
  const linked: Record<string, string | string[]> = {}
  for (const fill of group.linkPlan[item.id] ?? []) {
    const targets: string[] = []
    for (const targetId of fill.targetItemIds) {
      const resourceId = resourceIds.get(targetId) ?? existingResourceId(ctx.byId.get(targetId))
      if (!resourceId) return { ok: false, failure: { reason: PRECHECK_MESSAGES.targetResourceMissing } }
      targets.push(resourceId)
    }
    // 칸 이름과 단일·덧붙임은 `LINK_PAIRS`가 정하므로(`groups.ts`) 단일 칸은 문자열, 덧붙임 칸은 배열이다.
    linked[fill.field] = fill.mode === 'single' ? targets[0] : targets
  }
  return { ok: true, value: linked as ExecuteLinkedIds }
}

/** 항목의 `created_resource`를 적는다(`preparing`인 동안만). 적지 못하면 실패 사유를 돌려준다. */
async function writeCreatedResource(ctx: RunContext, item: ExecuteItem, key: string, resourceId: string): Promise<ExecuteFailure | null> {
  const written = await ctx.service
    .from('ops_bundle_items')
    .update({ created_resource: { [key]: resourceId }, updated_at: ctx.stamp() })
    .eq('id', item.id)
    .eq('bundle_id', ctx.bundleId)
    .eq('status', 'preparing')
    .select('id')
  if (written.error) return { reason: MESSAGES.saveFailed, detail: written.error.message }
  if (!written.data || written.data.length === 0) return { reason: MESSAGES.stateChanged }
  return null
}

/**
 * 그룹 실패를 정한다: 이번에 만든 자원을 역순으로 지우고, 항목마다 사유를 붙인다. 원인 항목(`culpritId`)은 자기 사유를, 나머지는
 * 「함께 실패했어요」를 받는다(특정 항목 탓이 아니면 `null`: 모두 같은 사유). 응답에는 `reason`만 싣고 `detail`은 서버 로그에만 남긴다.
 */
async function failGroup(
  ctx: RunContext,
  items: readonly ExecuteItem[],
  created: readonly CreatedResource[],
  culpritId: string | null,
  failure: ExecuteFailure
): Promise<GroupResult> {
  if (failure.detail) console.error(`${LOG} 실행 실패(${kindLabel(ctx.byId.get(culpritId ?? '')?.kind)}):`, failure.detail)

  const undoFailedIds = new Set<string>()
  for (const entry of [...created].reverse()) {
    const undone = await guarded(() => entry.handler.undo(ctx.service, entry.resourceId), (thrown) => thrown)
    if (undone) {
      undoFailedIds.add(entry.item.id)
      console.error(`${LOG} 되돌리지 못한 자원(${kindLabel(entry.item.kind)}):`, undone.detail ?? undone.reason)
    }
  }

  const failed = items.map((item): ItemReason => {
    const base = culpritId === null || item.id === culpritId ? cleanReason(failure.reason) : MESSAGES.groupFailed
    return { id: item.id, reason: undoFailedIds.has(item.id) ? joinSentences(base, MESSAGES.undoFailed) : base }
  })
  return { ok: false, failed }
}

/** 연결 그룹 하나를 실행한다. 성공하면 항목은 「예약됨」이 돼 있고, 실패하면 아직 「준비중」이다(상태는 호출부가 닫는다). */
async function runGroup(ctx: RunContext, group: PrecheckGroup): Promise<GroupResult> {
  const items = group.executeIds.map((id) => ctx.byId.get(id) as ExecuteItem)
  const plannedIds = new Map(items.map((item) => [item.id, crypto.randomUUID()]))
  const resourceIds = new Map(plannedIds)
  const handlerOf = (item: ExecuteItem) => ctx.handlers[item.kind ?? ''] as ExecuteHandler

  const prepare = async (item: ExecuteItem): Promise<ExecuteOutcome<ExecutePrepared>> => {
    const linked = linkedIdsFor(ctx, group, item, resourceIds)
    if (!linked.ok) return linked
    const id = plannedIds.get(item.id) as string
    return guarded<ExecuteOutcome<ExecutePrepared>>(
      () => handlerOf(item).prepare(item, { id, actorId: ctx.actor, linkedIds: linked.value }),
      asFailedOutcome
    )
  }

  // 1) 등록 전 검증: 모든 항목을 변환하고 DB 검사를 한다. 하나라도 실패하면 만든 것 없이 그룹 전체가 실패다.
  for (const item of items) {
    const prepared = await prepare(item)
    if (!prepared.ok) return failGroup(ctx, items, [], item.id, prepared.failure)
    const checked = await guarded(() => handlerOf(item).check(asRegisterChecksClient(ctx.service), prepared.value), (thrown) => thrown)
    if (checked) return failGroup(ctx, items, [], item.id, checked)
  }

  // 2) 생성: 시험 묶음은 만들지 않는다. 대상이 바로 앞에서 만들어진 ID를 쓰도록 변환을 다시 한다.
  const created: CreatedResource[] = []
  if (!ctx.isSample) {
    for (const item of items) {
      const handler = handlerOf(item)
      const prepared = await prepare(item)
      if (!prepared.ok) return failGroup(ctx, items, created, item.id, prepared.failure)

      const plannedId = plannedIds.get(item.id) as string
      if (handler.idFirst) {
        const written = await writeCreatedResource(ctx, item, handler.resourceKey, plannedId)
        if (written) return failGroup(ctx, items, created, item.id, written)
      }
      const made = await guarded<ExecuteOutcome<{ id: string }>>(() => handler.create(ctx.service, prepared.value), asFailedOutcome)
      if (!made.ok) return failGroup(ctx, items, created, item.id, made.failure)

      const resourceId = made.value.id
      resourceIds.set(item.id, resourceId)
      // 적기 전에 되돌려야 할 수 있으니 먼저 목록에 넣는다.
      created.push({ item, handler, resourceId })
      if (!handler.idFirst || resourceId !== plannedId) {
        const written = await writeCreatedResource(ctx, item, handler.resourceKey, resourceId)
        if (written) return failGroup(ctx, items, created, item.id, written)
      }
    }
  }

  // 3) 예약됨으로 옮긴다. 시험 묶음은 여기서 `created_resource`를 `{ sample: true }`로 적는다.
  const sampleResource: { created_resource?: Json } = ctx.isSample ? { created_resource: { sample: true } } : {}
  const finished = await ctx.service
    .from('ops_bundle_items')
    .update({ status: 'scheduled', updated_at: ctx.stamp(), ...sampleResource })
    .eq('bundle_id', ctx.bundleId)
    .eq('status', 'preparing')
    .in('id', group.executeIds)
    .select('id')
  if (finished.error) return failGroup(ctx, items, created, null, { reason: MESSAGES.finishFailed, detail: finished.error.message })
  return { ok: true }
}

// ── 실행 ─────────────────────────────────────────────────────────────────────────────────────────

/** 요청한 항목이 지금 예약할 수 없는 이유(건너뛴 항목의 사유). */
function skipReasonOf(id: string, byId: ReadonlyMap<string, ExecuteItem>, precheck: PrecheckResult): string {
  const blocked = precheck.blocked.find((entry) => entry.id === id)
  if (blocked) return blocked.reasons[0]
  if (precheck.waiting.includes(id)) return PRECHECK_MESSAGES.waiting
  if (precheck.excluded.includes(id)) return MESSAGES.notExecutableKind
  return byId.get(id)?.status === 'approved' ? MESSAGES.changed : MESSAGES.alreadyHandled
}

/**
 * 슬랙 요약의 「제외」: 사전 점검에서 실행하지 못한 승인 항목(기다리는 중·못 하는 항목)과 그사이 바뀌어 건너뛴 항목의 합이다.
 * 요청한 항목이 그사이 못 하는 항목이 됐으면 두 쪽에 다 있으니 항목 ID로 한 번만 센다.
 */
function countExcluded(precheck: PrecheckResult, skipped: readonly ItemReason[]): number {
  return new Set([...precheck.waiting, ...precheck.blocked.map((entry) => entry.id), ...skipped.map((entry) => entry.id)]).size
}

/** 차지한 항목을 `approved`로 되돌린다. 되돌림이 실패하면 로그만 남긴다(「준비중」으로 남은 항목은 상태 맞추기가 정리한다). */
async function releaseClaim(ctx: RunContext, itemIds: string[]) {
  const released = await ctx.service
    .from('ops_bundle_items')
    .update({ status: 'approved', updated_at: ctx.stamp() })
    .eq('bundle_id', ctx.bundleId)
    .eq('status', 'preparing')
    .in('id', itemIds)
  if (released.error) logError('선점 되돌림 실패(항목이 준비중으로 남아 있을 수 있어요)', released.error)
}

/**
 * 실행 요청(`{ itemIds }`). `itemIds`는 요약창이 보인 「예약할 항목」이다. 서버는 사전 점검을 다시 해서 지금도 예약할 수 있는 항목만 실행하고,
 * 나머지 요청 항목은 `skipped`로 알린다. 실행한 그룹이 하나도 없으면 409다.
 */
export async function executeBundle(
  service: ServiceClient,
  input: { bundleId: string; itemIds: unknown; actor: string },
  deps: Partial<ExecuteDeps> = {}
): Promise<ExecuteSuccess | RunFailure> {
  const { bundleId, actor } = input
  const handlers = deps.handlers ?? EXECUTE_HANDLERS
  const now = deps.now ?? (() => new Date())

  const raw = Array.isArray(input.itemIds) ? input.itemIds : []
  if (raw.length === 0) return fail(400, MESSAGES.pickItems)
  if (!raw.every((id): id is string => typeof id === 'string' && isUuid(id))) return fail(400, MESSAGES.badItemId)
  const ids = [...new Set(raw)]
  if (ids.length > MAX_ITEMS) return fail(400, `한 번에 ${MAX_ITEMS}개까지 예약할 수 있어요.`)

  const loaded = await loadBundleItems(service, bundleId, MESSAGES.executeFailed)
  if (isRunFailure(loaded)) return loaded
  const { isSample, items } = loaded
  const byId = new Map(items.map((item) => [item.id, item]))
  if (ids.some((id) => !byId.has(id))) return fail(400, MESSAGES.notInBundle)

  const ctx: RunContext = { service, bundleId, actor, isSample, handlers, byId, stamp: () => now().toISOString() }

  // 사전 점검을 다시 해 지금도 예약할 수 있는 항목만 실행한다.
  const precheck = precheckBundle(items, { now: now(), handlers })
  const requested = new Set(ids)
  const readyIds = new Set(precheck.ready)
  const failCloseIds = new Set(precheck.failClose.map((entry) => entry.id))
  const skipped: ItemReason[] = ids
    .filter((id) => !readyIds.has(id) && !failCloseIds.has(id))
    .map((id) => ({ id, reason: skipReasonOf(id, byId, precheck) }))

  // 연결 그룹은 함께 예약한다. 요청에 그룹의 예약할 항목이 다 있지 않으면 그룹째 건너뛴다.
  const candidates: PrecheckGroup[] = []
  for (const group of precheck.groups) {
    const wanted = group.executeIds.filter((id) => requested.has(id))
    if (wanted.length === 0) continue
    if (wanted.length < group.executeIds.length) skipped.push(...wanted.map((id) => ({ id, reason: MESSAGES.partialGroup })))
    else candidates.push(group)
  }
  const nothingToRun = () => fail(409, MESSAGES.nothingToRun, { skipped, excludedCount: countExcluded(precheck, skipped) })

  // 선점: 「승인됨 → 준비중」을 조건부로 차지한다. 하나도 차지하지 못하면 409다.
  const claimIds = candidates.flatMap((group) => group.executeIds)
  if (claimIds.length === 0) return nothingToRun()
  const claim = await service
    .from('ops_bundle_items')
    .update({ status: 'preparing', updated_at: ctx.stamp() })
    .eq('bundle_id', bundleId)
    .eq('status', 'approved')
    .in('id', claimIds)
    .select('id')
  if (claim.error) {
    logError('선점 실패', claim.error)
    return fail(500, MESSAGES.executeFailed)
  }
  const claimed = new Set((claim.data ?? []).map((row) => row.id))

  // 그룹 일부만 차지했으면(동시 실행) 차지한 항목을 되돌리고 그 그룹을 건너뛴다.
  const toRun: PrecheckGroup[] = []
  for (const group of candidates) {
    const mine = group.executeIds.filter((id) => claimed.has(id))
    if (mine.length === group.executeIds.length) {
      toRun.push(group)
      continue
    }
    if (mine.length > 0) await releaseClaim(ctx, mine)
    skipped.push(...group.executeIds.map((id) => ({ id, reason: MESSAGES.concurrent })))
  }
  if (toRun.length === 0) return nothingToRun()

  const scheduled: string[] = []
  const failed: ItemReason[] = []
  for (const group of toRun) {
    const result = await runGroup(ctx, group)
    if (result.ok) {
      scheduled.push(...group.executeIds)
      continue
    }
    failed.push(...result.failed)
    const closed = await service
      .from('ops_bundle_items')
      .update({ status: 'failed', updated_at: ctx.stamp() })
      .eq('bundle_id', bundleId)
      .eq('status', 'preparing')
      .in('id', group.executeIds)
    if (closed.error) logError('실패 상태 변경 실패(항목이 준비중으로 남아 있을 수 있어요)', closed.error)
  }

  // 실패로 닫을 항목: 요청에 없어도 함께 닫는다(§8.2). 그사이 바뀌어 닫지 못한 항목은 건너뛴 항목이다.
  if (precheck.failClose.length > 0) {
    const closing = await service
      .from('ops_bundle_items')
      .update({ status: 'failed', updated_at: ctx.stamp() })
      .eq('bundle_id', bundleId)
      .eq('status', 'approved')
      .in('id', [...failCloseIds])
      .select('id')
    if (closing.error) logError('실패로 닫기 실패', closing.error)
    const closedIds = new Set((closing.data ?? []).map((row) => row.id))
    for (const entry of precheck.failClose) {
      if (closedIds.has(entry.id)) failed.push({ id: entry.id, reason: cleanReason(entry.reason) })
      else skipped.push({ id: entry.id, reason: closing.error ? MESSAGES.closeFailed : MESSAGES.alreadyHandled })
    }
  }

  // 결정 기록: 예약된 항목마다 `execute`, 실패한 항목마다 `fail`(사유 필수), 같은 `batch_id`다.
  const batchId = crypto.randomUUID()
  const inserted = await service
    .from('ops_decisions')
    .insert([
      ...scheduled.map((itemId) => ({ bundle_id: bundleId, item_id: itemId, action: OPS_DECISION_ACTION_EXECUTE, actor, batch_id: batchId })),
      ...failed.map((entry) => ({ bundle_id: bundleId, item_id: entry.id, action: OPS_DECISION_ACTION_FAIL, actor, reason: entry.reason, batch_id: batchId })),
    ])
    .select('id')
  // 자원을 이미 만들었으므로 되돌리지 않고 알린다(되돌리면 자원을 지워야 한다).
  const decisionLogFailed = Boolean(inserted.error)
  if (inserted.error) logError('결정 기록 저장 실패(자원과 상태는 그대로예요)', inserted.error)

  const excludedCount = countExcluded(precheck, skipped)
  return {
    ok: true,
    body: { ok: true, scheduled, failed, skipped, excludedCount, ...(decisionLogFailed ? { decisionLogFailed: true as const } : {}) },
    batchId,
    slack: {
      batchId,
      isSample,
      scheduled: scheduled.length,
      excluded: excludedCount,
      failures: failed.map((entry) => ({ itemLabel: itemLabelOf(byId.get(entry.id) as ExecuteItem), reason: entry.reason })),
      decisionLogFailed,
    },
  }
}

// ── 슬랙 알림 ────────────────────────────────────────────────────────────────────────────────────

/** 글을 올리고 그 결과를 결정 기록의 `slack_result`에 채운다(같은 `batch_id`의 그 `action` 행). 던지지 않는다. */
async function postAndRecord(
  service: ServiceClient,
  slack: ExecuteNotification,
  channel: OpsSlackChannel,
  action: string,
  text: string
): Promise<void> {
  try {
    const result: OpsSlackResult = await postOpsSlack(channel, text)
    if (!result.ok) console.error(`${LOG} 슬랙 알림 실패(${channel}):`, result.error)
    if (slack.decisionLogFailed) return
    const slackResult: Json = result.error ? { channel, ok: result.ok, error: result.error } : { channel, ok: result.ok }
    const { error } = await service.from('ops_decisions').update({ slack_result: slackResult }).eq('batch_id', slack.batchId).eq('action', action)
    if (error) logError('알림 결과 기록 실패', error)
  } catch (err) {
    console.error(`${LOG} 슬랙 알림 처리 중 예외:`, err instanceof Error ? err.name : 'unknown')
  }
}

/**
 * 응답이 나간 뒤(`after`) 요약 한 건을 `#jam-report`에, 실패가 있으면 한 건을 `#jam-alert`에 올린다. 결과는 `batch_id`와 `action`으로 나눠 채운다:
 * 요약은 `execute` 행, 실패 글은 `fail` 행이다. **던지지 않는다** — 슬랙이 실패해도 예약 등록은 그대로다. 결정 기록에는 `slack_result` 열만 update한다.
 */
export async function notifyExecution(service: ServiceClient, outcome: ExecuteSuccess): Promise<void> {
  const { slack } = outcome
  await postAndRecord(
    service,
    slack,
    'report',
    OPS_DECISION_ACTION_EXECUTE,
    formatExecuteSummaryMessage({ isSample: slack.isSample, scheduled: slack.scheduled, excluded: slack.excluded, failed: slack.failures.length })
  )
  if (slack.failures.length === 0 && !slack.decisionLogFailed) return
  await postAndRecord(
    service,
    slack,
    'alert',
    OPS_DECISION_ACTION_FAIL,
    formatExecuteFailureMessage({ isSample: slack.isSample, failures: slack.failures, decisionLogFailed: slack.decisionLogFailed })
  )
}
