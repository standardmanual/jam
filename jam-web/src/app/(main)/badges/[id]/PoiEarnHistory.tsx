'use client'

import { useState } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import ListRowCard from '@/components/ui/ListRowCard'
import { Card } from '@ds/components/cards/Card'
import { LabelChip } from '@ds/components/cards/LabelChip'
import StravaLink from '@/components/StravaLink'
import LocalDate from '@/components/LocalDate'
import { ChevronRightIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'

export type PoiEarnItem = {
  id: string
  earned_at: string
  triggered_by_activity_name: string | null
  triggered_by_distance_km: number | null
  triggered_by_activity_date: string | null
  triggered_by_strava_id: number | null
}

function EarnCardContent({ e, isFirstEver = false }: { e: PoiEarnItem; isFirstEver?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {isFirstEver && <LabelChip className="self-start break-keep wrap-break-word whitespace-nowrap">{d.badges.firstEarnedChip}</LabelChip>}
      <div className="flex justify-between items-center">
        <span className="text-[14px] text-[var(--muted)]">{d.badges.earnedAt}</span>
        <span className="text-[14px] text-foreground">
          <LocalDate iso={e.earned_at} korean={{ year: true, time: true }} />
        </span>
      </div>
      {e.triggered_by_activity_name && (
        <div className="flex justify-between items-center">
          <span className="text-[14px] text-[var(--muted)]">{d.badges.triggerActivity}</span>
          <span className="text-[14px] text-foreground truncate max-w-[180px] text-right">{e.triggered_by_activity_name}</span>
        </div>
      )}
      {e.triggered_by_distance_km && (
        <div className="flex justify-between items-center">
          <span className="text-[14px] text-[var(--muted)]">{d.badges.triggerDistance}</span>
          <span className="text-[14px] text-foreground">{t(d.badges.triggerDistanceValue, { km: e.triggered_by_distance_km })}</span>
        </div>
      )}
      {e.triggered_by_activity_date && (
        <div className="flex justify-between items-center">
          <span className="text-[14px] text-[var(--muted)]">{d.badges.triggerDate}</span>
          <span className="text-[14px] text-foreground">
            <LocalDate iso={e.triggered_by_activity_date} options={{ year: 'numeric', month: 'long', day: 'numeric' }} />
          </span>
        </div>
      )}
      {e.triggered_by_strava_id && (
        <div className="mt-1">
          <StravaLink stravaId={e.triggered_by_strava_id} />
        </div>
      )}
    </div>
  )
}

/**
 * 체크인 배지 상세의 «방문 기록». `poiEarns`는 최신순이라 마지막 행이 처음 받은 날이다.
 * 행이 하나뿐이면 그 한 행이 처음 받은 날이다.
 */
export default function PoiEarnHistory({ poiEarns }: { poiEarns: PoiEarnItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  if (poiEarns.length === 0) return null

  const [first, ...rest] = poiEarns
  const firstEverId = poiEarns[poiEarns.length - 1].id

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-bold text-foreground break-keep wrap-break-word text-balance">{d.badges.visitHistoryTitle}</p>
        <span className="text-[13px] text-[var(--muted)]">{t(d.badges.earnHistoryCount, { count: poiEarns.length })}</span>
      </div>

      {/* 최신(첫 번째) 기록 — 카드 형식 */}
      <Card>
        <EarnCardContent e={first} isFirstEver={first.id === firstEverId} />
      </Card>

      {/* 2번째부터 — ListRowCard (이미지 없음) */}
      {rest.map((e, i) => (
        <ListRowCard
          key={e.id}
          onClick={() => setOpenIdx(i + 1)}
          trailing={<ChevronRightIcon className="w-4 h-4 text-[var(--muted)]" />}
        >
          <div className="flex flex-col items-start gap-2">
            {e.id === firstEverId && <LabelChip className="break-keep wrap-break-word whitespace-nowrap">{d.badges.firstEarnedChip}</LabelChip>}
            <p className="text-base text-foreground">
              <LocalDate iso={e.earned_at} korean={{ year: true, time: true }} />
            </p>
          </div>
        </ListRowCard>
      ))}

      {/* 기록 상세 바텀시트 */}
      <BottomSheet open={openIdx !== null} onClose={() => setOpenIdx(null)}>
        <div className="px-6 pt-2 pb-8">
          {openIdx !== null && (
            <EarnCardContent e={poiEarns[openIdx]} isFirstEver={poiEarns[openIdx].id === firstEverId} />
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
