'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BadgeRow, CombinationRecipeRow } from '@/types/database'
import BadgeSearchSelect from '@/components/admin/BadgeSearchSelect'

interface Props {
  recipes: CombinationRecipeRow[]
  badges: Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[]
}

const MAX_INGREDIENTS = 10

const emptyForm = {
  ingredient_badge_ids: ['', ''] as string[],
  result_badge_id: '',
  success_rate: 1.0,
  hint_text: '',
  is_public: false,
  required_activity_badge_id: '',
}

export default function RecipeList({ recipes, badges }: Props) {
  const [form, setForm] = useState(emptyForm)
  // 수정 화면 진입 시 이미 선택된 배지의 표시용 이름 — 검색 콤보박스가 처음에 보여줄 라벨
  const [formLabels, setFormLabels] = useState<{
    ingredients: string[]
    result: string
    requiredActivity: string
  }>({ ingredients: [], result: '', requiredActivity: '' })
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const router = useRouter()

  const badgeMap = new Map(badges.map((b) => [b.id, b.name]))

  function labelOf(badge?: { name: string; type: string; rarity: string }) {
    return badge ? `${badge.name} [${badge.type}/${badge.rarity}]` : ''
  }

  function setResultBadge(id: string, badge?: { name: string; type: string; rarity: string }) {
    setForm((f) => ({ ...f, result_badge_id: id }))
    setFormLabels((l) => ({ ...l, result: labelOf(badge) }))
  }

  function setRequiredActivityBadge(id: string, badge?: { name: string; type: string; rarity: string }) {
    setForm((f) => ({ ...f, required_activity_badge_id: id }))
    setFormLabels((l) => ({ ...l, requiredActivity: labelOf(badge) }))
  }

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFormLabels({ ingredients: [], result: '', requiredActivity: '' })
    setShowForm(true)
  }

  function startEdit(r: CombinationRecipeRow) {
    setEditingId(r.id)
    setForm({
      ingredient_badge_ids: [...r.ingredient_badge_ids],
      result_badge_id: r.result_badge_id ?? '',
      success_rate: r.success_rate,
      hint_text: r.hint_text ?? '',
      is_public: r.is_public,
      required_activity_badge_id: r.required_activity_badge_id ?? '',
    })
    setFormLabels({
      ingredients: r.ingredient_badge_ids.map((id) => badgeMap.get(id) ?? ''),
      result: r.result_badge_id ? (badgeMap.get(r.result_badge_id) ?? '') : '',
      requiredActivity: r.required_activity_badge_id ? (badgeMap.get(r.required_activity_badge_id) ?? '') : '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    const ingredients = form.ingredient_badge_ids.filter(Boolean)
    if (ingredients.length < 2 || !form.result_badge_id) return
    setSaving(true)
    const payload = {
      ...form,
      ingredient_badge_ids: ingredients,
      required_activity_badge_id: form.required_activity_badge_id || null,
    }
    if (editingId) {
      await fetch(`/api/admin/recipes/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      await fetch('/api/admin/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    setSaving(false)
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/admin/recipes/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  function setIngredient(idx: number, value: string, label?: string) {
    setForm((prev) => {
      const arr = [...prev.ingredient_badge_ids]
      arr[idx] = value
      return { ...prev, ingredient_badge_ids: arr }
    })
    setFormLabels((prev) => {
      const arr = [...prev.ingredients]
      arr[idx] = label ?? ''
      return { ...prev, ingredients: arr }
    })
  }

  function addIngredientSlot() {
    setForm((prev) =>
      prev.ingredient_badge_ids.length >= MAX_INGREDIENTS
        ? prev
        : { ...prev, ingredient_badge_ids: [...prev.ingredient_badge_ids, ''] }
    )
    setFormLabels((prev) => ({ ...prev, ingredients: [...prev.ingredients, ''] }))
  }

  function removeIngredientSlot(idx: number) {
    setForm((prev) => {
      if (prev.ingredient_badge_ids.length <= 2) return prev
      const arr = prev.ingredient_badge_ids.filter((_, i) => i !== idx)
      return { ...prev, ingredient_badge_ids: arr }
    })
    setFormLabels((prev) => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== idx) }))
  }

  return (
    <div className="space-y-6">
      {/* 등록 폼 토글 */}
      <div>
        <button
          onClick={() => (showForm ? setShowForm(false) : startCreate())}
          className="bg-[#111111] text-white font-bold px-4 py-2 rounded-xl hover:bg-[#242424] transition-colors text-sm"
        >
          {showForm ? '취소' : '+ 레시피 등록'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6 space-y-4">
          <h2 className="font-bold mb-4">{editingId ? '레시피 수정' : '새 레시피'}</h2>

          {/* 재료 선택 */}
          <div>
            <label className="text-xs text-[#6b7280] mb-2 block">
              재료 배지 (2~{MAX_INGREDIENTS}개) — 소재 세계관을 제외한 세계관에서 결과가 나옵니다
            </label>
            {form.ingredient_badge_ids.map((val, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <div className="flex-1">
                  <BadgeSearchSelect
                    key={`${editingId ?? 'new'}-${i}`}
                    value={val}
                    initialLabel={formLabels.ingredients[i]}
                    typeFilter="item"
                    placeholder={`재료 ${i + 1} 검색...`}
                    onChange={(id, badge) => setIngredient(i, id, labelOf(badge))}
                  />
                </div>
                {form.ingredient_badge_ids.length > 2 && (
                  <button
                    onClick={() => removeIngredientSlot(i)}
                    className="text-[#898989] hover:text-red-600 text-xs px-2"
                  >
                    삭제
                  </button>
                )}
              </div>
            ))}
            {form.ingredient_badge_ids.length < MAX_INGREDIENTS && (
              <button
                onClick={addIngredientSlot}
                className="text-xs text-[#6b7280] hover:text-[#111111] border border-dashed border-[#e5e7eb] rounded-lg px-3 py-1.5 mt-1"
              >
                + 재료 슬롯 추가
              </button>
            )}
          </div>

          {/* 결과 배지 */}
          <div>
            <label className="text-xs text-[#6b7280] mb-2 block">결과 배지</label>
            <BadgeSearchSelect
              key={editingId ?? 'new'}
              value={form.result_badge_id}
              initialLabel={formLabels.result}
              typeFilter="item"
              placeholder="결과 배지 검색..."
              onChange={setResultBadge}
            />
          </div>

          {/* 필수 액티비티 배지 (소모되지 않는 보유 조건) */}
          <div>
            <label className="text-xs text-[#6b7280] mb-2 block">
              필수 액티비티 배지 (선택 — 소모되지 않고 보유 여부만 검증)
            </label>
            <BadgeSearchSelect
              key={editingId ?? 'new'}
              value={form.required_activity_badge_id}
              initialLabel={formLabels.requiredActivity}
              typeFilter="activity"
              placeholder="필수 액티비티 배지 검색..."
              onChange={setRequiredActivityBadge}
            />
          </div>

          {/* 성공률 */}
          <div>
            <label className="text-xs text-[#6b7280] mb-2 block">성공률 ({Math.round(form.success_rate * 100)}%)</label>
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
            <label className="text-xs text-[#6b7280] mb-2 block">힌트 문구 (비공개 레시피용)</label>
            <input
              type="text"
              value={form.hint_text}
              onChange={(e) => setForm((f) => ({ ...f, hint_text: e.target.value }))}
              placeholder="예: 겨울 등반에 필요한 것들..."
              className="w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm"
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
            className="bg-[#111111] text-white font-bold px-4 py-2 rounded-xl hover:bg-[#242424] transition-colors text-sm"
          >
            {saving ? '저장 중...' : editingId ? '수정 저장' : '저장'}
          </button>
        </div>
      )}

      {/* 레시피 목록 */}
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
                      onClick={() => startEdit(r)}
                      className="text-[#374151] hover:text-[#111111] text-xs"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
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
    </div>
  )
}
