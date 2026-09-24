import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { readBulkRequest, bulkJson } from '@/lib/admin/bulk/server'
import type { BulkSkip } from '@/lib/admin/bulk/shared'
import { extendBans, releaseBans } from '@/lib/abusing/shadow-ban'
import {
  parseExtendDays,
  readSanctionRows,
  skipUnappliedExtensions,
  summarizeBanExtend,
  summarizeBanRelease,
  untilFromDays,
  type BanBulkRow,
  type SanctionRowReader,
} from '@/lib/admin/abusing-bulk'

/**
 * 섀도우밴 일괄 처리(티켓 20260924_0952, 상위 티켓 §4.4 어뷰징 행) — 해제·만료 연장, 둘 다
 * 위험 등급 2다. 예전에는 단건 DELETE를 선택한 수만큼 반복했다.
 *
 * - `release`: 삭제 한 문장(200건 묶음) 뒤 지운 행을 실행 어드민과 함께 `abusing_logs`에 남긴다.
 *   미리보기 `impact`: 활성 hard·soft 수, 이미 만료된 수.
 * - `extend`(`payload.days`): 지금부터 N일 뒤로 늦춘다. 영구 제재와 이미 더 오래 가는 제재는
 *   건너뛴다. 미리보기 `impact`: 다시 적용될 만료 제재 수, 건너뛸 영구 제재 수.
 */
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: { release: {}, extend: {} },
    idFormat: 'uuid',
  })
  if (!result.ok) return result.response
  const { admin, body } = result.context
  const { ids, action, payload, dryRun } = body

  const now = new Date()
  const supabase = createServiceClient()

  const read = await readSanctionRows<BanBulkRow>(
    supabase as unknown as SanctionRowReader,
    'user_shadow_bans',
    'id, ban_level, expires_at',
    ids
  )
  if (read.error) {
    return NextResponse.json({ error: `제재를 불러오지 못했어요. (${read.error})` }, { status: 500 })
  }

  if (action === 'release') {
    const summary = summarizeBanRelease(ids, read.rows, now)
    if (dryRun) {
      return bulkJson(
        { processed: summary.existingIds, skipped: summary.skipped, dryRun: true, impact: summary.impact },
        { admin, action }
      )
    }

    const released = await releaseBans(summary.existingIds, admin.email)
    const releasedIds = released.released.map((row) => row.id)
    if (released.error && releasedIds.length === 0) {
      return NextResponse.json({ error: `해제하지 못했어요. (${released.error})` }, { status: 500 })
    }
    const releasedSet = new Set(releasedIds)
    const failed: BulkSkip[] = released.error
      ? summary.existingIds
          .filter((id) => !releasedSet.has(id))
          .map((id) => ({ id, reason: `삭제 중 오류가 나 해제하지 못했어요. (${released.error})` }))
      : []
    return bulkJson(
      { processed: releasedIds, skipped: [...summary.skipped, ...failed], logged: released.logged },
      { admin, action }
    )
  }

  // action === 'extend'
  const days = parseExtendDays(payload)
  if (days === null) {
    return NextResponse.json({ error: '연장할 기간을 1일에서 365일 사이로 골라 주세요.' }, { status: 400 })
  }
  const until = untilFromDays(days, now)
  const summary = summarizeBanExtend(ids, read.rows, until, now)
  if (dryRun) {
    return bulkJson(
      { processed: summary.extendableIds, skipped: summary.skipped, dryRun: true, impact: summary.impact },
      { admin, action }
    )
  }

  const extended = summary.extendableIds.length > 0 ? await extendBans(summary.extendableIds, until) : { updatedIds: [], error: null }
  if (extended.error && extended.updatedIds.length === 0) {
    return NextResponse.json({ error: `연장하지 못했어요. (${extended.error})` }, { status: 500 })
  }
  const unapplied = skipUnappliedExtensions(summary.extendableIds, extended.updatedIds).map((skip) =>
    extended.error ? { ...skip, reason: `연장 중 오류가 나 반영하지 못했어요. (${extended.error})` } : skip
  )
  return bulkJson(
    { processed: extended.updatedIds, skipped: [...summary.skipped, ...unapplied] },
    { admin, action }
  )
}
