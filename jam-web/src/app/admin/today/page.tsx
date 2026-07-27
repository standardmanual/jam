import { createServiceClient } from '@/lib/supabase/server'
import type { TodayCardRow } from '@/types/database'
import TodayCardList from './TodayCardList'

export default async function AdminTodayPage() {
  const supabase = createServiceClient()

  const [{ data: cardsRaw }, { data: badgesRaw }, { data: missionsRaw }, { data: booksRaw }] =
    await Promise.all([
      supabase.from('today_cards').select('*').order('starts_at', { ascending: false }),
      supabase.from('badges').select('id, name').order('name'),
      supabase.from('missions').select('id, title').order('created_at', { ascending: false }),
      supabase.from('item_books').select('id, name').order('name'),
    ])

  const cards = (cardsRaw ?? []) as TodayCardRow[]
  const badges = (badgesRaw ?? []) as { id: string; name: string }[]
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
