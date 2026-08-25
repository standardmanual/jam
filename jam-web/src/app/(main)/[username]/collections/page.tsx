import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import SafeImage from '@/components/SafeImage'
import type { ItemBookRow, FactionRow } from '@/types/database'
import { Card } from '@ds/components/cards/Card'
import TopNav from '@/components/ui/TopNav'
import { BookIcon } from '@/components/ui/icons'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { d } from '@/lib/i18n'
import Link from 'next/link'

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

  const { data: targetRaw } = await service
    .from('users')
    .select('id, username')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  if (!targetRaw) notFound()
  const target = targetRaw as { id: string; username: string }

  // 대상 유저 인벤토리
  const { data: inventoryRaw } = await service
    .from('inventory')
    .select('id')
    .eq('user_id', target.id)
    .single()
  const inventory = inventoryRaw as { id: string } | null

  let cards: BookCard[] = []

  if (inventory) {
    const { data: invItemsRaw } = await service
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
      ] = await Promise.all([
        service
          .from('item_books')
          .select('*, faction:factions(id, name, image_url)')
          .in('id', bookIds)
          .eq('is_active', true),
        service
          .from('badges')
          .select('id, item_book_id')
          .in('item_book_id', bookIds)
          .eq('type', 'item')
          .is('deleted_at', null),
        service
          .from('user_item_book_slots')
          .select('item_book_id')
          .eq('user_id', target.id)
          .in('item_book_id', bookIds),
        service
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

      const isOwnList = target.id === user.id

      cards = books
        .map((book) => ({
          book,
          totalBadgeCount: totalByBook.get(book.id) ?? 0,
          slottedCount: slottedByBook.get(book.id) ?? 0,
          isCompleted: completedSet.has(book.id),
        }))
        // 타인이 볼 때는 아이템배지 슬롯이 0개인 컬렉션을 숨긴다(20260824_016).
        // 본인 열람(isOwnList)은 예외 없이 항상 노출.
        .filter((card) => isOwnList || card.slottedCount > 0)
        .sort((a, b) => {
          if (a.isCompleted !== b.isCompleted) return a.isCompleted ? -1 : 1
          return b.slottedCount - a.slottedCount
        })
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-surface text-text">
      <TopNav title={`${d.itembooks.title} · ${target.username}`} backHref={`/${username}`} />

      <div className="px-[var(--spacing-16)] pt-0 pb-[var(--spacing-32)]">
        {cards.length === 0 ? (
          <EmptyState
            icon={<BookIcon className="w-8 h-8" />}
            title={d.itembooks.emptyTitle}
            description={d.itembooks.emptyBody}
          />
        ) : (
          <div className="grid grid-cols-2 gap-[var(--spacing-16)]">
            {cards.map(({ book, totalBadgeCount, slottedCount, isCompleted }) => {
              const pct = totalBadgeCount > 0 ? Math.round((slottedCount / totalBadgeCount) * 100) : 0
              return (
                <Link key={book.id} href={`/collections/${book.id}`}>
                  <Card tone="inverse" className="flex flex-col gap-[var(--spacing-8)] active:scale-[0.98] transition-transform duration-100">
                    <div className="relative w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center bg-black/[0.04]">
                      {/* 컬렉션 이미지는 어드민 자유 입력이 가능했던 필드라 SafeImage로 렌더한다.
                          next/image에 직접 넘기면 카드 한 장이 이 목록 화면 전체를 500으로 만든다
                          (20260824_005). 폴백은 이미지가 없을 때와 같은 BookIcon. */}
                      <SafeImage
                        src={book.image_url}
                        alt={book.name}
                        className="object-contain p-1.5"
                        sizes="50vw"
                        fallback={<BookIcon className="w-8 h-8 text-text-inverse/40" />}
                      />
                      {isCompleted && (
                        <span className="absolute top-1.5 right-1.5 text-[length:var(--text-caption)] leading-none px-2 py-1 rounded-[var(--radius-tags)] bg-surface text-text">
                          {d.itembooks.completed}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] line-clamp-2">{book.name}</h2>
                      {book.faction && (
                        <p className="text-[length:var(--text-caption)] text-text-inverse/50 mt-0.5 truncate">{book.faction.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <ProgressBar percent={pct} height={6} />
                      <span className="text-[length:var(--text-caption)] text-[color:var(--color-primary)] font-bold tabular-nums shrink-0">{slottedCount}/{totalBadgeCount}</span>
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
