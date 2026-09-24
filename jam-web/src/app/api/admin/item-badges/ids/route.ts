import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import {
  parseItemBadgeListParams,
  applyItemBadgeListQuery,
  type ItemBadgeListQuery,
} from '@/lib/admin/item-badge-list'

/**
 * "이 조건의 N건 모두 선택" 배너가 부르는 전체 ID 조회(티켓 20260924_0950, 상위 티켓 §6 결정 1) —
 * 목록 페이지와 같은 쿼리 빌더(`applyItemBadgeListQuery`)로 필터링해, 화면에 보이는 "총 N개"와
 * 여기서 돌려주는 건수가 항상 같다.
 */
const SELECT_ALL_CAP = 1000

export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const params = parseItemBadgeListParams(pickSingleQueryParamsFromURL(req.nextUrl.searchParams))
  const supabase = createServiceClient()

  let query = supabase.from('badges').select('id', { count: 'exact' }) as unknown as ItemBadgeListQuery<{ id: string }>
  query = applyItemBadgeListQuery(query, params)
  const { data, count, error } = await query.range(0, SELECT_ALL_CAP - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if ((count ?? 0) > SELECT_ALL_CAP) {
    return NextResponse.json(
      {
        error: `조건에 맞는 아이템배지가 ${count}건이라 한 번에 선택할 수 있는 상한(${SELECT_ALL_CAP}건)을 넘습니다. 필터를 좁혀주세요.`,
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ ids: (data ?? []).map((row) => row.id) })
}
