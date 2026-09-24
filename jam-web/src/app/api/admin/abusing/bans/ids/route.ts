import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import { ABUSING_SELECT_ALL_CAP, fetchAbusingListIds, parseAbusingListParams } from '@/lib/admin/abusing-list'

/**
 * "이 조건의 N건 모두 선택" 배너가 부르는 제재 전체 ID 조회(티켓 20260924_0952, 상위 티켓 §6
 * 결정 1) — 목록 페이지와 같은 필터(`parseAbusingListParams`)로 걸러 화면의 총 건수와 항상 같다.
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const params = parseAbusingListParams(pickSingleQueryParamsFromURL(req.nextUrl.searchParams), 'bans')
  const { ids, total, error } = await fetchAbusingListIds(createServiceClient(), 'bans', params)
  if (error) return NextResponse.json({ error: `제재 목록을 불러오지 못했어요. (${error})` }, { status: 500 })

  if (total > ABUSING_SELECT_ALL_CAP) {
    return NextResponse.json(
      {
        error: `조건에 맞는 제재가 ${total}건이라 한 번에 선택할 수 있는 상한(${ABUSING_SELECT_ALL_CAP}건)을 넘어요. 필터를 좁혀 주세요.`,
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ ids })
}
