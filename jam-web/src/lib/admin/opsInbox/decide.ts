/**
 * 결정 처리 (티켓 20260930_1818) — 승인·반려·일괄 승인·직접 수정·수정 되돌리기·시험 묶음 지우기. **서버 전용**이다.
 *
 * 서비스 클라이언트를 인자로 받는다(라우트가 `createServiceClient()`로 만들어 넘기고, 테스트는 가짜를 넘긴다).
 * 실패해도 던지지 않고 `{ ok: false, status, error }`를 돌려준다 — 라우트가 그대로 응답 상태와 본문으로 쓴다.
 *
 * 지키는 규칙
 * - 상태 바꾸기는 **조건부 update**다(`status = 'reviewing'`). 바뀐 행이 없으면 다른 곳에서 먼저 처리한 것이라 409다 —
 *   같은 항목을 동시에 두 번 승인해도 한 번만 반영되고 결정 기록도 1행이다.
 * - 결정 기록은 **insert만** 한다(뒤에 `slack_result` 열만 채운다, `notifyDecision`). 수정·삭제하지 않는다. 결정 기록 insert가
 *   실패하면 방금 바꾼 항목을 되돌리고 500이다(1816 라우트의 되돌림 방식).
 * - 제출 원본(`original`)은 어떤 경우에도 건드리지 않는다. 수정은 수정본(`edited`)에만 쓴다.
 * - `actor`는 관리자 ID다(제출 라우트의 관리자 로그인 제출과 같은 규칙).
 * - DB 오류 원문은 응답에 싣지 않고 서버 로그에만 남긴다.
 */
import type { Json } from '@/types/database.generated'
import type { createServiceClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/admin/uuid'
import {
  MAX_DECISION_REASON_CHARS,
  MAX_ITEMS,
  OPS_DECISION_ACTION_APPROVE,
  OPS_DECISION_ACTION_EDIT,
  OPS_DECISION_ACTION_FILL_COLOR,
  OPS_DECISION_ACTION_REJECT,
  OPS_DECISION_ACTION_REVERT,
} from '@/lib/admin/opsInbox/constants'
import {
  OpsEditError,
  applyDiff,
  computeEditDiff,
  computeRevertDiff,
  findRevertTarget,
  isTimePath,
  mergeItemForValidation,
  readDiff,
  replaceItemFormatErrors,
  splitEditPath,
  type OpsEditDiffEntry,
} from '@/lib/admin/opsInbox/edit'
import { OPS_FIELD_UNKNOWN, readOpsItemColorPending, readOpsItemTribeId } from '@/lib/admin/opsInbox/fields'
import { asRecord, itemField } from '@/lib/admin/opsInbox/itemView'
import { findApprovedPair } from '@/lib/admin/opsInbox/tribePalettes'
import { editPathLabel, formatKstDayTime, kindLabel, splitFormatError } from '@/lib/admin/opsInbox/labels'
import { formatDecisionMessage, postOpsSlack, type DecisionMessageInput } from '@/lib/admin/opsInbox/slack'
import { loadTribeIds } from '@/lib/admin/opsInbox/tribes'
import { revalidateOpsItem, validateEditedColor, type ValidatedOpsItem } from '@/lib/admin/opsInbox/validate'

type ServiceClient = ReturnType<typeof createServiceClient>

const LOG = '[ops-inbox/decide]'
const CONFLICT_MESSAGE = '이미 다른 곳에서 처리한 항목이에요.'
const ITEM_NOT_FOUND_MESSAGE = '찾을 수 없는 항목이에요.'

// ── 결과 ─────────────────────────────────────────────────────────────────────────────────────────

export interface DecisionSuccess {
  ok: true
  /** 응답 본문. */
  body: Record<string, unknown>
  /** 이 요청이 남긴 결정 기록 ID 전부(슬랙 결과를 채울 자리). */
  decisionIds: string[]
  /** 일괄 승인의 처리 번호. 그 밖에는 null. */
  batchId: string | null
  /** 슬랙 글 재료. 알릴 일이 아니면 null. */
  slack: DecisionMessageInput | null
}

export interface DecisionFailure {
  ok: false
  status: 400 | 403 | 404 | 409 | 500
  error: string
  /** 응답 본문에 함께 실을 값(칸별 문장 `fieldErrors`, 일괄 승인 개수 등). */
  extra?: Record<string, unknown>
}

export type DecisionOutcome = DecisionSuccess | DecisionFailure

function fail(status: DecisionFailure['status'], error: string, extra?: Record<string, unknown>): DecisionFailure {
  return { ok: false, status, error, ...(extra ? { extra } : {}) }
}

function logError(what: string, error: { message: string } | null | undefined) {
  console.error(`${LOG} ${what}:`, error?.message ?? 'unknown')
}

// ── 읽기 재료 ────────────────────────────────────────────────────────────────────────────────────

interface BundleRow {
  id: string
  is_sample: boolean
  format_errors: Json
}

interface ItemRow {
  id: string
  bundle_id: string
  position: number
  item_key: string | null
  kind: string | null
  starts_at: string | null
  ends_at: string | null
  status: string
  original: Json
  edited: Json | null
  format_errors: Json
  updated_at: string
}

const ITEM_COLUMNS =
  'id, bundle_id, position, item_key, kind, starts_at, ends_at, status, original, edited, format_errors, updated_at'

async function loadBundle(service: ServiceClient, bundleId: string, failMessage: string): Promise<BundleRow | DecisionFailure> {
  const { data, error } = await service.from('ops_bundles').select('id, is_sample, format_errors').eq('id', bundleId).maybeSingle()
  if (error) {
    logError('묶음 조회 실패', error)
    return fail(500, failMessage)
  }
  if (!data) return fail(404, '찾을 수 없는 기획이에요.')
  return data
}

async function loadItem(
  service: ServiceClient,
  bundleId: string,
  itemId: string,
  failMessage: string
): Promise<ItemRow | DecisionFailure> {
  const { data, error } = await service
    .from('ops_bundle_items')
    .select(ITEM_COLUMNS)
    .eq('id', itemId)
    .eq('bundle_id', bundleId)
    .maybeSingle()
  if (error) {
    logError('항목 조회 실패', error)
    return fail(500, failMessage)
  }
  if (!data) return fail(404, ITEM_NOT_FOUND_MESSAGE)
  return data
}

function isFailure<T extends object>(value: T | DecisionFailure): value is DecisionFailure {
  return 'ok' in value && (value as { ok?: unknown }).ok === false
}

/** 「종류 · 공개 시각(KST)」. 슬랙 글의 항목 이름이다(`author`·`item_key`는 자기 신고라 쓰지 않는다). */
function itemLabelOf(item: Pick<ItemRow, 'kind' | 'starts_at'>): string {
  return [kindLabel(item.kind), formatKstDayTime(item.starts_at)].filter(Boolean).join(' · ')
}

/** 사유를 다듬는다. 비면 null이다. */
function cleanReason(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

function stringList(value: Json | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

// ── 승인 ─────────────────────────────────────────────────────────────────────────────────────────

const APPROVE_FAILED = '승인하지 못했어요. 잠시 뒤 다시 눌러 주세요.'
const REJECT_FAILED = '반려하지 못했어요. 잠시 뒤 다시 눌러 주세요.'

interface StatusDecisionInput {
  bundleId: string
  itemId: string
  actor: string
}

/** 승인·반려가 함께 쓰는 처리: 검토중 항목을 조건부로 다음 상태로 옮기고 결정 기록을 남긴다. */
async function decideItemStatus(
  service: ServiceClient,
  input: StatusDecisionInput & { next: 'approved' | 'rejected'; action: string; reason: string | null; failMessage: string }
): Promise<DecisionOutcome> {
  const { bundleId, itemId, actor, next, action, reason, failMessage } = input

  const bundle = await loadBundle(service, bundleId, failMessage)
  if (isFailure(bundle)) return bundle
  const item = await loadItem(service, bundleId, itemId, failMessage)
  if (isFailure(item)) return item

  const now = new Date().toISOString()
  const updated = await service
    .from('ops_bundle_items')
    .update({ status: next, updated_at: now })
    .eq('id', itemId)
    .eq('bundle_id', bundleId)
    .eq('status', 'reviewing')
    .select('id')
  if (updated.error) {
    logError('항목 상태 변경 실패', updated.error)
    return fail(500, failMessage)
  }
  if (!updated.data || updated.data.length === 0) return fail(409, CONFLICT_MESSAGE)

  const decision = await service
    .from('ops_decisions')
    .insert({ bundle_id: bundleId, item_id: itemId, action, actor, reason })
    .select('id')
    .single()
  if (decision.error || !decision.data) {
    logError('결정 기록 저장 실패', decision.error)
    await restoreStatus(service, [itemId], bundleId, next)
    return fail(500, failMessage)
  }

  const itemLabel = itemLabelOf(item)
  return {
    ok: true,
    body: { ok: true, status: next },
    decisionIds: [decision.data.id],
    batchId: null,
    slack:
      next === 'approved'
        ? { action: 'approve', isSample: bundle.is_sample, itemLabel }
        : { action: 'reject', isSample: bundle.is_sample, itemLabel, reason: reason ?? '' },
  }
}

/** 결정 기록을 남기지 못했을 때 방금 옮긴 항목을 검토중으로 되돌린다. 되돌림이 실패하면 로그만 남긴다. */
async function restoreStatus(service: ServiceClient, itemIds: string[], bundleId: string, from: 'approved' | 'rejected') {
  const restored = await service
    .from('ops_bundle_items')
    .update({ status: 'reviewing', updated_at: new Date().toISOString() })
    .eq('bundle_id', bundleId)
    .eq('status', from)
    .in('id', itemIds)
  if (restored.error) logError('되돌림 실패(항목 상태가 어긋나 있을 수 있어요)', restored.error)
}

/** 항목 승인. 승인은 「승인됨」에서 멈춘다(예약 등록은 단계 표시줄의 버튼이, 공개는 상태 맞추기가 잇는다). 사유는 받지 않는다. */
export function approveItem(service: ServiceClient, input: StatusDecisionInput): Promise<DecisionOutcome> {
  return decideItemStatus(service, {
    ...input,
    next: 'approved',
    action: OPS_DECISION_ACTION_APPROVE,
    reason: null,
    failMessage: APPROVE_FAILED,
  })
}

/** 항목 반려. 사유는 자유 입력이고 필수다(다듬어서 비면 400, 500자 넘으면 400). */
export async function rejectItem(service: ServiceClient, input: StatusDecisionInput & { reason: unknown }): Promise<DecisionOutcome> {
  const reason = cleanReason(input.reason)
  if (!reason) return fail(400, '반려 이유를 적어 주세요.')
  if (reason.length > MAX_DECISION_REASON_CHARS) {
    return fail(400, `반려 이유는 ${MAX_DECISION_REASON_CHARS}자까지 적을 수 있어요.`)
  }
  return decideItemStatus(service, {
    bundleId: input.bundleId,
    itemId: input.itemId,
    actor: input.actor,
    next: 'rejected',
    action: OPS_DECISION_ACTION_REJECT,
    reason,
    failMessage: REJECT_FAILED,
  })
}

// ── 일괄 승인 ────────────────────────────────────────────────────────────────────────────────────

/**
 * 그 묶음의 검토중 항목을 한 번에 조건부로 승인하고, 실제로 바뀐 항목마다 결정 기록 1행을 같은 `batch_id`로 남긴다.
 * `skipped`는 요청했지만 그 사이 다른 곳에서 이미 처리한 항목, `excluded`는 요청하지 않은 검토중 항목이다.
 * 하나도 바뀌지 않으면 409다.
 */
export async function bulkApprove(
  service: ServiceClient,
  input: { bundleId: string; itemIds: unknown; actor: string }
): Promise<DecisionOutcome> {
  const { bundleId, actor } = input
  const raw = Array.isArray(input.itemIds) ? input.itemIds : []
  if (raw.length === 0) return fail(400, '승인할 항목을 골라 주세요.')
  if (!raw.every((id): id is string => typeof id === 'string' && isUuid(id))) {
    return fail(400, '항목 ID 형식이 올바르지 않아요.')
  }
  const ids = [...new Set(raw)]
  if (ids.length > MAX_ITEMS) return fail(400, `한 번에 ${MAX_ITEMS}개까지 승인할 수 있어요.`)

  const bundle = await loadBundle(service, bundleId, APPROVE_FAILED)
  if (isFailure(bundle)) return bundle

  const listed = await service.from('ops_bundle_items').select('id, status').eq('bundle_id', bundleId)
  if (listed.error) {
    logError('항목 조회 실패', listed.error)
    return fail(500, APPROVE_FAILED)
  }
  const items = listed.data ?? []
  const inBundle = new Set(items.map((item) => item.id))
  if (ids.some((id) => !inBundle.has(id))) return fail(400, '이 기획의 항목이 아니에요.')

  const requested = new Set(ids)
  const excluded = items.filter((item) => item.status === 'reviewing' && !requested.has(item.id)).length

  const updated = await service
    .from('ops_bundle_items')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('bundle_id', bundleId)
    .eq('status', 'reviewing')
    .in('id', ids)
    .select('id')
  if (updated.error) {
    logError('일괄 승인 상태 변경 실패', updated.error)
    return fail(500, APPROVE_FAILED)
  }
  const changedIds = (updated.data ?? []).map((row) => row.id)
  const approved = changedIds.length
  const skipped = ids.length - approved
  if (approved === 0) return fail(409, CONFLICT_MESSAGE, { approved, skipped, excluded })

  const batchId = crypto.randomUUID()
  const inserted = await service
    .from('ops_decisions')
    .insert(
      changedIds.map((itemId) => ({
        bundle_id: bundleId,
        item_id: itemId,
        action: OPS_DECISION_ACTION_APPROVE,
        actor,
        batch_id: batchId,
      }))
    )
    .select('id')
  if (inserted.error || !inserted.data) {
    logError('결정 기록 저장 실패', inserted.error)
    await restoreStatus(service, changedIds, bundleId, 'approved')
    return fail(500, APPROVE_FAILED)
  }

  return {
    ok: true,
    body: { ok: true, approved, skipped, excluded },
    decisionIds: inserted.data.map((row) => row.id),
    batchId,
    slack: { action: 'bulk_approve', isSample: bundle.is_sample, approved, excluded, skipped },
  }
}

// ── 직접 수정과 되돌리기 ─────────────────────────────────────────────────────────────────────────

const EDIT_FAILED = '저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.'
const REVERT_FAILED = '되돌리지 못했어요. 잠시 뒤 다시 눌러 주세요.'

/** 고친 칸의 최상위 키 묶음. 공개·종료 시각은 한 묶음이다. */
function touchedKeys(diff: readonly OpsEditDiffEntry[]): Set<string> {
  const keys = new Set<string>()
  for (const entry of diff) {
    const parts = splitEditPath(entry.path)
    if (parts) keys.add(parts.root)
    else if (isTimePath(entry.path)) {
      keys.add('starts_at')
      keys.add('ends_at')
    } else keys.add(entry.path)
  }
  return keys
}

function fieldMessage(key: string, reason: string): string {
  if (key === 'user_experience') return '유저가 겪는 것을 비워 둘 수 없어요. 한 문장으로 적어 주세요.'
  if (key === 'ends_at' && reason.includes('늦어야')) return '끝나는 시각이 시작보다 빨라요. 시작 뒤로 바꿔 주세요.'
  return reason
}

/** 다시 검사한 오류 중 고친 칸에 걸린 것을 칸별 문장으로 모은다(비면 저장해도 된다). */
function blockingFieldErrors(validated: ValidatedOpsItem, touched: Set<string>): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  for (const line of validated.format_errors) {
    const { path, reason } = splitFormatError(line)
    const key = path.replace(/^items\[\d+\]\.?/, '').split(/[.[]/)[0]
    if (key && touched.has(key) && !(key in fieldErrors)) fieldErrors[key] = fieldMessage(key, reason)
  }
  return fieldErrors
}

interface EditedItemSave {
  bundle: BundleRow
  item: ItemRow
  newEdited: Json | null
  validated: ValidatedOpsItem
  /** 항목 수정 시각이 이 값일 때만 저장한다(다른 곳에서 먼저 바꿨으면 409). */
  expectedUpdatedAt: string
  action: string
  diff: OpsEditDiffEntry[]
  reason: string | null
  actor: string
  failMessage: string
}

/**
 * 수정본을 저장하고 결정 기록을 남긴다(수정·되돌리기 공통).
 * 항목 update(조건부) → 결정 기록 insert(실패하면 항목을 원래대로) → 묶음 형식 오류의 그 항목 줄 갱신(실패해도 결정은 유지).
 */
async function saveEditedItem(
  service: ServiceClient,
  save: EditedItemSave
): Promise<{ ok: true; updatedAt: string; decisionId: string } | DecisionFailure> {
  const { bundle, item, newEdited, validated, expectedUpdatedAt, action, diff, reason, actor, failMessage } = save
  const now = new Date().toISOString()

  const updated = await service
    .from('ops_bundle_items')
    .update({
      edited: newEdited,
      starts_at: validated.starts_at,
      ends_at: validated.ends_at,
      format_errors: validated.format_errors,
      updated_at: now,
    })
    .eq('id', item.id)
    .eq('bundle_id', bundle.id)
    .eq('status', 'reviewing')
    .eq('updated_at', expectedUpdatedAt)
    .select('id')
  if (updated.error) {
    logError('수정본 저장 실패', updated.error)
    return fail(500, failMessage)
  }
  if (!updated.data || updated.data.length === 0) return fail(409, CONFLICT_MESSAGE)

  const decision = await service
    .from('ops_decisions')
    .insert({ bundle_id: bundle.id, item_id: item.id, action, actor, diff, reason })
    .select('id')
    .single()
  if (decision.error || !decision.data) {
    logError('결정 기록 저장 실패', decision.error)
    const restored = await service
      .from('ops_bundle_items')
      .update({
        edited: item.edited,
        starts_at: item.starts_at,
        ends_at: item.ends_at,
        format_errors: item.format_errors,
        updated_at: item.updated_at,
      })
      .eq('id', item.id)
      .eq('updated_at', now)
    if (restored.error) logError('되돌림 실패(항목이 수정된 채 남아 있을 수 있어요)', restored.error)
    return fail(500, failMessage)
  }

  // 묶음 형식 오류 목록에서 이 항목의 줄만 새 결과로 바꾼다. 묶음 요약은 참고용이라 실패해도 결정은 유지한다.
  const nextBundleErrors = replaceItemFormatErrors(stringList(bundle.format_errors), item.position, validated.format_errors)
  const bundleUpdate = await service.from('ops_bundles').update({ format_errors: nextBundleErrors }).eq('id', bundle.id)
  if (bundleUpdate.error) logError('묶음 형식 오류 갱신 실패(결정은 저장됐어요)', bundleUpdate.error)

  return { ok: true, updatedAt: now, decisionId: decision.data.id }
}

async function loadBundleItemKeys(service: ServiceClient, bundleId: string, failMessage: string) {
  const { data, error } = await service.from('ops_bundle_items').select('position, item_key').eq('bundle_id', bundleId)
  if (error) {
    logError('항목 키 조회 실패', error)
    return fail(500, failMessage)
  }
  return (data ?? []).map((row) => ({ position: row.position, itemKey: row.item_key }))
}

/** 다시 검사에 쓸 트라이브 목록. 제출 때와 같은 목록·같은 규칙이라야 판정이 같다(`tribes.ts`). 조회가 실패하면 저장하지 않는다. */
async function loadTribeContext(service: ServiceClient, failMessage: string) {
  try {
    return { tribeIds: await loadTribeIds(service) }
  } catch (error) {
    logError('트라이브 목록 조회 실패', error instanceof Error ? error : null)
    return fail(500, failMessage)
  }
}

/**
 * 직접 수정. 검토중 항목만 고치고 제출 원본은 바꾸지 않는다. 바뀐 칸은 차이 목록으로 결정 기록에 남긴다.
 * 고친 칸에 걸린 형식 오류는 저장을 막고(400, 칸별 문장), 그 밖의 오류는 항목·묶음 형식 오류를 새 결과로 바꾼다.
 * `expectedUpdatedAt`은 화면이 본 항목의 수정 시각이다 — 그 사이 바뀌었으면 409다.
 */
export async function editItem(
  service: ServiceClient,
  input: {
    bundleId: string
    itemId: string
    actor: string
    values: unknown
    reason?: unknown
    expectedUpdatedAt: unknown
  }
): Promise<DecisionOutcome> {
  const { bundleId, itemId, actor } = input
  if (typeof input.values !== 'object' || input.values === null || Array.isArray(input.values)) {
    return fail(400, '고친 내용을 보내 주세요.')
  }
  if (typeof input.expectedUpdatedAt !== 'string' || input.expectedUpdatedAt === '') {
    return fail(400, '항목 수정 시각을 보내 주세요.')
  }
  const reason = cleanReason(input.reason)
  if (reason && reason.length > MAX_DECISION_REASON_CHARS) {
    return fail(400, `수정한 이유는 ${MAX_DECISION_REASON_CHARS}자까지 적을 수 있어요.`)
  }

  const bundle = await loadBundle(service, bundleId, EDIT_FAILED)
  if (isFailure(bundle)) return bundle
  const item = await loadItem(service, bundleId, itemId, EDIT_FAILED)
  if (isFailure(item)) return item
  if (item.status !== 'reviewing') return fail(409, CONFLICT_MESSAGE)

  let diff: OpsEditDiffEntry[]
  try {
    diff = computeEditDiff({ original: item.original, edited: item.edited }, input.values as Record<string, unknown>)
  } catch (error) {
    if (error instanceof OpsEditError) {
      return fail(400, '고친 내용을 저장하지 못했어요. 표시된 칸을 확인해 주세요.', { fieldErrors: { [error.path]: error.message } })
    }
    throw error
  }
  if (diff.length === 0) return fail(400, '바뀐 내용이 없어요.')

  const colorErrors: Record<string, string> = {}
  for (const entry of diff) {
    if (splitEditPath(entry.path)?.root !== 'colors') continue
    const message = validateEditedColor(entry.after ?? '')
    if (message) colorErrors[entry.path] = message
  }
  if (Object.keys(colorErrors).length > 0) {
    return fail(400, '고친 내용을 저장하지 못했어요. 표시된 칸을 확인해 주세요.', { fieldErrors: colorErrors })
  }

  const newEdited = applyDiff(item.original, item.edited, diff, 'forward')
  const keys = await loadBundleItemKeys(service, bundleId, EDIT_FAILED)
  if (isFailure(keys)) return keys
  const ctx = await loadTribeContext(service, EDIT_FAILED)
  if (isFailure(ctx)) return ctx
  const validated = revalidateOpsItem(mergeItemForValidation(item.original, newEdited), item.position, keys, ctx)

  const fieldErrors = blockingFieldErrors(validated, touchedKeys(diff))
  if (Object.keys(fieldErrors).length > 0) {
    return fail(400, '고친 내용을 저장하지 못했어요. 표시된 칸을 확인해 주세요.', { fieldErrors })
  }

  const saved = await saveEditedItem(service, {
    bundle,
    item,
    newEdited,
    validated,
    expectedUpdatedAt: input.expectedUpdatedAt,
    action: OPS_DECISION_ACTION_EDIT,
    diff,
    reason,
    actor,
    failMessage: EDIT_FAILED,
  })
  if (!saved.ok) return saved

  return {
    ok: true,
    body: { ok: true, updatedAt: saved.updatedAt, changed: diff.map((entry) => entry.path) },
    decisionIds: [saved.decisionId],
    batchId: null,
    slack: {
      action: 'edit',
      isSample: bundle.is_sample,
      itemLabel: itemLabelOf({ kind: item.kind, starts_at: validated.starts_at }),
      changedLabels: diff.map((entry) => editPathLabel(entry.path)),
    },
  }
}

const FILL_COLOR_FAILED = '색을 채우지 못했어요. 잠시 뒤 다시 눌러 주세요.'
const FILL_COLOR_MANUAL_LABEL = '직접 입력'

/**
 * 색 채우기(티켓 20261007_1145). 검토중 카드의 「색 대기」를 풀고 `image_spec.bg`·`end`와 `colors.bg`·`end`를 같은 값으로 함께 채운다
 * (이미지 제작은 `image_spec`을, 미리보기 칩은 `colors`를 읽는다). 승인 색 쌍(`tribePalettes.ts`)을 고르든 직접 입력하든 서버는
 * 형식(`#rrggbb`)만 본다. 결정 기록 사유에는 승인 쌍 이름(아니면 「직접 입력」)을 남긴다. 검토중이 아니면 409, 형식이 틀리면 400이다.
 * 되돌리기 대상이 아니다(다른 쌍을 다시 고르면 된다). 제출 원본은 바꾸지 않는다.
 */
export async function fillColor(
  service: ServiceClient,
  input: { bundleId: string; itemId: string; actor: string; bg: unknown; end: unknown; expectedUpdatedAt: unknown }
): Promise<DecisionOutcome> {
  const { bundleId, itemId, actor } = input
  if (typeof input.bg !== 'string' || typeof input.end !== 'string') return fail(400, '시작색과 끝색을 보내 주세요.')
  if (typeof input.expectedUpdatedAt !== 'string' || input.expectedUpdatedAt === '') {
    return fail(400, '항목 수정 시각을 보내 주세요.')
  }
  const colorErrors: Record<string, string> = {}
  const bgError = validateEditedColor(input.bg)
  if (bgError) colorErrors.bg = bgError
  const endError = validateEditedColor(input.end)
  if (endError) colorErrors.end = endError
  if (Object.keys(colorErrors).length > 0) {
    return fail(400, '색을 채우지 못했어요. 표시된 칸을 확인해 주세요.', { fieldErrors: colorErrors })
  }
  const bg = input.bg.toLowerCase()
  const end = input.end.toLowerCase()

  const bundle = await loadBundle(service, bundleId, FILL_COLOR_FAILED)
  if (isFailure(bundle)) return bundle
  const item = await loadItem(service, bundleId, itemId, FILL_COLOR_FAILED)
  if (isFailure(item)) return item
  if (item.status !== 'reviewing') return fail(409, CONFLICT_MESSAGE)

  const current = { original: item.original, edited: item.edited }
  const spec = asRecord(itemField(current, 'image_spec')) ?? {}
  const colors = asRecord(itemField(current, 'colors')) ?? {}
  const wasPending = readOpsItemColorPending(current) !== false
  const diff: OpsEditDiffEntry[] = []
  const pushIfChanged = (path: string, before: unknown, after: string) => {
    const beforeText = typeof before === 'string' ? before : null
    if (beforeText !== after) diff.push({ path, before: beforeText, after })
  }
  if (wasPending) diff.push({ path: 'color_pending', before: 'true', after: 'false' })
  pushIfChanged('image_spec.bg', spec.bg, bg)
  pushIfChanged('image_spec.end', spec.end, end)
  pushIfChanged('colors.bg', colors.bg, bg)
  pushIfChanged('colors.end', colors.end, end)
  if (diff.length === 0) return fail(400, '바뀐 내용이 없어요.')

  const nextEdited: Record<string, Json> = { ...(asRecord(item.edited) as Record<string, Json> | null) }
  nextEdited.color_pending = false
  nextEdited.image_spec = { ...(spec as Record<string, Json>), bg, end }
  nextEdited.colors = { ...(colors as Record<string, Json>), bg, end }

  const keys = await loadBundleItemKeys(service, bundleId, FILL_COLOR_FAILED)
  if (isFailure(keys)) return keys
  const ctx = await loadTribeContext(service, FILL_COLOR_FAILED)
  if (isFailure(ctx)) return ctx
  const validated = revalidateOpsItem(mergeItemForValidation(item.original, nextEdited), item.position, keys, ctx)
  const fieldErrors = blockingFieldErrors(validated, new Set(['color_pending', 'image_spec', 'colors']))
  if (Object.keys(fieldErrors).length > 0) {
    return fail(400, '색을 채우지 못했어요. 표시된 칸을 확인해 주세요.', { fieldErrors })
  }

  const tribeId = readOpsItemTribeId(current)
  const pair = tribeId === OPS_FIELD_UNKNOWN ? null : findApprovedPair(tribeId, bg, end)
  const pairLabel = pair ? pair.name : FILL_COLOR_MANUAL_LABEL

  const saved = await saveEditedItem(service, {
    bundle,
    item,
    newEdited: nextEdited,
    validated,
    expectedUpdatedAt: input.expectedUpdatedAt,
    action: OPS_DECISION_ACTION_FILL_COLOR,
    diff,
    reason: pairLabel,
    actor,
    failMessage: FILL_COLOR_FAILED,
  })
  if (!saved.ok) return saved

  return {
    ok: true,
    body: { ok: true, updatedAt: saved.updatedAt, changed: diff.map((entry) => entry.path) },
    decisionIds: [saved.decisionId],
    batchId: null,
    slack: {
      action: 'fill_color',
      isSample: bundle.is_sample,
      itemLabel: itemLabelOf({ kind: item.kind, starts_at: validated.starts_at }),
      pairLabel,
    },
  }
}

/**
 * 마지막 수정 되돌리기. 그 항목의 결정 기록에서 되돌리지 않은 가장 최근 수정을 찾아 그 차이를 거꾸로 적용하고, `revert` 결정
 * 기록(`diff`는 이번에 실제로 바뀐 전 → 후)을 남긴다. 한 번에 한 단계이고 다시 하기는 없다. 검토중이 아니거나 되돌릴 수정이
 * 없으면 409다.
 */
export async function revertLastEdit(
  service: ServiceClient,
  input: { bundleId: string; itemId: string; actor: string }
): Promise<DecisionOutcome> {
  const { bundleId, itemId, actor } = input

  const bundle = await loadBundle(service, bundleId, REVERT_FAILED)
  if (isFailure(bundle)) return bundle
  const item = await loadItem(service, bundleId, itemId, REVERT_FAILED)
  if (isFailure(item)) return item
  if (item.status !== 'reviewing') return fail(409, CONFLICT_MESSAGE)

  const history = await service
    .from('ops_decisions')
    .select('id, action, diff, created_at')
    .eq('bundle_id', bundleId)
    .eq('item_id', itemId)
    .in('action', [OPS_DECISION_ACTION_EDIT, OPS_DECISION_ACTION_REVERT])
    .order('created_at', { ascending: true })
  if (history.error) {
    logError('결정 기록 조회 실패', history.error)
    return fail(500, REVERT_FAILED)
  }
  const target = findRevertTarget((history.data ?? []).map((row) => ({ action: row.action, diff: row.diff, createdAt: row.created_at })))
  if (!target) return fail(409, '되돌릴 수정이 없어요.')

  const targetDiff = readDiff(target.diff)
  const revertDiff = computeRevertDiff({ original: item.original, edited: item.edited }, targetDiff)
  const newEdited = applyDiff(item.original, item.edited, revertDiff, 'forward')

  const keys = await loadBundleItemKeys(service, bundleId, REVERT_FAILED)
  if (isFailure(keys)) return keys
  const ctx = await loadTribeContext(service, REVERT_FAILED)
  if (isFailure(ctx)) return ctx
  const validated = revalidateOpsItem(mergeItemForValidation(item.original, newEdited), item.position, keys, ctx)

  const saved = await saveEditedItem(service, {
    bundle,
    item,
    newEdited,
    validated,
    expectedUpdatedAt: item.updated_at,
    action: OPS_DECISION_ACTION_REVERT,
    diff: revertDiff,
    reason: null,
    actor,
    failMessage: REVERT_FAILED,
  })
  if (!saved.ok) return saved

  const labelPaths = revertDiff.length > 0 ? revertDiff : targetDiff
  return {
    ok: true,
    body: { ok: true, updatedAt: saved.updatedAt, changed: revertDiff.map((entry) => entry.path) },
    decisionIds: [saved.decisionId],
    batchId: null,
    slack: {
      action: 'revert',
      isSample: bundle.is_sample,
      itemLabel: itemLabelOf({ kind: item.kind, starts_at: validated.starts_at }),
      changedLabels: labelPaths.map((entry) => editPathLabel(entry.path)),
    },
  }
}

// ── 시험 묶음 지우기 ─────────────────────────────────────────────────────────────────────────────

/**
 * 시험 묶음(`is_sample`)만 지운다. 묶음 행을 지우면 항목과 결정 기록이 ON DELETE CASCADE로 함께 지워진다(마이그레이션 198).
 * 결정 기록은 에이전트의 학습 재료라 시험이 아닌 묶음은 403이다.
 */
export async function deleteSampleBundle(service: ServiceClient, bundleId: string): Promise<DecisionOutcome> {
  const failMessage = '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.'
  const bundle = await loadBundle(service, bundleId, failMessage)
  if (isFailure(bundle)) return bundle
  if (!bundle.is_sample) return fail(403, '시험 묶음만 지울 수 있어요.')

  const deleted = await service.from('ops_bundles').delete().eq('id', bundleId).eq('is_sample', true)
  if (deleted.error) {
    logError('시험 묶음 삭제 실패', deleted.error)
    return fail(500, failMessage)
  }
  return { ok: true, body: { ok: true }, decisionIds: [], batchId: null, slack: null }
}

// ── 슬랙 알림 ────────────────────────────────────────────────────────────────────────────────────

/**
 * 응답이 나간 뒤(`after`) 결정 글을 `#jam-report`에 올리고 그 결과를 결정 기록의 `slack_result`에 채운다(일괄 승인은 같은
 * `batch_id`의 모든 행). **던지지 않는다** — 슬랙이 실패해도 결정은 그대로다. 결정 기록에는 이 열만 update한다.
 */
export async function notifyDecision(service: ServiceClient, outcome: DecisionSuccess): Promise<void> {
  if (!outcome.slack || outcome.decisionIds.length === 0) return
  try {
    const result = await postOpsSlack('report', formatDecisionMessage(outcome.slack))
    if (!result.ok) console.error(`${LOG} 슬랙 알림 실패:`, result.error)
    const slackResult: Json = result.error
      ? { channel: 'report', ok: result.ok, error: result.error }
      : { channel: 'report', ok: result.ok }
    const query = service.from('ops_decisions').update({ slack_result: slackResult })
    const { error } = outcome.batchId ? await query.eq('batch_id', outcome.batchId) : await query.eq('id', outcome.decisionIds[0])
    if (error) logError('알림 결과 기록 실패', error)
  } catch (err) {
    console.error(`${LOG} 슬랙 알림 처리 중 예외:`, err instanceof Error ? err.name : 'unknown')
  }
}
