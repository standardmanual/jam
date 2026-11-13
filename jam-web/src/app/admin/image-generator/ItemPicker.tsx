'use client'

import { useState } from 'react'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Badge } from '@/components/admin/ui/badge'
import type { BookItem, BookSearchResult, ItemImageStatus } from '@/lib/admin/badgeImageGenerator/items'
import { callApi, CHECKER_STYLE } from './imageGeneratorApi'

const STATUS_LABEL: Record<ItemImageStatus, string> = {
  none: '이미지 없음',
  candidates: '후보 있음',
  applied: '적용됨',
}

interface Props {
  selectedBook: BookSearchResult | null
  items: BookItem[]
  itemsLoading: boolean
  selectedItemName: string | null
  onSelectBook: (book: BookSearchResult) => void
  onSelectItem: (itemName: string) => void
}

/** 왼쪽 칸 — 컬렉션 검색과 아이템 목록 */
export default function ItemPicker({
  selectedBook,
  items,
  itemsLoading,
  selectedItemName,
  onSelectBook,
  onSelectItem,
}: Props) {
  const [q, setQ] = useState('')
  const [books, setBooks] = useState<BookSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search() {
    setSearching(true)
    setError(null)
    try {
      const res = await callApi<{ books: BookSearchResult[] }>(
        `/api/admin/badge-image-generator/items?q=${encodeURIComponent(q)}`
      )
      setBooks(res.books)
    } catch (e) {
      setError(e instanceof Error ? e.message : '검색에 실패했어요.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="컬렉션 이름으로 검색해요" />
        <Button type="submit" disabled={searching}>
          {searching ? '검색 중' : '검색'}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {books && (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
          {books.length === 0 && <li className="p-2 text-sm text-muted-foreground">검색 결과가 없어요.</li>}
          {books.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onSelectBook(b)}
                className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${
                  selectedBook?.id === b.id ? 'bg-muted font-semibold' : ''
                }`}
              >
                {b.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedBook && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{selectedBook.name}</p>
          {itemsLoading && <p className="text-sm text-muted-foreground">아이템을 불러오는 중이에요.</p>}
          {!itemsLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">형태 묘사가 있는 아이템이 없어요.</p>
          )}
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.itemName}>
                <button
                  type="button"
                  onClick={() => onSelectItem(item.itemName)}
                  className={`flex w-full items-center gap-3 rounded-md border p-2 text-left hover:bg-muted ${
                    selectedItemName === item.itemName ? 'border-primary bg-muted' : ''
                  }`}
                >
                  <span className="size-10 shrink-0 overflow-hidden rounded border" style={CHECKER_STYLE}>
                    {item.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- 어드민 미리보기, 외부 저장소 URL
                      <img src={item.imageUrl} alt="" className="size-full object-contain" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">{item.itemName}</span>
                  <Badge variant={item.status === 'applied' ? 'default' : 'secondary'}>
                    {STATUS_LABEL[item.status]}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
