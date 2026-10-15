'use client'

import { useState, useEffect } from 'react'
import type { HistoryEvent } from '@/app/api/inventory/items/[itemId]/history/route'
import { ChevronRightIcon, PinIcon, HourglassIcon } from '@/components/ui/icons'
import BottomSheet from '@/components/ui/BottomSheet'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { useSkeletonReveal } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { formatKoreanDateTime } from '@/components/LocalDate'
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

export default function InventoryItemHistorySheet({ itemId, obtainedBy }: Props) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<HistoryEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 로딩 스피너 대신 타임라인 모양 스켈레톤 → 도착 시 cross-fade (Skeleton reveal, 14)
  const skelRef = useSkeletonReveal<HTMLDivElement>(events !== null)

  // 20260827_020: 이펙트 진입 시의 동기 `setError(null)`은 캐스케이딩 렌더를 만든다
  // (react-hooks/set-state-in-effect). 재시도 시 이전 에러를 지우는 용도였으므로 시트를 여는
  // 클릭 핸들러로 옮겼다 — 시트가 열리기 전에 초기화되므로 화면 전이는 기존과 같다.
  useEffect(() => {
    if (!open || events !== null) return
    fetch(`/api/inventory/items/${itemId}/history`)
      .then((r) => r.json())
      .then((data) => {
        // ADR 0001: 서버가 완성한 에러 메시지를 그대로 신뢰해 노출한다 (티켓 20260915_2243)
        if (data.events) setEvents(data.events)
        else setError(data.error ?? d.inventory.historyError)
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
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        className="flex justify-between items-center px-4 py-4 w-full text-left active:opacity-70 transition-opacity"
      >
        <span className="text-base text-foreground/50">{d.inventory.obtainMethod}</span>
        <span className="flex items-center gap-1 text-base">
          {obtainLabel}
          <ChevronRightIcon className="w-4 h-4 text-foreground/40" />
        </span>
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={d.inventory.historyTitle}
      >
        <div className="px-6 py-4">
          {error ? (
            <p className="text-base text-center py-8">{error}</p>
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
                  <div key={i} className="flex flex-col gap-1 mb-4">
                    <div className="h-3 w-28 rounded-lg bg-foreground/15" />
                    <div className="h-4 w-3/5 rounded-lg bg-foreground/15" />
                  </div>
                ))}
              </div>

              <div className="t-skel-content">
                {events && events.length === 0 && (
                  <EmptyState
                    icon={<HourglassIcon className="w-8 h-8" />}
                    title={d.inventory.historyEmpty}
                    description={d.inventory.historyEmptyBody}
                  />
                )}

                {events && events.length > 0 && (
                  <ol className="flex flex-col gap-4">
                    {events.map((ev, i) => (
                      <li key={i} className="flex flex-col gap-0.5">
                        <span className="text-xs text-foreground/40 font-mono">{formatKoreanDateTime(ev.timestamp, { year: true, time: true })}</span>
                        <p className="text-base">
                          {ev.username ?? d.inventory.historyUnknownUser} · {eventLabel(ev)}
                        </p>
                        {ev.poi_name && (
                          <p className="text-xs text-foreground/50 inline-flex items-center gap-1">
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
