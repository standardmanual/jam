import { COMPLETION_BADGE_TYPES, computeBookCompletion, isBookCompleted } from '@/lib/itembook/completion-basis'
import { buildFilledByBook } from '@/lib/itembook/filled-by-book'
import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import SafeImage from '@/components/SafeImage'
import type { ItemBookRow, TribeRow } from '@/types/database'
import { Card } from '@ds/components/cards/Card'
import TopNav from '@/components/ui/TopNav'
import { BookIcon } from '@/components/ui/icons'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { d } from '@/lib/i18n'
import { getDisplayName } from '@/lib/utils'
import Link from 'next/link'

interface Props {
  params: Promise<{ username: string }>
}

type ItemBookWithTribe = ItemBookRow & {
  tribe: Pick<TribeRow, 'id' | 'name' | 'image_url'> | null
}

interface BookCard {
  book: ItemBookWithTribe
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

  const { data: targetRaw, error: targetError } = await service
    .from('users')
    .select('id, username, display_name')
    .eq('username', username.toLowerCase())
    .maybeSingle()
  // 20260901_1848: 조회 실패도 !targetRaw로 걸려 404(notFound)로 위장된다 — 로그로 구분
  if (targetError) console.error('[[username]/collections/page] 대상 유저(users) 조회 실패', targetError)

  if (!targetRaw) notFound()
  const target = targetRaw as { id: string; username: string; display_name: string | null }

  // 대상 유저 인벤토리 (.single()이라 무인벤토리도 error로 잡힘 — 실제 오류와 구분 불가하지만
  // 최소 가시성 확보 차원에서 우선 로깅)
  const { data: inventoryRaw, error: inventoryError } = await service
    .from('inventory')
    .select('id')
    .eq('user_id', target.id)
    .single()
  if (inventoryError) console.error('[[username]/collections/page] inventory 조회 실패(무인벤토리 포함)', inventoryError)
  const inventory = inventoryRaw as { id: string } | null

  let cards: BookCard[] = []

  if (inventory) {
    const { data: invItemsRaw, error: invItemsError } = await service
      .from('inventory_items')
      .select('badge_id, badge:badges(item_book_id, type, deleted_at)')
      .eq('inventory_id', inventory.id)
      .is('dropped_at', null)
    if (invItemsError) console.error('[[username]/collections/page] inventory_items 조회 실패', invItemsError)

    type InvItemJoin = {
      badge_id: string
      badge: { item_book_id: string | null; type: string; deleted_at: string | null } | null
    }
    const invItems = (invItemsRaw ?? []) as unknown as InvItemJoin[]

    // 20260903_2021: 소프트 삭제된 배지는 목록에서도 제외한다 — 통계 카운트
    // ([username]/page.tsx의 itemBookCount)는 이미 badges.deleted_at IS NULL을 적용 중이라
    // 이 필터가 없으면 "목록에는 뜨는데 통계 숫자에는 안 잡히는" 비대칭이 생긴다.
    const discoveredByBook = new Map<string, Set<string>>()
    for (const it of invItems) {
      const bookId = it.badge?.item_book_id
      if (!bookId || it.badge?.type !== 'item' || it.badge?.deleted_at) continue
      if (!discoveredByBook.has(bookId)) discoveredByBook.set(bookId, new Set())
      discoveredByBook.get(bookId)!.add(it.badge_id)
    }

    const bookIds = [...discoveredByBook.keys()]

    if (bookIds.length > 0) {
      // 컬렉션 노출 판정 = is_active && 노출 기간 내(마이그레이션 171, 티켓 20260914_1729).
      // 소속 아이템배지의 활성 여부와는 독립적 — 컬렉션이 비활성/기간 밖이면 컬렉션만 숨긴다.
      const now = new Date().toISOString()
      const [
        { data: booksRaw, error: booksError },
        { data: bookBadgesRaw, error: bookBadgesError },
        { data: slotsRaw, error: slotsError },
        { data: completionsRaw, error: completionsError },
      ] = await Promise.all([
        service
          .from('item_books')
          .select('*, tribe:tribes(id, name, image_url)')
          .in('id', bookIds)
          .eq('is_active', true)
          .or(`valid_from.is.null,valid_from.lte.${now}`)
          .or(`valid_until.is.null,valid_until.gte.${now}`),
        service
          .from('badges')
          .select('id, item_book_id, type, drop_excluded, name, rarity, deleted_at')
          .in('item_book_id', bookIds)
          .in('type', [...COMPLETION_BADGE_TYPES])
          .is('deleted_at', null),
        service
          .from('user_item_book_slots')
          .select('item_book_id, badge_id')
          .eq('user_id', target.id)
          .in('item_book_id', bookIds),
        service
          .from('user_item_book_completions')
          .select('item_book_id')
          .eq('user_id', target.id)
          .in('item_book_id', bookIds),
      ])
      if (booksError) console.error('[[username]/collections/page] item_books 조회 실패', booksError)
      if (bookBadgesError) console.error('[[username]/collections/page] 아이템북 소속 배지 조회 실패', bookBadgesError)
      if (slotsError) console.error('[[username]/collections/page] user_item_book_slots 조회 실패', slotsError)
      if (completionsError) console.error('[[username]/collections/page] user_item_book_completions 조회 실패', completionsError)

      const books = (booksRaw ?? []) as unknown as ItemBookWithTribe[]

      // 분모·분자 — 완성 판정 단일 모듈(티켓 20261016_2340 2회-나). 분자는 컬렉션별 집합으로 센다.
      const bookBadges = (bookBadgesRaw ?? []) as {
        id: string
        item_book_id: string | null
        type: string
        drop_excluded: boolean | null
        name: string
        rarity: string | null
        deleted_at: string | null
      }[]
      const checkinBadgesByBook = new Map<string, string[]>()
      for (const b of bookBadges) {
        if (b.type !== 'checkin' || !b.item_book_id) continue
        const list = checkinBadgesByBook.get(b.item_book_id)
        if (list) list.push(b.id)
        else checkinBadgesByBook.set(b.item_book_id, [b.id])
      }
      const checkinBadgeIds = bookBadges.filter((b) => b.type === 'checkin').map((b) => b.id)
      let earnedCheckinRows: { badge_id: string }[] = []
      if (checkinBadgeIds.length > 0) {
        const { data: earnsRaw, error: earnsError } = await service
          .from('user_checkin_badge_earns')
          .select('badge_id')
          .eq('user_id', target.id)
          .in('badge_id', checkinBadgeIds)
        if (earnsError) console.error('[[username]/collections/page] user_checkin_badge_earns 조회 실패', earnsError)
        earnedCheckinRows = (earnsRaw ?? []) as { badge_id: string }[]
      }
      const filledByBook = buildFilledByBook({
        slots: (slotsRaw ?? []) as { item_book_id: string; badge_id: string }[],
        checkinBadgesByBook,
        earnedCheckinBadgeIds: new Set(earnedCheckinRows.map((e) => e.badge_id)),
      })
      const completionByBook = computeBookCompletion(bookBadges, new Set<string>(), {
        filledByBook,
        tierModeBookIds: new Set(books.filter((b) => (b as { tier_mode?: boolean | null }).tier_mode).map((b) => b.id)),
      })

      const completedSet = new Set(
        ((completionsRaw ?? []) as { item_book_id: string }[]).map((c) => c.item_book_id)
      )

      const isOwnList = target.id === user.id

      cards = books
        .map((book) => ({
          book,
          totalBadgeCount: completionByBook.get(book.id)?.total ?? 0,
          slottedCount: completionByBook.get(book.id)?.filled ?? 0,
          isCompleted: isBookCompleted(completedSet, book.id, completionByBook.get(book.id)),
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
    <div className="flex flex-col min-h-full text-foreground">
      <TopNav title={`${d.itembooks.title} · ${getDisplayName(target)}`} backHref={`/${username}`} />

      <div className="px-4 pt-0 pb-8">
        {cards.length === 0 ? (
          <EmptyState
            icon={<BookIcon className="w-8 h-8" />}
            title={d.itembooks.emptyTitle}
            description={d.itembooks.emptyBody}
          />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {cards.map(({ book, totalBadgeCount, slottedCount, isCompleted }) => {
              const pct = totalBadgeCount > 0 ? Math.round((slottedCount / totalBadgeCount) * 100) : 0
              return (
                <Link key={book.id} href={`/collections/${book.id}`}>
                  <Card className="flex flex-col gap-2 jam-press">
                    <div className="relative w-full aspect-square rounded-2xl overflow-hidden flex items-center justify-center bg-background-secondary">
                      {/* 컬렉션 이미지는 어드민 자유 입력이 가능했던 필드라 SafeImage로 렌더한다.
                          next/image에 직접 넘기면 카드 한 장이 이 목록 화면 전체를 500으로 만든다
                          (20260824_005). 폴백은 이미지가 없을 때와 같은 BookIcon. */}
                      <SafeImage
                        src={book.image_url}
                        alt={book.name}
                        className="object-contain p-1.5"
                        sizes="50vw"
                        fallback={<BookIcon className="w-8 h-8 text-muted" />}
                      />
                      {isCompleted && (
                        <span className="absolute top-1.5 right-1.5 text-xs leading-none px-2 py-1 rounded-full bg-background text-foreground">
                          {d.itembooks.completed}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base line-clamp-2">{book.name}</h2>
                      {book.tribe && (
                        <p className="text-xs text-muted mt-0.5 truncate">{book.tribe.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <ProgressBar percent={pct} height={6} />
                      <span className="text-xs text-[color:var(--link)] font-bold tabular-nums shrink-0">{slottedCount}/{totalBadgeCount}</span>
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
