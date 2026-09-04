'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { ItemBookRow, BadgeRow, FactionRow } from '@/types/database'
import BadgeSearchSelect from '@/components/admin/BadgeSearchSelect'
import BadgeMultiSearchSelect from '@/components/admin/BadgeMultiSearchSelect'
import ImageUploadField from '@/components/admin/ImageUploadField'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { Switch } from '@/components/admin/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import BackgroundGeneratorPreview, {
  type BackgroundGeneratorLivePreviewState,
} from '../badges/BackgroundGeneratorPreview'
import { parseBlobAnimation, type BlobAnimationParams } from '@/lib/blobAnimation'
import ItemBookDetailPreviewFrame from './ItemBookDetailPreviewFrame'
import { BadgeActiveToggleButton } from '@/components/admin/badges/BadgeActiveToggleButton'

interface ItemBookFormProps {
  book?: ItemBookRow
  factions: Pick<FactionRow, 'id' | 'name'>[]
  // [20260902_1043] 이 컬렉션에 배정된 전체 배지(활성+비활성) — deleted_at이 있으면 유저 노출에서
  // 회수된(비활성) 배지지만, 배정 관계(item_book_id) 자체는 남아있으므로 목록에서 제외하지 않는다.
  slottedBadges: Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'image_url' | 'deleted_at'>[]
  /** 수정 화면 진입 시 필수 액티비티/완성 보상 배지 콤보박스에 처음 보여줄 이름 */
  requiredActivityBadgeLabel?: string
  rewardBadgeLabel?: string
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic',
}

// Radix Select는 SelectItem value=""를 허용하지 않는다 — "선택 안 함"을 나타내는 전용 값.
const NONE_VALUE = '__none__'

export default function ItemBookForm({
  book,
  factions,
  slottedBadges,
  requiredActivityBadgeLabel,
  rewardBadgeLabel,
}: ItemBookFormProps) {
  const router = useRouter()
  const isEdit = !!book

  // Select/AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민
  // 테마 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다 (4단계a `BadgeForm.tsx`와 동일 패턴, 20260826_018).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

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
  // 배경 테마 (20260818_004) — 컬렉션 자체에는 렌더링되지 않고, "하위 배지에 일괄 적용" 버튼으로
  // 소속 배지들의 background_color에 1회성으로 복사하는 원본 값. 제너레이터(패턴/애니메이션/Paper
  // 필터)와 배경 쉐이더 드롭다운은 티켓 20260901_1929에서 제거.
  const [backgroundColor, setBackgroundColor] = useState<string>(book?.background_color ?? '')
  // [20260901_1944] 배경색과 배타인 애니메이션 모드. null이면 배경색 모드다. 하위 배지 일괄
  // 적용의 원본 값이기도 하다.
  const [backgroundAnimation, setBackgroundAnimation] = useState<BlobAnimationParams | null>(
    () => parseBlobAnimation(book?.background_animation)
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showBadgeModal, setShowBadgeModal] = useState(false)

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
    // 애니메이션 모드에서는 배경색 입력란이 화면에 없다 — 보이지 않는 값 때문에 저장이 막히지
    // 않도록 배경색 모드일 때만 검증한다(20260901_1944).
    const trimmedBackgroundColor = backgroundColor.trim()
    if (!backgroundAnimation && trimmedBackgroundColor && !HEX_COLOR_PATTERN.test(trimmedBackgroundColor)) {
      return '배경색 형식이 올바르지 않아요. #1a1a1a처럼 #으로 시작하는 6자리 hex 값을 입력해주세요.'
    }
    return null
  }

  /** PUT/POST로 현재 폼 값을 저장한다. 성공 시 저장된 row, 실패 시 에러를 던진다.
   *  background_shader_id/background_image_url/background_video_url은 보내지 않는다
   *  (티켓 20260901_1929) — 제너레이터가 사라져 이 필드들을 새로 만들 방법이 없고, 저장 API는
   *  누락된 필드를 기존 DB 값 그대로 둔다(undefined 병합, item_books PUT 참조). */
  const persist = async (): Promise<ItemBookRow> => {
    const trimmedBackgroundColor = backgroundColor.trim()

    const body = {
      name,
      description,
      image_url: imageUrl || null,
      required_activity_badge_id: requiredActivityBadgeId || null,
      reward_badge_id: rewardBadgeId || null,
      faction_id: factionId || null,
      story_text: storyText || null,
      is_active: isActive,
      // [20260901_1944] 애니메이션 모드에서는 배경색을 검증하지 않으므로 hex가 아닌 값은 null로
      // 정리한다. 배경색 모드는 위에서 이미 검증돼 동작이 달라지지 않는다.
      background_color: HEX_COLOR_PATTERN.test(trimmedBackgroundColor) ? trimmedBackgroundColor : null,
      // 배경색과 배타 — 해제(null)도 명시적으로 보내야 PUT의 `!== undefined` 병합에서 저장된다.
      background_animation: backgroundAnimation,
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
  // 덮어쓰게 되므로 버튼을 비활성화한다 (티켓 20260901_1929 — 제너레이터·쉐이더 제거로 단순화).
  const hasBackgroundValue = Boolean(backgroundColor.trim()) || backgroundAnimation !== null

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

  // 클릭해도 모달을 닫지 않는다 — 계속 검색해서 여러 배지를 이어서 추가할 수 있는 멀티애드 UX
  // (20260826_011). 배정된 배지는 unassigned=true 검색에서 자연히 빠지므로 별도 제외 처리 불필요.
  const handleAssignBadge = async (badgeId: string) => {
    const res = await fetch(`/api/admin/badges/${badgeId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_book_id: book!.id }),
    })
    if (res.ok) router.refresh()
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
        <span className="text-sm text-foreground">컬렉션 이름 *</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
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
        <span className="text-sm text-foreground">설명 *</span>
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
          placeholder="컬렉션 설명을 입력하세요"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">스토리 텍스트</span>
        <textarea
          value={storyText}
          onChange={(e) => setStoryText(e.target.value)}
          rows={3}
          className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
          placeholder="세계관 스토리 또는 배경 설명"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">소속 세계관</span>
        <Select
          value={factionId || NONE_VALUE}
          onValueChange={(v) => setFactionId(v === NONE_VALUE ? '' : v)}
        >
          <SelectTrigger aria-label="소속 세계관">
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={themeContainer ?? undefined}>
            <SelectItem value={NONE_VALUE}>— 없음 —</SelectItem>
            {factions.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">필수 액티비티 배지</span>
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
        <span className="text-sm text-foreground">완성 보상 배지</span>
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

      {/* 배경 테마 — 컬렉션 상세화면 렌더링 + 하위 배지 일괄 적용 (20260818_004) */}
      <div className="border border-border rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">배경 테마</p>
          <p className="text-xs text-muted-foreground mt-1">
            이 설정은 이 컬렉션 상세화면과 소속된 모든 아이템배지 상세화면에 일괄 적용돼요.
          </p>
        </div>

        <BackgroundGeneratorPreview
          backgroundColor={backgroundColor}
          onBackgroundColorChange={setBackgroundColor}
          backgroundAnimation={backgroundAnimation}
          onBackgroundAnimationChange={setBackgroundAnimation}
          renderPreview={({ themed: previewThemed, backgroundLayerStyle, backgroundLayerRef, liveNode, backgroundAnimation: previewAnimation }: BackgroundGeneratorLivePreviewState) => (
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
                backgroundAnimation={previewAnimation}
              />
              <p className="text-xs text-muted-foreground mt-2 max-w-[430px]">
                실제 컬렉션 상세화면과 같은 구조로 보여줘요. 진행도는 예시라 실제 값과 달라요.
              </p>
            </>
          )}
        />

        <div className="pt-1">
          <button
            type="button"
            onClick={handleBulkApplyClick}
            disabled={!isEdit || !hasBackgroundValue || bulkApplyLoading || loading}
            className="bg-white border border-border text-foreground text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {bulkApplyLoading ? '처리 중...' : '하위 배지에 일괄 적용'}
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            {!isEdit
              ? '컬렉션을 먼저 등록해야 하위 배지에 일괄 적용할 수 있어요.'
              : !hasBackgroundValue
                ? '배경색이나 애니메이션을 먼저 지정해야 일괄 적용할 수 있어요.'
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
        <div className="border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">배지 슬롯 관리</p>
            <span className="text-xs text-muted-foreground">{slottedBadges.length}개 배지 등록됨</span>
          </div>

          {slottedBadges.length === 0 && (
            <p className="text-muted-foreground text-sm">등록된 배지가 없습니다.</p>
          )}
          <div className="space-y-2">
            {slottedBadges.map((b) => {
              const isBadgeInactive = !!b.deleted_at
              return (
                <div
                  key={b.id}
                  className={`flex items-center gap-3 bg-white rounded-xl px-4 py-2.5 ${isBadgeInactive ? 'opacity-50' : ''}`}
                >
                  {b.image_url && (
                    <Image src={b.image_url} alt={b.name} width={32} height={32} className="w-8 h-8 rounded-lg object-contain" />
                  )}
                  <span className="text-sm flex-1">{b.name}</span>
                  {isBadgeInactive && (
                    <span className="text-xs font-semibold text-red-600">비활성</span>
                  )}
                  <span className="text-xs text-muted-foreground">{b.rarity ? RARITY_LABEL[b.rarity] : '—'}</span>
                  <BadgeActiveToggleButton badgeId={b.id} isActive={!isBadgeInactive} />
                  <button
                    type="button"
                    onClick={() => handleUnassignBadge(b.id)}
                    className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    제거
                  </button>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowBadgeModal(true)}
            className="w-full border border-dashed border-border rounded-xl py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            + 배지 추가
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '컬렉션 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/itembooks')}
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
            <h3 className="text-lg font-bold mb-2">컬렉션 삭제</h3>
            <p className="text-muted-foreground text-sm mb-5">
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
                className="flex-1 bg-white text-foreground py-2.5 rounded-xl hover:bg-muted transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkApplyConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white border border-border rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">하위 배지에 일괄 적용</h3>
            <p className="text-muted-foreground text-sm mb-5">
              이 컬렉션에 속한 배지 {bulkApplyCount ?? 0}개의 배경이 지금 이 값으로 즉시
              덮어써집니다. 개별 배지에서 따로 지정한 배경도 모두 이 값으로 바뀝니다. 계속할까요?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleBulkApplyConfirm}
                disabled={bulkApplyLoading}
                className="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {bulkApplyLoading ? '적용 중...' : '적용 확인'}
              </button>
              <button
                onClick={() => setShowBulkApplyConfirm(false)}
                disabled={bulkApplyLoading}
                className="flex-1 bg-white text-foreground py-2.5 rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 컬렉션 비활성화 확인 — 켜짐 → 꺼짐 전환 시 소속 배지 연쇄 회수 경고 (20260823_004) */}
      <AlertDialog open={showDeactivateConfirm} onOpenChange={(open) => { if (!open) handleDeactivateCancel() }}>
        <AlertDialogContent container={themeContainer ?? undefined}>
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
              className="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              계속
            </button>
            <button
              type="button"
              onClick={handleDeactivateCancel}
              className="flex-1 bg-white text-foreground py-2.5 rounded-xl hover:bg-muted transition-colors"
            >
              취소
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 배지 선택 모달 */}
      {showBadgeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white border border-border rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">배지 추가</h3>
            <BadgeMultiSearchSelect
              typeFilter="item"
              unassigned
              placeholder="아이템 배지 이름 검색..."
              onSelect={(b) => handleAssignBadge(b.id)}
            />
            <button
              type="button"
              onClick={() => setShowBadgeModal(false)}
              className="mt-4 w-full bg-white text-foreground py-2.5 rounded-xl hover:bg-muted transition-colors text-sm"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
