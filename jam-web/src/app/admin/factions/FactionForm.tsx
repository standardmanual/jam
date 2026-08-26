'use client'

import { lazy, Suspense, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FactionRow } from '@/types/database'
import ImageUploadField from '@/components/admin/ImageUploadField'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { BADGE_BACKGROUND_SHADER_OPTIONS } from '@/lib/badgeBackgroundShaderOptions'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type {
  BackgroundMode,
  BackgroundGeneratorPreviewHandle,
  BackgroundGeneratorLivePreviewState,
} from '../badges/BackgroundGeneratorPreview'
import ItemBookDetailPreviewFrame from '../itembooks/ItemBookDetailPreviewFrame'

// WebGL 셰이더 5종 + mp4-muxer를 정적 import하면 FactionForm 청크에 그대로 딸려온다 — React.lazy로
// 분리해 별도 청크로 지연 로드한다(20260826_011 A5). next/dynamic은 loadable 래퍼가 ref를 가로채
// `ref.bake()`(배경 저장)를 깨뜨리므로 쓰지 않는다.
const BackgroundGeneratorPreview = lazy(() => import('../badges/BackgroundGeneratorPreview'))

interface FactionFormProps {
  faction?: FactionRow
}

// Radix Select는 SelectItem value=""를 허용하지 않는다 — "선택 안 함"을 나타내는 전용 값.
const NONE_VALUE = '__none__'

/** 3단 캐스케이드(직속 배지 / 소속 컬렉션 / 그 컬렉션의 아이템배지) 건수 — 20260819_015 */
interface CascadeCount {
  directBadges: number
  itemBooks: number
  itemBookBadges: number
}

/**
 * 구운 배경 파일(정지 PNG / 반복 MP4)을 기존 업로드 API로 올리고 public URL을 돌려준다.
 * `ItemBookForm.tsx`/`BadgeForm.tsx`의 동명 헬퍼와 동일 패턴(20260819_015) — 폼마다 자기 완결적으로
 * 두는 기존 코드베이스 관례를 따른다.
 */
async function uploadBackgroundFile(blob: Blob, filename: string, mimeType: string, errorMessage: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', new File([blob], filename, { type: mimeType }))
  formData.append('folder', 'factions/backgrounds')
  const res = await fetch('/api/admin/upload-image', { method: 'POST', body: formData })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.url as string
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
  // 배경 테마 (20260818_004, 20260819_015) — 세계관 자체에는 렌더링되지 않고, "하위에 일괄 적용"
  // 버튼으로 3단(직속 배지 → 소속 컬렉션 → 그 컬렉션의 아이템배지)에 1회성으로 복사하는 원본 값
  const [backgroundColor, setBackgroundColor] = useState<string>(faction?.background_color ?? '')
  const [backgroundShaderId, setBackgroundShaderId] = useState<string>(faction?.background_shader_id ?? '')
  // "단색"/"제너레이터" 상호 배타 선택 — 기존에 저장된 배경 제너레이터 이미지가 있으면 제너레이터
  // 모드로 시작, 없으면 단색 모드로 시작한다. 세계관은 "자신의 이미지" 개념이 없어
  // existingImageOption은 전달하지 않는다 — 항상 새 이미지 업로드만 노출된다.
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(faction?.background_image_url ? 'generator' : 'color')
  const backgroundGeneratorRef = useRef<BackgroundGeneratorPreviewHandle>(null)
  // BackgroundGeneratorPreview가 알려주는 "지금 배경 레이어에 실제로 그려지는 게 있는가" — 저장
  // 전에도 정확히 알아야 "하위에 일괄 적용" 버튼 활성화 여부를 판단할 수 있다 (20260819_015)
  const [themed, setThemed] = useState<boolean>(Boolean(faction?.background_color || faction?.background_image_url))

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
    const trimmedBackgroundColor = backgroundColor.trim()
    if (backgroundMode === 'color' && trimmedBackgroundColor && !HEX_COLOR_PATTERN.test(trimmedBackgroundColor)) {
      return '배경색 형식이 올바르지 않아요. #1a1a1a처럼 #으로 시작하는 6자리 hex 값을 입력해주세요.'
    }
    return null
  }

  /** PUT/POST로 현재 폼 값을 저장한다. 성공 시 저장된 row, 실패 시 에러를 던진다.
   *  단색/제너레이터는 상호 배타적이라 저장 시 선택하지 않은 쪽은 항상 null로 정리한다
   *  (`ItemBookForm.tsx`/`BadgeForm.tsx`와 동일한 원칙). 제너레이터 모드에서 이번 세션에 새
   *  이미지를 고르지 않았으면 기존에 저장돼 있던 배경 이미지·영상을 그대로 유지한다. */
  const persist = async (): Promise<FactionRow> => {
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
        finalBackgroundImageUrl = faction?.background_image_url ?? null
        finalBackgroundVideoUrl = faction?.background_video_url ?? null
      }
    }

    const body = {
      name,
      tagline: tagline || null,
      description: description || null,
      image_url: imageUrl || null,
      drop_weight: parseFloat(dropWeight),
      is_active: isActive,
      sort_order: parseInt(sortOrder, 10),
      background_color: finalBackgroundColor,
      background_shader_id: backgroundShaderId || null,
      background_image_url: finalBackgroundImageUrl,
      background_video_url: finalBackgroundVideoUrl,
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
  // 커스터마이징을 전부 빈 값으로 덮어쓰게 되므로 버튼을 비활성화한다. `themed`(제너레이터 포함)와
  // 쉐이더 선택 여부를 함께 본다 — 쉐이더는 아직 렌더링에 쓰이지 않지만 기존(20260818_004) 활성화
  // 조건을 그대로 유지한다.
  const hasBackgroundValue = themed || backgroundShaderId !== ''

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

      {/* 배경 테마 — 3단 캐스케이드 일괄 적용 (20260818_004, 20260819_015) */}
      <div className="border border-[#e5e7eb] rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-[#374151]">배경 테마</p>
          <p className="text-xs text-[#6b7280] mt-1">
            이 세계관 자체에는 배경이 적용되지 않아요. 이 설정은 이 세계관에 속한 배지, 소속
            컬렉션, 그 컬렉션의 아이템배지 전체에 일괄 적용돼요.
          </p>
        </div>

        <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded" />}>
          <BackgroundGeneratorPreview
            ref={backgroundGeneratorRef}
            backgroundColor={backgroundColor}
            onBackgroundColorChange={setBackgroundColor}
            mode={backgroundMode}
            onModeChange={setBackgroundMode}
            initialBackgroundImageUrl={faction?.background_image_url ?? null}
            onThemedChange={setThemed}
            renderPreview={({ themed: previewThemed, backgroundLayerStyle, backgroundLayerRef, liveNode }: BackgroundGeneratorLivePreviewState) => (
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
                />
                <p className="text-xs text-[#9ca3af] mt-2 max-w-[430px]">
                  세계관 자체 화면은 없어요. 이 배경이 그대로 복사될 소속 컬렉션 상세화면과 같은
                  구조로 보여줘요.
                </p>
              </>
            )}
          />
        </Suspense>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-[#374151]">배경 쉐이더 (임시)</span>
          <Select
            value={backgroundShaderId || NONE_VALUE}
            onValueChange={(v) => setBackgroundShaderId(v === NONE_VALUE ? '' : v)}
          >
            <SelectTrigger className="max-w-xs" aria-label="배경 쉐이더">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BADGE_BACKGROUND_SHADER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value || NONE_VALUE}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-[#898989]">쉐이더는 아직 상세화면에 적용되지 않아요. 선택한 값은 저장만 되고 화면에는 반영되지 않아요.</span>
        </label>

        <div className="pt-1">
          <button
            type="button"
            onClick={handleBulkApplyClick}
            disabled={!isEdit || !hasBackgroundValue || bulkApplyLoading || loading}
            className="bg-white border border-[#e5e7eb] text-[#374151] text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-[#f8f9fa] disabled:opacity-50 transition-colors"
          >
            {bulkApplyLoading ? '처리 중...' : '일괄 적용'}
          </button>
          <p className="text-xs text-[#898989] mt-2">
            {!isEdit
              ? '세계관을 먼저 등록해야 일괄 적용할 수 있어요.'
              : !hasBackgroundValue
                ? '배경색 또는 배경 이미지를 먼저 지정해야 일괄 적용할 수 있어요.'
                : '버튼을 누르면 지금 이 값이 먼저 저장되고, 이 세계관에 속한 배지·소속 컬렉션·그 컬렉션의 아이템배지에 즉시 복사돼요. 이후 세계관 배경을 바꿔도 이미 적용된 항목에는 자동 반영되지 않아요. 다시 이 버튼을 눌러야 해요.'}
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
            <h3 className="text-lg font-bold mb-2">일괄 적용</h3>
            <p className="text-[#6b7280] text-sm mb-5">
              직속 배지 {bulkApplyCount?.directBadges ?? 0}개, 소속 컬렉션 {bulkApplyCount?.itemBooks ?? 0}개,
              컬렉션 아이템배지 {bulkApplyCount?.itemBookBadges ?? 0}개의 배경이 지금 이 값으로
              즉시 덮어써집니다. 개별 배지·컬렉션에서 따로 지정한 배경도 모두 이 값으로
              바뀝니다. 계속할까요?
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
