'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react'
import ImageUploader from '@/app/spike/background-generator/ImageUploader'
import PatternPanel from '@/app/spike/background-generator/PatternPanel'
import AnimationPanel from '@/app/spike/background-generator/AnimationPanel'
import FilterPreview from '@/app/spike/background-generator/FilterPreview'
import { loadImageFromUrl } from '@/app/spike/background-generator/loadImage'
import {
  DEFAULT_ANIMATION_PARAMS,
  DEFAULT_PATTERN_PARAMS,
  FILTER_LABELS,
  SERVICE_WIDTH,
  type FilterId,
  type Mode,
} from '@/app/spike/background-generator/types'
import { getBadgeBackgroundStyle } from '@/lib/badgeBackgroundTheme'
import BackgroundColorField from '@/components/admin/BackgroundColorField'
import BadgeDetailPreviewFrame from './BadgeDetailPreviewFrame'
import { bakePreviewToBlob } from './bakePreviewToBlob'
import type { BadgeRarity } from '@/types/database'

export type BackgroundMode = 'color' | 'generator'

/** 미리보기 본문에 넣는 예시 조건 문구 — 실제 조건은 배지마다 달라 저작 화면에서는 알 수 없다 */
const PREVIEW_CONDITION_TEXT = '실제 화면에서는 이 자리에 배지 획득 조건이 표시돼요.'

/** 제너레이터의 이미지 입력 소스 — 새로 업로드하거나 이미 등록된 배지 이미지를 재사용 (20260819_008) */
type ImageSource = 'upload' | 'existing'

interface BackgroundGeneratorPreviewProps {
  name: string
  description: string
  rarity: BadgeRarity
  /** 배지 본체 이미지 URL(이미 폼에 로드돼 있음) — "등록된 배지 이미지 사용" 소스로 재사용 */
  imageUrl: string
  backgroundColor: string
  onBackgroundColorChange: (value: string) => void
  mode: BackgroundMode
  onModeChange: (mode: BackgroundMode) => void
  /** 이미 저장된 배경 제너레이터 결과(수정 모드). 원시 설정값은 저장하지 않으므로 재편집은
   *  불가능하지만, 이번 세션에 새 이미지를 고르기 전까지는 저장된 결과를 미리보기에 그대로
   *  보여준다 — 폼을 열자마자 배경이 사라진 것처럼 보이지 않게 하기 위함. */
  initialBackgroundImageUrl: string | null
}

export interface BackgroundGeneratorPreviewHandle {
  /**
   * 현재 미리보기를 PNG Blob으로 구워 반환한다. 이번 세션에 이미지를 하나도 고르지 않았으면(즉
   * 새로 구울 게 없으면) null을 반환한다 — 호출부(BadgeForm)가 이 경우 기존 저장값을 그대로
   * 유지할지(수정) 또는 아예 없음으로 둘지(신규) 판단한다.
   */
  bakeToBlob(): Promise<Blob | null>
}

/**
 * 배경 제너레이터 — BadgeForm 통합 저작 UI + 라이브 미리보기 + 실제 저장 연동 (티켓 20260819_007,
 * 20260819_008).
 *
 * - 스파이크(`/spike/background-generator`, 티켓 20260819_001~006)에서 검증된 패턴/애니메이션/
 *   Paper 필터 파이프라인을 그대로 재사용한다(알고리즘 재작성 없음).
 * - "단색"/"제너레이터"는 상호 배타적 라디오 선택이다(20260819_008). 어느 쪽을 선택했는지는 상위
 *   (`BadgeForm`)가 소유한 상태로 끌어올려져 있다 — 저장 시 배경색 검증·payload 구성을 그대로
 *   담당하기 위함이다. 이 컴포넌트는 모드에 따라 "단색" 필드 또는 제너레이터 컨트롤 중 하나만
 *   보여주고, 라이브 미리보기도 선택된 모드의 결과만 반영한다.
 * - "저장"은 이 컴포넌트가 직접 하지 않는다. `ref.bakeToBlob()`으로 현재 합성 결과를 PNG Blob으로
 *   구워 반환하기만 하고, 실제 업로드(API 재사용)·payload 구성·저장 요청은 `BadgeForm.handleSubmit`
 *   책임이다.
 * - admin 화면이므로 MODULAR 디자인 시스템 적용 대상이 아니다(기존 정책).
 */
const BackgroundGeneratorPreview = forwardRef<BackgroundGeneratorPreviewHandle, BackgroundGeneratorPreviewProps>(
  function BackgroundGeneratorPreview(
    { name, description, rarity, imageUrl, backgroundColor, onBackgroundColorChange, mode, onModeChange, initialBackgroundImageUrl },
    ref
  ) {
    const [imageSource, setImageSource] = useState<ImageSource>('upload')
    const [file, setFile] = useState<File | null>(null)
    const [image, setImage] = useState<HTMLImageElement | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)

    const [patternMode, setPatternMode] = useState<Mode>('pattern')
    const [patternParams, setPatternParams] = useState(DEFAULT_PATTERN_PARAMS)
    const [animationParams, setAnimationParams] = useState(DEFAULT_ANIMATION_PARAMS)
    const [filterId, setFilterId] = useState<FilterId>('none')
    const [filterSource, setFilterSource] = useState<string | null>(null)
    const [previewNode, setPreviewNode] = useState<ReactNode>(null)

    const previewLayerRef = useRef<HTMLDivElement>(null)

    const isGif = file?.type === 'image/gif'

    // 순수 계산으로 objectURL을 도출한다 (상태/이펙트 불필요) — 해제만 별도 이펙트에서 처리
    const objectUrl = useMemo(() => (imageSource === 'upload' && file ? URL.createObjectURL(file) : null), [imageSource, file])

    useEffect(() => {
      return () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
    }, [objectUrl])

    // 소스 ① 새 이미지 업로드 — 동일 출처 objectURL이라 CORS 이슈 없음
    useEffect(() => {
      if (!objectUrl) return
      let cancelled = false
      loadImageFromUrl(objectUrl)
        .then((img) => {
          if (cancelled) return
          setImage(img)
          setLoadError(null)
        })
        .catch(() => {
          if (!cancelled) setLoadError('이미지를 불러오지 못했습니다. 다른 파일로 시도해주세요.')
        })
      return () => {
        cancelled = true
      }
    }, [objectUrl])

    // 소스 ② 등록된 배지 이미지 재사용 — Storage 원격 URL이라 이후 캔버스 합성 결과를
    // toDataURL/toBlob으로 읽을 수 있도록 crossOrigin='anonymous'로 로드한다 (20260819_008)
    useEffect(() => {
      if (imageSource !== 'existing') return
      if (!imageUrl) {
        setImage(null)
        return
      }
      let cancelled = false
      setFilterSource(null)
      setPreviewNode(null)
      loadImageFromUrl(imageUrl, { crossOrigin: 'anonymous' })
        .then((img) => {
          if (cancelled) return
          setImage(img)
          setLoadError(null)
        })
        .catch(() => {
          if (!cancelled) setLoadError('등록된 배지 이미지를 불러오지 못했습니다.')
        })
      return () => {
        cancelled = true
      }
    }, [imageSource, imageUrl])

    // 이미지를 새로 고르면 이전 합성 결과가 남아 보이지 않도록 초기화(이벤트 핸들러에서 직접 처리
    // — 이펙트 내 setState 캐스케이드를 피하기 위함)
    const handleFileSelected = (f: File) => {
      setFile(f)
      setFilterSource(null)
      setPreviewNode(null)
    }

    const handleImageSourceChange = (source: ImageSource) => {
      setImageSource(source)
      setFile(null)
      setImage(null)
      setFilterSource(null)
      setPreviewNode(null)
      setLoadError(null)
    }

    useImperativeHandle(ref, () => ({
      async bakeToBlob() {
        if (!image || !previewLayerRef.current) return null
        return bakePreviewToBlob(previewLayerRef.current, SERVICE_WIDTH)
      },
    }))

    // 라이브 미리보기 — 선택된 모드의 결과만 반영한다(상호 배타적). "제너레이터" 모드에서 이번
    // 세션에 새 이미지를 고르지 않았으면(image === null) 기존에 저장된 배경 이미지를 그대로
    // 보여준다(재편집은 안 되지만 "저장된 게 사라진 것처럼" 보이지는 않게).
    const previewBadge = {
      image_url: imageUrl || null,
      name: name || '(배지 이름 미입력)',
      rarity,
      description,
      background_color: mode === 'color' ? backgroundColor || null : null,
      background_shader_id: null,
      background_image_url: null,
    }

    // 실제 배지 상세화면의 고정 배경 레이어(badges/[id]/page.tsx의 badgeBackgroundLayer)와 동일한
    // 계산기를 재사용 — "단색" 모드일 때만 배경색을 기저로 깔고, "제너레이터" 모드에서는 그 위에
    // 합성 결과 노드를 얹는다.
    const backgroundLayerStyle = getBadgeBackgroundStyle({
      background_color: mode === 'color' ? backgroundColor || null : null,
      background_shader_id: null,
      background_image_url: null,
    })

    // 제너레이터 모드에서 배경 레이어에 실제로 그려질 노드 (20260819_011)
    const savedBackgroundVisible = mode === 'generator' && !image && Boolean(initialBackgroundImageUrl)
    const liveNode: ReactNode =
      mode !== 'generator'
        ? null
        : filterSource
          ? previewNode
          : savedBackgroundVisible
            ? // eslint-disable-next-line @next/next/no-img-element
              <img src={initialBackgroundImageUrl ?? ''} alt="저장된 배경" />
            : null

    // 배경 레이어에 실제로 무언가 그려지는 상태인지 — 실제 화면에서 배경이 있는 배지와 동일하게
    // TopNav·Hero 카드를 투명 처리할지 결정한다. 아무것도 없으면 배경 없는 배지와 똑같이 보인다.
    const themed = mode === 'color' ? Boolean(backgroundColor) : Boolean(filterSource) || savedBackgroundVisible

    // 2단 배치에서 설정 영역이 눌리지 않도록, 넓은 화면(xl↑)에서는 이 섹션만 폼 기본 폭
    // (max-w-2xl)을 넘어 어드민 본문 가용 폭까지 넓힌다(사이드바 16rem + 여백 감안).
    return (
      <div className="border border-dashed border-[#9333ea]/40 rounded-2xl p-5 space-y-5 bg-[#fdf4ff] xl:w-[calc(100vw-22rem)] xl:max-w-[1040px]">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-[#9333ea]">배경 테마</p>
          <p className="text-xs text-[#6b7280]">
            단색을 지정하거나, 이미지를 패턴/애니메이션으로 합성하고 Paper 필터를 적용한 배경을
            만들 수 있어요. 저장 시 선택하지 않은 쪽 값은 지워져요.
          </p>
        </div>

        {/* PC는 좌측 설정 / 우측 미리보기 2단, 모바일은 위 미리보기 / 아래 설정 (20260819_011) —
            DOM 순서는 [설정, 미리보기]로 두고 모바일에서만 flex-col-reverse로 뒤집는다. */}
        <div className="flex flex-col-reverse gap-5 xl:flex-row xl:items-start">
          <div className="flex-1 min-w-0 space-y-5">
        {/* 단색/제너레이터 배타 선택 (20260819_008) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-[#374151] cursor-pointer">
              <input
                type="radio"
                name="background-mode"
                checked={mode === 'color'}
                onChange={() => onModeChange('color')}
                className="accent-[#111111]"
              />
              단색
            </label>
            <label className="flex items-center gap-1.5 text-sm text-[#374151] cursor-pointer">
              <input
                type="radio"
                name="background-mode"
                checked={mode === 'generator'}
                onChange={() => onModeChange('generator')}
                className="accent-[#111111]"
              />
              제너레이터
            </label>
          </div>
          <p className="text-xs text-[#9ca3af]">
            단색과 제너레이터는 동시에 사용할 수 없어요. 다른 모드로 전환한 뒤 저장하면 지금 모드의
            배경값은 지워져요.
          </p>
        </div>

        {mode === 'color' ? (
          <BackgroundColorField
            value={backgroundColor}
            onChange={onBackgroundColorChange}
            helperText="배지 이미지를 업로드하면 평균 색상이 자동으로 채워져요. 색상 피커나 직접 입력으로 바꿀 수 있고, 비워두면 기본 배경을 사용해요."
          />
        ) : (
          <>
            {/* 이미지 소스 선택 (20260819_008) */}
            <div className="flex flex-col gap-2 border-t border-[#e5e7eb] pt-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-[#374151] cursor-pointer">
                  <input
                    type="radio"
                    name="background-image-source"
                    checked={imageSource === 'upload'}
                    onChange={() => handleImageSourceChange('upload')}
                    className="accent-[#111111]"
                  />
                  새 이미지 업로드
                </label>
                <label className={['flex items-center gap-1.5 text-xs cursor-pointer', imageUrl ? 'text-[#374151]' : 'text-[#c4c4c4] cursor-not-allowed'].join(' ')}>
                  <input
                    type="radio"
                    name="background-image-source"
                    checked={imageSource === 'existing'}
                    onChange={() => handleImageSourceChange('existing')}
                    disabled={!imageUrl}
                    className="accent-[#111111]"
                  />
                  등록된 배지 이미지 사용
                </label>
              </div>

              {imageSource === 'upload' ? (
                <ImageUploader onFileSelected={handleFileSelected} fileName={file?.name ?? null} isGif={isGif} />
              ) : (
                <p className="text-xs text-[#6b7280]">
                  {imageUrl
                    ? '위에서 등록한 배지 이미지를 배경 소스로 그대로 사용해요.'
                    : '배지 이미지를 먼저 업로드해야 사용할 수 있어요.'}
                </p>
              )}
            </div>
            {loadError && <p className="text-xs text-red-600">{loadError}</p>}

            {image && (
              <>
                <div className="flex flex-col gap-4 border-t border-[#e5e7eb] pt-4">
                  <div className="flex items-center gap-2">
                    {(['pattern', 'animation'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPatternMode(m)}
                        className={[
                          'rounded-lg px-4 py-2 text-sm transition-colors',
                          patternMode === m ? 'bg-[#111111] text-white' : 'bg-white border border-[#e5e7eb] text-[#374151] hover:bg-[#f3f4f6]',
                        ].join(' ')}
                      >
                        {m === 'pattern' ? '패턴 모드' : '애니메이션 모드'}
                      </button>
                    ))}
                    <span className="text-xs text-[#9ca3af]">패턴/애니메이션은 배타적으로 선택됩니다.</span>
                  </div>

                  {patternMode === 'pattern' ? (
                    <PatternPanel
                      image={image}
                      params={patternParams}
                      onChange={setPatternParams}
                      onFlattenedChange={setFilterSource}
                      hidePreviewBox
                    />
                  ) : (
                    <AnimationPanel
                      image={image}
                      params={animationParams}
                      onChange={setAnimationParams}
                      previewSize={SERVICE_WIDTH}
                      onSnapshotChange={setFilterSource}
                      filterActive={filterId !== 'none'}
                      alwaysSnapshot
                      hidePreviewBox
                    />
                  )}
                </div>

                <div className="flex flex-col gap-3 border-t border-[#e5e7eb] pt-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-[#374151]">Paper 필터 (1개 선택)</p>
                    <p className="text-xs text-[#9ca3af]">
                      패턴/애니메이션 결과 위에 적용됩니다. 위 미리보기에 곧바로 반영돼요.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(FILTER_LABELS) as FilterId[]).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFilterId(id)}
                        className={[
                          'rounded-lg px-3 py-1.5 text-xs transition-colors',
                          filterId === id ? 'bg-[#111111] text-white' : 'bg-white border border-[#e5e7eb] text-[#374151] hover:bg-[#f3f4f6]',
                        ].join(' ')}
                      >
                        {FILTER_LABELS[id]}
                      </button>
                    ))}
                  </div>

                  <FilterPreview
                    filterId={filterId}
                    source={filterSource}
                    size={SERVICE_WIDTH}
                    hidePreviewBox
                    onPreviewNodeChange={setPreviewNode}
                  />
                </div>
              </>
            )}
          </>
        )}
          </div>

          {/* 실제 배지 상세화면과 동일한 구조(TopNav → Hero → 본문 → Footer) 미리보기 */}
          <div className="xl:shrink-0 overflow-x-auto">
            <BadgeDetailPreviewFrame
              badge={previewBadge}
              themed={themed}
              backgroundLayerStyle={backgroundLayerStyle}
              backgroundLayerRef={previewLayerRef}
              liveNode={liveNode}
              conditionText={PREVIEW_CONDITION_TEXT}
            />
            <p className="text-xs text-[#9ca3af] mt-2 max-w-[430px]">
              실제 배지 상세화면과 같은 구조로 보여줘요. 본문 문구는 예시라 실제 조건과 달라요.
            </p>
            {savedBackgroundVisible && (
              <p className="text-xs text-[#9ca3af] mt-1 max-w-[430px]">
                이미 저장된 배경 이미지예요. 원본 설정은 다시 불러올 수 없어요 — 이미지를 새로 고르면
                지금 보이는 배경이 교체돼요.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }
)

export default BackgroundGeneratorPreview
