'use client'

import { ItemBookCard } from './ItemBookCard'
import { ItemBookTable } from './ItemBookTable'
import type { ItemBookRow } from '@/types/database'

interface ItemBookListProps {
  itemBooks: ItemBookRow[]
  badgeMap: Map<string, string>
  factionMap: Map<string, string>
  itemBadgeCountMap: Map<string, number>
}

export function ItemBookList({
  itemBooks,
  badgeMap,
  factionMap,
  itemBadgeCountMap,
}: ItemBookListProps) {
  return (
    <>
      {/* 모바일: 카드 그리드 */}
      <div className="block md:hidden space-y-3">
        <div className="grid grid-cols-1 gap-3">
          {itemBooks.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/50 py-10 text-center">
              <p className="text-sm text-muted-foreground">등록된 아이템북이 없습니다.</p>
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
      </div>

      {/* 데스크톱: 테이블 */}
      <div className="hidden md:block">
        <ItemBookTable
          itemBooks={itemBooks}
          badgeMap={badgeMap}
          factionMap={factionMap}
          itemBadgeCountMap={itemBadgeCountMap}
        />
      </div>
    </>
  )
}
