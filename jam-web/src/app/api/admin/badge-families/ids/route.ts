import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import { parseFamilyListParams } from '@/lib/admin/badge-families'
import { listFamilies } from '@/lib/admin/badge-families-query'

/**
 * "이 조건의 N건 모두 선택" 배너가 부르는 전체 계열 키 조회(티켓 20260924_0949, 상위 티켓 §6
 * 결정 1) — 목록 페이지와 같은 `listFamilies`로 거르므로 화면의 "총 N개"와 건수가 같다.
 * 행 ID가 UUID가 아니라 계열 키(`family.key`)다.
 */
const SELECT_ALL_CAP = 1000

export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const params = parseFamilyListParams(pickSingleQueryParamsFromURL(req.nextUrl.searchParams))
  const { matched, error } = await listFamilies(params)

  // 부분 목록으로 계열을 묶으면 계열이 빠진 채 선택되므로 조회 오류는 그대로 실패시킨다.
  if (error) return NextResponse.json({ error }, { status: 500 })

  if (matched.length > SELECT_ALL_CAP) {
    return NextResponse.json(
      {
        error: `조건에 맞는 계열이 ${matched.length}건이라 한 번에 선택할 수 있는 상한(${SELECT_ALL_CAP}건)을 넘습니다. 필터를 좁혀주세요.`,
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ ids: matched.map((family) => family.key) })
}
