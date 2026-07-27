import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ItemBookForm from '../ItemBookForm'
import type { ItemBookRow, BadgeRow, FactionRow } from '@/types/database'

export default async function EditItemBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [
    { data: bookRaw },
    { data: factionsRaw },
    { data: slottedRaw },
    { data: availableRaw },
  ] = await Promise.all([
    supabase.from('item_books').select('*').eq('id', id).single(),
    supabase.from('factions').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('badges').select('id, name, rarity, image_url').eq('item_book_id', id).eq('type', 'item'),
    supabase.from('badges').select('id, name, rarity, image_url').is('item_book_id', null).is('deleted_at', null).eq('type', 'item').limit(10000),
  ])

  if (!bookRaw) notFound()

  const book = bookRaw as ItemBookRow
  const factions = (factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]
  const slottedBadges = (slottedRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'image_url'>[]
  const availableBadges = (availableRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'image_url'>[]

  // 필수 액티비티/완성 보상 배지는 전체 목록을 가져오지 않고, 이미 지정된 값이 있을 때만
  // 콤보박스 초기 라벨용으로 그 배지 하나씩만 콕 집어서 조회한다.
  const labelIds = [book.required_activity_badge_id, book.reward_badge_id].filter((v): v is string => !!v)
  const { data: labelBadgesRaw } = labelIds.length > 0
    ? await supabase.from('badges').select('id, name').in('id', labelIds)
    : { data: [] as Pick<BadgeRow, 'id' | 'name'>[] }
  const labelBadgeMap = new Map(((labelBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]).map((b) => [b.id, b.name]))

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/itembooks" className="text-[#6b7280] hover:text-[#111111] text-sm transition-colors">
          ← 아이템북 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">아이템북 수정</h1>
      </div>
      <ItemBookForm
        book={book}
        factions={factions}
        slottedBadges={slottedBadges}
        availableBadges={availableBadges}
        requiredActivityBadgeLabel={book.required_activity_badge_id ? labelBadgeMap.get(book.required_activity_badge_id) : undefined}
        rewardBadgeLabel={book.reward_badge_id ? labelBadgeMap.get(book.reward_badge_id) : undefined}
      />
    </div>
  )
}
