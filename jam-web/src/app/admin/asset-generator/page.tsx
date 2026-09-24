'use client'

/**
 * JAM! 에셋 제너레이터 — 어드민 "디자인" 화면 (티켓 20260924_2156)
 *
 * 프로토타입(jam-doc/assets/prototypes/20260924_jam-asset-generator.html)의 기본 기능을
 * 어드민 화면으로 옮긴다. 그리기 자체는 `jam-web/src/lib/asset-generator/`(티켓 20260924_2155)를
 * 그대로 쓰고, 이 화면은 상태 보관·레이아웃·"전체 무작위" 처리만 맡는다. 레이아웃·속성 패널·
 * 내보내기 패널 구조는 `src/app/admin/shader-lab/`을 참고했다(파일은 수정하지 않았다).
 *
 * 어드민 권한 게이트는 `src/app/admin/layout.tsx`가 이미 처리해 이 라우트 전용 layout은
 * 두지 않는다.
 *
 * 설정 패널 높이 제한(완료 조건: 스테이지 높이를 넘지 않는다): 프로토타입의 fitPanel()과
 * 같은 방식으로, `ResizeObserver`가 "미리보기" Card의 실측 높이(offsetHeight)를 읽어
 * "설정" Card에 인라인 `maxHeight`로 주입하고 `overflow-y-auto`로 내부 스크롤한다. 두 칸
 * 레이아웃이 아닌 좁은 화면(`lg` 미만, 1024px)에서는 `matchMedia`로 제한을 풀어 자연스럽게
 * 아래로 이어지게 한다(prototype의 두 칸 임계값 861px 대신 Tailwind `lg` 기준을 그대로 썼다).
 *
 * 이미지 레이어(티켓 20260924_2157): 업로드 원본은 화면 메모리(blob URL)에만 두고 화면을
 * 떠날 때 정리한다 — 저장소 업로드는 하위 티켓 20260924_2159가 맡는다.
 */
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import {
  choice,
  randomizeRibbonConfig,
  type ImageLayerConfig,
  type LetterKey,
  type RibbonLayerConfig,
  type StageRatio,
} from '@/lib/asset-generator'
import AssetGeneratorViewport, { type AssetGeneratorViewportHandle } from './AssetGeneratorViewport'
import AssetGeneratorPanel from './AssetGeneratorPanel'
import AssetGeneratorExport from './AssetGeneratorExport'
import {
  createImageLayer,
  deselectIfRemoved,
  INITIAL_RIBBON_LAYER,
  INITIAL_STAGE_RATIO,
  LETTER_KEYS,
  moveImageLayer,
  removeImageLayer,
} from './assetGeneratorHelpers'

export default function AssetGeneratorPage() {
  const [stageRatio, setStageRatio] = useState<StageRatio>(INITIAL_STAGE_RATIO)
  const [layer, setLayer] = useState<RibbonLayerConfig>(INITIAL_RIBBON_LAYER)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [imageLayers, setImageLayers] = useState<ImageLayerConfig[]>([])
  const [selectedImageLayerId, setSelectedImageLayerId] = useState<string | null>(null)
  const [play, setPlay] = useState(true)
  const [exportBusy, setExportBusy] = useState(false)

  const viewportRef = useRef<AssetGeneratorViewportHandle | null>(null)
  const stageCardRef = useRef<HTMLDivElement | null>(null)
  const panelCardRef = useRef<HTMLDivElement | null>(null)
  const uploadedUrlRef = useRef<string | null>(null)
  const imageLayerUrlsRef = useRef<Set<string>>(new Set())

  function handleLayerChange(patch: Partial<RibbonLayerConfig>) {
    setLayer((prev) => ({ ...prev, ...patch }))
  }

  function handleSelectLetter(letter: LetterKey) {
    setUploadedFileName(null)
    setLayer((prev) => ({ ...prev, source: { kind: 'letter', letter } }))
  }

  function handleFileSelected(file: File) {
    if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current)
    const url = URL.createObjectURL(file)
    uploadedUrlRef.current = url
    setUploadedFileName(file.name)
    setLayer((prev) => ({ ...prev, source: { kind: 'upload', assetUrl: url } }))
  }

  // 업로드한 파일의 blob URL은 화면을 떠날 때 정리한다(만든 쪽이 정리한다)
  useEffect(() => {
    const imageLayerUrls = imageLayerUrlsRef.current
    return () => {
      if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current)
      imageLayerUrls.forEach((url) => URL.revokeObjectURL(url))
      imageLayerUrls.clear()
    }
  }, [])

  // 이미지 레이어 추가: 배열 맨 앞(가장 위)에 넣고 바로 선택한다.
  function handleAddImageLayer(file: File) {
    const url = URL.createObjectURL(file)
    imageLayerUrlsRef.current.add(url)
    const newLayer = createImageLayer(url)
    setImageLayers((prev) => [newLayer, ...prev])
    setSelectedImageLayerId(newLayer.id)
  }

  // 삭제 대상이 선택돼 있었으면 선택을 해제한다(인접 레이어로 옮기지 않는다 — 기존 동작 유지).
  function handleRemoveImageLayer(id: string) {
    setImageLayers((prev) => {
      const target = prev.find((l) => l.id === id)
      if (target && imageLayerUrlsRef.current.has(target.assetUrl)) {
        URL.revokeObjectURL(target.assetUrl)
        imageLayerUrlsRef.current.delete(target.assetUrl)
      }
      return removeImageLayer(prev, id)
    })
    setSelectedImageLayerId((prev) => deselectIfRemoved(prev, id))
  }

  // id로 대상을 찾아 스왑하므로(moveImageLayer) 선택 상태는 배열 위치가 바뀌어도 그대로
  // 같은 레이어를 가리킨다 — 별도로 갱신할 필요가 없다.
  function handleMoveImageLayer(id: string, direction: 'up' | 'down') {
    setImageLayers((prev) => moveImageLayer(prev, id, direction))
  }

  function handleImageLayerChange(id: string, patch: Partial<ImageLayerConfig>) {
    setImageLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function handleReplaceImageLayerAsset(id: string, file: File) {
    const url = URL.createObjectURL(file)
    imageLayerUrlsRef.current.add(url)
    setImageLayers((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l
        if (imageLayerUrlsRef.current.has(l.assetUrl)) {
          URL.revokeObjectURL(l.assetUrl)
          imageLayerUrlsRef.current.delete(l.assetUrl)
        }
        return { ...l, assetUrl: url }
      })
    )
  }

  function handleRandomizeAll() {
    const random = randomizeRibbonConfig()
    setLayer((prev) => ({
      ...prev,
      backgroundColor: random.backgroundColor,
      endColor: random.endColor,
      linkStartToBackground: random.linkStartToBackground,
      startColor: random.linkStartToBackground ? random.backgroundColor : prev.startColor,
      sizePct: random.sizePct,
      blurPct: random.blurPct,
      rotationDeg: random.rotationDeg,
      followPath: random.followPath,
      direction: random.direction,
      irregularityPct: random.irregularityPct,
      seed: random.seed,
      speed: random.speed,
      gap: random.gap,
      count: random.count,
      // 업로드한 이미지를 쓰는 중이면 유지하고, 브랜드 글자를 쓰는 중이면 글자도 새로 고른다
      source: prev.source.kind === 'upload' ? prev.source : { kind: 'letter', letter: choice(LETTER_KEYS) },
    }))
  }

  // 설정 패널이 스테이지(미리보기 Card)보다 세로로 커지지 않도록 높이를 묶는다(원본 fitPanel, 662줄)
  useEffect(() => {
    const stageEl = stageCardRef.current
    const panelEl = panelCardRef.current
    if (!stageEl || !panelEl) return
    const twoColumnQuery = window.matchMedia('(min-width: 1024px)')
    function fitPanelHeight() {
      if (!panelEl) return
      panelEl.style.maxHeight = twoColumnQuery.matches ? `${stageEl!.offsetHeight}px` : ''
    }
    const observer = new ResizeObserver(fitPanelHeight)
    observer.observe(stageEl)
    twoColumnQuery.addEventListener('change', fitPanelHeight)
    fitPanelHeight()
    return () => {
      observer.disconnect()
      twoColumnQuery.removeEventListener('change', fitPanelHeight)
    }
  }, [])

  return (
    <div className="max-w-[1400px] space-y-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold md:text-3xl">에셋 제너레이터</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <Card ref={stageCardRef}>
          <CardHeader>
            <CardTitle>미리보기</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <AssetGeneratorViewport
              ref={viewportRef}
              stageRatio={stageRatio}
              layer={layer}
              imageLayers={imageLayers}
              play={play}
              onPlayChange={setPlay}
            />
            <AssetGeneratorExport
              viewportRef={viewportRef}
              stageRatio={stageRatio}
              layer={layer}
              play={play}
              onPlayChange={setPlay}
              onExportingChange={setExportBusy}
            />
          </CardContent>
        </Card>

        <Card ref={panelCardRef} className="lg:overflow-y-auto">
          <CardHeader>
            <CardTitle>설정</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset disabled={exportBusy} className="contents">
              <AssetGeneratorPanel
                stageRatio={stageRatio}
                onStageRatioChange={setStageRatio}
                layer={layer}
                onLayerChange={handleLayerChange}
                onSelectLetter={handleSelectLetter}
                onFileSelected={handleFileSelected}
                uploadedFileName={uploadedFileName}
                onRandomizeAll={handleRandomizeAll}
                imageLayers={imageLayers}
                selectedImageLayerId={selectedImageLayerId}
                onSelectImageLayer={setSelectedImageLayerId}
                onAddImageLayer={handleAddImageLayer}
                onRemoveImageLayer={handleRemoveImageLayer}
                onMoveImageLayer={handleMoveImageLayer}
                onImageLayerChange={handleImageLayerChange}
                onReplaceImageLayerAsset={handleReplaceImageLayerAsset}
              />
            </fieldset>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
