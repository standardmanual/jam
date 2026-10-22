'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SafeImage from '@/components/SafeImage'
import type { ItemBookRow, BadgeRow, TribeRow } from '@/types/database'
import BadgeSearchSelect from '@/components/admin/BadgeSearchSelect'
import BadgeMultiSearchSelect from '@/components/admin/BadgeMultiSearchSelect'
import ImageUploadField from '@/components/admin/ImageUploadField'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { Switch } from '@/components/admin/ui/switch'
import { Input } from '@/components/admin/ui/input'
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
import { FieldLabel, FieldMessage, SuffixInput } from '../badges/BadgeFormControls'
import { contentImageSourceLabel } from '@/lib/admin/contentImageSource'
import { resolvePeriodInputIso, toKstLocalInputValue } from '@/lib/admin/kst-format'
import { parseBlobAnimation, type BlobAnimationParams } from '@/lib/blobAnimation'
import ItemBookDetailPreviewFrame from './ItemBookDetailPreviewFrame'
import { BadgeActiveToggleButton } from '@/components/admin/badges/BadgeActiveToggleButton'

interface ItemBookFormProps {
  book?: ItemBookRow
  tribes: Pick<TribeRow, 'id' | 'name'>[]
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
  tribes,
  slottedBadges,
  requiredActivityBadgeLabel,
  rewardBadgeLabel,
}: ItemBookFormProps) {
  const router = useRouter()
  const isEdit = !!book
  // 4등급 방식이 켜진 컬렉션은 옛 보상 칸(완성 보상 배지·포인트 보상)을 접는다 — 값은 state에 그대로 남아 저장 때도 같이 간다(티켓 20261022_1139).
  const isTierMode = book?.tier_mode === true

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
  // 컬렉션 완성 시 지급하는 포인트 보상 (20260911_1259) — BadgeForm의 '포인트 보상' 필드와
  // 동일한 패턴(FieldLabel + SuffixInput + FieldMessage).
  const [rewardPoints, setRewardPoints] = useState<string>(book?.reward_points?.toString() ?? '0')
  const [tribeId, setTribeId] = useState(book?.tribe_id ?? '')
  const [storyText, setStoryText] = useState(book?.story_text ?? '')
  const [isActive, setIsActive] = useState(book?.is_active ?? true)
  // 노출 기간(20260914_1729) — badges.valid_from/valid_until(BadgeForm.tsx)과 동일한 패턴.
  // 기간은 KST 날짜·시각(datetime-local)으로 입력하고, 칸을 바꾸지 않았으면 저장된 ISO를 그대로 보낸다(20261004_2043).
  const toPeriodInput = (iso: string | null | undefined) => (iso ? toKstLocalInputValue(iso) : '')
  const [validFrom, setValidFrom] = useState<string>(toPeriodInput(book?.valid_from))
  const [validUntil, setValidUntil] = useState<string>(toPeriodInput(book?.valid_until))
  // 배경 테마 (20260818_004). "하위 배지에 일괄 적용" 버튼은 티켓 20260925_1416에서 제거.
  // 제너레이터(패턴/애니메이션/Paper 필터)와 배경 쉐이더 드롭다운은 티켓 20260901_1929에서 제거.
  const [backgroundColor, setBackgroundColor] = useState<string>(book?.background_color ?? '')
  // [20260901_1944] 배경색과 배타인 애니메이션 모드. null이면 배경색 모드다.
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
  // 티켓 20260914_1729: 컬렉션 비활성화는 소속 배지에 더 이상 영향을 주지 않아 영향 범위
  // 조회(badgeCount/holderUserCount)를 제거하고 정적 확인 문구로 바꿨다.
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)

  const validate = (): string | null => {
    // 애니메이션 모드에서는 배경색 입력란이 화면에 없다 — 보이지 않는 값 때문에 저장이 막히지
    // 않도록 배경색 모드일 때만 검증한다(20260901_1944).
    const trimmedBackgroundColor = backgroundColor.trim()
    if (!backgroundAnimation && trimmedBackgroundColor && !HEX_COLOR_PATTERN.test(trimmedBackgroundColor)) {
      return '배경색 형식이 올바르지 않아요. #1a1a1a처럼 #으로 시작하는 6자리 hex 값을 입력해 주세요'
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
      reward_points: Math.max(0, parseInt(rewardPoints, 10) || 0),
      tribe_id: tribeId || null,
      story_text: storyText || null,
      is_active: isActive,
      valid_from: resolvePeriodInputIso(book?.valid_from, validFrom),
      valid_until: resolvePeriodInputIso(book?.valid_until, validUntil),
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
      setError(err instanceof Error ? err.message : '컬렉션을 저장하지 못했어요')
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
      setError(err instanceof Error ? err.message : '컬렉션을 삭제하지 못했어요')
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

  /** Switch 토글 핸들러. 꺼짐 → 켜짐은 확인 없이 즉시 반영, 켜짐 → 꺼짐은 확인 모달을 띄운다 —
   *  모달에서 "계속"을 눌러야만 isActive가 false로 확정된다. 티켓 20260914_1729: 컬렉션
   *  비활성화가 소속 배지에 더 이상 영향을 주지 않아 영향 범위 조회는 제거했다. */
  const handleActiveToggle = (checked: boolean) => {
    if (checked) {
      setIsActive(true)
      return
    }
    if (!isEdit) {
      // 신규 등록 화면은 확인 없이 그대로 반영.
      setIsActive(false)
      return
    }

    setShowDeactivateConfirm(true)
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

      {/* 제작 경로 라벨(티켓 20260925_1409) — 수정 화면(book 존재)에서만 보인다. 신규 등록
          화면은 아직 image_source가 없다(적용 탭에서 반영해야 생긴다). */}
      {book && (
        <span className="inline-flex w-fit items-center whitespace-nowrap rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-semibold text-neutral-600">
          제작 경로 · {contentImageSourceLabel(book.image_source)}
        </span>
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
          placeholder="컬렉션 설명 입력"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">스토리 텍스트</span>
        <textarea
          value={storyText}
          onChange={(e) => setStoryText(e.target.value)}
          rows={3}
          className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
          placeholder="트라이브 스토리 또는 배경 설명"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">소속 트라이브</span>
        <Select
          value={tribeId || NONE_VALUE}
          onValueChange={(v) => setTribeId(v === NONE_VALUE ? '' : v)}
        >
          <SelectTrigger aria-label="소속 트라이브">
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={themeContainer ?? undefined}>
            <SelectItem value={NONE_VALUE}>— 없음 —</SelectItem>
            {tribes.map((f) => (
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

      {isTierMode ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">완성 보상</span>
          <FieldMessage className="break-keep wrap-break-word text-pretty">
            4등급 방식에서는 등급별 보상을 써요. 완성 보상 배지와 포인트 보상 칸은 접어 뒀고, 저장해 둔 값은 지우지 않아요.
          </FieldMessage>
        </div>
      ) : (
        <>
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

          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="itembook-reward-points">포인트 보상</FieldLabel>
            <SuffixInput
              id="itembook-reward-points"
              type="number"
              inputMode="numeric"
              min="0"
              value={rewardPoints}
              onChange={(e) => setRewardPoints(e.target.value)}
              placeholder="0"
              suffix="포인트"
              describedBy="itembook-reward-points-help"
            />
            <FieldMessage id="itembook-reward-points-help">
              컬렉션을 완성하는 순간 1번 지급돼요. 나중에 바꿔도 이미 지급한 포인트는 그대로예요. 0이면 지급하지 않아요.
            </FieldMessage>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <FieldLabel id="itembook-period-label">노출 기간 (한국 시각)</FieldLabel>
        <div
          role="group"
          aria-labelledby="itembook-period-label"
          aria-describedby="itembook-period-help"
          className="grid max-w-[440px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
        >
          <Input
            type="datetime-local"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            aria-label="시작 시각"
          />
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            ~
          </span>
          <Input
            type="datetime-local"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            min={validFrom || undefined}
            aria-label="종료 시각"
          />
        </div>
        <FieldMessage id="itembook-period-help">
          설정하면 해당 기간에만 컬렉션이 노출돼요. 비워 두면 상시 노출이에요. 기간 밖이거나
          비활성 상태면 컬렉션만 숨겨지고, 소속 아이템배지의 배정·활성 상태는 그대로 유지돼요.
        </FieldMessage>
        {(validFrom || validUntil) && (
          <button
            type="button"
            onClick={() => {
              setValidFrom('')
              setValidUntil('')
            }}
            className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            기간 설정 초기화
          </button>
        )}
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <Switch checked={isActive} onCheckedChange={handleActiveToggle} />
        <span className="text-sm">활성화</span>
      </label>

      {/* 배경 테마 — 컬렉션 상세화면 렌더링 (20260818_004) */}
      <div className="border border-border rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">배경 테마</p>
          <p className="text-xs text-muted-foreground mt-1">
            이 설정은 이 컬렉션 상세화면에 적용돼요.
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

      </div>

      {/* 배지 슬롯 관리 (편집 모드만) */}
      {isEdit && (
        <div className="border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">배지 슬롯 관리</p>
            <span className="text-xs text-muted-foreground">{slottedBadges.length}개 배지 등록됨</span>
          </div>

          {slottedBadges.length === 0 && (
            <p className="text-muted-foreground text-sm">등록된 배지가 없어요</p>
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
                    <SafeImage
                      src={b.image_url}
                      alt={b.name}
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-lg object-contain"
                      fallback={<span aria-hidden className="w-8 h-8 shrink-0" />}
                    />
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
              &apos;{book?.name}&apos; 컬렉션을 삭제할까요? 삭제한 컬렉션은 되돌릴 수 없어요.
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

      {/* 컬렉션 비활성화 확인 (20260823_004, 티켓 20260914_1729 — 소속 배지 연쇄 회수 폐지) */}
      <AlertDialog open={showDeactivateConfirm} onOpenChange={(open) => { if (!open) handleDeactivateCancel() }}>
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>컬렉션을 비활성화할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              비활성화하면 유저에게 더 이상 보이지 않아요. 소속 아이템배지에는 영향을 주지 않아요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <button
              type="button"
              onClick={handleDeactivateConfirm}
              className="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              비활성화
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
