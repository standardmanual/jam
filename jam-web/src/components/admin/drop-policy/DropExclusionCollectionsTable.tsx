'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/admin/ui/card'
import { Switch } from '@/components/admin/ui/switch'
import { Badge } from '@/components/admin/ui/badge'
import type { ItemBookRow } from '@/types/database'

type CollectionRow = Pick<ItemBookRow, 'id' | 'name' | 'tribe_id' | 'drop_excluded'>

interface DropExclusionCollectionsTableProps {
  collections: CollectionRow[]
}

/**
 * 컬렉션 단위 "이 컬렉션 전체 드랍 제외" 토글(티켓 20260911_2220). 배지 다중선택
 * 일괄 액션(`DropExclusionBadgesTable`)과는 별개의 액션 — 토글 하나로
 * `item_books.drop_excluded`만 바꾼다. 소속 배지 각각의 `drop_excluded` 값은 건드리지 않는다.
 */
export function DropExclusionCollectionsTable({ collections }: DropExclusionCollectionsTableProps) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const toggle = async (id: string, nextExcluded: boolean) => {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/admin/itembooks/${id}/drop-exclude`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drop_excluded: nextExcluded }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? '상태 변경에 실패했습니다. 다시 시도해주세요.')
        return
      }
      router.refresh()
    } finally {
      setLoadingId(null)
    }
  }

  if (collections.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">조건에 맞는 컬렉션이 없습니다.</div>
  }

  return (
    <Card className="divide-y divide-neutral-200">
      {collections.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate">{c.name}</span>
            {c.drop_excluded && (
              <Badge variant="destructive" className="shrink-0">
                드랍 제외됨
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">전체 드랍 제외</span>
            <Switch
              checked={c.drop_excluded}
              disabled={loadingId === c.id}
              onCheckedChange={(checked) => toggle(c.id, checked)}
              aria-label={`${c.name} 컬렉션 전체 드랍 제외`}
            />
          </div>
        </div>
      ))}
    </Card>
  )
}
