'use client'

import { useState, useEffect } from 'react'
import type { HistoryEvent } from '@/app/api/inventory/items/[itemId]/history/route'

interface Props {
  itemId: string
  obtainedBy: string
}

function eventLabel(event: HistoryEvent): string {
  if (event.type === 'obtained') {
    if (event.obtained_by === 'drop') return '활동 드랍'
    if (event.obtained_by === 'drop_event') return '이벤트 드랍'
    if (event.obtained_by === 'pickup') return 'POI 픽업'
    if (event.obtained_by === 'system' || event.obtained_by === 'system_event') return '시스템 지급'
    return '획득'
  }
  if (event.type === 'dropped') return 'POI 드랍'
  if (event.type === 'picked_up') return 'POI 픽업'
  return ''
}

function eventIcon(event: HistoryEvent): string {
  if (event.type === 'obtained') {
    if (event.obtained_by === 'drop') return '🎲'
    if (event.obtained_by === 'pickup') return '📍'
    return '🎁'
  }
  if (event.type === 'dropped') return '📌'
  if (event.type === 'picked_up') return '🤝'
  return '•'
}

function formatTs(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function InventoryItemHistorySheet({ itemId, obtainedBy }: Props) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<HistoryEvent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || events !== null) return
    setLoading(true)
    setError(null)
    fetch(`/api/inventory/items/${itemId}/history`)
      .then((r) => r.json())
      .then((data) => {
        if (data.events) setEvents(data.events)
        else setError('이력을 불러올 수 없습니다.')
      })
      .catch(() => setError('이력을 불러올 수 없습니다.'))
      .finally(() => setLoading(false))
  }, [open, itemId, events])

  const obtainLabel =
    obtainedBy === 'drop' ? '활동 드랍' :
    obtainedBy === 'drop_event' ? '이벤트 드랍' :
    obtainedBy === 'pickup' ? 'POI 픽업' :
    '시스템 지급'

  return (
    <>
      {/* 획득 방법 행 */}
      <button
        onClick={() => setOpen(true)}
        className="flex justify-between items-center px-4 py-3 w-full text-left active:bg-jam-ink/5"
      >
        <span className="text-sm text-jam-ink/50 font-semibold">획득 방법</span>
        <span className="flex items-center gap-1 text-sm text-jam-ink font-bold">
          {obtainLabel}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-jam-ink/40">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ maxWidth: 430, margin: '0 auto' }}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />

          {/* Sheet */}
          <div className="relative bg-white rounded-t-3xl border-t-[3px] border-jam-ink max-h-[75vh] flex flex-col">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-jam-ink/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 border-b-[2px] border-jam-ink/10 shrink-0">
              <h2 className="text-base font-black text-jam-ink">획득 이력</h2>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-jam-ink/10"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4 text-jam-ink">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {loading && (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-jam-ink/20 border-t-jam-ink rounded-full animate-spin" />
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 text-center py-8">{error}</p>
              )}

              {events && events.length === 0 && (
                <p className="text-sm text-jam-ink/40 text-center py-8">이력이 없습니다.</p>
              )}

              {events && events.length > 0 && (
                <ol className="relative border-l-2 border-jam-ink/10 ml-3 space-y-6">
                  {events.map((ev, i) => (
                    <li key={i} className="ml-4">
                      {/* Dot */}
                      <span className="absolute -left-[1.1rem] flex items-center justify-center w-7 h-7 rounded-full bg-jam-teal border-2 border-jam-ink text-base leading-none">
                        {eventIcon(ev)}
                      </span>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-jam-ink/40 font-mono">{formatTs(ev.timestamp)}</span>
                        <p className="text-sm font-black text-jam-ink">
                          {ev.username ?? '알 수 없는 유저'} · {eventLabel(ev)}
                        </p>
                        {ev.poi_name && (
                          <p className="text-xs text-jam-ink/50 font-semibold">📍 {ev.poi_name}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Safe area padding */}
            <div className="shrink-0 pb-[env(safe-area-inset-bottom,1rem)]" />
          </div>
        </div>
      )}
    </>
  )
}
