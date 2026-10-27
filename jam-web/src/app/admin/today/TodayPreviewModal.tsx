'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/admin/ui/dialog'
import { HomePreviewPanel } from '@/components/admin/ops/preview/HomePreviewPanel'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedDate: string
}

/**
 * 어드민 투데이 캘린더뷰(20260902_1028) [미리보기] 창. 티켓 20261026_2025 2회차부터 본문은 홈피드 미리보기 부품(`HomePreviewPanel`)이다 —
 * 기획 상세의 결정 패널과 같은 부품·같은 API(`GET /api/admin/home-preview`)라 노출 판정이 한 벌이다. 이 창은 그 부품을 담는 창일 뿐이다.
 *
 * 예전 본문은 개인화 조건(`exposure_tags`)을 무시한 「켜진 카드 전부」 상한선이었다. 이제는 선택한 날부터 7일을 가상 유저 조건(트라이브·시간대·
 * 날씨·특일·신규 유저)별로 실제 홈과 같은 규칙으로 보여준다. 카드는 계측 정보 없이 서비스 카드로 그려 노출·클릭 수치에 섞이지 않는다.
 * 창을 열 때만 부품을 그려(닫혀 있는 동안은 요청이 없다) 열 때마다 선택한 날짜에서 새로 시작한다.
 */
export default function TodayPreviewModal({ open, onOpenChange, selectedDate }: Props) {
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent container={themeContainer ?? undefined} className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="break-keep wrap-break-word">홈피드 미리보기</DialogTitle>
          <DialogDescription className="break-keep wrap-break-word text-pretty">
            선택한 날부터 7일을 유저 조건별로 미리 봐요. 날씨와 특일은 저장된 값을 쓰고, 저장되지 않은 날은 직접 골라 볼 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[75vh] overflow-y-auto p-6 pt-4">
          {open && <HomePreviewPanel initialDate={selectedDate} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
