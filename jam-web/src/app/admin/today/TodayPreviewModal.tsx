'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/admin/ui/dialog'
import { formatKstDateLabel, previewBaseTime } from '@/lib/admin/today-calendar'
import TodayCardPreview from './TodayCardPreview'
import { toCardView } from '@/lib/today/cardView'
import type { TodayCardWithHref } from '@/lib/today/cards'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedDate: string
}

/**
 * 어드민 투데이 캘린더뷰(20260902_1028) [미리보기] — 실제 라이브 페이지가 아니라 선택 날짜
 * 기준 노출조건(is_active + 날짜 구간, 개인화 exposure_tags는 무시)으로 재현한 시뮬레이션이다.
 * 조회 결과를 표시 데이터(`toCardView`)로 바꿔 새 틀(`TodayCard`)로 그린다(티켓 20261001_2208) — 홈 전환 상수와
 * 무관하게 늘 새 모양이라, 저장된 옛 카드(`shape` NULL)도 새 모양으로 어떻게 보일지 여기서 먼저 볼 수 있다.
 * 계측 정보(`tracking`)를 싣지 않아 노출·클릭 계측과 카드 이동이 없다(티켓 20260930_1645) — 어드민이 미리 보는
 * 것이 실제 노출 수치에 섞이면 안 된다.
 *
 * 기준 시각(「N일 남음」 계산과 컬렉션 공개 판정)은 선택한 날짜가 오늘이면 지금, 아니면 그 날짜 00:00(KST)이다.
 */
export default function TodayPreviewModal({ open, onOpenChange, selectedDate }: Props) {
  // 조회한 카드와 그 기준 시각(ISO). 기준 시각은 조회가 끝난 순간에 한 번 정해 같은 값으로 그린다.
  const [data, setData] = useState<{ cards: TodayCardWithHref[]; baseTime: string } | null>(null)
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
        if (!cancelled) setData({ cards: json.cards, baseTime: previewBaseTime(selectedDate).toISOString() })
      } catch {
        if (!cancelled) setError('미리보기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    return () => {
      cancelled = true
    }
  }, [open, selectedDate])

  const views = useMemo(() => {
    if (!data) return []
    const now = new Date(data.baseTime)
    return data.cards.map((card) => toCardView(card, { now }))
  }, [data])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent container={themeContainer ?? undefined} className="max-w-[520px] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{formatKstDateLabel(selectedDate)} 미리보기</DialogTitle>
          <DialogDescription>
            활성 상태와 노출 기간을 기준으로 구성한 미리보기예요. 시간대나 참여 미션 같은 개인화 조건은 기본값으로 표시돼요.
          </DialogDescription>
        </DialogHeader>

        {/* 카드를 얹는 bg-surface 판(홈 캔버스와 같은 배경)과 기기 폭 전환은 TodayCardPreview가 그린다. */}
        <div className="max-h-[70vh] overflow-y-auto p-6 pt-4">
          {loading && <p className="text-sm text-muted-foreground">불러오는 중...</p>}
          {!loading && error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && data && data.cards.length === 0 && (
            <p className="text-sm text-muted-foreground">이 날짜에 노출되는 카드가 없어요</p>
          )}
          {!loading && !error && data && data.cards.length > 0 && <TodayCardPreview views={views} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
