'use client'

import { useState, useEffect } from 'react'
import type { HistoryEvent } from '@/app/api/inventory/items/[itemId]/history/route'
import { ChevronRightIcon, CloseIcon, PinIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

interface Props {
  itemId: string
  obtainedBy: string
}

function eventLabel(event: HistoryEvent): string {
  if (event.type === 'obtained') {
    if (event.obtained_by === 'drop') return d.inventory.obtainByDrop
    if (event.obtained_by === 'drop_event') return d.inventory.obtainByDropEvent
    if (event.obtained_by === 'pickup') return d.inventory.obtainByPickup
    if (event.obtained_by === 'system' || event.obtained_by === 'system_event') return d.inventory.obtainBySystem
    return d.inventory.obtainBySystem
  }
  if (event.type === 'dropped') return d.inventory.eventDropped
  if (event.type === 'picked_up') return d.inventory.eventPickedUp
  return ''
}

function formatTs(iso: string): string {
  const dt = new Date(iso)
  return dt.toLocaleString('ko-KR', {
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
        else setError(d.inventory.historyError)
      })
      .catch(() => setError(d.inventory.historyError))
      .finally(() => setLoading(false))
  }, [open, itemId, events])

  const obtainLabel =
    obtainedBy === 'drop' ? d.inventory.obtainByDrop :
    obtainedBy === 'drop_event' ? d.inventory.obtainByDropEvent :
    obtainedBy === 'pickup' ? d.inventory.obtainByPickup :
    d.inventory.obtainBySystem

  return (
    <>
      {/* 획득 방법 행 */}
      <button
        onClick={() => setOpen(true)}
        className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)] w-full text-left shadow-[inset_0_-1px_0_0_var(--color-border-inverse)] active:opacity-70 transition-opacity"
      >
        <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50">{d.inventory.obtainMethod}</span>
        <span className="flex items-center gap-1 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
          {obtainLabel}
          <ChevronRightIcon className="w-4 h-4 text-text-inverse/40" />
        </span>
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ maxWidth: 430, margin: '0 auto' }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-surface/60" onClick={() => setOpen(false)} />

          {/* Sheet */}
          <div className="relative bg-surface-inverse text-text-inverse rounded-t-[var(--radius-cards)] max-h-[75vh] flex flex-col">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full shadow-[inset_0_0_0_1px_var(--color-border-inverse)]" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-[var(--spacing-24)] pb-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)] shrink-0">
              <h2 className="text-[length:var(--text-body)] leading-[var(--leading-body)]">{d.inventory.historyTitle}</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label={d.common.close}
                className="w-11 h-11 -mr-2 flex items-center justify-center text-text-inverse/60 active:scale-90 transition-transform duration-100"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 px-[var(--spacing-24)] py-[var(--spacing-16)]">
              {loading && (
                <div className="flex justify-center py-[var(--spacing-32)]">
                  <div className="w-5 h-5 border border-current border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {error && (
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center py-[var(--spacing-32)]">{error}</p>
              )}

              {events && events.length === 0 && (
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/40 text-center py-[var(--spacing-32)]">{d.inventory.historyEmpty}</p>
              )}

              {events && events.length > 0 && (
                <ol className="flex flex-col gap-[var(--spacing-16)]">
                  {events.map((ev, i) => (
                    <li key={i} className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-text-inverse/40 font-mono">{formatTs(ev.timestamp)}</span>
                      <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
                        {ev.username ?? d.inventory.historyUnknownUser} · {eventLabel(ev)}
                      </p>
                      {ev.poi_name && (
                        <p className="text-[11px] text-text-inverse/50 inline-flex items-center gap-1">
                          <PinIcon className="w-3 h-3" />{ev.poi_name}
                        </p>
                      )}
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
