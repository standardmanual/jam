'use client'

import { ItemBookCard } from './ItemBookCard'
import { ItemBookTable } from './ItemBookTable'
import { useIsDesktop } from '@/lib/admin/use-is-desktop'
import type { ItemBookRow } from '@/types/database'

interface ItemBookListProps {
  itemBooks: ItemBookRow[]
  badgeMap: Map<string, string>
  factionMap: Map<string, string>
  itemBadgeCountMap: Map<string, number>
  emptyMessage: string
}

export function ItemBookList({
  itemBooks,
  badgeMap,
  factionMap,
  itemBadgeCountMap,
  emptyMessage,
}: ItemBookListProps) {
  // `hidden md:block`으로 카드 그리드와 테이블을 둘 다 마운트하면 렌더 비용이 이중으로 든다
  // (20260826_011 A4) — 실제 뷰포트에 맞는 한쪽만 마운트한다.
  const isDesktop = useIsDesktop()
  if (isDesktop === null) return null

  if (!isDesktop) {
    return (
      <div className="grid grid-cols-1 gap-3">
        {itemBooks.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/50 py-10 text-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          itemBooks.map((book) => (
            <ItemBookCard
              key={book.id}
              itemBook={book}
              requiredActivityBadgeName={
                book.required_activity_badge_id
                  ? badgeMap.get(book.required_activity_badge_id)
                  : undefined
              }
              rewardBadgeName={
                book.reward_badge_id
                  ? badgeMap.get(book.reward_badge_id)
                  : undefined
              }
              factionName={
                book.faction_id ? factionMap.get(book.faction_id) : undefined
              }
              itemBadgeCount={itemBadgeCountMap.get(book.id) ?? 0}
            />
          ))
        )}
      </div>
    )
  }

  return (
    <ItemBookTable
      itemBooks={itemBooks}
      badgeMap={badgeMap}
      factionMap={factionMap}
      itemBadgeCountMap={itemBadgeCountMap}
      emptyMessage={emptyMessage}
    />
  )
}
