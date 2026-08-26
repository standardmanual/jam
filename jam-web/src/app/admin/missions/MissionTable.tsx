'use client'

import { memo } from 'react'
import type { MissionRow } from '@/types/database'
import { missionTypeLabel } from '@/lib/admin/badge-labels'

interface MissionTableProps {
  missions: MissionRow[]
  completionCounts: Map<string, number>
  onEdit: (mission: MissionRow) => void
  onDelete: (id: string) => void
}

/**
 * 미션 목록 테이블 — `MissionList.tsx`의 저작 폼과 분리된 자식 컴포넌트 (20260826_011 A3).
 * `React.memo`로 감싸 저작 폼에 입력할 때마다(예: 미션 이름 한 글자 입력) 목록 전체가
 * 리렌더되는 걸 막는다. props(missions/completionCounts/콜백)가 바뀔 때만 리렌더된다.
 */
function MissionTableInner({ missions, completionCounts, onEdit, onDelete }: MissionTableProps) {
  const now = new Date()

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
            <th className="px-5 py-3 font-medium">미션</th>
            <th className="px-5 py-3 font-medium">타입</th>
            <th className="px-5 py-3 font-medium">기간</th>
            <th className="px-5 py-3 font-medium">달성</th>
            <th className="px-5 py-3 font-medium">상태</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {missions.length === 0 && (
            <tr><td colSpan={6} className="px-5 py-10 text-center text-[#898989]">미션 없음</td></tr>
          )}
          {missions.map((m) => {
            // ends_at이 null이면 상시 미션 — 시작만 지났으면 항상 진행 중, 종료 없음
            const isEnded = m.ends_at !== null && new Date(m.ends_at) < now
            const isActive = new Date(m.starts_at) <= now && !isEnded
            const count = completionCounts.get(m.id) ?? 0
            return (
              <tr key={m.id} className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa]">
                <td className="px-5 py-3 font-medium">{m.title}</td>
                <td className="px-5 py-3 text-[#374151]">{missionTypeLabel(m.mission_type)}</td>
                <td className="px-5 py-3 text-[#6b7280] text-xs">
                  {new Date(m.starts_at).toLocaleDateString('ko-KR')} ~<br />
                  {m.ends_at ? new Date(m.ends_at).toLocaleDateString('ko-KR') : '상시'}
                </td>
                <td className="px-5 py-3 text-[#374151]">
                  {count}{m.max_completions ? `/${m.max_completions}` : ''}명
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-[#111111]/20 text-[#111111]' : isEnded ? 'bg-[#f3f4f6] text-[#898989]' : 'bg-amber-50 text-amber-600'}`}>
                    {isActive ? '진행 중' : isEnded ? '종료' : '예정'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(m)} className="text-[#111111] hover:opacity-70 text-xs">수정</button>
                    <button onClick={() => onDelete(m.id)} className="text-red-600 hover:text-red-700 text-xs">삭제</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export const MissionTable = memo(MissionTableInner)
