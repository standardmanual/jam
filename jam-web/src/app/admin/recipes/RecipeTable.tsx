'use client'

import { memo } from 'react'
import type { CombinationRecipeRow } from '@/types/database'

interface RecipeTableProps {
  recipes: CombinationRecipeRow[]
  badgeMap: Map<string, string>
  onEdit: (recipe: CombinationRecipeRow) => void
  onDelete: (id: string) => void
}

/**
 * 레시피 목록 테이블 — `RecipeList.tsx`의 저작 폼과 분리된 자식 컴포넌트 (20260826_011 A3).
 * `React.memo`로 감싸 저작 폼에 입력할 때마다 목록 전체가 리렌더되는 걸 막는다.
 */
function RecipeTableInner({ recipes, badgeMap, onEdit, onDelete }: RecipeTableProps) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
            <th className="px-5 py-3 font-medium">재료</th>
            <th className="px-5 py-3 font-medium">필수 액티비티</th>
            <th className="px-5 py-3 font-medium">결과</th>
            <th className="px-5 py-3 font-medium">성공률</th>
            <th className="px-5 py-3 font-medium">공개</th>
            <th className="px-5 py-3 font-medium">힌트</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {recipes.length === 0 && (
            <tr><td colSpan={7} className="px-5 py-10 text-center text-[#898989]">레시피 없음</td></tr>
          )}
          {recipes.map((r) => (
            <tr key={r.id} className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa]">
              <td className="px-5 py-3 text-[#374151]">
                {r.ingredient_badge_ids.map((id) => badgeMap.get(id) ?? id.slice(0, 8)).join(' + ')}
              </td>
              <td className="px-5 py-3 text-[#6b7280] text-xs">
                {r.required_activity_badge_id ? (badgeMap.get(r.required_activity_badge_id) ?? '—') : '—'}
              </td>
              <td className="px-5 py-3">
                {r.result_badge_id ? (badgeMap.get(r.result_badge_id) ?? '—') : (
                  <span className="text-red-600 text-xs">결과 미지정</span>
                )}
              </td>
              <td className="px-5 py-3 text-[#374151]">{Math.round(r.success_rate * 100)}%</td>
              <td className="px-5 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.is_public ? 'bg-emerald-50 text-emerald-600' : 'bg-[#f3f4f6] text-[#6b7280]'}`}>
                  {r.is_public ? '공개' : '비공개'}
                </span>
              </td>
              <td className="px-5 py-3 text-[#6b7280] text-xs max-w-[200px] truncate">{r.hint_text ?? '—'}</td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onEdit(r)}
                    className="text-[#374151] hover:text-[#111111] text-xs"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => onDelete(r.id)}
                    className="text-red-600 hover:text-red-700 text-xs"
                  >
                    삭제
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const RecipeTable = memo(RecipeTableInner)
