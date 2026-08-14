'use client'

import { useState, useEffect } from 'react'
import type { HistoryEvent } from '@/app/api/inventory/items/[itemId]/history/route'
import { ChevronRightIcon, PinIcon } from '@/components/ui/icons'
import BottomSheet from '@/components/ui/BottomSheet'
import { useSkeletonReveal } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
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
  const [error, setError] = useState<string | null>(null)

  // 로딩 스피너 대신 타임라인 모양 스켈레톤 → 도착 시 cross-fade (Skeleton reveal, 14)
  const skelRef = useSkeletonReveal<HTMLDivElement>(events !== null)

  useEffect(() => {
    if (!open || events !== null) return
    setError(null)
    fetch(`/api/inventory/items/${itemId}/history`)
      .then((r) => r.json())
      .then((data) => {
        if (data.events) setEvents(data.events)
        else setError(d.inventory.historyError)
      })
      .catch(() => setError(d.inventory.historyError))
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

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={d.inventory.historyTitle}
        closeLabel={d.common.close}
      >
        <div className="px-[var(--spacing-24)] py-[var(--spacing-16)]">
          {error ? (
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center py-[var(--spacing-32)]">{error}</p>
          ) : (
            <div
              ref={skelRef}
              className="t-skel"
              /* 두 레이어가 absolute로 겹치는 동안에는 래퍼가 높이를 갖지 못하므로
                 스켈레톤 높이만큼 자리를 잡아둔다. `.is-settled`에서 해제된다. */
              style={{ ['--skel-min-h' as string]: '150px' }}
            >
              <div className="t-skel-skeleton is-pulsing" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col gap-1 mb-[var(--spacing-16)]">
                    <div className="h-3 w-28 rounded-[var(--radius-inputs)] bg-text-inverse/15" />
                    <div className="h-4 w-3/5 rounded-[var(--radius-inputs)] bg-text-inverse/15" />
                  </div>
                ))}
              </div>

              <div className="t-skel-content">
                {events && events.length === 0 && (
                  <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/40 text-center py-[var(--spacing-32)]">{d.inventory.historyEmpty}</p>
                )}

                {events && events.length > 0 && (
                  <ol className="flex flex-col gap-[var(--spacing-16)]">
                    {events.map((ev, i) => (
                      <li key={i} className="flex flex-col gap-0.5">
                        <span className="text-[length:var(--text-caption)] text-text-inverse/40 font-mono">{formatTs(ev.timestamp)}</span>
                        <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
                          {ev.username ?? d.inventory.historyUnknownUser} · {eventLabel(ev)}
                        </p>
                        {ev.poi_name && (
                          <p className="text-[length:var(--text-caption)] text-text-inverse/50 inline-flex items-center gap-1">
                            <PinIcon className="w-3 h-3" />{ev.poi_name}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  )
}
