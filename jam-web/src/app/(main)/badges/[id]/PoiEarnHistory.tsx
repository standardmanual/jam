'use client'

import { useState } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import ListRowCard from '@/components/ui/ListRowCard'
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

function EarnCardContent({ e }: { e: PoiEarnItem }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <span className="text-[14px] text-[var(--color-text-secondary)]">{d.badges.earnedAt}</span>
        <span className="text-[14px] text-text">
          <LocalDate iso={e.earned_at} options={{ year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }} />
        </span>
      </div>
      {e.triggered_by_activity_name && (
        <div className="flex justify-between items-center">
          <span className="text-[14px] text-[var(--color-text-secondary)]">{d.badges.triggerActivity}</span>
          <span className="text-[14px] text-text truncate max-w-[180px] text-right">{e.triggered_by_activity_name}</span>
        </div>
      )}
      {e.triggered_by_distance_km && (
        <div className="flex justify-between items-center">
          <span className="text-[14px] text-[var(--color-text-secondary)]">{d.badges.triggerDistance}</span>
          <span className="text-[14px] text-text">{t(d.badges.triggerDistanceValue, { km: e.triggered_by_distance_km })}</span>
        </div>
      )}
      {e.triggered_by_activity_date && (
        <div className="flex justify-between items-center">
          <span className="text-[14px] text-[var(--color-text-secondary)]">{d.badges.triggerDate}</span>
          <span className="text-[14px] text-text">
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

export default function PoiEarnHistory({ poiEarns }: { poiEarns: PoiEarnItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  if (poiEarns.length === 0) return null

  const [first, ...rest] = poiEarns

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-bold text-text">{d.badges.earnHistoryTitle}</p>
        <span className="text-[13px] text-[var(--color-text-secondary)]">{t(d.badges.earnHistoryCount, { count: poiEarns.length })}</span>
      </div>

      {/* 최신(첫 번째) 이력 — 카드 형식 */}
      <div className="bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_var(--color-border)] rounded-[var(--radius-cards)] p-6">
        <EarnCardContent e={first} />
      </div>

      {/* 2번째부터 — ListRowCard (이미지 없음) */}
      {rest.map((e, i) => (
        <ListRowCard
          key={e.id}
          onClick={() => setOpenIdx(i + 1)}
          trailing={<ChevronRightIcon className="w-4 h-4 text-[var(--color-text-secondary)]" />}
        >
          <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text">
            <LocalDate iso={e.earned_at} options={{ year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }} />
          </p>
        </ListRowCard>
      ))}

      {/* 이력 상세 바텀시트 */}
      <BottomSheet open={openIdx !== null} onClose={() => setOpenIdx(null)}>
        <div className="px-6 pt-2 pb-8">
          {openIdx !== null && <EarnCardContent e={poiEarns[openIdx]} />}
        </div>
      </BottomSheet>
    </div>
  )
}
