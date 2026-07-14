'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FactionRow } from '@/types/database'

interface FactionFormProps {
  faction?: FactionRow
}

export default function FactionForm({ faction }: FactionFormProps) {
  const router = useRouter()
  const isEdit = !!faction

  const [name, setName] = useState(faction?.name ?? '')
  const [tagline, setTagline] = useState(faction?.tagline ?? '')
  const [description, setDescription] = useState(faction?.description ?? '')
  const [imageUrl, setImageUrl] = useState(faction?.image_url ?? '')
  const [dropWeight, setDropWeight] = useState<string>(
    faction?.drop_weight?.toString() ?? '1.0'
  )
  const [isActive, setIsActive] = useState(faction?.is_active ?? true)
  const [sortOrder, setSortOrder] = useState<string>(
    faction?.sort_order?.toString() ?? '0'
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const body = {
      name,
      tagline: tagline || null,
      description: description || null,
      image_url: imageUrl || null,
      drop_weight: parseFloat(dropWeight),
      is_active: isActive,
      sort_order: parseInt(sortOrder, 10),
    }

    try {
      const res = await fetch(
        isEdit ? `/api/admin/factions/${faction.id}` : '/api/admin/factions',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      router.push('/admin/factions')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/factions/${faction!.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      router.push('/admin/factions')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">세계관 이름 *</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
          placeholder="예: 도심 라이더즈"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">태그라인</span>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
          placeholder="짧은 한 줄 설명"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">설명</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50 resize-none"
          placeholder="세계관 상세 설명"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">이미지 URL</span>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
          placeholder="https://..."
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">드랍 가중치 (0.1 ~ 10.0)</span>
        <input
          type="number"
          step="0.1"
          min="0.1"
          max="10.0"
          value={dropWeight}
          onChange={(e) => setDropWeight(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">정렬 순서</span>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
          placeholder="0"
        />
      </label>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="accent-[#AEEA00]"
        />
        <span className="text-sm">활성화</span>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-[#AEEA00] text-black font-bold px-6 py-2.5 rounded-xl hover:bg-[#c6ff00] disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '세계관 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/factions')}
          className="text-white/50 hover:text-white px-4 py-2.5 rounded-xl hover:bg-white/5 transition-colors"
        >
          취소
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="ml-auto text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-2.5 rounded-xl transition-colors"
          >
            삭제
          </button>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">세계관 삭제</h3>
            <p className="text-white/50 text-sm mb-5">
              &apos;{faction?.name}&apos;을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {loading ? '삭제 중...' : '삭제 확인'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-white/5 text-white py-2.5 rounded-xl hover:bg-white/10 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
