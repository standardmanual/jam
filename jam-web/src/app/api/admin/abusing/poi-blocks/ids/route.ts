import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import { ABUSING_SELECT_ALL_CAP, fetchAbusingListIds, parseAbusingListParams } from '@/lib/admin/abusing-list'

/** POI 차단 전체 ID 조회 — 제재 쪽(`bans/ids`)과 같은 규칙이다(티켓 20260924_0952) */
export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const params = parseAbusingListParams(pickSingleQueryParamsFromURL(req.nextUrl.searchParams), 'poi-blocks')
  const { ids, total, error } = await fetchAbusingListIds(createServiceClient(), 'poi-blocks', params)
  if (error) return NextResponse.json({ error: `POI 차단 목록을 불러오지 못했어요. (${error})` }, { status: 500 })

  if (total > ABUSING_SELECT_ALL_CAP) {
    return NextResponse.json(
      {
        error: `조건에 맞는 POI 차단이 ${total}건이라 한 번에 선택할 수 있는 상한(${ABUSING_SELECT_ALL_CAP}건)을 넘어요. 필터를 좁혀 주세요.`,
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ ids })
}
