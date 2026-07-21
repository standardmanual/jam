'use client'

import { useState } from 'react'
import type { FactionRow } from '@/types/database'

interface AdjacencyEditorProps {
  factionId: string
  /** 자기 자신 제외 전체 세계관 */
  allFactions: Pick<FactionRow, 'id' | 'name'>[]
  /** 현재 인접 세계관 id */
  initialAdjacentIds: string[]
}

/**
 * 인접 세계관 편집 — 드랍엔진 v2 Layer 2 '인접 버킷(25%)'의 원천.
 * 원본 데이터: 아이템북 레시피.xlsx '세계관 인접' 시트
 */
export default function AdjacencyEditor({ factionId, allFactions, initialAdjacentIds }: AdjacencyEditorProps) {
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
      const res = await fetch(`/api/admin/factions/${factionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjacent_faction_ids: [...selected] }),
      })
      const json = await res.json()
      if (!res.ok) setMessage({ type: 'error', text: json.error ?? '저장 실패' })
      else setMessage({ type: 'ok', text: '인접 세계관이 저장되었습니다.' })
    } catch {
      setMessage({ type: 'error', text: '네트워크 오류' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-white/5 border border-white/10 rounded-2xl p-6 mt-8">
      <h2 className="font-bold mb-1">인접 세계관</h2>
      <p className="text-white/40 text-xs mb-4">
        드랍엔진 v2의 인접 버킷(25%) 추첨 대상. 이 세계관에서 드랍이 이어질 때 넘어갈 수 있는 이웃을
        지정합니다.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        {allFactions.map((f) => {
          const on = selected.has(f.id)
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggle(f.id)}
              className={[
                'px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors',
                on
                  ? 'bg-[#AEEA00]/15 border-[#AEEA00]/60 text-[#AEEA00]'
                  : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80',
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
          className="bg-[#AEEA00] text-black font-bold px-5 py-2 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm disabled:opacity-50"
        >
          {saving ? '저장 중…' : '인접 저장'}
        </button>
        {message && (
          <p className={`text-sm ${message.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
