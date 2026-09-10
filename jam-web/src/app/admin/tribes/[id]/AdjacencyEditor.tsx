'use client'

import { useState } from 'react'
import type { TribeRow } from '@/types/database'

interface AdjacencyEditorProps {
  tribeId: string
  /** 자기 자신 제외 전체 트라이브 */
  allTribes: Pick<TribeRow, 'id' | 'name'>[]
  /** 현재 인접 트라이브 id */
  initialAdjacentIds: string[]
}

/**
 * 인접 트라이브 편집 — 드랍엔진 v2 Layer 2 '인접 버킷(25%)'의 원천.
 * 원본 데이터: 아이템북 레시피.xlsx '트라이브 인접' 시트
 */
export default function AdjacencyEditor({ tribeId, allTribes, initialAdjacentIds }: AdjacencyEditorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialAdjacentIds))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/tribes/${tribeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjacent_tribe_ids: [...selected] }),
      })
      const json = await res.json()
      if (!res.ok) setMessage({ type: 'error', text: json.error ?? '저장 실패' })
      else setMessage({ type: 'ok', text: '인접 트라이브가 저장되었습니다.' })
    } catch {
      setMessage({ type: 'error', text: '네트워크 오류' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-white border border-border rounded-2xl p-6 mt-8">
      <h2 className="font-bold mb-1">인접 트라이브</h2>
      <p className="text-muted-foreground text-xs mb-4">
        드랍엔진 v2의 인접 버킷(25%) 추첨 대상. 이 트라이브에서 드랍이 이어질 때 넘어갈 수 있는 이웃을
        지정합니다.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        {allTribes.map((f) => {
          const on = selected.has(f.id)
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggle(f.id)}
              className={[
                'px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors',
                on
                  ? 'bg-primary/15 border-primary/60 text-foreground'
                  : 'bg-white border-border text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {f.name}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-white font-bold px-5 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm disabled:opacity-50"
        >
          {saving ? '저장 중…' : '인접 저장'}
        </button>
        {message && (
          <p className={`text-sm ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
