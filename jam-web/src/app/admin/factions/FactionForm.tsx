'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FactionRow } from '@/types/database'
import ImageUploadField from '@/components/admin/ImageUploadField'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import BackgroundGeneratorPreview, {
  type BackgroundGeneratorLivePreviewState,
} from '../badges/BackgroundGeneratorPreview'
import { parseBlobAnimation, type BlobAnimationParams } from '@/lib/blobAnimation'
import ItemBookDetailPreviewFrame from '../itembooks/ItemBookDetailPreviewFrame'

interface FactionFormProps {
  faction?: FactionRow
}

/** 3단 캐스케이드(직속 배지 / 소속 컬렉션 / 그 컬렉션의 아이템배지) 건수 — 20260819_015 */
interface CascadeCount {
  directBadges: number
  itemBooks: number
  itemBookBadges: number
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
  // 배경 테마 (20260818_004) — 세계관 자체에는 렌더링되지 않고, "하위에 일괄 적용" 버튼으로
  // 3단(직속 배지 → 소속 컬렉션 → 그 컬렉션의 아이템배지)에 1회성으로 복사하는 원본 값.
  // 제너레이터(패턴/애니메이션/Paper 필터)와 배경 쉐이더 드롭다운은 티켓 20260901_1929에서 제거.
  const [backgroundColor, setBackgroundColor] = useState<string>(faction?.background_color ?? '')
  // [20260901_1944] 배경색과 배타인 애니메이션 모드. null이면 배경색 모드다. 3단 캐스케이드의
  // 원본 값이기도 하다.
  const [backgroundAnimation, setBackgroundAnimation] = useState<BlobAnimationParams | null>(
    () => parseBlobAnimation(faction?.background_animation)
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // ── 3단 캐스케이드 일괄 적용 (20260819_015) ────────────────────────
  // 직속 배지 / 소속 컬렉션 / 그 컬렉션의 아이템배지 3단 건수를 함께 다룬다.
  const [bulkApplyLoading, setBulkApplyLoading] = useState(false)
  const [bulkApplyCount, setBulkApplyCount] = useState<CascadeCount | null>(null)
  const [showBulkApplyConfirm, setShowBulkApplyConfirm] = useState(false)
  const [bulkApplyResult, setBulkApplyResult] = useState<CascadeCount | null>(null)

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
   *  누락된 필드를 기존 DB 값 그대로 둔다(undefined 병합, factions PUT 참조). */
  const persist = async (): Promise<FactionRow> => {
    const trimmedBackgroundColor = backgroundColor.trim()

    const body = {
      name,
      tagline: tagline || null,
      description: description || null,
      image_url: imageUrl || null,
      drop_weight: parseFloat(dropWeight),
      is_active: isActive,
      sort_order: parseInt(sortOrder, 10),
      // [20260901_1944] 애니메이션 모드에서는 배경색을 검증하지 않으므로 hex가 아닌 값은 null로
      // 정리한다. 배경색 모드는 위에서 이미 검증돼 동작이 달라지지 않는다.
      background_color: HEX_COLOR_PATTERN.test(trimmedBackgroundColor) ? trimmedBackgroundColor : null,
      // 배경색과 배타 — 해제(null)도 명시적으로 보내야 PUT의 `!== undefined` 병합에서 저장된다.
      background_animation: backgroundAnimation,
    }

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

  // 배경값이 전혀 없으면 일괄 적용 시 하위(직속 배지·소속 컬렉션·그 컬렉션의 아이템배지)의 기존
  // 커스터마이징을 전부 빈 값으로 덮어쓰게 되므로 버튼을 비활성화한다
  // (티켓 20260901_1929 — 제너레이터·쉐이더 제거로 단순화).
  const hasBackgroundValue = Boolean(backgroundColor.trim()) || backgroundAnimation !== null

  // 저장된 세계관에서만 가능 — 신규 등록 화면에는 아직 하위가 존재할 수 없다.
  // 클릭 시 폼의 현재 값을 먼저 저장해(항상 최신 값 기준으로 적용) 실제 3단 캐스케이드 건수를
  // 조회한 뒤 확인 다이얼로그를 띄운다.
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

      // 서버에서 3단 조건과 동일한 WHERE로 COUNT만 계산하는 미리보기 경로 — 전체 배지/컬렉션
      // 목록을 fetch하지 않는다 (20260819_016)
      const res = await fetch(`/api/admin/factions/${faction!.id}/apply-background`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '하위 건수 조회 실패')

      setBulkApplyCount({
        directBadges: data.directBadges,
        itemBooks: data.itemBooks,
        itemBookBadges: data.itemBookBadges,
      })
      setShowBulkApplyConfirm(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '하위 건수 조회 중 오류가 발생했습니다.')
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
      setBulkApplyResult({
        directBadges: data.directBadges,
        itemBooks: data.itemBooks,
        itemBookBadges: data.itemBookBadges,
      })
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
          직속 배지 {bulkApplyResult.directBadges}개, 소속 컬렉션 {bulkApplyResult.itemBooks}개,
          컬렉션 아이템배지 {bulkApplyResult.itemBookBadges}개에 적용했어요.
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">세계관 이름 *</span>
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
          placeholder="세계관 상세 설명"
        />
      </label>

      {/* 세계관 이미지 — 원래 순수 자유 입력(https://... 텍스트 필드)이었다. 임의 호스트 URL이
          DB에 들어오면 그 값을 렌더하는 화면이 통째로 500이 되는 구조라(20260824_004),
          다른 어드민 폼과 동일하게 Storage 업로드 전용으로 바꿨다 (20260824_005). */}
      <ImageUploadField
        value={imageUrl}
        onChange={setImageUrl}
        folder="factions"
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

      {/* 배경 테마 — 3단 캐스케이드 일괄 적용 (20260818_004) */}
      <div className="border border-border rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">배경 테마</p>
          <p className="text-xs text-muted-foreground mt-1">
            이 세계관 자체에는 배경이 적용되지 않아요. 이 설정은 이 세계관에 속한 배지, 소속
            컬렉션, 그 컬렉션의 아이템배지 전체에 일괄 적용돼요.
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
                  name: name || '(세계관 이름 미입력)',
                  description: '이 세계관 소속 컬렉션에 그대로 복사되는 배경을 미리 보여줘요.',
                  image_url: imageUrl || null,
                }}
                themed={previewThemed}
                backgroundLayerStyle={backgroundLayerStyle}
                backgroundLayerRef={backgroundLayerRef}
                liveNode={liveNode}
                backgroundAnimation={previewAnimation}
              />
              <p className="text-xs text-muted-foreground mt-2 max-w-[430px]">
                세계관 자체 화면은 없어요. 이 배경이 그대로 복사될 소속 컬렉션 상세화면과 같은
                구조로 보여줘요.
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
            {bulkApplyLoading ? '처리 중...' : '일괄 적용'}
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            {!isEdit
              ? '세계관을 먼저 등록해야 일괄 적용할 수 있어요.'
              : !hasBackgroundValue
                ? '배경색이나 애니메이션을 먼저 지정해야 일괄 적용할 수 있어요.'
                : '버튼을 누르면 지금 이 값이 먼저 저장되고, 이 세계관에 속한 배지·소속 컬렉션·그 컬렉션의 아이템배지에 즉시 복사돼요. 이후 세계관 배경을 바꿔도 이미 적용된 항목에는 자동 반영되지 않아요. 다시 이 버튼을 눌러야 해요.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '세계관 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/factions')}
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
            <h3 className="text-lg font-bold mb-2">세계관 삭제</h3>
            <p className="text-muted-foreground text-sm mb-5">
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
            <h3 className="text-lg font-bold mb-2">일괄 적용</h3>
            <p className="text-muted-foreground text-sm mb-5">
              직속 배지 {bulkApplyCount?.directBadges ?? 0}개, 소속 컬렉션 {bulkApplyCount?.itemBooks ?? 0}개,
              컬렉션 아이템배지 {bulkApplyCount?.itemBookBadges ?? 0}개의 배경이 지금 이 값으로
              즉시 덮어써집니다. 개별 배지·컬렉션에서 따로 지정한 배경도 모두 이 값으로
              바뀝니다. 계속할까요?
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
    </form>
  )
}
