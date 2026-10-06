/**
 * 상태 맞추기 엔진 (티켓 20261002_1813, 상위 20260930_1500 ⑦-a) — **서버 전용**이다. 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8.6·§8.8이다.
 *
 * `planReconcile`은 항목과 자원 읽기 결과를 견주어 무엇을 바꿀지 정하는 순수 함수다. `reconcileOpsItems`는 「준비중」·「예약됨」·「게재중」 항목을 읽고,
 * 자원을 읽고(`observe`), 판정하고, 상태를 조건부로 바꾸고, 결정 기록을 남긴다. `notifyReconcile`은 응답이 나간 뒤(`after`) 슬랙 글을 올린다.
 * 서비스 클라이언트와 핸들러 레지스트리는 인자로 받는다(크론 라우트가 실제 것을, 테스트가 가짜를 넘긴다). 크론 라우트·`vercel.json`·화면 이름표는 ⑦-b(20261002_1814)다.
 *
 * 지키는 규칙
 * - 공개를 일으키는 주체는 없다. 자원이 저절로 보이게 되면 항목 상태만 따라간다: 예약됨 → 게재중 → 종료는 결정 기록을 남기지 않는다(자원의 시각이 정한 일).
 * - 자원이 운영툴 밖에서 지워졌으면 예약됨은 취소(`cancel`), 게재중은 종료(`end`)로 닫고 사유 「운영툴 밖에서 지워졌어요」를 남긴다. 자원 ID가 `created_resource`에 없는
 *   예약됨 항목도 같다(공개 전 취소와 같은 해석). 드랍이 놓이지 못하고 끝났으면(`failed`) 실패(`fail`)로 닫는다.
 * - 운영툴 밖에서 자원의 공개·종료 시각이 바뀌었거나 비활성이 됐으면 상태는 위 규칙대로 두고 `external_change`만 따로 남긴다. 되돌리지 않는다(G8). 그 항목의 가장 최근
 *   `external_change`와 차이가 같으면 다시 남기지 않는다.
 * - 「준비중」으로 10분이 지난 항목은 실패로 닫는다. 실제 묶음이고 자원 ID가 있으면 핸들러 `undo`(참조 확인 포함)로 지운다. 지우지 못하면 자원은 남기고 사유에
 *   「만든 자원이 남아 있어요」를 덧붙이고 알림 글에 자원 ID를 싣는다. 가장 최근 결정 기록이 이미 `fail`이면 새로 남기지 않는다.
 *   자원을 지우는 항목끼리는 생성 순서의 역순(`orderForUndo`, 카드가 미션보다 먼저)으로 부른다. 미션을 먼저 지우면 카드의 `mission_id` 참조에 걸려 미션이 남는다(티켓 20261002_1944).
 * - 시험 묶음은 자원을 읽지 않고 항목의 시각만 본다(§8.8). 드랍 항목은 공개 시각에 곧바로 종료한다. 멈춘 준비중은 `undo` 없이 닫는다.
 * - 상태는 항목마다 조건부 update(`status = 지금 상태`)이고 돌아온 id로 실제 바뀐 항목만 센다. 크론이 겹쳐 돌아도 한 번만 바뀐다(잠금·DB 변경 없음).
 *   결정 기록은 바뀐 항목에만 남기고(`external_change`는 차이가 새로울 때) 행위자는 `system:reconcile`, 회차마다 `batch_id` 하나다.
 * - 항목 하나의 오류(자원을 읽지 못함·핸들러 없음·쓰기 실패)가 회차를 멈추지 않는다. 그 항목은 건너뛰고 서버 로그와 결과의 `errors`에 남긴다. 상태는 바꾸지 않는다.
 * - 응답·결정 기록·슬랙에는 고정 문장(핸들러의 `reason`)만 싣는다. DB 오류 원문은 서버 로그 `[ops-inbox/reconcile]`에만 남는다.
 */
import type { Json } from '@/types/database.generated'
import { kstDayBoundsIso } from '@/lib/admin/today-calendar'
import {
  MAX_DECISION_REASON_CHARS,
  OPS_DECISION_ACTION_CANCEL,
  OPS_DECISION_ACTION_END,
  OPS_DECISION_ACTION_EXTERNAL_CHANGE,
  OPS_DECISION_ACTION_FAIL,
  OPS_HOME_FEED_CARD_KIND,
  OPS_RECONCILE_ACTOR,
  OPS_RECONCILE_REASONS,
} from '@/lib/admin/opsInbox/constants'
import { removeOpsImageFiles } from '@/lib/admin/opsInbox/image'
import { asRecord } from '@/lib/admin/opsInbox/itemView'
import { kindLabel, kstDateKey } from '@/lib/admin/opsInbox/labels'
import { formatReconcileAlertMessage, formatReconcileReportMessage, type ReconcileAlertItem } from '@/lib/admin/opsInbox/slack'
import {
  RESOURCE_KEY_BY_KIND,
  isExecutableKind,
  type ExecuteHandler,
  type ExecuteHandlerRegistry,
  type ExecuteItem,
  type ExecuteServiceClient,
  type ResourceObservation,
} from './handlers'
import { orderForUndo } from './groups'
import { EXECUTE_HANDLERS } from './registry'
import { ITEM_COLUMNS, itemLabelOf, postAndRecord, type ExecuteDeps, type RunFailure } from './run'

type ServiceClient = ExecuteServiceClient

const LOG = '[ops-inbox/reconcile]'

const MESSAGES = {
  reconcileFailed: '상태를 맞추지 못했어요.',
} as const

/** 「준비중」이 이 시간 넘게 이어지면 멈춘 것으로 본다(요청 60초 안에 끝나지 못함, §8.6). */
const PREPARING_STALE_MS = 10 * 60 * 1000

/** `.in()`에 한 번에 넘기는 ID 수. 주소가 길어져 요청이 막히지 않게 나눠 읽는다. */
const IN_CHUNK = 100

/** 맞추기 대상 상태. */
const TARGET_STATUSES = ['preparing', 'scheduled', 'live'] as const
type TargetStatus = (typeof TARGET_STATUSES)[number]

// ── 판정(순수) ───────────────────────────────────────────────────────────────────────────────────

type TransitionTarget = 'live' | 'ended' | 'cancelled' | 'failed'
/** 결정 기록을 남기는 전이의 `action`. 남기지 않는 전이는 null이다. */
type RecordAction = typeof OPS_DECISION_ACTION_CANCEL | typeof OPS_DECISION_ACTION_END | typeof OPS_DECISION_ACTION_FAIL

/** 항목의 시각 칸 하나가 자원과 다른 모양. `null`은 시각이 없다(상시)는 뜻이다. */
type TimeDiff = { item: string | null; resource: string | null }

/** `external_change`의 `diff`. 다른 칸만 담는다. 시각은 ISO 문자열이고 비활성은 항목이 켜 둔 것(true)과 자원이 꺼진 것(false)이다. */
export type ExternalDiff = { starts_at?: TimeDiff; ends_at?: TimeDiff; is_active?: { item: true; resource: false } }

/** 판정 재료 한 건: 항목과, 항목마다 결정 기록에서 읽은 두 값. */
export interface ReconcileItem {
  item: ExecuteItem
  /** 묶음이 시험 묶음인지. 시험 묶음은 자원 대신 항목의 시각만 본다. */
  isSample: boolean
  /** 그 항목의 가장 최근 결정 기록의 `action`. 기록이 없으면 null. */
  lastAction: string | null
  /** 그 항목의 가장 최근 `external_change`의 `diff`. 없으면 null. */
  lastExternalDiff: Json | null
}

/** 상태를 바꾸는 판정 한 건. */
export interface ReconcileTransition {
  item: ExecuteItem
  isSample: boolean
  from: TargetStatus
  to: TransitionTarget
  /** 남길 결정 기록의 `action`. 남기지 않으면 null. */
  action: RecordAction | null
  /** 결정 기록 사유이자 알림 글의 사유. 사유가 없는 전이(게재 시작·종료 시각 도달)는 null. */
  reason: string | null
  /** 멈춘 준비중을 닫을 때 지울 자원 ID. 없으면 null. */
  undoResourceId: string | null
}

/** `external_change`로 남길 판정 한 건. */
export interface PlannedExternalChange {
  item: ExecuteItem
  isSample: boolean
  diff: ExternalDiff
}

export interface ReconcilePlan {
  transitions: ReconcileTransition[]
  externalChanges: PlannedExternalChange[]
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function isoOf(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString()
}

/** 사유를 다듬는다. 결정 기록 사유 상한으로 자른다. */
function clipReason(reason: string): string {
  const trimmed = reason.trim()
  return trimmed.length > MAX_DECISION_REASON_CHARS ? `${trimmed.slice(0, MAX_DECISION_REASON_CHARS - 1)}…` : trimmed
}

/** 항목이 `created_resource`에 적어 둔 자원 ID. 키가 없거나 종류가 예약 등록 대상이 아니면 null이다. */
function resourceIdOfItem(item: ExecuteItem): string | null {
  if (!isExecutableKind(item.kind)) return null
  const value = asRecord(item.created_resource)?.[RESOURCE_KEY_BY_KIND[item.kind]]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * 항목이 자원에 기대하는 종료 시각(ms). 항목에 종료 시각이 있으면 그 값이다. 없으면 카드는 공개한 날의 끝(KST 23:59:59.999)으로 등록되므로(`registerInput.ts` 결정 6) 같은 값을 기대하고,
 * 그 밖의 종류는 상시(null)다. 종류마다 종료 시각을 채우는 규칙이 다르면 그 핸들러 조각이 여기에 더한다.
 */
function expectedEndMs(item: ExecuteItem): number | null {
  const own = parseMs(item.ends_at)
  if (own !== null) return own
  if (item.kind !== OPS_HOME_FEED_CARD_KIND) return null
  const day = kstDateKey(item.starts_at)
  return day ? parseMs(kstDayBoundsIso(day).endIso) : null
}

/** 자원이 항목과 다른 칸. 다른 칸이 없으면 null이다. 시각은 밀리초로 비교한다. */
function externalDiffOf(item: ExecuteItem, observation: Extract<ResourceObservation, { status: 'present' }>): ExternalDiff | null {
  const diff: ExternalDiff = {}

  const itemStart = parseMs(item.starts_at)
  const resourceStart = parseMs(observation.startsAt)
  // 항목에 공개 시각이 없으면 견줄 값이 없다(형식 오류 항목은 예약되지 않는다).
  if (itemStart !== null && itemStart !== resourceStart) diff.starts_at = { item: isoOf(itemStart), resource: isoOf(resourceStart) }

  const itemEnd = expectedEndMs(item)
  const resourceEnd = parseMs(observation.endsAt)
  if (itemEnd !== resourceEnd) diff.ends_at = { item: isoOf(itemEnd), resource: isoOf(resourceEnd) }

  if (observation.inactive) diff.is_active = { item: true, resource: false }
  return Object.keys(diff).length > 0 ? diff : null
}

/** 두 `diff`가 같은 차이인지. 저장된 JSONB는 키 순서가 바뀔 수 있어 칸마다 풀어서 견준다. */
function diffKey(diff: unknown): string {
  const record = asRecord(diff) ?? {}
  return (['starts_at', 'ends_at', 'is_active'] as const)
    .map((key) => {
      const cell = asRecord(record[key])
      return cell ? `${JSON.stringify(cell.item ?? null)}>${JSON.stringify(cell.resource ?? null)}` : '-'
    })
    .join('|')
}

function transition(entry: ReconcileItem, to: TransitionTarget, extra: Partial<Pick<ReconcileTransition, 'action' | 'reason' | 'undoResourceId'>> = {}): ReconcileTransition {
  return {
    item: entry.item,
    isSample: entry.isSample,
    from: entry.item.status as TargetStatus,
    to,
    action: extra.action ?? null,
    reason: extra.reason ?? null,
    undoResourceId: extra.undoResourceId ?? null,
  }
}

/** 멈춘 준비중. 읽은 시각 기준으로 10분이 지났으면 실패로 닫는다. */
function planPreparing(entry: ReconcileItem, nowMs: number): ReconcileTransition | null {
  const updatedMs = parseMs(entry.item.updated_at)
  if (updatedMs === null || updatedMs + PREPARING_STALE_MS > nowMs) return null
  return transition(entry, 'failed', {
    // 실행 API가 닫기에 실패하며 이미 `fail`을 남겼으면 같은 기록을 겹쳐 남기지 않는다.
    action: entry.lastAction === OPS_DECISION_ACTION_FAIL ? null : OPS_DECISION_ACTION_FAIL,
    reason: OPS_RECONCILE_REASONS.preparingStalled,
    undoResourceId: entry.isSample ? null : resourceIdOfItem(entry.item),
  })
}

/** 시험 묶음. 자원 대신 항목의 시각만 본다(§8.8). */
function planSample(entry: ReconcileItem, nowMs: number): ReconcileTransition | null {
  const { item } = entry
  const startMs = parseMs(item.starts_at)
  const endMs = parseMs(item.ends_at)
  const endedByTime = endMs !== null && endMs < nowMs

  if (item.status === 'scheduled') {
    if (startMs === null || startMs > nowMs) return null
    // 드랍은 놓인 직후 종료로 닫는다. 두 시각이 다 지난 늦은 회차도 곧바로 종료다.
    return transition(entry, item.kind === 'drop_schedule' || endedByTime ? 'ended' : 'live')
  }
  return endedByTime ? transition(entry, 'ended') : null
}

/** 실제 묶음의 예약됨·게재중. 자원 읽기 결과와 견준다(§8.6 표). */
function planObserved(entry: ReconcileItem, observation: ResourceObservation): { transition: ReconcileTransition | null; diff: ExternalDiff | null } {
  const scheduled = entry.item.status === 'scheduled'
  switch (observation.status) {
    case 'missing':
      return {
        transition: scheduled
          ? transition(entry, 'cancelled', { action: OPS_DECISION_ACTION_CANCEL, reason: OPS_RECONCILE_REASONS.deletedOutside })
          : transition(entry, 'ended', { action: OPS_DECISION_ACTION_END, reason: OPS_RECONCILE_REASONS.deletedOutside }),
        diff: null,
      }
    case 'failed':
      // 공개되지 못하고 끝나는 일은 예약됨에서만 생긴다.
      return {
        transition: scheduled
          ? transition(entry, 'failed', { action: OPS_DECISION_ACTION_FAIL, reason: clipReason(observation.reason) || OPS_RECONCILE_REASONS.notPublished })
          : null,
        diff: null,
      }
    case 'present': {
      let next: ReconcileTransition | null = null
      if (observation.ended) next = transition(entry, 'ended')
      else if (observation.published && scheduled) next = transition(entry, 'live')
      return { transition: next, diff: externalDiffOf(entry.item, observation) }
    }
    default:
      // `error`는 실행 쪽이 판정 재료에서 뺀다. 여기 오면 바꾸지 않는다.
      return { transition: null, diff: null }
  }
}

/**
 * 판정(§8.6 표). 대상은 상태가 준비중·예약됨·게재중인 항목이다. `observations`는 항목 ID → 자원 읽기 결과이고, 시험 묶음·준비중 항목과 자원 ID가 없는 항목은 읽지 않는다.
 * 읽기 결과가 없는 실제 묶음의 예약됨·게재중 항목은 읽지 못한 것이라 건너뛴다. 순서는 입력 순서다.
 */
export function planReconcile(items: readonly ReconcileItem[], observations: ReadonlyMap<string, ResourceObservation>, now: Date): ReconcilePlan {
  const nowMs = now.getTime()
  const plan: ReconcilePlan = { transitions: [], externalChanges: [] }

  for (const entry of items) {
    const { item } = entry
    let planned: ReconcileTransition | null = null

    if (item.status === 'preparing') {
      planned = planPreparing(entry, nowMs)
    } else if (item.status === 'scheduled' || item.status === 'live') {
      if (entry.isSample) {
        planned = planSample(entry, nowMs)
      } else {
        // 자원 ID가 없는 예약됨 항목은 자원이 이미 없는 것으로 본다(공개 전 취소와 같은 해석).
        const observation: ResourceObservation | undefined = resourceIdOfItem(item) ? observations.get(item.id) : { status: 'missing' }
        if (!observation) continue
        const read = planObserved(entry, observation)
        planned = read.transition
        // 같은 차이는 한 번만 남긴다.
        if (read.diff && diffKey(read.diff) !== diffKey(entry.lastExternalDiff)) plan.externalChanges.push({ item, isSample: entry.isSample, diff: read.diff })
      }
    }
    if (planned) plan.transitions.push(planned)
  }
  return plan
}

// ── 결과 ─────────────────────────────────────────────────────────────────────────────────────────

/** 실제로 바뀐 항목 한 건. */
export interface ReconcileChange {
  itemId: string
  bundleId: string
  /** 「종류 · 공개 시각(KST)」. 슬랙 글의 항목 이름이다. */
  itemLabel: string
  isSample: boolean
  /** 남긴 결정 기록의 `action`. 남기지 않은 전이(게재 시작·종료 시각 도달)는 null. */
  action: RecordAction | null
  /** 결정 기록 사유이자 알림 글의 사유. 없으면 null. */
  reason: string | null
  /** 멈춘 준비중을 닫는데 지우지 못해 남은 자원의 ID. 없으면 null. */
  resourceId: string | null
}

/** `external_change`로 남긴 항목 한 건. */
export interface ReconcileExternalChange {
  itemId: string
  bundleId: string
  itemLabel: string
  isSample: boolean
  diff: ExternalDiff
}

export interface ReconcileSuccess {
  ok: true
  /** 이번 회차의 결정 기록이 함께 가진 처리 번호. */
  batchId: string
  /** 예약됨 → 게재중. */
  published: ReconcileChange[]
  /** 종료. `action`이 null이면 종료 시각이 지난 것이고, `end`면 게재중인데 자원이 밖에서 지워진 것이다. */
  ended: ReconcileChange[]
  /** 예약됨 → 취소(자원이 밖에서 지워짐). */
  cancelled: ReconcileChange[]
  /** 실패로 닫음(멈춘 준비중·드랍을 놓지 못함). */
  failed: ReconcileChange[]
  /** 상태는 두고 `external_change`만 남긴 항목. */
  externalChanged: ReconcileExternalChange[]
  /** 읽지 못하거나 처리하지 못해 이번 회차에서 건너뛴 항목 수. */
  errors: number
  /** 상태는 바꿨는데 결정 기록을 남기지 못했다. */
  decisionLogFailed: boolean
}

// ── 실행 ─────────────────────────────────────────────────────────────────────────────────────────

function fail(error: string): RunFailure {
  return { ok: false, status: 500, error }
}

function logError(what: string, error: { message: string } | null | undefined) {
  console.error(`${LOG} ${what}:`, error?.message ?? 'unknown')
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown'
}

function chunked<T>(list: readonly T[]): T[][] {
  const out: T[][] = []
  for (let start = 0; start < list.length; start += IN_CHUNK) out.push(list.slice(start, start + IN_CHUNK))
  return out
}

/** 항목 종류의 핸들러. 예약 등록 대상 종류만 찾는다(`kind`는 제출 문자열이라 레지스트리 객체의 기본 속성을 집지 않게 한다). */
function handlerOf(handlers: ExecuteHandlerRegistry, item: ExecuteItem): ExecuteHandler | undefined {
  return isExecutableKind(item.kind) ? handlers[item.kind] : undefined
}

/** 핸들러 계약은 던지지 않는 것이다. 던져도 그 항목만 읽지 못한 것으로 센다. */
async function observeGuarded(handler: ExecuteHandler, service: ServiceClient, resourceId: string, now: Date): Promise<ResourceObservation> {
  try {
    return await handler.observe(service, resourceId, { now })
  } catch (err) {
    return { status: 'error', detail: messageOf(err) }
  }
}

interface LoadedTargets {
  items: ExecuteItem[]
  /** 묶음 ID → 시험 묶음인지. */
  sampleOf: Map<string, boolean>
  /** 항목 ID → 가장 최근 결정 기록의 `action`. */
  lastAction: Map<string, string>
  /** 항목 ID → 가장 최근 `external_change`의 `diff`. */
  lastExternalDiff: Map<string, Json | null>
}

/** 대상 항목과 묶음의 시험 표시, 항목마다 가장 최근 결정 기록을 읽는다. 읽지 못하면 null이다(로그는 남긴다). */
async function loadTargets(service: ServiceClient): Promise<LoadedTargets | null> {
  const listed = await service.from('ops_bundle_items').select(ITEM_COLUMNS).in('status', [...TARGET_STATUSES])
  if (listed.error) {
    logError('항목 조회 실패', listed.error)
    return null
  }
  const items = listed.data ?? []

  const sampleOf = new Map<string, boolean>()
  for (const ids of chunked([...new Set(items.map((item) => item.bundle_id))])) {
    const bundles = await service.from('ops_bundles').select('id, is_sample').in('id', ids)
    if (bundles.error) {
      logError('묶음 조회 실패', bundles.error)
      return null
    }
    for (const bundle of bundles.data ?? []) sampleOf.set(bundle.id, bundle.is_sample)
  }

  // 최근 것부터 읽어 항목마다 처음 만난 행이 가장 최근 것이다.
  const lastAction = new Map<string, string>()
  const lastExternalDiff = new Map<string, Json | null>()
  for (const ids of chunked(items.map((item) => item.id))) {
    const decisions = await service.from('ops_decisions').select('item_id, action, diff').in('item_id', ids).order('created_at', { ascending: false })
    if (decisions.error) {
      logError('결정 기록 조회 실패', decisions.error)
      return null
    }
    for (const row of decisions.data ?? []) {
      if (!row.item_id) continue
      if (!lastAction.has(row.item_id)) lastAction.set(row.item_id, row.action)
      if (row.action === OPS_DECISION_ACTION_EXTERNAL_CHANGE && !lastExternalDiff.has(row.item_id)) lastExternalDiff.set(row.item_id, row.diff)
    }
  }
  return { items, sampleOf, lastAction, lastExternalDiff }
}

/**
 * 판정을 적용하는 순서(티켓 20261002_1944 가정 4). 멈춘 준비중이 만든 자원을 지우는 전이끼리는 생성 순서의 역순(`orderForUndo`)으로 부른다:
 * 카드와 미션이 함께 멈추면 미션을 먼저 지우려다 카드의 `mission_id` 참조에 걸려 미션이 남기 때문이다(실행의 그룹 되돌림도 같은 순서다).
 * 자원을 지우는 전이끼리만 자리를 서로 바꾸고, 나머지 전이는 제자리에 둔다. 입력을 바꾸지 않는다.
 */
function inApplyOrder(transitions: readonly ReconcileTransition[]): ReconcileTransition[] {
  const slots = transitions.flatMap((planned, index) => (planned.undoResourceId ? [index] : []))
  const ordered = orderForUndo({
    items: slots.map((index) => ({ kind: transitions[index].item.kind, position: transitions[index].item.position, planned: transitions[index] })),
  })
  const result = [...transitions]
  slots.forEach((slot, rank) => {
    result[slot] = ordered[rank].planned
  })
  return result
}

interface ApplyContext {
  service: ServiceClient
  handlers: ExecuteHandlerRegistry
  stamp: string
}

/** 멈춘 준비중이 만든 자원을 지운다. 지웠으면 null, 지우지 못했으면 남은 자원의 ID다. */
async function undoLeftover(ctx: ApplyContext, item: ExecuteItem, resourceId: string): Promise<string | null> {
  const handler = handlerOf(ctx.handlers, item)
  if (!handler) return resourceId
  try {
    const undone = await handler.undo(ctx.service, resourceId)
    if (!undone) {
      await removeOpsImageFiles(ctx.service, { kind: item.kind, itemId: item.id })
      return null
    }
    console.error(`${LOG} 멈춘 준비중이 만든 자원을 지우지 못했어요(${kindLabel(item.kind)}):`, undone.detail ?? undone.reason)
  } catch (err) {
    console.error(`${LOG} 멈춘 준비중이 만든 자원을 지우다 예외가 났어요(${kindLabel(item.kind)}):`, messageOf(err))
  }
  return resourceId
}

/**
 * 판정 한 건을 적용한다. 상태를 조건부로 바꾸고, 바뀐 항목만 돌려준다(다른 곳이 먼저 바꿨으면 null). 자원을 지우는 일은 상태를 차지한 뒤에 한다
 * (진 쪽이 방금 예약된 항목의 자원을 지우면 안 된다). DB 오류는 던진다 — 부르는 쪽이 그 항목만 건너뛴다.
 */
async function applyTransition(ctx: ApplyContext, planned: ReconcileTransition): Promise<ReconcileChange | null> {
  const { item } = planned
  let update = ctx.service.from('ops_bundle_items').update({ status: planned.to, updated_at: ctx.stamp }).eq('id', item.id).eq('status', planned.from)
  // 준비중은 읽은 뒤 실행 API가 다시 차지했을 수 있어 읽은 때의 `updated_at`도 건다.
  if (planned.from === 'preparing') update = update.eq('updated_at', item.updated_at)
  const updated = await update.select('id')
  if (updated.error) throw new Error(updated.error.message)
  if (!updated.data || updated.data.length === 0) return null

  let reason = planned.reason
  let resourceId: string | null = null
  if (planned.undoResourceId) {
    resourceId = await undoLeftover(ctx, item, planned.undoResourceId)
    if (resourceId && reason) reason = `${reason}. ${OPS_RECONCILE_REASONS.resourceRemains}`
  }
  return {
    itemId: item.id,
    bundleId: item.bundle_id,
    itemLabel: itemLabelOf(item),
    isSample: planned.isSample,
    action: planned.action,
    reason: reason === null ? null : clipReason(reason),
    resourceId,
  }
}

/**
 * 상태 맞추기 한 회차. 크론(⑦-b)과 매시 점검(티켓 20261001_1154)이 부른다. 대상 항목을 읽고, 자원을 읽고, 판정하고, 상태를 조건부로 바꾸고,
 * 바뀐 항목에만 결정 기록을 남긴다. 항목 하나의 오류는 그 항목만 건너뛰고 `errors`로 센다. 읽기 재료를 읽지 못하면 아무것도 바꾸지 않고 500이다.
 */
export async function reconcileOpsItems(service: ServiceClient, deps: Partial<ExecuteDeps> = {}): Promise<ReconcileSuccess | RunFailure> {
  const handlers = deps.handlers ?? EXECUTE_HANDLERS
  const now = (deps.now ?? (() => new Date()))()

  const loaded = await loadTargets(service)
  if (!loaded) return fail(MESSAGES.reconcileFailed)

  let errors = 0
  const entries: ReconcileItem[] = []
  const observations = new Map<string, ResourceObservation>()

  for (const item of loaded.items) {
    const isSample = loaded.sampleOf.get(item.bundle_id)
    if (isSample === undefined) {
      errors += 1
      console.error(`${LOG} 묶음을 찾지 못해 건너뛰었어요(${kindLabel(item.kind)})`)
      continue
    }

    if (!isSample) {
      // 실제 묶음은 핸들러가 필요하다: 예약됨·게재중은 자원을 읽어야 하고, 준비중은 만든 자원을 지워야 한다(자원 ID가 없는 준비중은 지울 것이 없다).
      const resourceId = resourceIdOfItem(item)
      const needsHandler = item.status === 'preparing' ? resourceId !== null : true
      const handler = handlerOf(handlers, item)
      if (needsHandler && (!handler || (item.status !== 'preparing' && typeof handler.observe !== 'function'))) {
        errors += 1
        console.error(`${LOG} 핸들러가 없는 종류라 건너뛰었어요(${kindLabel(item.kind)})`)
        continue
      }
      if (item.status !== 'preparing' && handler && resourceId) {
        const observation = await observeGuarded(handler, service, resourceId, now)
        if (observation.status === 'error') {
          errors += 1
          console.error(`${LOG} 자원을 읽지 못해 건너뛰었어요(${kindLabel(item.kind)}):`, observation.detail)
          continue
        }
        observations.set(item.id, observation)
      }
    }
    entries.push({ item, isSample, lastAction: loaded.lastAction.get(item.id) ?? null, lastExternalDiff: loaded.lastExternalDiff.get(item.id) ?? null })
  }

  const plan = planReconcile(entries, observations, now)

  const ctx: ApplyContext = { service, handlers, stamp: now.toISOString() }
  const result: ReconcileSuccess = {
    ok: true,
    batchId: crypto.randomUUID(),
    published: [],
    ended: [],
    cancelled: [],
    failed: [],
    externalChanged: [],
    errors,
    decisionLogFailed: false,
  }
  const bucketOf: Record<TransitionTarget, ReconcileChange[]> = {
    live: result.published,
    ended: result.ended,
    cancelled: result.cancelled,
    failed: result.failed,
  }
  // 계획한 전이가 0행이면(`applyTransition`이 null) 읽은 뒤 다른 곳(지금 종료 API 등, 티켓 20261006_0950 가정 9)이 항목 상태를 먼저 바꾼 것이다. 그 항목의 「밖에서 바뀜」은
  // 낡은 상태를 읽은 결과라(항목은 그 API가 이미 종료 시각과 함께 맞춰 뒀다) 이번 회차에 남기지 않는다. 전이를 계획하지 않은 항목의 차이와 전이가 오류로 던진 항목은 그대로 남긴다.
  const lostTransitionItemIds = new Set<string>()
  for (const planned of inApplyOrder(plan.transitions)) {
    try {
      const change = await applyTransition(ctx, planned)
      if (change) bucketOf[planned.to].push(change)
      else lostTransitionItemIds.add(planned.item.id)
    } catch (err) {
      result.errors += 1
      console.error(`${LOG} 상태를 바꾸지 못해 건너뛰었어요(${kindLabel(planned.item.kind)}):`, messageOf(err))
    }
  }
  for (const planned of plan.externalChanges) {
    if (lostTransitionItemIds.has(planned.item.id)) continue
    result.externalChanged.push({
      itemId: planned.item.id,
      bundleId: planned.item.bundle_id,
      itemLabel: itemLabelOf(planned.item),
      isSample: planned.isSample,
      diff: planned.diff,
    })
  }

  // 결정 기록: 바뀐 항목 가운데 기록하는 전이와, 새로 드러난 `external_change`. 상태는 이미 바꿨으므로 insert가 실패해도 되돌리지 않고 알린다.
  const base = { actor: OPS_RECONCILE_ACTOR, batch_id: result.batchId }
  const rows = [
    ...[...result.cancelled, ...result.ended, ...result.failed]
      .filter((change): change is ReconcileChange & { action: RecordAction } => change.action !== null)
      .map((change) => ({ ...base, bundle_id: change.bundleId, item_id: change.itemId, action: change.action, reason: change.reason })),
    ...result.externalChanged.map((change) => ({ ...base, bundle_id: change.bundleId, item_id: change.itemId, action: OPS_DECISION_ACTION_EXTERNAL_CHANGE, diff: change.diff })),
  ]
  if (rows.length > 0) {
    const inserted = await service.from('ops_decisions').insert(rows).select('id')
    if (inserted.error) {
      result.decisionLogFailed = true
      logError('결정 기록 저장 실패(상태는 그대로예요)', inserted.error)
    }
  }
  return result
}

// ── 슬랙 알림 ────────────────────────────────────────────────────────────────────────────────────

const toAlertItem = (change: ReconcileChange): ReconcileAlertItem => ({ itemLabel: change.itemLabel, reason: change.reason ?? '', resourceId: change.resourceId })

/**
 * 응답이 나간 뒤(`after`) 한 회차의 글을 올린다. 공개·종료(종료 시각 도달)가 있으면 요약 한 건을 `#jam-report`에, 실패·밖에서 지워짐(취소·종료)이 있거나 결정 기록을
 * 남기지 못했으면 한 건을 `#jam-alert`에 올린다. 시험 묶음 항목은 따로 모아 「[시험]」을 붙인 글로 보내고, 바뀐 것이 없으면 보내지 않는다.
 * 알림 글은 `batch_id`와 항목으로 그 글이 다룬 `cancel`·`end`·`fail` 행의 `slack_result`를 채운다(공개·종료 요약은 기록이 없어 채울 행이 없다).
 * **던지지 않는다** — 슬랙이 실패해도 상태 맞추기는 그대로다. 크론 한 번에 한 번만 부른다.
 */
export async function notifyReconcile(service: ServiceClient, result: ReconcileSuccess): Promise<void> {
  const slack = { batchId: result.batchId, decisionLogFailed: result.decisionLogFailed }
  for (const isSample of [false, true]) {
    const inGroup = <T extends { isSample: boolean }>(list: readonly T[]) => list.filter((entry) => entry.isSample === isSample)
    const published = inGroup(result.published)
    const endedByTime = inGroup(result.ended).filter((change) => change.action === null)
    const endedOutside = inGroup(result.ended).filter((change) => change.action !== null)
    const cancelled = inGroup(result.cancelled)
    const failed = inGroup(result.failed)

    if (published.length + endedByTime.length > 0) {
      await postAndRecord(
        service,
        slack,
        'report',
        [],
        formatReconcileReportMessage({ isSample, published: published.map((change) => change.itemLabel), ended: endedByTime.map((change) => change.itemLabel) })
      )
    }

    // 결정 기록이 없어 알림이 가리킬 행이 없는 그룹이면 결정 기록 실패는 이 글과 상관이 없다.
    const wroteRows = [...cancelled, ...endedOutside, ...failed].some((change) => change.action !== null) || inGroup(result.externalChanged).length > 0
    const decisionLogFailed = result.decisionLogFailed && wroteRows
    const alerts = [...cancelled, ...endedOutside, ...failed]
    if (alerts.length === 0 && !decisionLogFailed) continue
    await postAndRecord(
      service,
      slack,
      'alert',
      [OPS_DECISION_ACTION_CANCEL, OPS_DECISION_ACTION_END, OPS_DECISION_ACTION_FAIL],
      formatReconcileAlertMessage({
        isSample,
        failed: failed.map(toAlertItem),
        cancelled: cancelled.map(toAlertItem),
        ended: endedOutside.map(toAlertItem),
        decisionLogFailed,
      }),
      alerts.map((change) => change.itemId)
    )
  }
}
