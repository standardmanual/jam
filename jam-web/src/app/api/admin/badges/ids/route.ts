import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import { parseBadgeListParams, fetchBadgeListIds, SELECT_ALL_CAP } from '@/lib/admin/badge-list-query'

/**
 * "이 조건의 N건 모두 선택" 배너가 부르는 전체 ID 조회(티켓 20260924_0944, 상위 티켓 §6
 * 결정 1) — 목록 페이지와 같은 필터(`parseBadgeListParams`)로 걸러, 화면에 보이는 "총 N개"와
 * 여기서 돌려주는 건수가 항상 같다.
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const params = parseBadgeListParams(pickSingleQueryParamsFromURL(req.nextUrl.searchParams))
  const supabase = createServiceClient()
  let result: Awaited<ReturnType<typeof fetchBadgeListIds>>
  try {
    result = await fetchBadgeListIds(supabase, params, SELECT_ALL_CAP)
  } catch {
    // 조회 오류를 "0건"으로 오인하지 않도록 500으로 알린다(티켓 20260924_1405). 원인은 던진 쪽이 로그로 남겼다.
    return NextResponse.json(
      { error: '배지 목록을 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.' },
      { status: 500 }
    )
  }
  const { ids, total } = result

  if (total > SELECT_ALL_CAP) {
    return NextResponse.json(
      {
        error: `조건에 맞는 배지가 ${total}건이라 한 번에 선택할 수 있는 상한(${SELECT_ALL_CAP}건)을 넘습니다. 필터를 좁혀주세요.`,
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ ids })
}
