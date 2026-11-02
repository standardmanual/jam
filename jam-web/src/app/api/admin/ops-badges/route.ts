/**
 * GET /api/admin/ops-badges — 윤진이 읽는 액티비티 배지 재료 (티켓 20261102_1602, 상위 20260930_1503, 운영툴 PRD §11.16)
 *
 * 요청 때 읽고(`lib/admin/opsBadges/load.ts`) 계열로 묶는다(`compute.ts`). 저장하지 않는다. 이 라우트는 인증·쿼리 읽기·쪽 나누기·응답만 맡는다.
 *
 * - 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용). **쓰기 메서드는 두지 않는다.**
 * - 응답 `{ total, limit, offset, nextOffset, families: [{ family, name, tiers: [{ tier, conditionSummary, earnedCount }], hidden }] }`.
 *   **숨김 배지는 싣지 않는다.** 획득 수는 배지를 받은 사람 수이고 유저 ID는 읽지도 싣지도 않는다.
 * - 쿼리 `family`(계열 이름 포함)·`limit`(1~100, 기본 30)·`offset`. 형식이나 범위가 틀리면 400이고 읽지 않는다.
 * - 원천 하나라도 읽지 못하면 500이다(획득 수 0으로 바꿔 숨기지 않는다).
 */
import { NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { buildBadgeFamilies, filterFamiliesByName } from '@/lib/admin/opsBadges/compute'
import { BADGES_LOAD_FAILED_MESSAGE, loadBadgeInputs } from '@/lib/admin/opsBadges/load'
import { BADGES_QUERY_INVALID_MESSAGE, parseBadgesQuery } from '@/lib/admin/opsBadges/query'

export async function GET(req: Request) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const query = parseBadgesQuery(new URL(req.url).searchParams)
  if (query === null) {
    return NextResponse.json({ error: BADGES_QUERY_INVALID_MESSAGE }, { status: 400 })
  }

  try {
    const { badges, earnedByBadge } = await loadBadgeInputs(createServiceClient())
    const matched = filterFamiliesByName(buildBadgeFamilies(badges, earnedByBadge), query.family)
    const nextOffset = query.offset + query.limit < matched.length ? query.offset + query.limit : null
    return NextResponse.json({
      total: matched.length,
      limit: query.limit,
      offset: query.offset,
      nextOffset,
      families: matched.slice(query.offset, query.offset + query.limit),
    })
  } catch (error) {
    console.error('[admin/ops-badges] 배지 조회 실패:', error)
    return NextResponse.json({ error: BADGES_LOAD_FAILED_MESSAGE }, { status: 500 })
  }
}
