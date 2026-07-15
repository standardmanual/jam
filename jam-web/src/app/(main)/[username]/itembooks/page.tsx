import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { ItemBookRow, FactionRow } from '@/types/database'

interface Props {
  params: Promise<{ username: string }>
}

type ItemBookWithFaction = ItemBookRow & {
  faction: Pick<FactionRow, 'id' | 'name' | 'image_url'> | null
}

interface BookCard {
  book: ItemBookWithFaction
  totalBadgeCount: number
  slottedCount: number
  isCompleted: boolean
}

export default async function UserItemBooksPage({ params }: Props) {
  const { username } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetRaw } = await (service as any)
    .from('users')
    .select('id, username')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  if (!targetRaw) notFound()
  const target = targetRaw as { id: string; username: string }

  // 대상 유저 인벤토리
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inventoryRaw } = await (service as any)
    .from('inventory')
    .select('id')
    .eq('user_id', target.id)
    .single()
  const inventory = inventoryRaw as { id: string } | null

  let cards: BookCard[] = []

  if (inventory) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invItemsRaw } = await (service as any)
      .from('inventory_items')
      .select('badge_id, badge:badges(item_book_id, type)')
      .eq('inventory_id', inventory.id)
      .is('dropped_at', null)

    type InvItemJoin = {
      badge_id: string
      badge: { item_book_id: string | null; type: string } | null
    }
    const invItems = (invItemsRaw ?? []) as unknown as InvItemJoin[]

    const discoveredByBook = new Map<string, Set<string>>()
    for (const it of invItems) {
      const bookId = it.badge?.item_book_id
      if (!bookId || it.badge?.type !== 'item') continue
      if (!discoveredByBook.has(bookId)) discoveredByBook.set(bookId, new Set())
      discoveredByBook.get(bookId)!.add(it.badge_id)
    }

    const bookIds = [...discoveredByBook.keys()]

    if (bookIds.length > 0) {
      const [
        { data: booksRaw },
        { data: bookBadgesRaw },
        { data: slotsRaw },
        { data: completionsRaw },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (service as any)
          .from('item_books')
          .select('*, faction:factions(id, name, image_url)')
          .in('id', bookIds)
          .eq('is_active', true),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (service as any)
          .from('badges')
          .select('id, item_book_id')
          .in('item_book_id', bookIds)
          .eq('type', 'item'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (service as any)
          .from('user_item_book_slots')
          .select('item_book_id')
          .eq('user_id', target.id)
          .in('item_book_id', bookIds),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (service as any)
          .from('user_item_book_completions')
          .select('item_book_id')
          .eq('user_id', target.id)
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
          slottedCount: slottedByBook.get(book.id) ?? 0,
          isCompleted: completedSet.has(book.id),
        }))
        .sort((a, b) => {
          if (a.isCompleted !== b.isCompleted) return a.isCompleted ? -1 : 1
          return b.slottedCount - a.slottedCount
        })
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-jam-teal">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-5 max-w-2xl mx-auto w-full">
        <Link href={`/${username}`} className="text-jam-ink/50 text-sm font-bold mb-1 inline-block">
          ← {target.username}
        </Link>
        <h1 className="text-4xl font-black text-jam-ink leading-tight">아이템북</h1>
        <p className="mt-2 text-jam-ink/60 text-sm font-semibold leading-relaxed">
          {target.username}님이 발견한 아이템북
        </p>
      </div>

      <div className="flex-1 bg-jam-cream rounded-t-[2rem] border-t-[3px] border-jam-ink px-5 py-6">
        <div className="max-w-2xl mx-auto w-full">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="text-5xl mb-4">📕</span>
              <p className="text-jam-ink/70 font-bold">아직 발견한 아이템북이 없어요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {cards.map(({ book, totalBadgeCount, slottedCount, isCompleted }) => {
                const pct = totalBadgeCount > 0
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
                    <div className="mt-auto">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-jam-ink/10 overflow-hidden border border-jam-ink/20">
                          <div
                            className={`h-full rounded-full transition-all ${isCompleted ? 'bg-jam-ink' : 'bg-jam-teal'}`}
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
