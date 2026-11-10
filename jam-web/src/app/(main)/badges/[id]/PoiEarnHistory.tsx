'use client'

import { useState, type ReactNode } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import { SHEET_VALUE_ROW_STYLE } from '@/components/ui/sheetClasses'
import { ListRow, ListRowChip } from '@/components/ui/ListRow'
import { Card } from '@ds/components/cards/Card'
import { LabelChip } from '@ds/components/cards/LabelChip'
import StravaLink from '@/components/StravaLink'
import LocalDate from '@/components/LocalDate'
import { d, t } from '@/lib/i18n'

export type PoiEarnItem = {
  id: string
  earned_at: string
  triggered_by_activity_name: string | null
  triggered_by_distance_km: number | null
  triggered_by_activity_date: string | null
  triggered_by_strava_id: number | null
}

/**
 * 한 번의 획득 내용 — 페이지의 첫 카드와 시트가 같이 쓴다. `inSheet`이면 값 행의 위아래를 8px로 줄이고 행 사이에 가는 선을 긋는다
 * (캔버스 «JAM! 바텀시트» 10번, 티켓 20261110_2150). 카드 안(`inSheet` 없음)은 지금대로다.
 */
function EarnCardContent({ e, isFirstEver = false, inSheet = false }: { e: PoiEarnItem; isFirstEver?: boolean; inSheet?: boolean }) {
  const rows: { key: string; title: ReactNode; value: ReactNode; nowrap?: boolean }[] = [
    { key: 'earned', title: d.badges.earnedAt, value: <LocalDate iso={e.earned_at} stamp stampBreak />, nowrap: true },
    ...(e.triggered_by_activity_name ? [{ key: 'activity', title: d.badges.triggerActivity, value: e.triggered_by_activity_name }] : []),
    ...(e.triggered_by_distance_km
      ? [{ key: 'distance', title: d.badges.triggerDistance, value: t(d.badges.triggerDistanceValue, { km: e.triggered_by_distance_km }) }]
      : []),
    ...(e.triggered_by_activity_date
      ? [{ key: 'date', title: d.badges.triggerDate, value: <LocalDate iso={e.triggered_by_activity_date} stamp stampBreak />, nowrap: true }]
      : []),
  ]
  return (
    <div className="flex flex-col">
      {isFirstEver && <LabelChip className="self-start break-keep wrap-break-word whitespace-nowrap">{d.badges.firstEarnedChip}</LabelChip>}
      <div className={inSheet ? 'flex flex-col' : 'flex flex-col -mb-3'}>
        {rows.map((row, i) => (
          <ListRow
            key={row.key}
            tone="flat"
            titleVariant="label"
            titleLines={0}
            title={row.title}
            value={row.value}
            valueNoWrap={row.nowrap}
            separator={inSheet && i < rows.length - 1}
            style={inSheet ? SHEET_VALUE_ROW_STYLE : undefined}
          />
        ))}
      </div>
      {e.triggered_by_strava_id && (
        <div className="mt-4">
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
  const firstEverId = poiEarns[poiEarns.length - 1].id

  return (
    <div className="flex flex-col gap-3">
      {/* 제목만 둔다 — 오른쪽의 «총 N회»는 걷었다(2026-11-09 사용자 지시, 횟수는 히어로 카드의 방문 횟수 칩이 말한다) */}
      <p className="text-[15px] font-bold text-foreground break-keep wrap-break-word text-balance">{d.badges.visitHistoryTitle}</p>

      {/* 최신(첫 번째) 기록 — 카드 형식 */}
      <Card>
        <EarnCardContent e={first} isFirstEver={first.id === firstEverId} />
      </Card>

      {/* 2번째부터 — lead 없는 ListRow(날짜 제목 + 쉐브론). 처음 받은 날 칩은 eyebrow */}
      {rest.map((e, i) => (
        <ListRow
          key={e.id}
          eyebrow={e.id === firstEverId ? <ListRowChip tone="neutral">{d.badges.firstEarnedChip}</ListRowChip> : undefined}
          title={<LocalDate iso={e.earned_at} stamp />}
          titleVariant="regular"
          titleLines={2}
          chevron
          onClick={() => setOpenIdx(i + 1)}
        />
      ))}

      {/* 기록 상세 바텀시트 */}
      <BottomSheet open={openIdx !== null} onClose={() => setOpenIdx(null)}>
        <div className="px-6 pt-5 pb-6">
          {openIdx !== null && (
            <EarnCardContent e={poiEarns[openIdx]} isFirstEver={poiEarns[openIdx].id === firstEverId} inSheet />
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
