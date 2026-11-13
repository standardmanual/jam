'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import type { BookItem, BookItemsResult, BookSearchResult } from '@/lib/admin/badgeImageGenerator/items'
import { callApi, type Preset } from './imageGeneratorApi'
import ItemPicker from './ItemPicker'
import ItemWorkbench from './ItemWorkbench'
import PresetManager from './PresetManager'

const API = '/api/admin/badge-image-generator'

/** 어드민 디자인 > 이미지 생성 — 좌우 레이아웃과 상태 관리 (티켓 20261113_1132) */
export default function ImageGeneratorPanel() {
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetsReady, setPresetsReady] = useState(false)
  const [book, setBook] = useState<BookSearchResult | null>(null)
  const [items, setItems] = useState<BookItem[]>([])
  const [lastPresetId, setLastPresetId] = useState<string | null>(null)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemName, setItemName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [presetOpen, setPresetOpen] = useState(false)

  const loadPresets = useCallback(async () => {
    try {
      const res = await callApi<{ presets: Preset[] }>(`${API}/presets`)
      setPresets(res.presets)
    } catch (e) {
      setError(e instanceof Error ? e.message : '프리셋을 불러오지 못했어요.')
    } finally {
      setPresetsReady(true)
    }
  }, [])

  useEffect(() => {
    // 마운트 시 한 번 불러오는 비동기 호출 — 상태 갱신은 응답 뒤에 일어난다
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 사유: 초기 데이터 로딩
    void loadPresets()
  }, [loadPresets])

  const loadItems = useCallback(async (bookId: string) => {
    try {
      const res = await callApi<BookItemsResult>(`${API}/items?bookId=${encodeURIComponent(bookId)}`)
      setItems(res.items)
      setLastPresetId(res.lastPresetId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '아이템을 불러오지 못했어요.')
    }
  }, [])

  async function selectBook(b: BookSearchResult) {
    setBook(b)
    setItemName(null)
    setItems([])
    setError(null)
    setItemsLoading(true)
    await loadItems(b.id)
    setItemsLoading(false)
  }

  const reloadItems = useCallback(async () => {
    if (book) await loadItems(book.id)
  }, [book, loadItems])

  const selectedItem = items.find((i) => i.itemName === itemName) ?? null

  return (
    <div className="w-full space-y-6 p-4 break-keep wrap-break-word md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-balance md:text-3xl">이미지 생성</h1>
        <Button variant="outline" onClick={() => setPresetOpen(true)}>
          프리셋 관리
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>컬렉션과 아이템</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemPicker
              selectedBook={book}
              items={items}
              itemsLoading={itemsLoading}
              selectedItemName={itemName}
              onSelectBook={selectBook}
              onSelectItem={setItemName}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>선택한 아이템</CardTitle>
          </CardHeader>
          <CardContent>
            {book && selectedItem && presetsReady ? (
              <ItemWorkbench
                key={`${book.id}:${selectedItem.itemName}`}
                bookId={book.id}
                item={selectedItem}
                presets={presets}
                defaultPresetId={lastPresetId}
                onChanged={reloadItems}
              />
            ) : (
              <p className="text-sm text-muted-foreground">왼쪽에서 컬렉션과 아이템을 골라 주세요.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <PresetManager open={presetOpen} onOpenChange={setPresetOpen} presets={presets} onChanged={loadPresets} />
    </div>
  )
}
