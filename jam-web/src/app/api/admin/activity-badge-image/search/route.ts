import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { parseActivityBadgeImageParams } from '@/lib/admin/activityBadgeImage'
import type { ActivityType, BadgeRarity } from '@/types/database'
import type { Json } from '@/types/database.generated'

/**
 * 액티비티 배지 이미지 생성 — 검색 API (티켓 20260902_1613)
 *
 * `type='activity'` 배지만 대상으로 한다. 체크인 검색(`/api/admin/badge-image/search`)과 달리
 * POI 조인이 없어 구조가 단순하다 — 대신 **등급·활동 종목을 반드시 함께 돌려준다.** 액티비티
 * 배지는 이름이 중복되기 때문이다(예: 「이달의 산책왕」이 common·epic 2건). 이름만 보여주면
 * 운영자가 어느 배지를 고르는지 판단할 수 없다.
 *
 * 액티비티 배지는 전체 207건 규모라, 체크인(1,789건)과 달리 필터 없이도 목록을 훑을 수 있게
 * 둔다(상한 50건 + truncated 플래그).
 */

const MAX_RESULTS = 50

const RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

interface BadgeRow {
  id: string
  name: string
  description: string
  rarity: BadgeRarity
  activity_types: string[] | null
  image_url: string | null
  image_gen_params: Json | null
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const rawQuery = typeof body?.q === 'string' ? body.q : ''
  // PostgREST 필터 문법(쉼표/괄호)과 LIKE 와일드카드를 깨뜨리는 문자는 제거 (기존 검색과 동일 패턴)
  const q = rawQuery.replace(/[,()%_*\\]/g, ' ').trim()
  const rarity =
    typeof body?.rarity === 'string' && (RARITIES as string[]).includes(body.rarity)
      ? (body.rarity as BadgeRarity)
      : null
  const activityType = typeof body?.activityType === 'string' && body.activityType ? body.activityType : null

  const supabase = createServiceClient()

  let query = supabase
    .from('badges')
    .select('id, name, description, rarity, activity_types, image_url, image_gen_params', {
      count: 'exact',
    })
    .eq('type', 'activity')
    .is('deleted_at', null)

  if (q) query = query.ilike('name', `%${q}%`)
  if (rarity) query = query.eq('rarity', rarity)
  // activity_types는 text[] — 배열에 해당 종목이 들어 있는 배지만 남긴다.
  if (activityType) query = query.contains('activity_types', [activityType])

  const { data, error, count } = await query.order('name').limit(MAX_RESULTS)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const badges = ((data ?? []) as unknown as BadgeRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    rarity: row.rarity,
    activityTypes: (row.activity_types ?? []) as ActivityType[],
    hasImage: Boolean(row.image_url),
    // 저작 파라미터가 남아 있으면 재편집으로 그대로 복원한다.
    imageGenParams: parseActivityBadgeImageParams(row.image_gen_params),
  }))

  return NextResponse.json({ badges, truncated: (count ?? 0) > MAX_RESULTS })
}
