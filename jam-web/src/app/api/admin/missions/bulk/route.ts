import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  readBulkRequest,
  updateByIdsAllOrNothing,
  deleteByIds,
  bulkJson,
  type BulkServiceClient,
} from '@/lib/admin/bulk/server'
import { confirmPhraseFor, isPhraseMatch } from '@/lib/admin/bulk/shared'
import { countRowsByKey, type CountRowsClient } from '@/lib/admin/list-counts'
import { collectMissionReferences } from '@/lib/admin/reference-guards'
import {
  MISSION_BULK_COLUMNS,
  applyMissionShow,
  classifyMissionDeletion,
  classifyMissionEndPeriod,
  classifyMissionHide,
  planMissionShow,
  sumInProgressUsers,
  type MissionBulkRow,
} from '@/lib/admin/mission-bulk'

/**
 * 미션 목록 일괄 처리(티켓 20260924_0946, 상위 티켓 §4.1 미션 행) — 숨김·노출·기간 종료·삭제.
 * 참조·참여 건수 조회가 여러 왕복을 필요로 해 실행 시간을 늘려둔다.
 */
export const maxDuration = 60

/** `.in()` 목록이 URL 16KB 상한에 걸리지 않도록 한 번에 읽는 id 수 */
const READ_CHUNK_SIZE = 200
/** 참조 조회(`collectMissionReferences`)가 `.in()` 한 번에 싣는 id 수를 200건으로 묶기 위한 삭제 상한 */
const DELETE_MAX_IDS = 200

async function readMissionRows(
  client: BulkServiceClient,
  ids: string[]
): Promise<{ rows: MissionBulkRow[]; error: string | null }> {
  const rows: MissionBulkRow[] = []
  for (let i = 0; i < ids.length; i += READ_CHUNK_SIZE) {
    const { data, error } = await client
      .from('missions')
      .select(MISSION_BULK_COLUMNS)
      .in('id', ids.slice(i, i + READ_CHUNK_SIZE))
    if (error) return { rows, error: error.message }
    rows.push(...((data ?? []) as unknown as MissionBulkRow[]))
  }
  return { rows, error: null }
}

export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: {
      hide: {},
      show: {},
      end_period: {},
      delete: { maxIds: DELETE_MAX_IDS },
    },
    idFormat: 'uuid',
  })
  if (!result.ok) return result.response
  const { admin, body } = result.context
  const { ids, action, dryRun, confirmPhrase } = body

  const supabase = createServiceClient()
  const bulkClient = supabase as unknown as BulkServiceClient
  const countClient = supabase as unknown as CountRowsClient
  const now = new Date()

  const read = await readMissionRows(bulkClient, ids)
  if (read.error) return NextResponse.json({ error: read.error }, { status: 500 })
  const rows = read.rows

  const inProgressUsersOf = async (targetIds: string[]) => {
    const [participations, completions] = await Promise.all([
      countRowsByKey(countClient, 'user_mission_participations', 'mission_id', targetIds),
      countRowsByKey(countClient, 'user_mission_completions', 'mission_id', targetIds),
    ])
    return sumInProgressUsers(targetIds, participations, completions)
  }

  if (action === 'hide' || action === 'end_period') {
    const { targets, skipped } =
      action === 'hide' ? classifyMissionHide(ids, rows) : classifyMissionEndPeriod(ids, rows, now)

    if (dryRun) {
      const inProgressUsers = targets.length > 0 ? await inProgressUsersOf(targets) : 0
      return bulkJson(
        { processed: targets, skipped, dryRun: true, impact: { inProgressUsers } },
        { admin, action }
      )
    }

    const patch = action === 'hide' ? { exposure_mode: 'hidden' } : { ends_at: now.toISOString() }
    const update = await updateByIdsAllOrNothing(bulkClient, 'missions', targets, patch)
    if (!update.ok) {
      return NextResponse.json({ error: update.error ?? '반영에 실패했습니다.' }, { status: 500 })
    }
    return bulkJson({ processed: update.updatedIds, skipped }, { admin, action })
  }

  if (action === 'show') {
    const plan = planMissionShow(ids, rows)

    if (dryRun) {
      return bulkJson(
        { processed: [...plan.toScheduled, ...plan.toStartDate], skipped: plan.skipped, dryRun: true },
        { admin, action }
      )
    }

    const applied = await applyMissionShow(plan, (targetIds, patch) =>
      updateByIdsAllOrNothing(bulkClient, 'missions', targetIds, patch)
    )
    if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 500 })
    return bulkJson({ processed: applied.processed, skipped: plan.skipped }, { admin, action })
  }

  if (action === 'delete') {
    const references = await collectMissionReferences(supabase, ids)
    if (references.error) {
      console.error('[missions bulk delete] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', references.error)
      return NextResponse.json(
        { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
        { status: 500 }
      )
    }

    const { targets, skipped } = classifyMissionDeletion(ids, rows, references.counts)
    const requiredPhrase = confirmPhraseFor('삭제', targets.length)

    if (dryRun) {
      return bulkJson({ processed: targets, skipped, dryRun: true, requiredPhrase }, { admin, action })
    }

    if (!confirmPhrase || !isPhraseMatch(confirmPhrase, requiredPhrase)) {
      return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.', requiredPhrase }, { status: 409 })
    }

    const deleteResult = await deleteByIds(bulkClient, 'missions', targets)
    return bulkJson(
      { processed: deleteResult.processed, skipped: [...skipped, ...deleteResult.skipped] },
      { admin, action }
    )
  }

  return NextResponse.json({ error: '지원하지 않는 동작입니다.' }, { status: 400 })
}
