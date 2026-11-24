'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TribeRow } from '@/types/database'
import ImageUploadField from '@/components/admin/ImageUploadField'

interface TribeFormProps {
  tribe?: TribeRow
}

export default function TribeForm({ tribe }: TribeFormProps) {
  const router = useRouter()
  const isEdit = !!tribe

  const [name, setName] = useState(tribe?.name ?? '')
  const [tagline, setTagline] = useState(tribe?.tagline ?? '')
  const [description, setDescription] = useState(tribe?.description ?? '')
  const [imageUrl, setImageUrl] = useState(tribe?.image_url ?? '')
  const [dropWeight, setDropWeight] = useState<string>(
    tribe?.drop_weight?.toString() ?? '1.0'
  )
  const [isActive, setIsActive] = useState(tribe?.is_active ?? true)
  const [sortOrder, setSortOrder] = useState<string>(
    tribe?.sort_order?.toString() ?? '0'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  /** PUT/POST로 현재 폼 값을 저장한다. 성공 시 저장된 row, 실패 시 에러를 던진다.
   *  background_* 필드는 보내지 않는다(티켓 20261124_2254) — 배경 테마 카드를 걷어 새로 만들
   *  방법이 없고, 저장 API는 누락된 필드를 PUT에서는 기존 DB 값 그대로 두고 POST에서는 null로
   *  저장한다(tribes route 참조). */
  const persist = async (): Promise<TribeRow> => {
    const body = {
      name,
      tagline: tagline || null,
      description: description || null,
      image_url: imageUrl || null,
      drop_weight: parseFloat(dropWeight),
      is_active: isActive,
      sort_order: parseInt(sortOrder, 10),
    }

    const res = await fetch(
      isEdit ? `/api/admin/tribes/${tribe.id}` : '/api/admin/tribes',
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? '저장 실패')
    return data.tribe as TribeRow
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    setLoading(true)
    try {
      await persist()
      router.push('/admin/tribes')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '트라이브를 저장하지 못했어요')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/tribes/${tribe!.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      router.push('/admin/tribes')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '트라이브를 삭제하지 못했어요')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
          {error}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">트라이브 이름 *</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          placeholder="예: 도심 라이더즈"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">태그라인</span>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          placeholder="짧은 한 줄 설명"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">설명</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
          placeholder="트라이브 상세 설명"
        />
      </label>

      {/* 트라이브 이미지 — 원래 순수 자유 입력(https://... 텍스트 필드)이었다. 임의 호스트 URL이
          DB에 들어오면 그 값을 렌더하는 화면이 통째로 500이 되는 구조라(20260824_004),
          다른 어드민 폼과 동일하게 Storage 업로드 전용으로 바꿨다 (20260824_005).
          20260910_1226 — DB 스키마를 tribes로 완전 통일하며 신규 업로드 폴더도 "tribes"로
          바꿨다. 과거 "factions" 폴더에 이미 올라간 기존 이미지의 image_url은 그대로
          유효하다(파일 자체를 옮기지 않는 한 URL을 재작성하지 않는다). */}
      <ImageUploadField
        value={imageUrl}
        onChange={setImageUrl}
        folder="tribes"
        label="이미지"
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">드랍 가중치 (0.1 ~ 10.0)</span>
        <input
          type="number"
          step="0.1"
          min="0.1"
          max="10.0"
          value={dropWeight}
          onChange={(e) => setDropWeight(e.target.value)}
          className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:border-primary/50"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">정렬 순서</span>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:border-primary/50"
          placeholder="0"
        />
      </label>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="accent-primary"
        />
        <span className="text-sm">활성화</span>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '트라이브 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/tribes')}
          className="text-muted-foreground hover:text-foreground px-4 py-2.5 rounded-xl hover:bg-muted transition-colors"
        >
          취소
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="ml-auto text-red-600 hover:text-red-700 hover:bg-red-50 px-4 py-2.5 rounded-xl transition-colors"
          >
            삭제
          </button>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white border border-border rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">트라이브 삭제</h3>
            <p className="text-muted-foreground text-sm mb-5">
              &apos;{tribe?.name}&apos; 트라이브를 삭제할까요? 삭제한 트라이브는 되돌릴 수 없어요.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '삭제 중...' : '삭제'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-white text-foreground py-2.5 rounded-xl hover:bg-muted transition-colors"
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
