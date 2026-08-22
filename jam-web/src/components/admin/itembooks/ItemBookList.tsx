'use client'

import { useMemo, useState } from 'react'
import { ItemBookCard } from './ItemBookCard'
import { ItemBookTable } from './ItemBookTable'
import type { ItemBookRow } from '@/types/database'

interface ItemBookListProps {
  itemBooks: ItemBookRow[]
  badgeMap: Map<string, string>
  factionMap: Map<string, string>
  itemBadgeCountMap: Map<string, number>
}

type SortOrder = 'default' | 'name-asc' | 'name-desc'

export function ItemBookList({
  itemBooks,
  badgeMap,
  factionMap,
  itemBadgeCountMap,
}: ItemBookListProps) {
  const [selectedFactionId, setSelectedFactionId] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('default')

  const isFiltered = selectedFactionId !== 'all'

  const filteredItemBooks = useMemo(() => {
    const filtered =
      selectedFactionId === 'all'
        ? itemBooks
        : itemBooks.filter((book) => book.faction_id === selectedFactionId)

    if (sortOrder === 'default') return filtered

    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    return sortOrder === 'name-desc' ? sorted.reverse() : sorted
  }, [itemBooks, selectedFactionId, sortOrder])

  const emptyMessage = isFiltered
    ? '조건에 맞는 컬렉션이 없습니다.'
    : '등록된 컬렉션이 없습니다.'

  return (
    <>
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedFactionId}
          onChange={(e) => setSelectedFactionId(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-foreground/50"
          aria-label="세계관 필터"
        >
          <option value="all">전체 세계관</option>
          {Array.from(factionMap.entries()).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-foreground/50"
          aria-label="이름 정렬"
        >
          <option value="default">최근 등록순</option>
          <option value="name-asc">이름 ↑ (오름차순)</option>
          <option value="name-desc">이름 ↓ (내림차순)</option>
        </select>
      </div>

      {/* 모바일: 카드 그리드 */}
      <div className="block md:hidden space-y-3">
        <div className="grid grid-cols-1 gap-3">
          {filteredItemBooks.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/50 py-10 text-center">
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            filteredItemBooks.map((book) => (
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
          itemBooks={filteredItemBooks}
          badgeMap={badgeMap}
          factionMap={factionMap}
          itemBadgeCountMap={itemBadgeCountMap}
          emptyMessage={emptyMessage}
        />
      </div>
    </>
  )
}
