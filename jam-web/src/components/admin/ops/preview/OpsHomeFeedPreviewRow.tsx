'use client'

import { useState } from 'react'
import { Button } from '@/components/admin/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/admin/ui/sheet'
import { formatKstDayTime } from '@/lib/admin/opsInbox/labels'
import { cn } from '@/lib/utils'
import { HomePreviewPanel } from './HomePreviewPanel'

/**
 * 기획 상세 결정 패널 바닥의 한 줄 (티켓 20261026_2025 2회차, 어드민 상황판 PRD §6.3)
 *
 * 「공개 시작 12/30(목) 09:00」(체크한 항목 중 가장 이른 공개 시각, 없으면 이 문구를 쓰지 않는다)과 버튼 「홈피드로 보기」.
 * 누르면 오른쪽 시트가 열려 `HomePreviewPanel`을 담는다. 시트는 열릴 때만 그려져 닫혀 있는 동안은 요청이 없다.
 * `HomePreviewPanel`에는 이 묶음(`bundleId`)과 처음 보여줄 날짜(`initialDate`)를 넘긴다.
 */

const TEXT_CLASS = 'break-keep wrap-break-word'
export const OPEN_PREVIEW_LABEL = '홈피드로 보기'

interface OpsHomeFeedPreviewRowProps {
  bundleId: string
  /** 체크한 항목 중 가장 이른 공개 시각(ISO). 없으면 null */
  startsAt: string | null
  /** 처음 보여줄 날짜 'YYYY-MM-DD'(KST) */
  initialDate: string
}

export function OpsHomeFeedPreviewRow({ bundleId, startsAt, initialDate }: OpsHomeFeedPreviewRowProps) {
  const [open, setOpen] = useState(false)
  const startsAtText = formatKstDayTime(startsAt)
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
      {startsAtText && <span className={cn('text-sm tabular-nums text-muted-foreground', TEXT_CLASS)}>{`공개 시작 ${startsAtText}`}</span>}
      <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setOpen(true)}>
        {OPEN_PREVIEW_LABEL}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        {open && (
          <SheetContent
            side="right"
            container={document.querySelector<HTMLElement>('[data-admin-theme]') ?? undefined}
            className="w-full overflow-y-auto sm:max-w-2xl"
          >
            <SheetHeader>
              <SheetTitle className={TEXT_CLASS}>홈피드로 보기</SheetTitle>
              <SheetDescription className={cn(TEXT_CLASS, 'text-pretty')}>
                날짜와 유저 조건을 골라 이 기획이 승인된 뒤의 홈피드를 미리 봐요. 승인 전 카드는 점선으로 보여요.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <HomePreviewPanel initialDate={initialDate} bundleId={bundleId} />
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  )
}
