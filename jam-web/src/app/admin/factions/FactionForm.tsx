'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FactionRow } from '@/types/database'
import BackgroundColorField, { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { BADGE_BACKGROUND_SHADER_OPTIONS } from '@/lib/badgeBackgroundShaderOptions'

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
  // 배경 테마 (20260818_004) — 세계관 자체에는 렌더링되지 않고, "하위 배지에 일괄 적용" 버튼으로
  // 소속 배지들의 background_color/background_shader_id에 1회성으로 복사하는 원본 값
  const [backgroundColor, setBackgroundColor] = useState<string>(faction?.background_color ?? '')
  const [backgroundShaderId, setBackgroundShaderId] = useState<string>(faction?.background_shader_id ?? '')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // ── 하위 배지 일괄 적용 ──────────────────────────────────────────
  const [bulkApplyLoading, setBulkApplyLoading] = useState(false)
  const [bulkApplyCount, setBulkApplyCount] = useState<number | null>(null)
  const [showBulkApplyConfirm, setShowBulkApplyConfirm] = useState(false)
  const [bulkApplyResult, setBulkApplyResult] = useState<number | null>(null)

  const buildBody = () => {
    const trimmedBackgroundColor = backgroundColor.trim()
    return {
      name,
      tagline: tagline || null,
      description: description || null,
      image_url: imageUrl || null,
      drop_weight: parseFloat(dropWeight),
      is_active: isActive,
      sort_order: parseInt(sortOrder, 10),
      background_color: trimmedBackgroundColor || null,
      background_shader_id: backgroundShaderId || null,
    }
  }

  const validate = (): string | null => {
    const trimmedBackgroundColor = backgroundColor.trim()
    if (trimmedBackgroundColor && !HEX_COLOR_PATTERN.test(trimmedBackgroundColor)) {
      return '배경색 형식이 올바르지 않아요. #1a1a1a처럼 #으로 시작하는 6자리 hex 값을 입력해주세요.'
    }
    return null
  }

  /** PUT/POST로 현재 폼 값을 저장한다. 성공 시 저장된 row, 실패 시 에러를 던진다. */
  const persist = async (): Promise<FactionRow> => {
    const res = await fetch(
      isEdit ? `/api/admin/factions/${faction.id}` : '/api/admin/factions',
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? '저장 실패')
    return data.faction as FactionRow
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      await persist()
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

  // 저장된 세계관에서만 가능 — 신규 등록 화면에는 아직 하위 배지가 존재할 수 없다.
  // 클릭 시 폼의 현재 값을 먼저 저장해(항상 최신 값 기준으로 적용) 실제 하위 배지 수를
  // 조회한 뒤 확인 다이얼로그를 띄운다.
  const handleBulkApplyClick = async () => {
    if (!isEdit) return
    setError(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setBulkApplyLoading(true)
    try {
      await persist()

      const res = await fetch('/api/admin/badges')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '배지 목록 조회 실패')
      type BadgeListRow = { faction_id: string | null; deleted_at: string | null }
      const count = ((data.badges ?? []) as BadgeListRow[]).filter(
        (b) => b.faction_id === faction!.id && !b.deleted_at
      ).length

      setBulkApplyCount(count)
      setShowBulkApplyConfirm(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '하위 배지 수 조회 중 오류가 발생했습니다.')
    } finally {
      setBulkApplyLoading(false)
    }
  }

  const handleBulkApplyConfirm = async () => {
    setBulkApplyLoading(true)
    try {
      const res = await fetch(`/api/admin/factions/${faction!.id}/apply-background`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '일괄 적용 실패')
      setShowBulkApplyConfirm(false)
      setBulkApplyResult(data.appliedCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : '일괄 적용 중 오류가 발생했습니다.')
    } finally {
      setBulkApplyLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
          {error}
        </div>
      )}

      {bulkApplyResult !== null && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">
          {bulkApplyResult}개 배지에 적용했어요.
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">세계관 이름 *</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50"
          placeholder="예: 도심 라이더즈"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">태그라인</span>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50"
          placeholder="짧은 한 줄 설명"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">설명</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 resize-none"
          placeholder="세계관 상세 설명"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">이미지 URL</span>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50"
          placeholder="https://..."
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">드랍 가중치 (0.1 ~ 10.0)</span>
        <input
          type="number"
          step="0.1"
          min="0.1"
          max="10.0"
          value={dropWeight}
          onChange={(e) => setDropWeight(e.target.value)}
          className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] focus:outline-none focus:border-[#111111]/50"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">정렬 순서</span>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] focus:outline-none focus:border-[#111111]/50"
          placeholder="0"
        />
      </label>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="accent-[#111111]"
        />
        <span className="text-sm">활성화</span>
      </label>

      {/* 배경 테마 — 하위 배지 일괄 적용 (20260818_004) */}
      <div className="border border-[#e5e7eb] rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-[#374151]">배경 테마</p>
          <p className="text-xs text-[#6b7280] mt-1">
            이 세계관 자체에는 배경이 적용되지 않아요. 아래 &quot;하위 배지에 일괄 적용&quot; 버튼을 눌러야
            이 세계관에 속한 배지들의 배경에 실제로 반영돼요.
          </p>
        </div>

        <BackgroundColorField
          value={backgroundColor}
          onChange={setBackgroundColor}
          helperText="세계관은 특정 이미지 1장에 종속되지 않아 자동 추출은 지원하지 않아요. 직접 입력해주세요."
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-[#374151]">배경 쉐이더 (임시)</span>
          <select
            value={backgroundShaderId}
            onChange={(e) => setBackgroundShaderId(e.target.value)}
            className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] focus:outline-none focus:border-[#111111]/50 max-w-xs"
          >
            {BADGE_BACKGROUND_SHADER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-white">{opt.label}</option>
            ))}
          </select>
          <span className="text-xs text-[#898989]">쉐이더는 아직 상세화면에 적용되지 않아요. 선택한 값은 저장만 되고 화면에는 반영되지 않아요.</span>
        </label>

        <div className="pt-1">
          <button
            type="button"
            onClick={handleBulkApplyClick}
            disabled={!isEdit || bulkApplyLoading || loading}
            className="bg-white border border-[#e5e7eb] text-[#374151] text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-[#f8f9fa] disabled:opacity-50 transition-colors"
          >
            {bulkApplyLoading ? '처리 중...' : '하위 배지에 일괄 적용'}
          </button>
          <p className="text-xs text-[#898989] mt-2">
            {isEdit
              ? '버튼을 누르면 지금 이 값이 먼저 저장되고, 이 세계관에 속한 배지들에 즉시 복사돼요. 이후 세계관 색상을 바꿔도 이미 적용된 배지에는 자동 반영되지 않아요. 다시 이 버튼을 눌러야 해요.'
              : '세계관을 먼저 등록해야 하위 배지에 일괄 적용할 수 있어요.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-[#111111] text-white font-bold px-6 py-2.5 rounded-xl hover:bg-[#242424] disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '세계관 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/factions')}
          className="text-[#6b7280] hover:text-[#111111] px-4 py-2.5 rounded-xl hover:bg-[#f8f9fa] transition-colors"
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
          <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">세계관 삭제</h3>
            <p className="text-[#6b7280] text-sm mb-5">
              &apos;{faction?.name}&apos;을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '삭제 중...' : '삭제 확인'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-white text-[#111111] py-2.5 rounded-xl hover:bg-[#f3f4f6] transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkApplyConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">하위 배지에 일괄 적용</h3>
            <p className="text-[#6b7280] text-sm mb-5">
              이 세계관에 속한 배지 {bulkApplyCount ?? 0}개의 배경색이 지금 이 값으로 즉시
              덮어써집니다. 개별 배지에서 따로 지정한 색상도 모두 이 값으로 바뀝니다. 계속할까요?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleBulkApplyConfirm}
                disabled={bulkApplyLoading}
                className="flex-1 bg-[#111111] text-white font-bold py-2.5 rounded-xl hover:bg-[#242424] disabled:opacity-50 transition-colors"
              >
                {bulkApplyLoading ? '적용 중...' : '적용 확인'}
              </button>
              <button
                onClick={() => setShowBulkApplyConfirm(false)}
                disabled={bulkApplyLoading}
                className="flex-1 bg-white text-[#111111] py-2.5 rounded-xl hover:bg-[#f3f4f6] transition-colors disabled:opacity-50"
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
