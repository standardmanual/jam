import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import { loadOrphanedRows, parseOrphanedListParams, sortOrphanedRows } from '@/lib/admin/orphaned-items-query'

/**
 * "이 조건의 N건 모두 선택" 배너가 부르는 전체 ID 조회(티켓 20260924_0950, 상위 티켓 §6 결정 1) —
 * 목록 페이지와 같은 행 집합·정렬(`loadOrphanedRows`·`sortOrphanedRows`)을 쓰므로 화면의
 * "총 N개"와 여기서 돌려주는 건수가 같다(상한 이내일 때). 이 화면에는 필터가 없고 전체가 상한(1,000건)을
 * 넘을 수 있어(2026-09-24 기준 1,268건), 다른 목록처럼 422로 막지 않고 현재 정렬의 앞쪽 1,000건을
 * 돌려준다 — 배너가 "상위 1,000건 선택됨"으로 알린다(`selectAllBannerState`의 `capped`).
 */
const SELECT_ALL_CAP = 1000

export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const params = parseOrphanedListParams(pickSingleQueryParamsFromURL(req.nextUrl.searchParams))
  const supabase = createServiceClient()

  let rows
  try {
    rows = sortOrphanedRows(await loadOrphanedRows(supabase), params.sort)
  } catch (error) {
    console.error('[admin/item-badges/orphaned/ids]', error)
    return NextResponse.json({ error: '목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해주세요.' }, { status: 500 })
  }

  return NextResponse.json({ ids: rows.slice(0, SELECT_ALL_CAP).map((row) => row.id) })
}
