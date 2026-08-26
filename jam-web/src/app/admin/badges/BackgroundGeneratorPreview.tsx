'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
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
import { bakePreviewToBlob } from './bakePreviewToBlob'
import {
  BACKGROUND_VIDEO_FPS,
  bakeBackgroundVideo,
  isBackgroundVideoBakeSupported,
} from './bakeBackgroundVideo'

export type BackgroundMode = 'color' | 'generator'

/** 제너레이터의 이미지 입력 소스 — 새로 업로드하거나 이미 등록된 이미지를 재사용 (20260819_008) */
type ImageSource = 'upload' | 'existing'

/**
 * "새 이미지 업로드" 외에 "기존 이미지 재사용" 라디오 옵션을 추가로 노출하려면 전달한다.
 * 배지처럼 편집 중인 항목 자체에 대표 이미지가 있는 엔티티만 넘긴다 — 컬렉션/세계관은 대표
 * 이미지 개념이 없으므로 이 prop을 생략하면 "새 이미지 업로드" 하나만 보인다 (20260819_013).
 */
export interface BackgroundGeneratorExistingImageOption {
  /** 라디오 버튼 라벨. 예: "등록된 배지 이미지 사용" */
  label: string
  /** 재사용할 이미지 URL. 비어 있으면 라디오는 비활성 상태로 노출된다(선택 불가). */
  imageUrl: string
}

/** 라이브 미리보기 상태 — 호출부가 실제 화면 맥락(배지 상세/컬렉션/세계관)에 맞는 프레임을 그릴 때 쓴다 */
export interface BackgroundGeneratorLivePreviewState {
  /** 배경 레이어에 실제로 무언가 그려지는 상태인지 — 배경 있는 화면처럼 주변 UI를 투명 처리할지 결정 */
  themed: boolean
  /** 배경 레이어에 적용할 스타일(단색/이미지 모드) */
  backgroundLayerStyle: CSSProperties
  /** 저장(bake) 대상이 되는 배경 레이어 DOM 참조 — 호출부가 프레임 루트에 그대로 연결해야 한다 */
  backgroundLayerRef: RefObject<HTMLDivElement | null>
  /** 제너레이터 라이브 합성 노드(필터 캔버스 또는 평면화 img). 없으면 배경 레이어는 비어 있다 */
  liveNode: ReactNode
}

interface BackgroundGeneratorPreviewProps {
  backgroundColor: string
  onBackgroundColorChange: (value: string) => void
  mode: BackgroundMode
  onModeChange: (mode: BackgroundMode) => void
  /** 이미 저장된 배경 제너레이터 결과(수정 모드). 원시 설정값은 저장하지 않으므로 재편집은
   *  불가능하지만, 이번 세션에 새 이미지를 고르기 전까지는 저장된 결과를 미리보기에 그대로
   *  보여준다 — 폼을 열자마자 배경이 사라진 것처럼 보이지 않게 하기 위함. */
  initialBackgroundImageUrl: string | null
  /** "기존 이미지 재사용" 옵션. 생략하면 "새 이미지 업로드"만 노출한다 (20260819_013) */
  existingImageOption?: BackgroundGeneratorExistingImageOption
  /** 라이브 미리보기를 실제 화면 맥락에 맞게 그리는 렌더 함수. 호출부(BadgeForm 등)가 자신의
   *  상세화면과 동일한 구조로 프레임을 그린다 — 이 컴포넌트는 어떤 화면을 흉내 내는지 모른다. */
  renderPreview: (state: BackgroundGeneratorLivePreviewState) => ReactNode
  /** 배경 레이어에 실제로 무언가 그려지는 상태(themed)가 바뀔 때마다 호출된다. 호출부가 저장 전
   *  단계에서도 "지금 배경값이 있는가"를 알아야 할 때(예: 컬렉션의 "하위 배지에 일괄 적용" 버튼
   *  활성화 조건) 사용한다 — 옵션이라 넘기지 않는 기존 호출부(BadgeForm)는 영향 없음
   *  (20260819_014). */
  onThemedChange?: (themed: boolean) => void
}

/** `bake()` 결과 — 정지 이미지는 항상, 반복 영상은 애니메이션 모드에서만 만들어진다 (20260819_012) */
export interface BakedBackgroundResult {
  /** 배경 정지 PNG. 애니메이션 모드에서는 영상의 poster/폴백으로 쓰인다 */
  poster: Blob
  /** 반복 재생 MP4. 정적 패턴 모드에서는 null */
  video: Blob | null
}

export interface BackgroundGeneratorPreviewHandle {
  /**
   * 현재 미리보기를 저장 가능한 파일로 굽는다. 이번 세션에 이미지를 하나도 고르지 않았으면(즉
   * 새로 구울 게 없으면) null을 반환한다 — 호출부(BadgeForm)가 이 경우 기존 저장값을 그대로
   * 유지할지(수정) 또는 아예 없음으로 둘지(신규) 판단한다.
   *
   * - 정적 패턴 모드: PNG 1장만 굽는다(기존 동작 그대로).
   * - 애니메이션 모드: 반복 재생 MP4 + 첫 프레임 poster PNG를 함께 굽는다 (20260819_012).
   */
  bake(): Promise<BakedBackgroundResult | null>
}

/**
 * 배경 제너레이터 — 패턴/애니메이션/Paper 필터 저작 UI + 라이브 미리보기 공용 컴포넌트
 * (티켓 20260819_007, 20260819_008, 20260819_013).
 *
 * - 스파이크(`/spike/background-generator`, 티켓 20260819_001~006)에서 검증된 패턴/애니메이션/
 *   Paper 필터 파이프라인을 그대로 재사용한다(알고리즘 재작성 없음).
 * - "단색"/"제너레이터"는 상호 배타적 라디오 선택이다(20260819_008). 어느 쪽을 선택했는지는 상위
 *   컴포넌트가 소유한 상태로 끌어올려져 있다 — 저장 시 배경색 검증·payload 구성을 그대로 담당하기
 *   위함이다. 이 컴포넌트는 모드에 따라 "단색" 필드 또는 제너레이터 컨트롤 중 하나만 보여주고,
 *   라이브 미리보기도 선택된 모드의 결과만 반영한다.
 * - "저장"은 이 컴포넌트가 직접 하지 않는다. `ref.bake()`로 현재 합성 결과를 Blob으로 구워
 *   반환하기만 하고, 실제 업로드(API 재사용)·payload 구성·저장 요청은 호출부(BadgeForm 등)
 *   책임이다.
 * - **badge 전용 결합 없음 (20260819_013)**: 편집 대상이 배지인지 컬렉션인지 세계관인지 이
 *   컴포넌트는 모른다. "무엇을 편집 중인가"에 따라 달라지는 부분(대표 이미지 재사용 옵션 노출
 *   여부, 실제 상세화면과 같은 구조의 미리보기 프레임)은 각각 `existingImageOption` prop과
 *   `renderPreview` 렌더 함수로 호출부에 위임한다.
 * - admin 화면이므로 MODULAR 디자인 시스템 적용 대상이 아니다(기존 정책).
 */
const BackgroundGeneratorPreview = forwardRef<BackgroundGeneratorPreviewHandle, BackgroundGeneratorPreviewProps>(
  function BackgroundGeneratorPreview(
    { backgroundColor, onBackgroundColorChange, mode, onModeChange, initialBackgroundImageUrl, existingImageOption, renderPreview, onThemedChange },
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

    // 영상 굽기 진행 상태 (20260819_012) — 인코딩은 수 초가 걸리므로 진행 상황을 노출한다.
    // baking=true인 동안에는 스냅샷 간격을 출력 프레임레이트에 맞춰 낮추고, 사용자가 일시정지를
    // 눌러뒀더라도 엔진을 계속 돌린다.
    const [baking, setBaking] = useState(false)
    const [bakeStatus, setBakeStatus] = useState<string | null>(null)

    const previewLayerRef = useRef<HTMLDivElement>(null)

    const isGif = file?.type === 'image/gif'

    const existingImageUrl = existingImageOption?.imageUrl ?? ''

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

    // 소스 ② 기존 이미지 재사용 — Storage 원격 URL이라 이후 캔버스 합성 결과를
    // toDataURL/toBlob으로 읽을 수 있도록 crossOrigin='anonymous'로 로드한다 (20260819_008)
    useEffect(() => {
      if (imageSource !== 'existing') return
      if (!existingImageUrl) {
        setImage(null)
        return
      }
      let cancelled = false
      setFilterSource(null)
      setPreviewNode(null)
      loadImageFromUrl(existingImageUrl, { crossOrigin: 'anonymous' })
        .then((img) => {
          if (cancelled) return
          setImage(img)
          setLoadError(null)
        })
        .catch(() => {
          if (!cancelled) setLoadError('등록된 이미지를 불러오지 못했습니다.')
        })
      return () => {
        cancelled = true
      }
    }, [imageSource, existingImageUrl])

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
      async bake() {
        if (!image || !previewLayerRef.current) return null
        const container = previewLayerRef.current

        // 정적 패턴 모드는 기존과 동일하게 PNG 1장만 굽는다
        if (patternMode !== 'animation') {
          return { poster: await bakePreviewToBlob(container, SERVICE_WIDTH), video: null }
        }

        if (!isBackgroundVideoBakeSupported()) {
          throw new Error('이 브라우저에서는 배경 영상을 만들 수 없습니다. Chrome 또는 Edge 최신 버전에서 저장해주세요.')
        }

        setBaking(true)
        setBakeStatus('배경 영상을 준비하고 있어요…')
        try {
          // baking 상태가 실제 렌더링(스냅샷 간격 단축 + 강제 재생)에 반영되고 파이프라인이
          // 새 간격으로 안정될 때까지 잠깐 기다린 뒤 캡처를 시작한다
          await new Promise((resolve) => window.setTimeout(resolve, 500))
          const baked = await bakeBackgroundVideo(container, SERVICE_WIDTH, (phase, done, total) => {
            const percent = Math.round((done / total) * 100)
            setBakeStatus(phase === 'capture' ? `배경 영상 촬영 중… ${percent}%` : `배경 영상 압축 중… ${percent}%`)
          })
          return { poster: baked.poster, video: baked.video }
        } finally {
          setBaking(false)
          setBakeStatus(null)
        }
      },
    }))

    // 실제 화면의 고정 배경 레이어와 동일한 계산기를 재사용 — "단색" 모드일 때만 배경색을 기저로
    // 깔고, "제너레이터" 모드에서는 그 위에 합성 결과 노드를 얹는다.
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

    // 배경 레이어에 실제로 무언가 그려지는 상태인지 — 실제 화면에서 배경이 있는 화면과 동일하게
    // 주변 UI를 투명 처리할지 결정한다. 아무것도 없으면 배경 없는 화면과 똑같이 보인다.
    const themed = mode === 'color' ? Boolean(backgroundColor) : Boolean(filterSource) || savedBackgroundVisible

    // 호출부가 저장 전에도 "지금 배경값이 있는가"를 알아야 하는 경우를 위한 알림 (20260819_014)
    useEffect(() => {
      onThemedChange?.(themed)
    }, [themed, onThemedChange])

    // 2단 배치에서 설정 영역이 눌리지 않도록, 넓은 화면(xl↑)에서는 이 섹션만 폼 기본 폭
    // (max-w-2xl)을 넘어 어드민 본문 가용 폭까지 넓힌다(사이드바 16rem + 여백 감안).
    return (
      <div className="border border-dashed border-purple-600/40 rounded-2xl p-5 space-y-5 bg-fuchsia-50 xl:w-[calc(100vw-22rem)] xl:max-w-[1040px]">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-purple-600">배경 테마</p>
          <p className="text-xs text-muted-foreground">
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
            <label className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
              <input
                type="radio"
                name="background-mode"
                checked={mode === 'color'}
                onChange={() => onModeChange('color')}
                className="accent-primary"
              />
              단색
            </label>
            <label className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
              <input
                type="radio"
                name="background-mode"
                checked={mode === 'generator'}
                onChange={() => onModeChange('generator')}
                className="accent-primary"
              />
              제너레이터
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            단색과 제너레이터는 동시에 사용할 수 없어요. 다른 모드로 전환한 뒤 저장하면 지금 모드의
            배경값은 지워져요.
          </p>
        </div>

        {mode === 'color' ? (
          <BackgroundColorField
            value={backgroundColor}
            onChange={onBackgroundColorChange}
            helperText="이미지를 업로드하면 평균 색상이 자동으로 채워져요. 색상 피커나 직접 입력으로 바꿀 수 있고, 비워두면 기본 배경을 사용해요."
          />
        ) : (
          <>
            {/* 이미지 소스 선택 (20260819_008) — existingImageOption이 없으면 업로드만 노출 (20260819_013) */}
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              {existingImageOption && (
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="radio"
                      name="background-image-source"
                      checked={imageSource === 'upload'}
                      onChange={() => handleImageSourceChange('upload')}
                      className="accent-primary"
                    />
                    새 이미지 업로드
                  </label>
                  <label className={['flex items-center gap-1.5 text-xs cursor-pointer', existingImageUrl ? 'text-foreground' : 'text-muted-foreground/50 cursor-not-allowed'].join(' ')}>
                    <input
                      type="radio"
                      name="background-image-source"
                      checked={imageSource === 'existing'}
                      onChange={() => handleImageSourceChange('existing')}
                      disabled={!existingImageUrl}
                      className="accent-primary"
                    />
                    {existingImageOption.label}
                  </label>
                </div>
              )}

              {imageSource === 'upload' ? (
                <ImageUploader onFileSelected={handleFileSelected} fileName={file?.name ?? null} isGif={isGif} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {existingImageUrl
                    ? '위에서 등록한 이미지를 배경 소스로 그대로 사용해요.'
                    : '이미지를 먼저 업로드해야 사용할 수 있어요.'}
                </p>
              )}
            </div>
            {loadError && <p className="text-xs text-red-600">{loadError}</p>}

            {image && (
              <>
                <div className="flex flex-col gap-4 border-t border-border pt-4">
                  <div className="flex items-center gap-2">
                    {(['pattern', 'animation'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPatternMode(m)}
                        className={[
                          'rounded-lg px-4 py-2 text-sm transition-colors',
                          patternMode === m ? 'bg-primary text-white' : 'bg-white border border-border text-foreground hover:bg-muted',
                        ].join(' ')}
                      >
                        {m === 'pattern' ? '패턴 모드' : '애니메이션 모드'}
                      </button>
                    ))}
                    <span className="text-xs text-muted-foreground">패턴/애니메이션은 배타적으로 선택됩니다.</span>
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
                      // 영상을 굽는 동안에는 출력 프레임레이트에 맞춰 스냅샷을 뽑아야 끊기지 않는
                      // 영상이 나온다. 평소에는 기존 스로틀링 값(400ms)을 그대로 쓴다 (20260819_012)
                      snapshotIntervalMs={baking ? Math.round(1000 / BACKGROUND_VIDEO_FPS) : 400}
                      forcePlay={baking}
                    />
                  )}
                </div>

                <div className="flex flex-col gap-3 border-t border-border pt-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-foreground">Paper 필터 (1개 선택)</p>
                    <p className="text-xs text-muted-foreground">
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
                          filterId === id ? 'bg-primary text-white' : 'bg-white border border-border text-foreground hover:bg-muted',
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

          {/* 호출부가 실제 화면과 동일한 구조로 그리는 미리보기 프레임 (20260819_013) */}
          <div className="xl:shrink-0 overflow-x-auto">
            {renderPreview({ themed, backgroundLayerStyle, backgroundLayerRef: previewLayerRef, liveNode })}
            {/* 영상 굽기 진행 상태 (20260819_012) — 캡처 4초 + 인코딩까지 수 초가 걸린다 */}
            {bakeStatus && (
              <p className="text-xs font-medium text-purple-600 mt-2 max-w-[430px]" role="status">
                {bakeStatus} 저장이 끝날 때까지 이 화면을 닫지 마세요.
              </p>
            )}
            {mode === 'generator' && patternMode === 'animation' && image && (
              <p className="text-xs text-muted-foreground mt-1 max-w-[430px]">
                애니메이션 모드는 저장할 때 2초짜리 반복 영상으로 구워져요. 일시정지 버튼은 미리보기
                조작용이라 저장 결과에는 영향을 주지 않아요.
              </p>
            )}
            {savedBackgroundVisible && (
              <p className="text-xs text-muted-foreground mt-1 max-w-[430px]">
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
