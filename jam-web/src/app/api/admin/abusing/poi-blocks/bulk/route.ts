import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { readBulkRequest, bulkJson } from '@/lib/admin/bulk/server'
import type { BulkSkip } from '@/lib/admin/bulk/shared'
import { extendPoiBlocks, releasePoiBlocks } from '@/lib/abusing/poi-block'
import {
  parseExtendDays,
  readSanctionRows,
  skipUnappliedExtensions,
  summarizePoiBlockExtend,
  summarizePoiBlockRelease,
  untilFromDays,
  type PoiBlockBulkRow,
  type SanctionRowReader,
} from '@/lib/admin/abusing-bulk'

/**
 * POI 차단 일괄 처리(티켓 20260924_0952) — 제재 쪽(`bans/bulk`)과 같은 두 동작(해제·만료 연장,
 * 위험 등급 2)이다. POI 차단에는 영구가 없어(`blocked_until`이 NOT NULL) 영구 건너뜀은 없다.
 * 미리보기 `impact`: 해제는 활성 수·이미 만료된 수, 연장은 다시 적용될 만료 차단 수.
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

  const read = await readSanctionRows<PoiBlockBulkRow>(
    supabase as unknown as SanctionRowReader,
    'poi_blocks',
    'id, blocked_until',
    ids
  )
  if (read.error) {
    return NextResponse.json({ error: `POI 차단을 불러오지 못했어요. (${read.error})` }, { status: 500 })
  }

  if (action === 'release') {
    const summary = summarizePoiBlockRelease(ids, read.rows, now)
    if (dryRun) {
      return bulkJson(
        { processed: summary.existingIds, skipped: summary.skipped, dryRun: true, impact: summary.impact },
        { admin, action }
      )
    }

    const released = await releasePoiBlocks(summary.existingIds, admin.email)
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
  const summary = summarizePoiBlockExtend(ids, read.rows, until, now)
  if (dryRun) {
    return bulkJson(
      { processed: summary.extendableIds, skipped: summary.skipped, dryRun: true, impact: summary.impact },
      { admin, action }
    )
  }

  const extended = summary.extendableIds.length > 0 ? await extendPoiBlocks(summary.extendableIds, until) : { updatedIds: [], error: null }
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
