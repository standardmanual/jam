'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { TodayCardRow } from '@/types/database'
import { TodayCardTable } from './TodayCardTable'

interface Props {
  cards: TodayCardRow[]
  /** 현재 캘린더뷰가 보고 있는 날짜('YYYY-MM-DD') — 행의 [수정]·[상세보기] 링크에 실어 날라
   *  전용 화면에서 저장·취소·삭제 후 이 목록으로 돌아오게 한다(20260902_1028, 티켓 20260911_1454). */
  selectedDate: string
}

/**
 * 투데이 카드 목록 — 티켓 20260911_1454(페이지 전환 방식 리뉴얼)로 카드 테이블 ·
 * 캘린더 날짜 탐색만 남았다. 생성 · 수정 폼은 전용 화면(`new/page.tsx` · `[id]/edit/page.tsx`)
 * 으로 분리됐다 — 이 컴포넌트는 활성화 토글 · 삭제 콜백만 들고 있는 얇은 클라이언트 래퍼다
 * (목록 자체의 테이블 디자인은 이번 티켓 범위 밖이라 그대로 둔다).
 */
export default function TodayCardList({ cards, selectedDate }: Props) {
  const router = useRouter()

  const handleToggleActive = useCallback(async (card: TodayCardRow) => {
    await fetch(`/api/admin/today/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !card.is_active }),
    })
    router.refresh()
  }, [router])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('카드를 삭제하시겠습니까?')) return
    await fetch(`/api/admin/today/${id}`, { method: 'DELETE' })
    router.refresh()
  }, [router])

  return (
    <TodayCardTable cards={cards} selectedDate={selectedDate} onToggleActive={handleToggleActive} onDelete={handleDelete} />
  )
}
