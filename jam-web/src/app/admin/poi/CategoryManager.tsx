'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PoiCategoryRow } from '@/types/database'

interface CategoryManagerProps {
  categories: PoiCategoryRow[]
  usageCounts: Record<string, number>
  pipelineLinkedSlugs: string[]
}

export default function CategoryManager({ categories, usageCounts, pipelineLinkedSlugs }: CategoryManagerProps) {
  const router = useRouter()
  const pipelineSet = new Set(pipelineLinkedSlugs)

  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
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
        body: JSON.stringify({ slug, label }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '생성 실패')
      setSlug('')
      setLabel('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성 중 오류가 발생했습니다.')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (c: PoiCategoryRow) => {
    setEditingSlug(c.slug)
    setEditLabel(c.label)
    setRowError((prev) => ({ ...prev, [c.slug]: '' }))
  }

  const handleSaveEdit = async (targetSlug: string) => {
    setRowError((prev) => ({ ...prev, [targetSlug]: '' }))
    try {
      const res = await fetch(`/api/admin/poi-categories/${targetSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '수정 실패')
      setEditingSlug(null)
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
      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 bg-white/5 border border-white/10 rounded-2xl p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/60">slug *</span>
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="fitness_center"
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50 font-mono text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/60">표시 이름 *</span>
          <input
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="헬스장"
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="bg-[#AEEA00] text-black font-bold px-5 py-2.5 rounded-xl hover:bg-[#c6ff00] disabled:opacity-50 transition-colors"
        >
          {creating ? '생성 중...' : '카테고리 추가'}
        </button>
        {error && <p className="text-red-400 text-sm w-full">{error}</p>}
      </form>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-left">
              <th className="px-5 py-3 font-medium">slug</th>
              <th className="px-5 py-3 font-medium">표시 이름</th>
              <th className="px-5 py-3 font-medium">사용 중인 POI</th>
              <th className="px-5 py-3 font-medium">구분</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.slug} className="border-b border-white/5 hover:bg-white/5 transition-colors align-top">
                <td className="px-5 py-3 font-mono text-white/70">{c.slug}</td>
                <td className="px-5 py-3">
                  {editingSlug === c.slug ? (
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-[#AEEA00]/50 text-sm"
                    />
                  ) : (
                    c.label
                  )}
                </td>
                <td className="px-5 py-3 text-white/60">{usageCounts[c.slug] ?? 0}개</td>
                <td className="px-5 py-3">
                  {pipelineSet.has(c.slug) && (
                    <span
                      title="드랍/픽업 자동검색 파이프라인이 키워드로 사용 중인 카테고리입니다. 삭제/수정 시 자동검색 동작이 바뀔 수 있어요."
                      className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1"
                    >
                      파이프라인 연동
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  {editingSlug === c.slug ? (
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleSaveEdit(c.slug)}
                        className="text-[#AEEA00] hover:text-[#c6ff00] px-2 py-1"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setEditingSlug(null)}
                        className="text-white/40 hover:text-white px-2 py-1"
                      >
                        취소
                      </button>
                    </div>
                  ) : deletingSlug === c.slug ? (
                    <div className="flex gap-2 justify-end items-center">
                      <span className="text-white/40 text-xs">정말 삭제할까요?</span>
                      <button
                        onClick={() => handleDelete(c.slug)}
                        className="text-red-400 hover:text-red-300 px-2 py-1"
                      >
                        삭제 확인
                      </button>
                      <button
                        onClick={() => setDeletingSlug(null)}
                        className="text-white/40 hover:text-white px-2 py-1"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => startEdit(c)}
                        className="text-white/60 hover:text-white px-2 py-1"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => setDeletingSlug(c.slug)}
                        className="text-red-400/70 hover:text-red-300 px-2 py-1"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                  {rowError[c.slug] && (
                    <p className="text-red-400 text-xs mt-1">{rowError[c.slug]}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
