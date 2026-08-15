import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ItemBookRow, FactionRow } from '@/types/database'
import Card from '@/components/ui/Card'
import { BookIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'

type ItemBookWithFaction = ItemBookRow & {
  faction: Pick<FactionRow, 'id' | 'name' | 'image_url'> | null
}

interface BookCard {
  book: ItemBookWithFaction
  totalBadgeCount: number
  discoveredBadgeCount: number
  slottedCount: number
  isCompleted: boolean
}

export default async function ItemBooksPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 1) 유저 인벤토리 id
  const { data: inventoryRaw } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', user.id)
    .single()
  const inventory = inventoryRaw as { id: string } | null

  let cards: BookCard[] = []

  if (inventory) {
    // 2) 인벤토리 아이템 → 아이템 배지(item_book_id 있는 것)만 추출
    const { data: invItemsRaw } = await supabase
      .from('inventory_items')
      .select('badge_id, badge:badges(item_book_id, type)')
      .eq('inventory_id', inventory.id)
      .is('dropped_at', null)

    type InvItemJoin = {
      badge_id: string
      badge: { item_book_id: string | null; type: string } | null
    }
    const invItems = (invItemsRaw ?? []) as unknown as InvItemJoin[]

    // 북별로 발견한 배지 집합 구성
    const discoveredByBook = new Map<string, Set<string>>()
    for (const it of invItems) {
      const bookId = it.badge?.item_book_id
      if (!bookId || it.badge?.type !== 'item') continue
      if (!discoveredByBook.has(bookId)) discoveredByBook.set(bookId, new Set())
      discoveredByBook.get(bookId)!.add(it.badge_id)
    }

    const bookIds = [...discoveredByBook.keys()]

    if (bookIds.length > 0) {
      // 3) 아이템북 + 세계관, 이 북들의 전체 배지 수, 유저 슬롯/완성 병렬 조회
      const [
        { data: booksRaw },
        { data: bookBadgesRaw },
        { data: slotsRaw },
        { data: completionsRaw },
      ] = await Promise.all([
        supabase
          .from('item_books')
          .select('*, faction:factions(id, name, image_url)')
          .in('id', bookIds)
          .eq('is_active', true),
        supabase
          .from('badges')
          .select('id, item_book_id')
          .in('item_book_id', bookIds)
          .eq('type', 'item'),
        supabase
          .from('user_item_book_slots')
          .select('item_book_id')
          .eq('user_id', user.id)
          .in('item_book_id', bookIds),
        supabase
          .from('user_item_book_completions')
          .select('item_book_id')
          .eq('user_id', user.id)
          .in('item_book_id', bookIds),
      ])

      const books = (booksRaw ?? []) as unknown as ItemBookWithFaction[]

      const totalByBook = new Map<string, number>()
      for (const b of (bookBadgesRaw ?? []) as { id: string; item_book_id: string }[]) {
        totalByBook.set(b.item_book_id, (totalByBook.get(b.item_book_id) ?? 0) + 1)
      }

      const slottedByBook = new Map<string, number>()
      for (const s of (slotsRaw ?? []) as { item_book_id: string }[]) {
        slottedByBook.set(s.item_book_id, (slottedByBook.get(s.item_book_id) ?? 0) + 1)
      }

      const completedSet = new Set(
        ((completionsRaw ?? []) as { item_book_id: string }[]).map((c) => c.item_book_id)
      )

      cards = books
        .map((book) => ({
          book,
          totalBadgeCount: totalByBook.get(book.id) ?? 0,
          discoveredBadgeCount: discoveredByBook.get(book.id)?.size ?? 0,
          slottedCount: slottedByBook.get(book.id) ?? 0,
          isCompleted: completedSet.has(book.id),
        }))
        // 완성된 것 먼저, 그 다음 진행도 높은 순
        .sort((a, b) => {
          if (a.isCompleted !== b.isCompleted) return a.isCompleted ? -1 : 1
          return b.slottedCount - a.slottedCount
        })
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-surface text-text">
      {/* 헤더 */}
      <div className="px-[var(--spacing-16)] pt-[calc(env(safe-area-inset-top)+var(--spacing-24))] pb-[var(--spacing-24)]">
        <h1 className="text-[length:var(--text-heading)] leading-[var(--leading-heading)]">{d.itembooks.title}</h1>
        <p className="mt-2 text-text/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
          {d.itembooks.subtitle}
        </p>
      </div>

      <div className="px-[var(--spacing-16)] pb-[var(--spacing-32)]">
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-[var(--spacing-40)] text-center">
            <p className="text-text/70 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{d.itembooks.emptyTitle}</p>
            <p className="text-text/40 text-[length:var(--text-caption)] mt-1">{d.itembooks.emptyBody}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-[var(--spacing-16)]">
            {cards.map(({ book, totalBadgeCount, discoveredBadgeCount, slottedCount, isCompleted }) => {
              const pct = totalBadgeCount > 0 ? Math.round((slottedCount / totalBadgeCount) * 100) : 0
              const showCompleted = isCompleted || (totalBadgeCount > 0 && discoveredBadgeCount === totalBadgeCount)
              const discoveredLabel = totalBadgeCount > 0
                ? t(d.itembooks.discoveredCount, { discovered: discoveredBadgeCount, total: totalBadgeCount })
                : t(d.itembooks.discoveredCountSimple, { count: discoveredBadgeCount })
              return (
                <Link key={book.id} href={`/itembooks/${book.id}`}>
                  <Card className="flex flex-col gap-[var(--spacing-8)] active:scale-[0.98] transition-transform duration-100">
                    {/* 북 이미지 */}
                    <div className="relative w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center shadow-[inset_0_0_0_1px_var(--color-border-inverse)]">
                      {book.image_url ? (
                        <Image src={book.image_url} alt={book.name} fill className="object-contain p-1.5" />
                      ) : (
                        <BookIcon className="w-8 h-8 text-text-inverse/40" />
                      )}
                      {showCompleted && (
                        <span className="absolute top-1.5 right-1.5 text-[length:var(--text-caption)] leading-none px-2 py-1 rounded-[var(--radius-tags)] bg-[var(--color-rarity-legend)] text-[var(--color-rarity-legend-text)] font-medium">
                          {d.itembooks.completed}
                        </span>
                      )}
                    </div>

                    {/* 이름 + 세계관 + 발견 수 */}
                    <div className="min-w-0">
                      <h2 className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] line-clamp-2">{book.name}</h2>
                      {book.faction && (
                        <p className="text-[length:var(--text-caption)] text-text-inverse/50 mt-0.5 truncate">{book.faction.name}</p>
                      )}
                      <p className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)] mt-0.5 tabular-nums">{discoveredLabel}</p>
                    </div>

                    {/* 진행도 */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border-inverse)]">
                        <div className="h-full bg-text-inverse rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[length:var(--text-caption)] text-text-inverse/60 tabular-nums shrink-0">{slottedCount}/{totalBadgeCount}</span>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
