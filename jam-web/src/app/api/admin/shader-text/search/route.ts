import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { parseShaderTextParams } from '@/lib/admin/shaderTextDissolve'
import {
  SHADER_TEXT_SEARCH_PAGE_SIZE,
  parseShaderTextBadgeSearchParams,
  shaderTextBadgeSearchRange,
  shaderTextBadgeSearchTotalPages,
} from '@/lib/admin/shaderTextBadgeSearch'
import type { BadgeRarity, BadgeType } from '@/types/database'
import type { Json } from '@/types/database.generated'

/**
 * 쉐이더 텍스트 생성기 — 배지 검색 API (티켓 20260912_1532)
 *
 * `20260902_1613`(액티비티 배지 이미지 생성기)이 전용 검색을 따로 둔 것과 같은 이유로,
 * `/admin/badges`의 `BadgesFilterBar`(목록용)를 재사용하지 않고 이 도구 전용으로 새로 만든다.
 * **대상 배지 타입 제한이 없다** — activity/item/checkin 전체를 대상으로 이름 검색한다(티켓 명시).
 * 결과에 등급·타입·현재 썸네일을 노출해 어떤 배지인지 식별 가능하게 한다.
 */

interface BadgeRow {
  id: string
  name: string
  type: BadgeType
  rarity: BadgeRarity | null
  image_url: string | null
  image_gen_params: Json | null
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const { q, type, page } = parseShaderTextBadgeSearchParams(body)

  const supabase = createServiceClient()
  let query = supabase
    .from('badges')
    .select('id, name, type, rarity, image_url, image_gen_params', { count: 'exact' })
    .is('deleted_at', null)

  if (q) query = query.ilike('name', `%${q}%`)
  if (type) query = query.eq('type', type)

  const { from, to } = shaderTextBadgeSearchRange(page)
  const { data, error, count } = await query.order('name').order('id').range(from, to)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const badges = ((data ?? []) as unknown as BadgeRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    rarity: row.rarity,
    imageUrl: row.image_url,
    // 이 도구로 저작한 값이 있으면 그대로 실어 보내 선택 즉시 재편집 상태로 복원한다
    // (다른 저작 도구가 만든 image_gen_params는 discriminator가 달라 여기서 null로 떨어진다).
    imageGenParams: parseShaderTextParams(row.image_gen_params),
  }))

  const total = count ?? 0
  return NextResponse.json({
    badges,
    total,
    page,
    pageSize: SHADER_TEXT_SEARCH_PAGE_SIZE,
    totalPages: shaderTextBadgeSearchTotalPages(total),
  })
}
