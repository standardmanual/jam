import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import type { BadgeType } from '@/types/database'

const MAX_RESULTS = 20

/**
 * 어드민 폼(레시피 재료/결과, 아이템북 필수·보상 배지, POI 연결 배지 등)에서
 * 배지를 찾기 위한 검색 API. 전체 배지 목록을 한 번에 select()하면 Supabase
 * 서버 단 Max Rows 상한에 걸려 뒤쪽 배지가 누락될 수 있으므로(등급 4종 x
 * 세력별 대량 아이템으로 총 배지 수가 수천 개), 항상 이름 검색으로 소량만
 * 가져온다. 패턴은 /api/admin/poi/search와 동일.
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const raw = (req.nextUrl.searchParams.get('query') ?? '').trim()
  const type = req.nextUrl.searchParams.get('type') as BadgeType | null
  // 아이템북 미배정 아이템 배지만 검색(ItemBookForm 전용). 다른 호출부는 파라미터를 안 보내므로
  // 기존 동작(전체 대상 검색) 그대로 유지된다.
  const unassigned = req.nextUrl.searchParams.get('unassigned') === 'true'
  // PostgREST 필터 문법(쉼표/괄호)과 LIKE 와일드카드를 깨뜨리는 문자는 제거
  const query = raw.replace(/[,()%_*\\]/g, ' ').trim()
  if (!query) return NextResponse.json({ badges: [] })

  const supabase = createServiceClient()
  let q = supabase
    .from('badges')
    // point_reward: MissionList의 "보상 배지 포인트 포함 여부" 경고에 필요. 나머지 호출부는
    // 무시하면 그만이라 부작용 없음.
    .select('id, name, rarity, type, point_reward')
    .is('deleted_at', null)
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })
    .limit(MAX_RESULTS)

  if (type) q = q.eq('type', type)
  if (unassigned) q = q.is('item_book_id', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ badges: data ?? [] })
}
