import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import TodayCardDetail, { type TodayCardDetailBadge } from '@/components/admin/today/TodayCardDetail'
import { normalizeDateParam } from '@/lib/admin/today-calendar'
import { singleQueryParam, type SearchParamValue } from '@/lib/searchParams'
import type { TodayCardRow } from '@/types/database'

interface TodayCardDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: SearchParamValue }>
}

export default async function TodayCardDetailPage({ params, searchParams }: TodayCardDetailPageProps) {
  const { id } = await params
  const returnDate = normalizeDateParam(singleQueryParam((await searchParams).date))
  const supabase = createServiceClient()

  const { data } = await supabase.from('today_cards').select('*').eq('id', id).single()
  if (!data) notFound()
  const card = data as TodayCardRow

  const [{ data: badgesRaw }, { data: missionRaw }, { data: itemBookRaw }] = await Promise.all([
    (card.badge_ids ?? []).length > 0
      ? supabase.from('badges').select('id, name').in('id', card.badge_ids ?? [])
      : Promise.resolve({ data: [] as TodayCardDetailBadge[] }),
    card.mission_id ? supabase.from('missions').select('title').eq('id', card.mission_id).single() : Promise.resolve({ data: null }),
    card.item_book_id
      ? supabase.from('item_books').select('name').eq('id', card.item_book_id).single()
      : Promise.resolve({ data: null }),
  ])

  const linkedBadges = (badgesRaw ?? []) as TodayCardDetailBadge[]
  const missionTitle = (missionRaw as { title: string } | null)?.title
  const itemBookName = (itemBookRaw as { name: string } | null)?.name

  return (
    <div className="p-4 md:p-8">
      <TodayCardDetail card={card} linkedBadges={linkedBadges} missionTitle={missionTitle} itemBookName={itemBookName} returnDate={returnDate} />
    </div>
  )
}
