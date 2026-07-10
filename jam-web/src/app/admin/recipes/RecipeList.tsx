'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BadgeRow, CombinationRecipeRow } from '@/types/database'

interface Props {
  recipes: CombinationRecipeRow[]
  badges: Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[]
}

const emptyForm = {
  ingredient_badge_ids: ['', ''] as string[],
  result_badge_id: '',
  success_rate: 1.0,
  hint_text: '',
  is_public: false,
}

export default function RecipeList({ recipes, badges }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  const badgeMap = new Map(badges.map((b) => [b.id, b.name]))

  async function handleSave() {
    const ingredients = form.ingredient_badge_ids.filter(Boolean)
    if (ingredients.length < 2 || !form.result_badge_id) return
    setSaving(true)
    await fetch('/api/admin/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ingredient_badge_ids: ingredients }),
    })
    setSaving(false)
    setForm(emptyForm)
    setShowForm(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/admin/recipes/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  function setIngredient(idx: number, value: string) {
    setForm((prev) => {
      const arr = [...prev.ingredient_badge_ids]
      arr[idx] = value
      return { ...prev, ingredient_badge_ids: arr }
    })
  }

  return (
    <div className="space-y-6">
      {/* 등록 폼 토글 */}
      <div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-[#AEEA00] text-black font-bold px-4 py-2 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm"
        >
          {showForm ? '취소' : '+ 레시피 등록'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="font-bold mb-4">새 레시피</h2>

          {/* 재료 선택 */}
          <div>
            <label className="text-xs text-white/40 mb-2 block">재료 배지 (2~3개)</label>
            {[0, 1, 2].map((i) => (
              <select
                key={i}
                value={form.ingredient_badge_ids[i] ?? ''}
                onChange={(e) => setIngredient(i, e.target.value)}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm mb-2"
              >
                <option value="">재료 {i + 1} 선택{i >= 2 ? ' (선택사항)' : ''}</option>
                {badges.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} [{b.type}/{b.rarity}]</option>
                ))}
              </select>
            ))}
          </div>

          {/* 결과 배지 */}
          <div>
            <label className="text-xs text-white/40 mb-2 block">결과 배지</label>
            <select
              value={form.result_badge_id}
              onChange={(e) => setForm((f) => ({ ...f, result_badge_id: e.target.value }))}
              className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">선택</option>
              {badges.map((b) => (
                <option key={b.id} value={b.id}>{b.name} [{b.rarity}]</option>
              ))}
            </select>
          </div>

          {/* 성공률 */}
          <div>
            <label className="text-xs text-white/40 mb-2 block">성공률 ({Math.round(form.success_rate * 100)}%)</label>
            <input
              type="range"
              min="0" max="1" step="0.05"
              value={form.success_rate}
              onChange={(e) => setForm((f) => ({ ...f, success_rate: parseFloat(e.target.value) }))}
              className="w-full"
            />
          </div>

          {/* 힌트 */}
          <div>
            <label className="text-xs text-white/40 mb-2 block">힌트 문구 (비공개 레시피용)</label>
            <input
              type="text"
              value={form.hint_text}
              onChange={(e) => setForm((f) => ({ ...f, hint_text: e.target.value }))}
              placeholder="예: 겨울 등반에 필요한 것들..."
              className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm"
            />
          </div>

          {/* 공개 여부 */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={(e) => setForm((f) => ({ ...f, is_public: e.target.checked }))}
            />
            <span className="text-sm">공개 레시피 (재료 공개)</span>
          </label>

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#AEEA00] text-black font-bold px-4 py-2 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}

      {/* 레시피 목록 */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-left">
              <th className="px-5 py-3 font-medium">재료</th>
              <th className="px-5 py-3 font-medium">결과</th>
              <th className="px-5 py-3 font-medium">성공률</th>
              <th className="px-5 py-3 font-medium">공개</th>
              <th className="px-5 py-3 font-medium">힌트</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {recipes.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-white/30">레시피 없음</td></tr>
            )}
            {recipes.map((r) => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-5 py-3 text-white/70">
                  {r.ingredient_badge_ids.map((id) => badgeMap.get(id) ?? id.slice(0, 8)).join(' + ')}
                </td>
                <td className="px-5 py-3">{badgeMap.get(r.result_badge_id) ?? '—'}</td>
                <td className="px-5 py-3 text-white/60">{Math.round(r.success_rate * 100)}%</td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.is_public ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                    {r.is_public ? '공개' : '비공개'}
                  </span>
                </td>
                <td className="px-5 py-3 text-white/40 text-xs max-w-[200px] truncate">{r.hint_text ?? '—'}</td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
