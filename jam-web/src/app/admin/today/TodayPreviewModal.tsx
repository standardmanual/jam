'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/admin/ui/dialog'
import { formatKstDateLabel } from '@/lib/admin/today-calendar'
import TodayCardStack from '@/app/(main)/TodayCardStack'
import type { TodayCardWithHref } from '@/lib/today/cards'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedDate: string
}

/**
 * 어드민 투데이 캘린더뷰(20260902_1028) [미리보기] — 실제 라이브 페이지가 아니라 선택 날짜
 * 기준 노출조건(is_active + 날짜 구간, 개인화 exposure_tags는 무시)으로 재현한 시뮬레이션이다.
 * 유저向 홈 화면과 동일한 `TodayCardStack`을 그대로 재사용해 실제로 보일 모양을 그대로 반영한다
 * (해당 컴포넌트는 이 티켓에서 수정하지 않음 — 읽기 전용 재사용).
 */
export default function TodayPreviewModal({ open, onOpenChange, selectedDate }: Props) {
  const [cards, setCards] = useState<TodayCardWithHref[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  // 이펙트 본문에서 동기 setState를 피하기 위해 조회 자체를 별도 async 함수로 분리하고
  // 그 안에서만 상태를 갱신한다 (UserGrantForm.tsx와 동일 패턴, react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/admin/today/preview?date=${selectedDate}`)
        if (!res.ok) throw new Error('조회 실패')
        const json = (await res.json()) as { cards: TodayCardWithHref[] }
        if (!cancelled) setCards(json.cards)
      } catch {
        if (!cancelled) setError('미리보기를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    return () => {
      cancelled = true
    }
  }, [open, selectedDate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent container={themeContainer ?? undefined} className="max-w-[480px] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{formatKstDateLabel(selectedDate)} 미리보기</DialogTitle>
          <DialogDescription>
            실제 라이브 화면이 아닌 시뮬레이션입니다. 활성 상태와 노출 기간만 반영하고,
            시간대·참여 미션 등 유저 개인화 조건은 &apos;all&apos; 기준으로 단순화합니다.
          </DialogDescription>
        </DialogHeader>

        {/* 홈 화면 실제 캔버스와 동일한 배경(bg-surface, DS v2 다크 그레이) 위에 카드를 그려야
            TodayCardStack의 tone="inverse"(흰 카드) 대비가 실제 화면과 같게 보인다. */}
        <div className="max-h-[70vh] overflow-y-auto p-6 pt-4 bg-surface text-text">
          {loading && <p className="text-sm text-text-secondary">불러오는 중...</p>}
          {!loading && error && <p className="text-sm text-red-400">{error}</p>}
          {!loading && !error && cards && cards.length === 0 && (
            <p className="text-sm text-text-secondary">이 날짜에 노출될 카드가 없습니다.</p>
          )}
          {!loading && !error && cards && cards.length > 0 && <TodayCardStack cards={cards} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
