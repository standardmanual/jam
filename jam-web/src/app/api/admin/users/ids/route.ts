import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import { parseUserListParams, fetchUserListIds, USER_SELECT_ALL_CAP } from '@/lib/admin/user-list'

/**
 * "이 조건의 N건 모두 선택" 배너가 부르는 전체 ID 조회(티켓 20260924_0951, 상위 티켓 §6
 * 결정 1) — 목록 페이지와 같은 필터(`parseUserListParams`)로 걸러, 화면에 보이는 총 건수와
 * 여기서 돌려주는 건수가 항상 같다. 어드민·본인 계정은 여기서 빼지 않는다 — 일괄 API가
 * 실행 때 자동 제외하고 그 수를 확인창에 보여 준다.
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const params = parseUserListParams(pickSingleQueryParamsFromURL(req.nextUrl.searchParams))
  try {
    const { ids, total } = await fetchUserListIds(createServiceClient(), params, USER_SELECT_ALL_CAP)

    if (total > USER_SELECT_ALL_CAP) {
      return NextResponse.json(
        {
          error: `조건에 맞는 유저가 ${total}명이라 한 번에 선택할 수 있는 상한(${USER_SELECT_ALL_CAP}명)을 넘습니다. 필터를 좁혀주세요.`,
        },
        { status: 422 }
      )
    }

    return NextResponse.json({ ids })
  } catch (error) {
    console.error('[admin/users/ids]', error)
    return NextResponse.json({ error: '유저 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}
