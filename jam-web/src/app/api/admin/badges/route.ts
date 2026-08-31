import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { findCumulativeConditionError, findUnknownConditionKeyError } from '@/lib/admin/badge-validation'
import type { BadgeRow } from '@/types/database'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  // 티켓 20260825_029: 전체 배지(현재 5585건, 소프트 삭제 포함)를 `.limit(5000)`으로
  // 조회했으나 PostgREST 서버 설정(db-max-rows, 기본 1000)은 클라이언트가 요청한 limit보다
  // 우선한다 — 실제로는 created_at 내림차순 최신 1000건만 돌아온다. 이 엔드포인트는
  // BadgeForm.tsx(같은 북+등급 내 drop_weight 합산 미리보기)와 ItemBookForm.tsx(일괄 배경
  // 적용 전 대상 배지 수 미리보기)에서 응답 전체를 클라이언트에서 필터링해 쓰므로, 오래된
  // 배지가 잘려나가면 두 미리보기 숫자가 실제보다 적게 계산되는 오판으로 이어진다.
  // range로 페이지를 끝까지 넘겨 전량을 가져온다.
  const PAGE_SIZE = 1000
  const all: BadgeRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: pageRaw, error } = await supabase
      .from('badges')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const page = (pageRaw ?? []) as BadgeRow[]
    all.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return NextResponse.json({ badges: all })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, type, rarity, image_url, activity_types, patch_available, patch_price_krw, condition_json, faction_id, item_book_id, category, drop_weight, valid_from, valid_until, point_reward, background_color, background_shader_id, background_image_url, background_video_url } = body

  if (!name || !description || !type || !rarity || !image_url) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 })
  }

  const cumulativeError = findCumulativeConditionError(type, condition_json ?? null)
  if (cumulativeError) {
    return NextResponse.json({ error: cumulativeError }, { status: 400 })
  }

  const unknownConditionKeyError = findUnknownConditionKeyError(condition_json ?? null)
  if (unknownConditionKeyError) {
    return NextResponse.json({ error: unknownConditionKeyError }, { status: 400 })
  }

  const supabase = createServiceClient()
  const insertPayload = {
    name,
    description,
    type,
    rarity,
    image_url,
    activity_types: activity_types ?? [],
    patch_available: patch_available ?? false,
    patch_price_krw: patch_price_krw ?? null,
    // POI 배지는 "어느 POI를 지나갔는가"로만 판정 — 활동 조건이 섞이지 않도록 강제 null
    condition_json: type === 'checkin' ? null : condition_json ?? null,
    // 체크인 배지에는 세계관/컬렉션 개념이 없다 — 저작 화면(BadgeForm)에서도 정리하지만
    // 서버에서도 같은 규칙을 강제한다(20260830_1344).
    faction_id: type === 'checkin' ? null : faction_id ?? null,
    item_book_id: type === 'checkin' ? null : item_book_id ?? null,
    // 배지 카테고리는 체크인 배지 전용(poi_categories.slug 재사용, 마이그레이션 113).
    category: type === 'checkin' ? category ?? null : null,
    drop_weight: drop_weight ?? 1.0,
    valid_from: valid_from ?? null,
    valid_until: valid_until ?? null,
    point_reward: Math.max(0, Math.trunc(Number(point_reward) || 0)),
    background_color: background_color ?? null,
    background_shader_id: background_shader_id ?? null,
    // 배경 3모드(단색 / 정적 제너레이터 / 애니메이션 제너레이터)는 상호 배타적이라 선택하지 않은
    // 쪽은 항상 null로 정리된다 — 정리 책임은 저작 화면(BadgeForm)에 있고, 여기서는 넘어온 값을
    // 그대로 반영한다(20260819_012).
    background_image_url: background_image_url ?? null,
    background_video_url: background_video_url ?? null,
  }
  const badgesQuery = supabase.from('badges')
  const insertQuery = badgesQuery.insert(insertPayload)
  const { data, error } = await insertQuery.select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ badge: data }, { status: 201 })
}
