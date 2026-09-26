/**
 * 미션 일괄 처리 전용 순수 판정(티켓 20260924_0946) — `api/admin/missions/bulk`가 그대로 쓴다.
 * DB 왕복 없이 "어느 행을 처리하고 어느 행을 건너뛰는가"만 정한다.
 */
import type { BulkSkip } from './bulk/shared'
import type { UpdateAllOrNothingResult } from './bulk/server'
import { MISSION_REFERENCE_SOURCES, summarizeReference } from './reference-guards'

/** 일괄 처리 판정에 필요한 미션 컬럼 */
export interface MissionBulkRow {
  id: string
  title: string
  exposure_mode: string
  exposure_at: string | null
  starts_at: string
  ends_at: string | null
}

export const MISSION_BULK_COLUMNS = 'id, title, exposure_mode, exposure_at, starts_at, ends_at'

export interface MissionBulkClassification {
  /** 실제로 처리할 id */
  targets: string[]
  skipped: BulkSkip[]
}

function byId(rows: MissionBulkRow[]): Map<string, MissionBulkRow> {
  return new Map(rows.map((row) => [row.id, row]))
}

const NOT_FOUND_REASON = '미션을 찾을 수 없어요.'

/** 숨김: 이미 숨김인 미션과 없는 id는 건너뛴다 */
export function classifyMissionHide(ids: string[], rows: MissionBulkRow[]): MissionBulkClassification {
  const rowById = byId(rows)
  const targets: string[] = []
  const skipped: BulkSkip[] = []

  for (const id of ids) {
    const row = rowById.get(id)
    if (!row) {
      skipped.push({ id, reason: NOT_FOUND_REASON })
    } else if (row.exposure_mode === 'hidden') {
      skipped.push({ id, label: row.title, reason: '이미 숨김 상태예요.' })
    } else {
      targets.push(id)
    }
  }
  return { targets, skipped }
}

export interface MissionShowPlan {
  /** `exposure_at`이 있어 `scheduled`로 되돌릴 id */
  toScheduled: string[]
  /** `exposure_at`이 없어 `start_date`로 되돌릴 id */
  toStartDate: string[]
  skipped: BulkSkip[]
}

/**
 * 노출: 숨김 상태인 미션만 되돌린다. 되돌릴 모드는 행마다 다르다 — 노출일(`exposure_at`)이 있으면
 * `scheduled`, 없으면 `start_date`(단건 스위치와 같은 규칙). 이미 노출 중이거나 없는 id는 건너뛴다.
 */
export function planMissionShow(ids: string[], rows: MissionBulkRow[]): MissionShowPlan {
  const rowById = byId(rows)
  const toScheduled: string[] = []
  const toStartDate: string[] = []
  const skipped: BulkSkip[] = []

  for (const id of ids) {
    const row = rowById.get(id)
    if (!row) {
      skipped.push({ id, reason: NOT_FOUND_REASON })
    } else if (row.exposure_mode !== 'hidden') {
      skipped.push({ id, label: row.title, reason: '이미 노출 중이에요.' })
    } else if (row.exposure_at) {
      toScheduled.push(id)
    } else {
      toStartDate.push(id)
    }
  }
  return { toScheduled, toStartDate, skipped }
}

/**
 * 노출 계획을 반영한다. 모드가 둘로 갈려 문장이 두 번 나간다 — 뒤 문장이 실패하면 앞 문장을
 * 숨김으로 되돌린다(모두 반영되거나 모두 취소, 상위 티켓 §2). 되돌리기까지 실패하면 일부만
 * 반영된 채 남았음을 에러 메시지로 알린다.
 */
export async function applyMissionShow(
  plan: Pick<MissionShowPlan, 'toScheduled' | 'toStartDate'>,
  update: (ids: string[], patch: Record<string, unknown>) => Promise<UpdateAllOrNothingResult>
): Promise<{ ok: true; processed: string[] } | { ok: false; error: string }> {
  const first = await update(plan.toScheduled, { exposure_mode: 'scheduled' })
  if (!first.ok) return { ok: false, error: first.error ?? '반영에 실패했어요.' }

  const second = await update(plan.toStartDate, { exposure_mode: 'start_date' })
  if (second.ok) return { ok: true, processed: [...first.updatedIds, ...second.updatedIds] }

  const secondError = second.error ?? '반영에 실패했어요.'
  if (first.updatedIds.length === 0) return { ok: false, error: secondError }

  const revert = await update(first.updatedIds, { exposure_mode: 'hidden' })
  if (!revert.ok) {
    return { ok: false, error: `일부만 반영됐어요. 반영 실패: ${secondError} / 되돌리기 실패: ${revert.error ?? ''}` }
  }
  return { ok: false, error: secondError }
}

/**
 * 기간 종료(`ends_at = now`): 아직 시작 전인 미션과 이미 끝난 미션은 건너뛴다. 시작 전 미션은
 * 끝낼 진행이 없고, 이미 끝난 미션의 종료일을 앞으로 당기면 기록만 바뀐다.
 */
export function classifyMissionEndPeriod(ids: string[], rows: MissionBulkRow[], now: Date): MissionBulkClassification {
  const rowById = byId(rows)
  const targets: string[] = []
  const skipped: BulkSkip[] = []

  for (const id of ids) {
    const row = rowById.get(id)
    if (!row) {
      skipped.push({ id, reason: NOT_FOUND_REASON })
    } else if (new Date(row.starts_at) > now) {
      skipped.push({ id, label: row.title, reason: '아직 시작 전인 미션이에요.' })
    } else if (row.ends_at !== null && new Date(row.ends_at) < now) {
      skipped.push({ id, label: row.title, reason: '이미 끝난 미션이에요.' })
    } else {
      targets.push(id)
    }
  }
  return { targets, skipped }
}

/**
 * 삭제: 참조 이력이 있어 삭제가 막히는 미션은 건너뛴다(단건·기존 일괄 삭제와 같은 가드,
 * `reference-guards.ts`). `refCounts`는 `collectMissionReferences`가 돌려준 대상별 참조 건수다.
 */
export function classifyMissionDeletion(
  ids: string[],
  rows: MissionBulkRow[],
  refCounts: Map<string, Record<string, number>>
): MissionBulkClassification {
  const rowById = byId(rows)
  const targets: string[] = []
  const skipped: BulkSkip[] = []

  for (const id of ids) {
    const row = rowById.get(id)
    if (!row) {
      skipped.push({ id, reason: NOT_FOUND_REASON })
      continue
    }
    const summary = summarizeReference(MISSION_REFERENCE_SOURCES, refCounts.get(id) ?? {})
    if (summary.blockingTotal > 0) {
      skipped.push({
        id,
        label: row.title,
        reason: `참여·완료 이력 ${summary.blockingTotal}건(${summary.hitLabels})`,
      })
    } else {
      targets.push(id)
    }
  }
  return { targets, skipped }
}

/**
 * 지금 진행 중인 유저 수 = 미션별 (참여 건수 − 완료 건수)의 합. 두 표 모두 유저·미션당 한 행이고
 * 완료는 참여가 전제라(`checker.ts` 참가 게이트) 차이가 "참여했지만 아직 끝내지 못한 유저"다.
 * 데이터가 어긋나 완료가 더 많은 미션은 0으로 본다.
 */
export function sumInProgressUsers(
  ids: string[],
  participationCounts: Record<string, number>,
  completionCounts: Record<string, number>
): number {
  let total = 0
  for (const id of ids) {
    total += Math.max(0, (participationCounts[id] ?? 0) - (completionCounts[id] ?? 0))
  }
  return total
}
