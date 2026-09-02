'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { shiftDateStr, formatKstDateLabel } from '@/lib/admin/today-calendar'
import TodayPreviewModal from './TodayPreviewModal'

interface Props {
  selectedDate: string
}

/**
 * 어드민 투데이 캘린더뷰(20260902_1028) 상단 — 좌우 화살표로 날짜 이동 + [미리보기] 버튼.
 * 날짜 이동은 `?date=YYYY-MM-DD` 쿼리로 페이지를 다시 불러온다(서버 컴포넌트 재조회 —
 * 과거 날짜도 동일 경로로 조회 가능, 별도 제한 없음).
 */
export default function TodayDateNav({ selectedDate }: Props) {
  const router = useRouter()
  const [previewOpen, setPreviewOpen] = useState(false)

  const goTo = (date: string) => router.push(`/admin/today?date=${date}`)

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="이전 날짜"
          onClick={() => goTo(shiftDateStr(selectedDate, -1))}
        >
          <IconChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-bold text-sm min-w-[10rem] text-center">
          {formatKstDateLabel(selectedDate)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="다음 날짜"
          onClick={() => goTo(shiftDateStr(selectedDate, 1))}
        >
          <IconChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
        미리보기
      </Button>

      <TodayPreviewModal open={previewOpen} onOpenChange={setPreviewOpen} selectedDate={selectedDate} />
    </div>
  )
}
