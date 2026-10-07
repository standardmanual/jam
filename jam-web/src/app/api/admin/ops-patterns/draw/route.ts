/**
 * GET /api/admin/ops-patterns/draw — 조합 뽑기: 최근에 덜 쓴 패턴·트라이브·지점 카테고리 (티켓 20261007_2221, 상위 20260930_1503 ④, 운영툴 PRD §11.14)
 *
 * 응답 `{ now, since, windowDays, limit, countedItems, patterns, tribes, placeCategories }`의 모양과 계산은 `lib/admin/opsPatterns/draw.ts`가 정한다. 이 라우트는
 * 인증·쿼리 읽기·응답만 맡는다. 같은 폴더에 동적 경로 `[patternNo]`가 있어, `draw`가 그 라우트에 가로채이지 않는지는 머지 뒤 실제 호출로 확인한다.
 *
 * - 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용). **쓰기 메서드는 두지 않는다.**
 * - 쿼리 `limit`(1~50 정수, 기본 5): 목록마다 싣는 개수. 모양이 틀리면 400이고 조회하지 않는다. 기준 시각을 바꾸는 쿼리는 없다(지금이 기준이다).
 * - **응답에 관리자 ID를 싣지 않는다**(`draw.ts`가 `author`·`raw`·`actor`를 읽지도 않는다).
 */
import { NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { OPS_DRAW_LOAD_FAILED_MESSAGE, drawOpsCombination, parseDrawLimit } from '@/lib/admin/opsPatterns/draw'

export async function GET(req: Request) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const parsed = parseDrawLimit(new URL(req.url).searchParams)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const service = createServiceClient()
    return NextResponse.json(await drawOpsCombination(service, { limit: parsed.limit, now: new Date() }))
  } catch (error) {
    console.error('[admin/ops-patterns/draw] 조합 뽑기 조회 실패:', error)
    return NextResponse.json({ error: OPS_DRAW_LOAD_FAILED_MESSAGE }, { status: 500 })
  }
}
