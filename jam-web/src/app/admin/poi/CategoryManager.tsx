'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import type { PoiCategoryRow } from '@/types/database'

interface CategoryManagerProps {
  categories: PoiCategoryRow[]
  usageCounts: Record<string, number>
}

// 콤마로 구분된 키워드 입력 문자열 <-> string[] 배열 변환
function parseKeywords(input: string): string[] {
  return input
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
}

interface EditState {
  label: string
  pipelineLinked: boolean
  tier: 1 | 2
  keywordsInput: string
}

function toEditState(c: PoiCategoryRow): EditState {
  return {
    label: c.label,
    pipelineLinked: c.pipeline_linked,
    tier: c.tier ?? 1,
    keywordsInput: c.keywords.join(', '),
  }
}

export default function CategoryManager({ categories, usageCounts }: CategoryManagerProps) {
  const router = useRouter()

  // 생성 폼 상태
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [pipelineLinked, setPipelineLinked] = useState(false)
  const [tier, setTier] = useState<1 | 2>(1)
  const [keywordsInput, setKeywordsInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const res = await fetch('/api/admin/poi-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          label,
          pipeline_linked: pipelineLinked,
          tier: pipelineLinked ? tier : null,
          keywords: pipelineLinked ? parseKeywords(keywordsInput) : [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '생성 실패')
      setSlug('')
      setLabel('')
      setPipelineLinked(false)
      setTier(1)
      setKeywordsInput('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성 중 오류가 발생했습니다.')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (c: PoiCategoryRow) => {
    setEditingSlug(c.slug)
    setEditState(toEditState(c))
    setRowError((prev) => ({ ...prev, [c.slug]: '' }))
  }

  const handleSaveEdit = async (targetSlug: string) => {
    if (!editState) return
    setRowError((prev) => ({ ...prev, [targetSlug]: '' }))
    try {
      const res = await fetch(`/api/admin/poi-categories/${targetSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editState.label,
          pipeline_linked: editState.pipelineLinked,
          tier: editState.pipelineLinked ? editState.tier : null,
          keywords: editState.pipelineLinked ? parseKeywords(editState.keywordsInput) : [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '수정 실패')
      setEditingSlug(null)
      setEditState(null)
      router.refresh()
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [targetSlug]: err instanceof Error ? err.message : '수정 중 오류가 발생했습니다.',
      }))
    }
  }

  const handleDelete = async (targetSlug: string) => {
    setRowError((prev) => ({ ...prev, [targetSlug]: '' }))
    try {
      const res = await fetch(`/api/admin/poi-categories/${targetSlug}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      setDeletingSlug(null)
      router.refresh()
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [targetSlug]: err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.',
      }))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleCreate} className="flex flex-col gap-3 bg-white border border-[#e5e7eb] rounded-2xl p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-[#374151]">slug *</span>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="fitness_center"
              className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-[#374151]">표시 이름 *</span>
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="헬스장"
              className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="bg-[#111111] text-white font-bold px-5 py-2.5 rounded-xl hover:bg-[#242424] disabled:opacity-50 transition-colors"
          >
            {creating ? '생성 중...' : '카테고리 추가'}
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-[#374151]">
          <input
            type="checkbox"
            checked={pipelineLinked}
            onChange={(e) => setPipelineLinked(e.target.checked)}
            className="accent-[#111111]"
          />
          드랍/픽업 자동검색 파이프라인에 연동
        </label>

        {pipelineLinked && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-[#374151]">티어</span>
              <Select value={String(tier)} onValueChange={(v) => setTier(Number(v) as 1 | 2)}>
                <SelectTrigger aria-label="티어">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">티어 1 — 항상 검색</SelectItem>
                  <SelectItem value="2">티어 2 — 티어1 부족 시 보조 검색</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 flex-1 min-w-[220px]">
              <span className="text-sm text-[#374151]">키워드 (콤마로 구분) *</span>
              <input
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="헬스장, 필라테스"
                className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 text-sm"
              />
            </label>
          </div>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
              <th className="px-5 py-3 font-medium">slug</th>
              <th className="px-5 py-3 font-medium">표시 이름</th>
              <th className="px-5 py-3 font-medium">사용 중인 POI</th>
              <th className="px-5 py-3 font-medium">연동</th>
              <th className="px-5 py-3 font-medium">티어</th>
              <th className="px-5 py-3 font-medium">키워드</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const isEditing = editingSlug === c.slug
              return (
                <tr key={c.slug} className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors align-top">
                  <td className="px-5 py-3 font-mono text-[#374151] whitespace-nowrap">{c.slug}</td>
                  <td className="px-5 py-3 min-w-[120px]">
                    {isEditing && editState ? (
                      <input
                        value={editState.label}
                        onChange={(e) => setEditState({ ...editState, label: e.target.value })}
                        className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-1.5 text-[#111111] focus:outline-none focus:border-[#111111]/50 text-sm w-full"
                      />
                    ) : (
                      c.label
                    )}
                  </td>
                  <td className="px-5 py-3 text-[#374151] whitespace-nowrap">{usageCounts[c.slug] ?? 0}개</td>
                  <td className="px-5 py-3">
                    {isEditing && editState ? (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editState.pipelineLinked}
                          onChange={(e) => setEditState({ ...editState, pipelineLinked: e.target.checked })}
                          className="accent-[#111111]"
                        />
                      </label>
                    ) : c.pipeline_linked ? (
                      <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2.5 py-1 whitespace-nowrap">
                        연동중
                      </span>
                    ) : (
                      <span className="text-xs text-[#898989]">미연동</span>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {isEditing && editState ? (
                      editState.pipelineLinked ? (
                        <Select
                          value={String(editState.tier)}
                          onValueChange={(v) => setEditState({ ...editState, tier: Number(v) as 1 | 2 })}
                        >
                          <SelectTrigger className="h-auto px-2 py-1.5 text-xs" aria-label="티어">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">티어 1</SelectItem>
                            <SelectItem value="2">티어 2</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-[#898989] text-xs">—</span>
                      )
                    ) : c.tier ? (
                      `티어 ${c.tier}`
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3 min-w-[200px]">
                    {isEditing && editState ? (
                      editState.pipelineLinked ? (
                        <input
                          value={editState.keywordsInput}
                          onChange={(e) => setEditState({ ...editState, keywordsInput: e.target.value })}
                          placeholder="키워드1, 키워드2"
                          className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-1.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 text-xs w-full"
                        />
                      ) : (
                        <span className="text-[#898989] text-xs">—</span>
                      )
                    ) : c.keywords.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.keywords.map((k) => (
                          <span key={k} className="text-xs bg-[#f5f5f5] text-[#374151] rounded-full px-2 py-0.5">
                            {k}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[#898989] text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleSaveEdit(c.slug)}
                          className="text-[#111111] hover:text-[#242424] px-2 py-1"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => { setEditingSlug(null); setEditState(null) }}
                          className="text-[#6b7280] hover:text-[#111111] px-2 py-1"
                        >
                          취소
                        </button>
                      </div>
                    ) : deletingSlug === c.slug ? (
                      <div className="flex gap-2 justify-end items-center">
                        <span className="text-[#6b7280] text-xs">정말 삭제할까요?</span>
                        <button
                          onClick={() => handleDelete(c.slug)}
                          className="text-red-600 hover:text-red-700 px-2 py-1"
                        >
                          삭제 확인
                        </button>
                        <button
                          onClick={() => setDeletingSlug(null)}
                          className="text-[#6b7280] hover:text-[#111111] px-2 py-1"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-[#374151] hover:text-[#111111] px-2 py-1"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => setDeletingSlug(c.slug)}
                          className="text-red-500 hover:text-red-600 px-2 py-1"
                        >
                          삭제
                        </button>
                      </div>
                    )}
                    {rowError[c.slug] && (
                      <p className="text-red-600 text-xs mt-1">{rowError[c.slug]}</p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
