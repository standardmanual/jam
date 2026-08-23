'use client'

import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ItemBookActiveToggleButton } from './ItemBookActiveToggleButton'
import type { ItemBookRow } from '@/types/database'

interface ItemBookTableProps {
  itemBooks: ItemBookRow[]
  badgeMap: Map<string, string>
  factionMap: Map<string, string>
  itemBadgeCountMap: Map<string, number>
  emptyMessage?: string
}

export function ItemBookTable({
  itemBooks,
  badgeMap,
  factionMap,
  itemBadgeCountMap,
  emptyMessage = '등록된 컬렉션이 없습니다.',
}: ItemBookTableProps) {
  if (itemBooks.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 py-10 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">이름</TableHead>
            <TableHead className="font-semibold">세계관</TableHead>
            <TableHead className="font-semibold">필수 액티비티 배지</TableHead>
            <TableHead className="font-semibold">아이템 배지 수</TableHead>
            <TableHead className="font-semibold">보상 배지</TableHead>
            <TableHead className="font-semibold text-right">관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itemBooks.map((book) => (
            <TableRow
              key={book.id}
              className="hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <TableCell>
                <Link
                  href={`/admin/itembooks/${book.id}`}
                  className="font-medium hover:underline"
                >
                  {book.name}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {book.faction_id ? factionMap.get(book.faction_id) ?? '—' : '—'}
              </TableCell>
              <TableCell className="text-sm">
                {book.required_activity_badge_id
                  ? badgeMap.get(book.required_activity_badge_id) ?? '—'
                  : '—'}
              </TableCell>
              <TableCell className="text-sm">
                {itemBadgeCountMap.get(book.id) ?? 0}개
              </TableCell>
              <TableCell className="text-sm">
                {book.reward_badge_id
                  ? badgeMap.get(book.reward_badge_id) ?? '—'
                  : '—'}
              </TableCell>
              <TableCell className="text-right">
                <ItemBookActiveToggleButton itemBookId={book.id} isActive={book.is_active} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
