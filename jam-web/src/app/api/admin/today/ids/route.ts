import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import {
  parseTodayListParams,
  applyTodayListQuery,
  TODAY_SELECT_ALL_CAP,
  type TodayListQuery,
} from '@/lib/admin/today-list-query'

/**
 * "이 조건의 N건 모두 선택" 배너가 부르는 전체 ID 조회(티켓 20260924_0947, 상위 티켓 §6
 * 결정 1) — 목록 페이지와 같은 쿼리 빌더(`applyTodayListQuery`)로 필터링해, 화면에 보이는
 * "총 N개"와 여기서 돌려주는 건수가 항상 같다.
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const params = parseTodayListParams(pickSingleQueryParamsFromURL(req.nextUrl.searchParams))
  const supabase = createServiceClient()

  let query = supabase
    .from('today_cards')
    .select('id', { count: 'exact' }) as unknown as TodayListQuery<{ id: string }>
  query = applyTodayListQuery(query, params)
  const { data, count, error } = await query.range(0, TODAY_SELECT_ALL_CAP - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if ((count ?? 0) > TODAY_SELECT_ALL_CAP) {
    return NextResponse.json(
      {
        error: `조건에 맞는 카드가 ${count}건이라 한 번에 선택할 수 있는 상한(${TODAY_SELECT_ALL_CAP}건)을 넘어요. 필터를 좁혀 주세요.`,
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ ids: (data ?? []).map((row) => row.id) })
}
