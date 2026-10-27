'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
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
 *
 * 선택 속성 `annotations`(티켓 20261026_2025 2회차, 홈피드 미리보기): 카드 순서와 같은 길이의 배열로, 칸이 있는 카드만 두른다.
 * 승인 전 카드(`pending`)는 점선 테두리와 「승인 전」 표시를 두르고, `chips`가 있으면 카드 위에 이유 칩 줄을 올린다.
 * 속성을 안 주거나 칸이 null이면 카드를 두르지 않고 지금과 똑같이 그린다. 카드는 어느 경우든 `TodayCard` 그대로다.
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

/**
 * 칸 폭(가용폭)에 카드 폭을 맞추는 축소 비율. 칸이 충분히 넓으면 1(축소 없음)이다.
 * 측정 전(0 이하)에도 1을 돌려줘 서버 렌더·첫 그림이 기존 모습 그대로다.
 */
export function previewScale(availableWidth: number, cardWidth: number): number {
  if (!(availableWidth > 0) || !(cardWidth > 0)) return 1
  return Math.min(1, availableWidth / cardWidth)
}

/** 카드 하나를 두르는 표시. `pending`이 참이면 점선 테두리와 「승인 전」, `chips`가 있으면 카드 위 이유 칩 줄이다. */
export interface PreviewCardAnnotation {
  pending: boolean
  chips?: ReactNode
}

export const PENDING_LABEL = '승인 전'

function isPreviewDeviceWidth(value: number): value is PreviewDeviceWidth {
  return (PREVIEW_DEVICE_WIDTHS as readonly number[]).includes(value)
}

export default function TodayCardPreview({
  views,
  defaultWidth = DEFAULT_PREVIEW_DEVICE_WIDTH,
  annotations,
  emptyMessage,
}: {
  views: CardView[]
  /** 처음 고른 기기 폭. 기본은 360이다. */
  defaultWidth?: PreviewDeviceWidth
  /** 카드 순서와 같은 길이. 칸이 null이거나 속성이 없으면 카드를 두르지 않는다. */
  annotations?: readonly (PreviewCardAnnotation | null)[]
  /** 카드가 0장일 때 판 안에 보일 문구. 없으면 빈 판이다. */
  emptyMessage?: string
}) {
  const [deviceWidth, setDeviceWidth] = useState<PreviewDeviceWidth>(defaultWidth)
  const frameRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const [boardHeight, setBoardHeight] = useState(0)

  // 칸 폭과 판의 (축소 전) 높이를 실측한다. transform은 레이아웃 높이를 줄이지 않아 바깥 칸 높이를 따로 맞춰야 한다.
  useEffect(() => {
    const frame = frameRef.current
    const board = boardRef.current
    if (!frame || !board || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      setAvailableWidth(frame.clientWidth)
      setBoardHeight(board.offsetHeight)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(board)
    return () => observer.disconnect()
  }, [])

  const cardWidth = previewCardWidth(deviceWidth)
  const scale = previewScale(availableWidth, cardWidth)

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

      {/* 홈 화면 실제 캔버스와 동일한 배경(bg-background) 위에 그려야 카드 대비가 실제 화면과 같게 보인다.
          data-service-theme로 서비스 토큰 값을 되찾는다(어드민 스코프가 같은 이름을 덮는다).
          카드 폭은 그대로 두고 칸이 좁으면 판 전체를 칸 폭에 맞춰 축소한다(transform: scale,
          티켓 20261007_0035). 칸이 충분히 넓으면 scale 1이라 기존 모습 그대로다. 카드 사이 간격은 홈과 같다. */}
      <div data-service-theme="" className="rounded-lg bg-background p-4 text-foreground">
        <div
          ref={frameRef}
          data-preview-frame
          className="overflow-hidden"
          style={scale < 1 ? { height: boardHeight * scale } : undefined}
        >
          <div
            ref={boardRef}
            data-preview-board
            data-preview-scale={scale}
            className="mx-auto flex flex-col gap-4"
            style={{
              width: cardWidth,
              ...(scale < 1 ? { transform: `scale(${scale})`, transformOrigin: 'top left' } : {}),
            }}
          >
            {views.length === 0 && emptyMessage && (
              <p className="py-6 text-center text-sm text-muted-foreground break-keep wrap-break-word text-pretty">{emptyMessage}</p>
            )}
            {views.map((view, index) => {
              const annotation = annotations?.[index]
              if (!annotation) return <TodayCard key={index} view={view} />
              return (
                <div
                  key={index}
                  data-preview-pending={annotation.pending ? '' : undefined}
                  className={cn('flex flex-col gap-2', annotation.pending && 'rounded-2xl border border-dashed border-neutral-400 p-2')}
                >
                  {(annotation.pending || annotation.chips) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {annotation.pending && (
                        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 break-keep wrap-break-word">
                          {PENDING_LABEL}
                        </span>
                      )}
                      {annotation.chips}
                    </div>
                  )}
                  <TodayCard view={view} />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
