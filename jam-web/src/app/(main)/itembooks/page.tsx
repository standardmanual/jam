import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ItemBookRow, FactionRow } from '@/types/database'

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
    <div className="flex flex-col min-h-full bg-jam-teal">
      {/* 헤더 */}
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-5 max-w-2xl mx-auto w-full">
        <p className="text-jam-ink/60 text-sm font-bold">컬렉션</p>
        <h1 className="text-4xl font-black text-jam-ink leading-tight">아이템북</h1>
        <p className="mt-2 text-jam-ink/60 text-sm font-semibold leading-relaxed">
          아이템 배지를 모아 아이템북을 완성해보세요
        </p>
      </div>

      {/* 크림 패널 */}
      <div className="flex-1 bg-jam-cream rounded-t-[2rem] border-t-[3px] border-jam-ink px-5 py-6">
        <div className="max-w-2xl mx-auto w-full">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="text-5xl mb-4">📕</span>
              <p className="text-jam-ink/70 font-bold">아직 발견한 아이템북이 없어요.</p>
              <p className="text-jam-ink/40 text-xs mt-1 font-semibold">
                아이템 배지를 모아봐요!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {cards.map(({ book, totalBadgeCount, slottedCount, isCompleted }) => {
                const pct =
                  totalBadgeCount > 0
                    ? Math.round((slottedCount / totalBadgeCount) * 100)
                    : 0
                return (
                  <Link
                    key={book.id}
                    href={`/itembooks/${book.id}`}
                    className={[
                      'flex flex-col rounded-2xl border-[3px] p-3 gap-2.5 transition-all active:shadow-none active:translate-x-[3px] active:translate-y-[3px]',
                      isCompleted
                        ? 'bg-jam-lime border-jam-ink shadow-[3px_3px_0_0_#161616]'
                        : 'bg-white border-jam-ink shadow-[3px_3px_0_0_#161616]',
                    ].join(' ')}
                  >
                    {/* 북 이미지 */}
                    <div className="relative w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center bg-jam-cream">
                      {book.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={book.image_url}
                          alt={book.name}
                          className="w-full h-full object-contain p-1.5"
                        />
                      ) : (
                        <span className="text-4xl">📖</span>
                      )}
                      {isCompleted && (
                        <span className="absolute top-1.5 right-1.5 bg-jam-ink text-white text-[10px] font-black px-2 py-0.5 rounded-full border-2 border-white">
                          완성
                        </span>
                      )}
                    </div>

                    {/* 이름 + 세계관 */}
                    <div className="min-w-0">
                      <h2 className="text-sm font-black text-jam-ink leading-tight line-clamp-2">
                        {book.name}
                      </h2>
                      {book.faction && (
                        <p className="text-[11px] text-jam-ink/50 font-bold mt-0.5 truncate">
                          {book.faction.name}
                        </p>
                      )}
                    </div>

                    {/* 진행도 */}
                    <div className="mt-auto">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-jam-ink/10 overflow-hidden border border-jam-ink/20">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isCompleted ? 'bg-jam-ink' : 'bg-jam-teal'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-jam-ink/70 font-black tabular-nums shrink-0">
                          {slottedCount}/{totalBadgeCount}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
