import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import {
  parseItemBookListParams,
  fetchItemBookListIds,
  ITEM_BOOK_SELECT_ALL_CAP,
} from '@/lib/admin/itembook-list-query'

/**
 * "이 조건의 N건 모두 선택" 배너가 부르는 전체 ID 조회(티켓 20260924_0945, 상위 티켓 §6 결정 1) —
 * 목록 페이지와 같은 필터(`parseItemBookListParams`)로 걸러, 화면의 "총 N개"와 여기서 돌려주는
 * 건수가 항상 같다.
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const params = parseItemBookListParams(pickSingleQueryParamsFromURL(req.nextUrl.searchParams))
  const supabase = createServiceClient()
  const { ids, total } = await fetchItemBookListIds(supabase, params, ITEM_BOOK_SELECT_ALL_CAP)

  if (total > ITEM_BOOK_SELECT_ALL_CAP) {
    return NextResponse.json(
      {
        error: `조건에 맞는 컬렉션이 ${total}건이라 한 번에 선택할 수 있는 상한(${ITEM_BOOK_SELECT_ALL_CAP}건)을 넘습니다. 필터를 좁혀주세요.`,
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ ids })
}
