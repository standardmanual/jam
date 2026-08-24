'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { ItemBookRow, BadgeRow, FactionRow } from '@/types/database'
import BadgeSearchSelect from '@/components/admin/BadgeSearchSelect'
import ImageUploadField from '@/components/admin/ImageUploadField'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { BADGE_BACKGROUND_SHADER_OPTIONS } from '@/lib/badgeBackgroundShaderOptions'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import BackgroundGeneratorPreview, {
  type BackgroundMode,
  type BackgroundGeneratorPreviewHandle,
  type BackgroundGeneratorLivePreviewState,
} from '../badges/BackgroundGeneratorPreview'
import ItemBookDetailPreviewFrame from './ItemBookDetailPreviewFrame'

interface ItemBookFormProps {
  book?: ItemBookRow
  factions: Pick<FactionRow, 'id' | 'name'>[]
  slottedBadges: Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'image_url'>[]
  availableBadges: Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'image_url'>[]
  /** 수정 화면 진입 시 필수 액티비티/완성 보상 배지 콤보박스에 처음 보여줄 이름 */
  requiredActivityBadgeLabel?: string
  rewardBadgeLabel?: string
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', legend: 'Legend', mythic: 'Mythic',
}

/**
 * 구운 배경 파일(정지 PNG / 반복 MP4)을 기존 업로드 API로 올리고 public URL을 돌려준다.
 * `BadgeForm.tsx`의 동명 헬퍼와 동일 패턴(20260819_014) — 폼마다 자기 완결적으로 두는 기존
 * 코드베이스 관례를 따른다.
 */
async function uploadBackgroundFile(blob: Blob, filename: string, mimeType: string, errorMessage: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', new File([blob], filename, { type: mimeType }))
  formData.append('folder', 'itembooks/backgrounds')
  const res = await fetch('/api/admin/upload-image', { method: 'POST', body: formData })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.url as string
}

export default function ItemBookForm({
  book,
  factions,
  slottedBadges,
  availableBadges,
  requiredActivityBadgeLabel,
  rewardBadgeLabel,
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
  // 배경 테마 (20260818_004, 20260819_014) — 컬렉션 자체에는 렌더링되지 않고, "하위 배지에 일괄
  // 적용" 버튼으로 소속 배지들의 background_color/background_image_url/background_video_url에
  // 1회성으로 복사하는 원본 값. background_shader_id는 아직 렌더링에 쓰이지 않지만 기존 동작
  // 유지 차원에서 값만 저장한다.
  const [backgroundColor, setBackgroundColor] = useState<string>(book?.background_color ?? '')
  const [backgroundShaderId, setBackgroundShaderId] = useState<string>(book?.background_shader_id ?? '')
  // "단색"/"제너레이터" 상호 배타 선택 — 기존에 저장된 배경 제너레이터 이미지가 있으면 제너레이터
  // 모드로 시작, 없으면 단색 모드로 시작한다. 컬렉션은 "자신의 이미지" 개념이 없어
  // existingImageOption은 전달하지 않는다 — 항상 새 이미지 업로드만 노출된다.
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(book?.background_image_url ? 'generator' : 'color')
  const backgroundGeneratorRef = useRef<BackgroundGeneratorPreviewHandle>(null)
  // BackgroundGeneratorPreview가 알려주는 "지금 배경 레이어에 실제로 그려지는 게 있는가" — 저장
  // 전에도 정확히 알아야 "하위 배지에 일괄 적용" 버튼 활성화 여부를 판단할 수 있다 (20260819_014)
  const [themed, setThemed] = useState<boolean>(Boolean(book?.background_color || book?.background_image_url))

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showBadgeModal, setShowBadgeModal] = useState(false)
  const [badgeSearch, setBadgeSearch] = useState('')

  // ── 켜짐 → 꺼짐 전환 확인 (20260823_004) ──────────────────────────
  // 저장 전 임시 상태이므로, 확인 모달을 취소하면 API 호출 없이 로컬 isActive를 그대로 둔다
  // (Switch를 끄는 순간에는 아직 isActive를 false로 바꾸지 않고, "계속"을 눌러야만 확정한다).
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  const [deactivationImpactLoading, setDeactivationImpactLoading] = useState(false)
  const [deactivationImpact, setDeactivationImpact] = useState<{ badgeCount: number; holderUserCount: number } | null>(null)
  const [deactivationImpactFailed, setDeactivationImpactFailed] = useState(false)

  // ── 하위 배지 일괄 적용 ──────────────────────────────────────────
  const [bulkApplyLoading, setBulkApplyLoading] = useState(false)
  const [bulkApplyCount, setBulkApplyCount] = useState<number | null>(null)
  const [showBulkApplyConfirm, setShowBulkApplyConfirm] = useState(false)
  const [bulkApplyResult, setBulkApplyResult] = useState<number | null>(null)

  const validate = (): string | null => {
    const trimmedBackgroundColor = backgroundColor.trim()
    if (backgroundMode === 'color' && trimmedBackgroundColor && !HEX_COLOR_PATTERN.test(trimmedBackgroundColor)) {
      return '배경색 형식이 올바르지 않아요. #1a1a1a처럼 #으로 시작하는 6자리 hex 값을 입력해주세요.'
    }
    return null
  }

  /** PUT/POST로 현재 폼 값을 저장한다. 성공 시 저장된 row, 실패 시 에러를 던진다.
   *  단색/제너레이터는 상호 배타적이라 저장 시 선택하지 않은 쪽은 항상 null로 정리한다
   *  (`BadgeForm.tsx`와 동일한 원칙). 제너레이터 모드에서 이번 세션에 새 이미지를 고르지
   *  않았으면 기존에 저장돼 있던 배경 이미지·영상을 그대로 유지한다. */
  const persist = async (): Promise<ItemBookRow> => {
    const trimmedBackgroundColor = backgroundColor.trim()

    let finalBackgroundColor: string | null = null
    let finalBackgroundImageUrl: string | null = null
    let finalBackgroundVideoUrl: string | null = null

    if (backgroundMode === 'color') {
      finalBackgroundColor = trimmedBackgroundColor || null
    } else {
      const baked = await backgroundGeneratorRef.current?.bake()
      if (baked) {
        finalBackgroundImageUrl = await uploadBackgroundFile(
          baked.poster,
          `background-${Date.now()}.png`,
          'image/png',
          '배경 이미지를 업로드하지 못했습니다.'
        )
        if (baked.video) {
          finalBackgroundVideoUrl = await uploadBackgroundFile(
            baked.video,
            `background-${Date.now()}.mp4`,
            'video/mp4',
            '배경 영상을 업로드하지 못했습니다.'
          )
        }
      } else {
        finalBackgroundImageUrl = book?.background_image_url ?? null
        finalBackgroundVideoUrl = book?.background_video_url ?? null
      }
    }

    const body = {
      name,
      description,
      image_url: imageUrl || null,
      required_activity_badge_id: requiredActivityBadgeId || null,
      reward_badge_id: rewardBadgeId || null,
      faction_id: factionId || null,
      story_text: storyText || null,
      is_active: isActive,
      background_color: finalBackgroundColor,
      background_shader_id: backgroundShaderId || null,
      background_image_url: finalBackgroundImageUrl,
      background_video_url: finalBackgroundVideoUrl,
    }

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
    return data.itemBook as ItemBookRow
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
      router.push('/admin/itembooks')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 배경값이 전혀 없으면 일괄 적용 시 하위 배지의 기존 커스터마이징을 전부 빈 값으로
  // 덮어쓰게 되므로 버튼을 비활성화한다. `themed`(제너레이터 포함)와 쉐이더 선택 여부를 함께 본다
  // — 쉐이더는 아직 렌더링에 쓰이지 않지만 기존(20260818_004) 활성화 조건을 그대로 유지한다.
  const hasBackgroundValue = themed || backgroundShaderId !== ''

  // 저장된 컬렉션에서만 가능 — 클릭 시 폼의 현재 값을 먼저 저장해(항상 최신 값 기준으로 적용)
  // 실제 하위 배지 수를 조회한 뒤 확인 다이얼로그를 띄운다.
  const handleBulkApplyClick = async () => {
    if (!isEdit || !hasBackgroundValue) return
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
      type BadgeListRow = { item_book_id: string | null; deleted_at: string | null }
      const count = ((data.badges ?? []) as BadgeListRow[]).filter(
        (b) => b.item_book_id === book!.id && !b.deleted_at
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
      const res = await fetch(`/api/admin/itembooks/${book!.id}/apply-background`, {
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

  /** Switch 토글 핸들러. 꺼짐 → 켜짐은 확인 없이 즉시 반영, 켜짐 → 꺼짐은 영향 범위를 조회한
   *  뒤 확인 모달을 띄운다 — 모달에서 "계속"을 눌러야만 isActive가 false로 확정된다. */
  const handleActiveToggle = async (checked: boolean) => {
    if (checked) {
      setIsActive(true)
      return
    }
    if (!isEdit) {
      // 신규 등록 화면은 아직 소속 배지가 있을 수 없으므로 확인 없이 그대로 반영.
      setIsActive(false)
      return
    }

    setDeactivationImpact(null)
    setDeactivationImpactFailed(false)
    setShowDeactivateConfirm(true)
    setDeactivationImpactLoading(true)
    try {
      const res = await fetch(`/api/admin/itembooks/${book!.id}/deactivation-impact`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '영향 범위 조회 실패')
      setDeactivationImpact({ badgeCount: data.badgeCount, holderUserCount: data.holderUserCount })
    } catch {
      setDeactivationImpactFailed(true)
    } finally {
      setDeactivationImpactLoading(false)
    }
  }

  const handleDeactivateConfirm = () => {
    setIsActive(false)
    setShowDeactivateConfirm(false)
  }

  const handleDeactivateCancel = () => {
    // Switch는 애초에 false로 바뀐 적이 없으므로(확정은 "계속" 클릭 시에만) 별도 되돌림 불필요.
    setShowDeactivateConfirm(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
          {error}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">컬렉션 이름 *</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50"
          placeholder="예: 서울 라이더 컬렉션"
        />
      </label>

      <ImageUploadField
        value={imageUrl}
        onChange={setImageUrl}
        folder="itembooks"
        label="이미지"
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">설명 *</span>
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 resize-none"
          placeholder="컬렉션 설명을 입력하세요"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">스토리 텍스트</span>
        <textarea
          value={storyText}
          onChange={(e) => setStoryText(e.target.value)}
          rows={3}
          className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 resize-none"
          placeholder="세계관 스토리 또는 배경 설명"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">소속 세계관</span>
        <select
          value={factionId}
          onChange={(e) => setFactionId(e.target.value)}
          className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] focus:outline-none focus:border-[#111111]/50"
        >
          <option value="" className="bg-white">— 없음 —</option>
          {factions.map((f) => (
            <option key={f.id} value={f.id} className="bg-white">{f.name}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">필수 액티비티 배지</span>
        <BadgeSearchSelect
          key={book?.id ?? 'new'}
          value={requiredActivityBadgeId}
          initialLabel={requiredActivityBadgeLabel}
          typeFilter="activity"
          placeholder="액티비티 배지 검색..."
          onChange={(id) => setRequiredActivityBadgeId(id)}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[#374151]">완성 보상 배지</span>
        <BadgeSearchSelect
          key={book?.id ?? 'new'}
          value={rewardBadgeId}
          initialLabel={rewardBadgeLabel}
          placeholder="보상 배지 검색..."
          onChange={(id) => setRewardBadgeId(id)}
        />
      </label>

      <label className="flex items-center gap-3 cursor-pointer">
        <Switch checked={isActive} onCheckedChange={handleActiveToggle} />
        <span className="text-sm">활성화</span>
      </label>

      {/* 배경 테마 — 컬렉션 상세화면 렌더링 + 하위 배지 일괄 적용 (20260818_004, 20260819_014) */}
      <div className="border border-[#e5e7eb] rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-[#374151]">배경 테마</p>
          <p className="text-xs text-[#6b7280] mt-1">
            이 설정은 이 컬렉션 상세화면과 소속된 모든 아이템배지 상세화면에 일괄 적용돼요.
          </p>
        </div>

        <BackgroundGeneratorPreview
          ref={backgroundGeneratorRef}
          backgroundColor={backgroundColor}
          onBackgroundColorChange={setBackgroundColor}
          mode={backgroundMode}
          onModeChange={setBackgroundMode}
          initialBackgroundImageUrl={book?.background_image_url ?? null}
          onThemedChange={setThemed}
          renderPreview={({ themed: previewThemed, backgroundLayerStyle, backgroundLayerRef, liveNode }: BackgroundGeneratorLivePreviewState) => (
            <>
              <ItemBookDetailPreviewFrame
                book={{
                  name: name || '(컬렉션 이름 미입력)',
                  description,
                  image_url: imageUrl || null,
                }}
                themed={previewThemed}
                backgroundLayerStyle={backgroundLayerStyle}
                backgroundLayerRef={backgroundLayerRef}
                liveNode={liveNode}
              />
              <p className="text-xs text-[#9ca3af] mt-2 max-w-[430px]">
                실제 컬렉션 상세화면과 같은 구조로 보여줘요. 진행도는 예시라 실제 값과 달라요.
              </p>
            </>
          )}
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
            disabled={!isEdit || !hasBackgroundValue || bulkApplyLoading || loading}
            className="bg-white border border-[#e5e7eb] text-[#374151] text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-[#f8f9fa] disabled:opacity-50 transition-colors"
          >
            {bulkApplyLoading ? '처리 중...' : '하위 배지에 일괄 적용'}
          </button>
          <p className="text-xs text-[#898989] mt-2">
            {!isEdit
              ? '컬렉션을 먼저 등록해야 하위 배지에 일괄 적용할 수 있어요.'
              : !hasBackgroundValue
                ? '배경색 또는 배경 이미지를 먼저 지정해야 일괄 적용할 수 있어요.'
                : '버튼을 누르면 지금 이 값이 먼저 저장되고, 이 컬렉션에 속한 배지들에 즉시 복사돼요. 이후 컬렉션 배경을 바꿔도 이미 적용된 배지에는 자동 반영되지 않아요. 다시 이 버튼을 눌러야 해요.'}
          </p>
        </div>
      </div>

      {bulkApplyResult !== null && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">
          {bulkApplyResult}개 배지에 적용했어요.
        </div>
      )}

      {/* 배지 슬롯 관리 (편집 모드만) */}
      {isEdit && (
        <div className="border border-[#e5e7eb] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#374151]">배지 슬롯 관리</p>
            <span className="text-xs text-[#6b7280]">{slottedBadges.length}개 배지 등록됨</span>
          </div>

          {slottedBadges.length === 0 && (
            <p className="text-[#898989] text-sm">등록된 배지가 없습니다.</p>
          )}
          <div className="space-y-2">
            {slottedBadges.map((b) => (
              <div key={b.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-2.5">
                {b.image_url && (
                  <Image src={b.image_url} alt={b.name} width={32} height={32} className="w-8 h-8 rounded-lg object-contain" />
                )}
                <span className="text-sm flex-1">{b.name}</span>
                <span className="text-xs text-[#6b7280]">{RARITY_LABEL[b.rarity] ?? b.rarity}</span>
                <button
                  type="button"
                  onClick={() => handleUnassignBadge(b.id)}
                  className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                >
                  제거
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowBadgeModal(true)}
            className="w-full border border-dashed border-[#e5e7eb] rounded-xl py-2.5 text-sm text-[#6b7280] hover:text-[#374151] hover:border-[#d1d5db] transition-colors"
          >
            + 배지 추가
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-[#111111] text-white font-bold px-6 py-2.5 rounded-xl hover:bg-[#242424] disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '컬렉션 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/itembooks')}
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
            <h3 className="text-lg font-bold mb-2">컬렉션 삭제</h3>
            <p className="text-[#6b7280] text-sm mb-5">
              &apos;{book?.name}&apos;을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
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
              이 컬렉션에 속한 배지 {bulkApplyCount ?? 0}개의 배경이 지금 이 값으로 즉시
              덮어써집니다. 개별 배지에서 따로 지정한 배경도 모두 이 값으로 바뀝니다. 계속할까요?
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

      {/* 컬렉션 비활성화 확인 — 켜짐 → 꺼짐 전환 시 소속 배지 연쇄 회수 경고 (20260823_004) */}
      <AlertDialog open={showDeactivateConfirm} onOpenChange={(open) => { if (!open) handleDeactivateCancel() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>컬렉션 비활성화</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivationImpactLoading && '영향 범위를 확인하는 중이에요...'}
              {!deactivationImpactLoading && deactivationImpactFailed &&
                '영향 범위를 확인할 수 없습니다 — 신중히 진행하세요.'}
              {!deactivationImpactLoading && !deactivationImpactFailed && deactivationImpact &&
                `이 컬렉션을 비활성화하면 소속 아이템배지 ${deactivationImpact.badgeCount}개가 함께 비활성화되고, 이미 획득한 유저 ${deactivationImpact.holderUserCount}명에게서 회수됩니다. 계속하시겠습니까?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <button
              type="button"
              onClick={handleDeactivateConfirm}
              disabled={deactivationImpactLoading}
              className="flex-1 bg-[#111111] text-white font-bold py-2.5 rounded-xl hover:bg-[#242424] disabled:opacity-50 transition-colors"
            >
              계속
            </button>
            <button
              type="button"
              onClick={handleDeactivateCancel}
              className="flex-1 bg-white text-[#111111] py-2.5 rounded-xl hover:bg-[#f3f4f6] transition-colors"
            >
              취소
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 배지 선택 모달 */}
      {showBadgeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">배지 추가</h3>
            <input
              type="text"
              placeholder="배지 이름 검색..."
              value={badgeSearch}
              onChange={(e) => setBadgeSearch(e.target.value)}
              className="w-full bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 mb-4"
            />
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {availableBadges
                .filter((b) => b.name.toLowerCase().includes(badgeSearch.toLowerCase()))
                .map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleAssignBadge(b.id)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#f8f9fa] transition-colors text-sm"
                  >
                    {b.image_url && (
                      <Image src={b.image_url} alt={b.name} width={32} height={32} className="w-8 h-8 rounded-lg object-contain" />
                    )}
                    <span>{b.name}</span>
                    <span className="text-[#6b7280] text-xs ml-auto">{RARITY_LABEL[b.rarity] ?? b.rarity}</span>
                  </button>
                ))}
            </div>
            <button
              type="button"
              onClick={() => { setShowBadgeModal(false); setBadgeSearch('') }}
              className="mt-4 w-full bg-white text-[#111111] py-2.5 rounded-xl hover:bg-[#f3f4f6] transition-colors text-sm"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
