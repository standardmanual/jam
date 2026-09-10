import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import type { BadgeRarity, BadgeType } from '@/types/database'

const MAX_RESULTS = 20

/**
 * 어드민 폼(레시피 재료/결과, 아이템북 필수·보상 배지, POI 연결 배지 등)에서
 * 배지를 찾기 위한 검색 API. 전체 배지 목록을 한 번에 select()하면 Supabase
 * 서버 단 Max Rows 상한에 걸려 뒤쪽 배지가 누락될 수 있으므로(등급 4종 x
 * 트라이브별 대량 아이템으로 총 배지 수가 수천 개), 이름 검색이나 필터로 좁혀 소량만
 * 가져온다(조건이 하나도 없으면 빈 배열). 패턴은 /api/admin/poi/search와 동일.
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const raw = (req.nextUrl.searchParams.get('query') ?? '').trim()
  const type = req.nextUrl.searchParams.get('type') as BadgeType | null
  // 아이템북 미배정 아이템 배지만 검색(ItemBookForm 전용). 다른 호출부는 파라미터를 안 보내므로
  // 기존 동작(전체 대상 검색) 그대로 유지된다.
  const unassigned = req.nextUrl.searchParams.get('unassigned') === 'true'
  // 보상 배지 다중 선택(MultiBadgeSearchSelect)의 후보 좁히기 필터 — 트라이브·컬렉션(아이템북)·등급.
  // **추첨 풀이 아니라 검색 도구다**(티켓 20260910_1408). 파라미터를 안 보내는 기존 호출부는
  // 그대로 전체 대상 검색이 유지된다.
  const tribeId = req.nextUrl.searchParams.get('tribe_id')
  const itemBookId = req.nextUrl.searchParams.get('item_book_id')
  const rarity = req.nextUrl.searchParams.get('rarity') as BadgeRarity | null
  // PostgREST 필터 문법(쉼표/괄호)과 LIKE 와일드카드를 깨뜨리는 문자는 제거
  const query = raw.replace(/[,()%_*\\]/g, ' ').trim()
  // 필터(트라이브·컬렉션·등급)가 하나라도 걸려 있으면 이름 없이도 후보를 훑을 수 있게 한다.
  // 아무 조건도 없는 전체 조회는 여전히 막는다(Max Rows 절단 방지 — 파일 상단 주석 참고).
  const hasFilter = Boolean(tribeId || itemBookId || rarity)
  if (!query && !hasFilter) return NextResponse.json({ badges: [] })

  const supabase = createServiceClient()
  let q = supabase
    .from('badges')
    // point_reward: MissionList의 "보상 배지 포인트 포함 여부" 경고에 필요. 나머지 호출부는
    // 무시하면 그만이라 부작용 없음.
    // admin_category: 어드민 전용 분류(JAM! 카테고리) — 검색 결과에서 제외하지 않고 구분
    // 라벨만 붙인다(게이트미션·아이템북과 같은 정책, 티켓 20260910_2055).
    .select('id, name, rarity, type, point_reward, admin_category')
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(MAX_RESULTS)

  if (query) q = q.ilike('name', `%${query}%`)
  if (type) q = q.eq('type', type)
  if (unassigned) q = q.is('item_book_id', null)
  if (tribeId) q = q.eq('tribe_id', tribeId)
  if (itemBookId) q = q.eq('item_book_id', itemBookId)
  if (rarity) q = q.eq('rarity', rarity)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ badges: data ?? [] })
}
