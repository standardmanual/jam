'use client'

import { memo } from 'react'
import type { TodayCardRow } from '@/types/database'

interface TodayCardTableProps {
  cards: TodayCardRow[]
  onEdit: (card: TodayCardRow) => void
  onToggleActive: (card: TodayCardRow) => void
  onDelete: (id: string) => void
}

/**
 * 투데이 카드 목록 테이블 — `TodayCardList.tsx`의 저작 폼과 분리된 자식 컴포넌트
 * (20260826_011 A3). `React.memo`로 감싸 저작 폼에 입력할 때마다 목록 전체가 리렌더되는 걸 막는다.
 */
function TodayCardTableInner({ cards, onEdit, onToggleActive, onDelete }: TodayCardTableProps) {
  const now = new Date()

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
            <th className="px-5 py-3 font-medium">제목</th>
            <th className="px-5 py-3 font-medium">템플릿</th>
            <th className="px-5 py-3 font-medium">노출형태</th>
            <th className="px-5 py-3 font-medium">노출조건</th>
            <th className="px-5 py-3 font-medium">기간</th>
            <th className="px-5 py-3 font-medium">상태</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {cards.length === 0 && (
            <tr><td colSpan={7} className="px-5 py-10 text-center text-[#898989]">카드 없음</td></tr>
          )}
          {cards.map((c) => {
            const started = new Date(c.starts_at) <= now
            const ended = new Date(c.ends_at) < now
            const live = c.is_active && started && !ended
            const status = !c.is_active ? '비활성' : ended ? '종료' : !started ? '예약' : '노출중'
            const statusCls = live ? 'bg-[#111111]/20 text-[#111111]' : ended || !c.is_active ? 'bg-[#f3f4f6] text-[#898989]' : 'bg-amber-50 text-amber-600'
            return (
              <tr key={c.id} className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa] align-top">
                <td className="px-5 py-3 font-medium max-w-[220px]">{c.title}</td>
                <td className="px-5 py-3 text-[#374151] text-xs">{c.template_type}</td>
                <td className="px-5 py-3 text-[#374151] text-xs">{c.layout_type}</td>
                <td className="px-5 py-3 text-[#6b7280] text-xs max-w-[180px]">{c.exposure_tags.join(', ')}</td>
                <td className="px-5 py-3 text-[#6b7280] text-xs">
                  {new Date(c.starts_at).toLocaleDateString('ko-KR')} ~<br />
                  {new Date(c.ends_at).toLocaleDateString('ko-KR')}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusCls}`}>{status}</span>
                </td>
                <td className="px-5 py-3 whitespace-nowrap">
                  <button onClick={() => onEdit(c)} className="text-[#6b7280] hover:text-[#111111] text-xs mr-3">
                    수정
                  </button>
                  <button onClick={() => onToggleActive(c)} className="text-[#6b7280] hover:text-[#111111] text-xs mr-3">
                    {c.is_active ? '비활성화' : '활성화'}
                  </button>
                  <button onClick={() => onDelete(c.id)} className="text-red-600 hover:text-red-700 text-xs">삭제</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export const TodayCardTable = memo(TodayCardTableInner)
