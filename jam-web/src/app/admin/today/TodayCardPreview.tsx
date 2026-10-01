'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import TodayCard from '@/components/today/TodayCard'
import type { CardView } from '@/lib/today/cardView'

/**
 * 어드민 투데이 미리보기 목록 (티켓 20261001_2208, 상위 20260930_1453 조각 b6)
 *
 * 표시 데이터(`CardView`) 배열을 받아 새 틀(`TodayCard`)로 세로로 쌓아 그린다. 카드 행·DB를 모르므로 날짜 미리보기 모달과
 * 카드 폼의 「홈 화면 미리보기」, 그리고 운영툴 미리보기(티켓 20261001_1501)가 같은 부품을 쓴다.
 *
 * 계측 정보(`tracking`)가 없는 표시 데이터만 그린다 — 트래커·링크가 없어 어드민 미리보기가 노출·클릭 수치에 섞이지 않고
 * 눌러도 서비스 화면으로 이동하지 않는다. 내 순위 강조(`currentUserId`)도 넘기지 않는다.
 */

/** 미리보기로 고를 수 있는 기기 폭(px). */
export const PREVIEW_DEVICE_WIDTHS = [360, 430] as const

export type PreviewDeviceWidth = (typeof PREVIEW_DEVICE_WIDTHS)[number]

export const DEFAULT_PREVIEW_DEVICE_WIDTH: PreviewDeviceWidth = 360

/** 홈 본문의 좌우 여백 하나(`app/(main)/page.tsx`의 `px-[var(--spacing-16)]`, 16px). */
const HOME_SIDE_PADDING_PX = 16

/** 기기 폭에서 홈의 좌우 여백을 뺀 카드 폭 — 360 기기는 328px, 430 기기는 398px다. */
export function previewCardWidth(deviceWidth: PreviewDeviceWidth): number {
  return deviceWidth - HOME_SIDE_PADDING_PX * 2
}

function isPreviewDeviceWidth(value: number): value is PreviewDeviceWidth {
  return (PREVIEW_DEVICE_WIDTHS as readonly number[]).includes(value)
}

export default function TodayCardPreview({
  views,
  defaultWidth = DEFAULT_PREVIEW_DEVICE_WIDTH,
}: {
  views: CardView[]
  /** 처음 고른 기기 폭. 기본은 360이다. */
  defaultWidth?: PreviewDeviceWidth
}) {
  const [deviceWidth, setDeviceWidth] = useState<PreviewDeviceWidth>(defaultWidth)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">기기 폭(px)</span>
        <Tabs
          value={String(deviceWidth)}
          onValueChange={(value) => {
            const next = Number(value)
            if (isPreviewDeviceWidth(next)) setDeviceWidth(next)
          }}
        >
          <TabsList aria-label="기기 폭" className="h-8">
            {PREVIEW_DEVICE_WIDTHS.map((width) => (
              <TabsTrigger key={width} value={String(width)} className="px-3 py-1 text-xs tabular-nums">
                {width}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* 홈 화면 실제 캔버스와 동일한 배경(bg-surface, DS v2 다크 그레이) 위에 그려야 카드의 tone="inverse"(흰 카드) 대비가
          실제 화면과 같게 보인다. 카드 폭은 줄이지 않는다 — 판이 카드 폭보다 좁으면 가로로 넘쳐 스크롤한다. 카드 사이 간격은 홈과 같다. */}
      <div className="overflow-x-auto rounded-lg bg-surface p-4 text-text">
        <div
          data-preview-board
          className="mx-auto flex flex-col gap-[var(--spacing-16)]"
          style={{ width: previewCardWidth(deviceWidth) }}
        >
          {views.map((view, index) => (
            <TodayCard key={index} view={view} />
          ))}
        </div>
      </div>
    </div>
  )
}
