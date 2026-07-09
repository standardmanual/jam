'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemBookRow, BadgeRow } from '@/types/database'

interface ItemBookFormProps {
  book?: ItemBookRow
  activityBadges: Pick<BadgeRow, 'id' | 'name'>[]
  itemBadges: Pick<BadgeRow, 'id' | 'name'>[]
  allBadges: Pick<BadgeRow, 'id' | 'name'>[]
}

export default function ItemBookForm({ book, activityBadges, itemBadges, allBadges }: ItemBookFormProps) {
  const router = useRouter()
  const isEdit = !!book

  const [name, setName] = useState(book?.name ?? '')
  const [description, setDescription] = useState(book?.description ?? '')
  const [requiredActivityBadgeId, setRequiredActivityBadgeId] = useState(
    book?.required_activity_badge_id ?? ''
  )
  const [requiredItemBadgeIds, setRequiredItemBadgeIds] = useState<string[]>(
    book?.required_item_badge_ids ?? []
  )
  const [rewardBadgeId, setRewardBadgeId] = useState(book?.reward_badge_id ?? '')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const toggleItemBadge = (id: string) => {
    setRequiredItemBadgeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const body = {
      name,
      description,
      required_activity_badge_id: requiredActivityBadgeId,
      required_item_badge_ids: requiredItemBadgeIds,
      reward_badge_id: rewardBadgeId || null,
    }

    try {
      const res = await fetch(
        isEdit ? `/api/admin/itembooks/${book.id}` : '/api/admin/itembooks',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      router.push('/admin/itembooks')
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
      const res = await fetch(`/api/admin/itembooks/${book!.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      router.push('/admin/itembooks')
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
        <span className="text-sm text-white/60">아이템북 이름 *</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
          placeholder="예: 서울 라이더 컬렉션"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">설명 *</span>
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50 resize-none"
          placeholder="아이템북 설명을 입력하세요"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">필수 액티비티 배지 *</span>
        <select
          required
          value={requiredActivityBadgeId}
          onChange={(e) => setRequiredActivityBadgeId(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
        >
          <option value="" className="bg-[#1a1a1a]">— 선택 —</option>
          {activityBadges.map((b) => (
            <option key={b.id} value={b.id} className="bg-[#1a1a1a]">{b.name}</option>
          ))}
        </select>
      </label>

      <div>
        <p className="text-sm text-white/60 mb-2">필수 아이템 배지 (복수 선택) *</p>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 max-h-48 overflow-y-auto space-y-2">
          {itemBadges.length === 0 && (
            <p className="text-white/30 text-sm">등록된 아이템 배지가 없습니다.</p>
          )}
          {itemBadges.map((b) => (
            <label key={b.id} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={requiredItemBadgeIds.includes(b.id)}
                onChange={() => toggleItemBadge(b.id)}
                className="accent-[#AEEA00]"
              />
              <span className="text-sm">{b.name}</span>
            </label>
          ))}
        </div>
        {requiredItemBadgeIds.length > 0 && (
          <p className="text-xs text-white/40 mt-1.5">
            선택됨: {requiredItemBadgeIds.length}개
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">완성 보상 배지</span>
        <select
          value={rewardBadgeId}
          onChange={(e) => setRewardBadgeId(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
        >
          <option value="" className="bg-[#1a1a1a]">— 없음 —</option>
          {allBadges.map((b) => (
            <option key={b.id} value={b.id} className="bg-[#1a1a1a]">{b.name}</option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-[#AEEA00] text-black font-bold px-6 py-2.5 rounded-xl hover:bg-[#c6ff00] disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '아이템북 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/itembooks')}
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
            <h3 className="text-lg font-bold mb-2">아이템북 삭제</h3>
            <p className="text-white/50 text-sm mb-5">
              &apos;{book?.name}&apos;을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
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
