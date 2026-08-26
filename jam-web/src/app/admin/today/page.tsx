import { createServiceClient } from '@/lib/supabase/server'
import type { TodayCardRow } from '@/types/database'
import TodayCardList from './TodayCardList'

type BadgeLabelRow = { id: string; name: string; rarity: string; type: string; point_reward: number }

export default async function AdminTodayPage() {
  const supabase = createServiceClient()

  const [{ data: cardsRaw }, { data: missionsRaw }, { data: booksRaw }] = await Promise.all([
    supabase.from('today_cards').select('*').order('starts_at', { ascending: false }),
    supabase.from('missions').select('id, title').order('created_at', { ascending: false }),
    supabase.from('item_books').select('id, name').order('name'),
  ])

  const cards = (cardsRaw ?? []) as TodayCardRow[]
  const missions = (missionsRaw ?? []) as { id: string; title: string }[]
  const itemBooks = (booksRaw ?? []) as { id: string; name: string }[]

  // 카드가 이미 참조하는 배지(badge_ids)의 표시용 라벨 조회. 이전에는 배지 2172건 전량을
  // range-loop로 끌어온 뒤 클라이언트 필터링했지만(PostgREST 1000행 상한 방지, 티켓
  // 20260825_029), 저작 폼의 배지 검색 UI가 /api/admin/badges/search 기반 컴포넌트로
  // 바뀌면서(20260826_011 A1·A2) 더 이상 전량이 필요 없다 — 실제로 참조되는 id만
  // bounded로 조회한다(admin/itembooks/page.tsx의 labelIds 패턴과 동일).
  const referencedBadgeIds = [...new Set(cards.flatMap((c) => c.badge_ids ?? []))]
  const { data: badgeLabelsRaw } = referencedBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name, rarity, type, point_reward').in('id', referencedBadgeIds)
    : { data: [] as BadgeLabelRow[] }
  const badgeLabels = (badgeLabelsRaw ?? []) as BadgeLabelRow[]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">투데이 콘텐츠 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            홈(투데이) 카드 CMS — 템플릿별 카드 제작 · 예약 발행 · 노출조건 태그
          </p>
        </div>
      </div>
      <TodayCardList cards={cards} badgeLabels={badgeLabels} missions={missions} itemBooks={itemBooks} />
    </div>
  )
}
