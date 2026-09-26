import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import { parsePoiListParams, applyPoiListQuery, type PoiListQuery } from '@/lib/admin/poi-list-query'

/**
 * "이 조건의 N건 모두 선택" 배너가 부르는 전체 ID 조회(티켓 20260924_0941, 상위 티켓 §6
 * 결정 1) — 목록 페이지와 같은 쿼리 빌더(`applyPoiListQuery`)로 필터링해, 화면에 보이는
 * "총 N개"와 여기서 돌려주는 건수가 항상 같다.
 */
const SELECT_ALL_CAP = 1000

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1603). 현상 → 원인 → 해결책 순서.
const READ_ERROR_MESSAGE = 'POI 목록을 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const params = parsePoiListParams(pickSingleQueryParamsFromURL(req.nextUrl.searchParams))
  const supabase = createServiceClient()

  let query = supabase.from('poi').select('id', { count: 'exact' }) as unknown as PoiListQuery<{ id: string }>
  query = applyPoiListQuery(query, params)
  const { data, count, error } = await query.range(0, SELECT_ALL_CAP - 1)

  if (error) {
    console.error('[poi ids] 조회 오류:', error.message)
    return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
  }

  if ((count ?? 0) > SELECT_ALL_CAP) {
    return NextResponse.json(
      {
        error: `조건에 맞는 POI가 ${count}건이라 한 번에 선택할 수 있는 상한(${SELECT_ALL_CAP}건)을 넘습니다. 필터를 좁혀주세요.`,
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ ids: (data ?? []).map((row) => row.id) })
}
