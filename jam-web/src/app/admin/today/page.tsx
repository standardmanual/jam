import { createServiceClient } from '@/lib/supabase/server'
import type { TodayCardRow } from '@/types/database'
import TodayCardList from './TodayCardList'

type BadgeOptionRow = { id: string; name: string }

/**
 * 오늘 카드 배지 선택용 배지 전량 조회.
 *
 * 티켓 20260825_029: type 필터가 없어 미삭제 배지 2172건 전체를 대상으로 하는데,
 * PostgREST 기본 응답 상한(1000행)에 걸리면 name 오름차순 뒤쪽 배지가 통째로 잘려
 * "오늘" 카드 배지 스포트라이트에서 골라 넣지 못한다(admin/missions/page.tsx와 동일 원인,
 * 티켓 20260825_028 dce8f5fa). range로 페이지를 끝까지 넘겨 전량을 가져온다.
 */
async function fetchAllBadgeOptions(supabase: ReturnType<typeof createServiceClient>): Promise<BadgeOptionRow[]> {
  const PAGE_SIZE = 1000
  const all: BadgeOptionRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: pageRaw, error } = await supabase
      .from('badges')
      .select('id, name')
      .is('deleted_at', null)
      .order('name')
      .order('id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error('[admin/today] 배지 목록 조회 실패:', error)
      break
    }
    const page = (pageRaw ?? []) as BadgeOptionRow[]
    all.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return all
}

export default async function AdminTodayPage() {
  const supabase = createServiceClient()

  const [{ data: cardsRaw }, badges, { data: missionsRaw }, { data: booksRaw }] =
    await Promise.all([
      supabase.from('today_cards').select('*').order('starts_at', { ascending: false }),
      fetchAllBadgeOptions(supabase),
      supabase.from('missions').select('id, title').order('created_at', { ascending: false }),
      supabase.from('item_books').select('id, name').order('name'),
    ])

  const cards = (cardsRaw ?? []) as TodayCardRow[]
  const missions = (missionsRaw ?? []) as { id: string; title: string }[]
  const itemBooks = (booksRaw ?? []) as { id: string; name: string }[]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">투데이 콘텐츠 관리</h1>
          <p className="text-[#6b7280] text-sm mt-1">
            홈(투데이) 카드 CMS — 템플릿별 카드 제작 · 예약 발행 · 노출조건 태그
          </p>
        </div>
      </div>
      <TodayCardList cards={cards} badges={badges} missions={missions} itemBooks={itemBooks} />
    </div>
  )
}
