'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemBookRow, BadgeRow, FactionRow } from '@/types/database'

interface ItemBookFormProps {
  book?: ItemBookRow
  factions: Pick<FactionRow, 'id' | 'name'>[]
  slottedBadges: Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'image_url'>[]
  availableBadges: Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'image_url'>[]
  activityBadges: Pick<BadgeRow, 'id' | 'name'>[]
  allBadges: Pick<BadgeRow, 'id' | 'name'>[]
}

export default function ItemBookForm({
  book,
  factions,
  slottedBadges,
  availableBadges,
  activityBadges,
  allBadges,
}: ItemBookFormProps) {
  const router = useRouter()
  const isEdit = !!book

  const [name, setName] = useState(book?.name ?? '')
  const [description, setDescription] = useState(book?.description ?? '')
  const [imageUrl, setImageUrl] = useState(book?.image_url ?? '')
  const [requiredActivityBadgeId, setRequiredActivityBadgeId] = useState(
    book?.required_activity_badge_id ?? ''
  )
  const [rewardBadgeId, setRewardBadgeId] = useState(book?.reward_badge_id ?? '')
  const [factionId, setFactionId] = useState(book?.faction_id ?? '')
  const [storyText, setStoryText] = useState(book?.story_text ?? '')
  const [isActive, setIsActive] = useState(book?.is_active ?? true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showBadgeModal, setShowBadgeModal] = useState(false)
  const [badgeSearch, setBadgeSearch] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const body = {
      name,
      description,
      image_url: imageUrl || null,
      required_activity_badge_id: requiredActivityBadgeId || null,
      reward_badge_id: rewardBadgeId || null,
      faction_id: factionId || null,
      story_text: storyText || null,
      is_active: isActive,
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

  const handleAssignBadge = async (badgeId: string) => {
    const res = await fetch(`/api/admin/badges/${badgeId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_book_id: book!.id }),
    })
    if (res.ok) {
      router.refresh()
      setShowBadgeModal(false)
      setBadgeSearch('')
    }
  }

  const handleUnassignBadge = async (badgeId: string) => {
    const res = await fetch(`/api/admin/badges/${badgeId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_book_id: null }),
    })
    if (res.ok) router.refresh()
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
        <span className="text-sm text-white/60">이미지 URL</span>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
          placeholder="https://..."
        />
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="미리보기" className="w-16 h-16 rounded-xl object-cover mt-1" />
        )}
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
        <span className="text-sm text-white/60">스토리 텍스트</span>
        <textarea
          value={storyText}
          onChange={(e) => setStoryText(e.target.value)}
          rows={3}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50 resize-none"
          placeholder="세계관 스토리 또는 배경 설명"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">소속 세계관</span>
        <select
          value={factionId}
          onChange={(e) => setFactionId(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
        >
          <option value="" className="bg-[#1a1a1a]">— 없음 —</option>
          {factions.map((f) => (
            <option key={f.id} value={f.id} className="bg-[#1a1a1a]">{f.name}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">필수 액티비티 배지</span>
        <select
          value={requiredActivityBadgeId}
          onChange={(e) => setRequiredActivityBadgeId(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
        >
          <option value="" className="bg-[#1a1a1a]">— 없음 —</option>
          {activityBadges.map((b) => (
            <option key={b.id} value={b.id} className="bg-[#1a1a1a]">{b.name}</option>
          ))}
        </select>
      </label>

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

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="accent-[#AEEA00]"
        />
        <span className="text-sm">활성화</span>
      </label>

      {/* 배지 슬롯 관리 (편집 모드만) */}
      {isEdit && (
        <div className="border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/70">배지 슬롯 관리</p>
            <span className="text-xs text-white/40">{slottedBadges.length}개 배지 등록됨</span>
          </div>

          {slottedBadges.length === 0 && (
            <p className="text-white/30 text-sm">등록된 배지가 없습니다.</p>
          )}
          <div className="space-y-2">
            {slottedBadges.map((b) => (
              <div key={b.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5">
                {b.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.image_url} alt={b.name} className="w-8 h-8 rounded-lg object-contain" />
                )}
                <span className="text-sm flex-1">{b.name}</span>
                <span className="text-xs text-white/40">{b.rarity}</span>
                <button
                  type="button"
                  onClick={() => handleUnassignBadge(b.id)}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                >
                  제거
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowBadgeModal(true)}
            className="w-full border border-dashed border-white/20 rounded-xl py-2.5 text-sm text-white/40 hover:text-white/60 hover:border-white/30 transition-colors"
          >
            + 배지 추가
          </button>
        </div>
      )}

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

      {/* 배지 선택 모달 */}
      {showBadgeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">배지 추가</h3>
            <input
              type="text"
              placeholder="배지 이름 검색..."
              value={badgeSearch}
              onChange={(e) => setBadgeSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50 mb-4"
            />
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {availableBadges
                .filter((b) => b.name.toLowerCase().includes(badgeSearch.toLowerCase()))
                .map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleAssignBadge(b.id)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-sm"
                  >
                    {b.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.image_url} alt={b.name} className="w-8 h-8 rounded-lg object-contain" />
                    )}
                    <span>{b.name}</span>
                    <span className="text-white/40 text-xs ml-auto">{b.rarity}</span>
                  </button>
                ))}
            </div>
            <button
              type="button"
              onClick={() => { setShowBadgeModal(false); setBadgeSearch('') }}
              className="mt-4 w-full bg-white/5 text-white py-2.5 rounded-xl hover:bg-white/10 transition-colors text-sm"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
