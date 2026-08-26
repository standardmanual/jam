import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/shadcn-button'
import { ItemBookDetail } from '@/components/admin/itembooks/ItemBookDetail'
import ItemBookForm from '../ItemBookForm'
import type { ItemBookRow, BadgeRow, FactionRow } from '@/types/database'

export default async function EditItemBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [
    { data: bookRaw },
    { data: factionsRaw },
    { data: slottedRaw },
  ] = await Promise.all([
    supabase.from('item_books').select('*').eq('id', id).single(),
    supabase.from('factions').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('badges').select('id, name, rarity, image_url').eq('item_book_id', id).eq('type', 'item').is('deleted_at', null),
  ])

  if (!bookRaw) notFound()

  const book = bookRaw as ItemBookRow
  const factions = (factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]
  const slottedBadges = (slottedRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'image_url'>[]

  const labelIds = [book.required_activity_badge_id, book.reward_badge_id].filter((v): v is string => !!v)
  const { data: labelBadgesRaw } = labelIds.length > 0
    ? await supabase.from('badges').select('id, name').in('id', labelIds)
    : { data: [] as Pick<BadgeRow, 'id' | 'name'>[] }
  const labelBadgeMap = new Map(((labelBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]).map((b) => [b.id, b.name]))

  const factionLabel = factions.find(f => f.id === book.faction_id)?.name

  return (
    <div className="space-y-8 p-4 md:p-8">
      {/* 뒤로가기 + 제목 */}
      <div className="space-y-3">
        <Link href="/admin/itembooks">
          <Button variant="ghost" className="h-auto p-0 text-sm">
            ← 컬렉션 목록
          </Button>
        </Link>
        <h1 className="text-2xl font-bold md:text-3xl">컬렉션 수정</h1>
      </div>

      {/* ItemBook 상세 정보 (읽기 전용) */}
      <ItemBookDetail
        itemBook={book}
        requiredActivityBadgeName={
          book.required_activity_badge_id
            ? labelBadgeMap.get(book.required_activity_badge_id)
            : undefined
        }
        rewardBadgeName={
          book.reward_badge_id
            ? labelBadgeMap.get(book.reward_badge_id)
            : undefined
        }
        factionName={factionLabel}
        itemBadgeCount={slottedBadges.length}
      />

      {/* 편집 폼 */}
      <div className="border-t pt-8">
        <h2 className="text-xl font-bold mb-6">편집</h2>
        <ItemBookForm
          book={book}
          factions={factions}
          slottedBadges={slottedBadges}
          requiredActivityBadgeLabel={book.required_activity_badge_id ? labelBadgeMap.get(book.required_activity_badge_id) : undefined}
          rewardBadgeLabel={book.reward_badge_id ? labelBadgeMap.get(book.reward_badge_id) : undefined}
        />
      </div>
    </div>
  )
}
