/**
 * GET /api/admin/ops-places — 윤진이 읽는 장소 재료 (티켓 20261102_1602, 상위 20260930_1503, 운영툴 PRD §11.15)
 *
 * 요청 때 읽고(`lib/admin/opsPlaces/load.ts`) 계산한다(`compute.ts`). 저장하지 않는다. 이 라우트는 인증·쿼리 읽기·쪽 나누기·응답만 맡는다.
 *
 * - 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용). **쓰기 메서드는 두지 않는다.**
 * - 쿼리 없음: 카테고리 요약 `{ totalPlaces, inactiveCount, pendingReviewCount, categories: [{ slug, label, placeCount, inactiveCount, pendingReviewCount, checkinBadgeCount, dropCount, pickupCount }] }`.
 *   모든 수치는 기본으로 활성(`is_active`)이고 검수를 통과한(`pending_review = false`) 장소만 센다. 비활성·검수 대기 수는 따로 싣는다(티켓 20261102_2254).
 * - 모든 모드가 받는 거름: `status=active|inactive|pending|all`(기본 active, `all`의 합계 = poi 전체 행 수), `sido`·`gu`(정확히 일치).
 * - `groupBy=region`: `{ totalPlaces, groups: [{ sido, gu, placeCount, checkinBadgeCount, dropCount, pickupCount }] }`. `category`를 함께 주면 그 카테고리만 센다.
 * - `category=<slug>`: 그 카테고리의 장소 목록 `{ category, total, limit, offset, nextOffset, places }`(장소마다 `sido`·`gu`, 없으면 null). `q`(이름 포함)·`limit`(1~100, 기본 30)·
 *   `offset`·`sort=drops|name`(기본 drops)을 함께 받는다. 형식이나 범위가 틀리면 400이고 읽지 않는다. 없는 카테고리는 404다.
 * - 장소 좌표·주소·동·유저 칸을 싣지 않는다. 원천 하나라도 읽지 못하면 500이다(빈 값으로 바꿔 숨기지 않는다).
 */
import { NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import {
  categoryExists,
  categoryLabel,
  filterPlaces,
  groupPlacesByRegion,
  listCategoryPlaces,
  stateOf,
  summarizeCategories,
} from '@/lib/admin/opsPlaces/compute'
import { PLACES_LOAD_FAILED_MESSAGE, loadPlaceInputs } from '@/lib/admin/opsPlaces/load'
import { PLACES_QUERY_INVALID_MESSAGE, parsePlacesQuery } from '@/lib/admin/opsPlaces/query'

const CATEGORY_NOT_FOUND_MESSAGE = '없는 카테고리예요. category 없이 불러 목록을 확인해 주세요.'

export async function GET(req: Request) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const parsed = parsePlacesQuery(new URL(req.url).searchParams)
  if (parsed === null) {
    return NextResponse.json({ error: PLACES_QUERY_INVALID_MESSAGE }, { status: 400 })
  }

  try {
    const inputs = await loadPlaceInputs(createServiceClient())

    const { filter } = parsed
    if (parsed.mode === 'summary') {
      const regional = inputs.places.filter(
        (place) => (filter.sido === null || place.sido === filter.sido) && (filter.gu === null || place.gu === filter.gu)
      )
      return NextResponse.json({
        totalPlaces: filterPlaces(inputs.places, filter).length,
        inactiveCount: regional.filter((place) => stateOf(place) === 'inactive').length,
        pendingReviewCount: regional.filter((place) => stateOf(place) === 'pending').length,
        categories: summarizeCategories(inputs, filter),
      })
    }

    if (parsed.mode === 'region') {
      if (parsed.category !== null && !categoryExists(inputs, parsed.category)) {
        return NextResponse.json({ error: CATEGORY_NOT_FOUND_MESSAGE }, { status: 404 })
      }
      const groups = groupPlacesByRegion(inputs, filter, parsed.category)
      return NextResponse.json({ totalPlaces: groups.reduce((sum, g) => sum + g.placeCount, 0), groups })
    }

    const { query } = parsed
    if (!categoryExists(inputs, query.category)) {
      return NextResponse.json({ error: CATEGORY_NOT_FOUND_MESSAGE }, { status: 404 })
    }
    const entries = listCategoryPlaces(inputs, query, filter)
    const nextOffset = query.offset + query.limit < entries.length ? query.offset + query.limit : null
    return NextResponse.json({
      category: { slug: query.category, label: categoryLabel(inputs, query.category) },
      total: entries.length,
      limit: query.limit,
      offset: query.offset,
      nextOffset,
      places: entries.slice(query.offset, query.offset + query.limit),
    })
  } catch (error) {
    console.error('[admin/ops-places] 장소 조회 실패:', error)
    return NextResponse.json({ error: PLACES_LOAD_FAILED_MESSAGE }, { status: 500 })
  }
}
