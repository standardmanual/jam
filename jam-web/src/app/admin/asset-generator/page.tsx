'use client'

/**
 * JAM! 에셋 제너레이터 — 어드민 "디자인" 화면 (티켓 20260924_2156)
 *
 * 프로토타입(docs/assets/prototypes/20260924_jam-asset-generator.html)의 기본 기능을
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
 *
 * 오버레이 레이어(재작업, 20260924_2158): 이미지 레이어 목록을 텍스트 레이어까지 담는
 * `overlayLayers`(이미지·텍스트 혼합, 순서 있는 목록)로 확장했다 — 티켓 20260924_2159의
 * 프리셋이 `layers` 배열 하나에 이미지·텍스트를 순서대로 저장하기 때문이다(리본은 저장하지
 * 않는다). `moveImageLayer`·`removeImageLayer`는 id 기반 제네릭이라 이름은 그대로 두고 이
 * 혼합 목록에도 쓴다(assetGeneratorHelpers.ts 주석 참고).
 *
 * 프리셋 저장·불러오기(티켓 20260924_2159): `PresetPanel`(설정 패널 안 Accordion 섹션)이
 * 저장·목록·삭제를 맡고, 이 페이지는 불러오기 결과를 반영하는 `handleLoadPreset` 하나만
 * 가진다 — 스테이지 비율·오버레이 레이어를 통째로 교체하고, 교체로 사라지는 이미지 레이어의
 * blob URL을 정리한다(`handleRemoveOverlayLayer`와 같은 정리 방식).
 *
 * 적용 탭(티켓 20260924_2200): 오른쪽 패널을 shadcn Tabs로 "제작"/"적용" 두 화면으로 나눈다.
 * 왼쪽 "미리보기" Card(스테이지 캔버스)는 탭과 무관하게 항상 그대로 보인다 — 적용 탭은 이
 * 캔버스를 그대로 공유해서 쓸 뿐 별도 캔버스를 새로 만들지 않는다(`ApplyTab.tsx` 주석 참고).
 */
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import {
  choice,
  deriveRibbonFromSeed,
  type ImageLayerConfig,
  type LetterKey,
  type OverlayLayerConfig,
  type RandomRibbonValues,
  type RibbonLayerConfig,
  type StageRatio,
  type TextLayerConfig,
} from '@/lib/asset-generator'
import AssetGeneratorViewport, { type AssetGeneratorViewportHandle } from './AssetGeneratorViewport'
import AssetGeneratorPanel from './AssetGeneratorPanel'
import AssetGeneratorExport from './AssetGeneratorExport'
import ApplyTab from './ApplyTab'
import {
  computeInitialImageWidthPct,
  createImageLayer,
  createTextLayer,
  deselectIfRemoved,
  generateRandomSeed,
  INITIAL_RIBBON_LAYER,
  INITIAL_STAGE_RATIO,
  LETTER_KEYS,
  moveImageLayer,
  readImageNaturalWidth,
  removeImageLayer,
  resolveStageSize,
} from './assetGeneratorHelpers'

export default function AssetGeneratorPage() {
  const [stageRatio, setStageRatio] = useState<StageRatio>(INITIAL_STAGE_RATIO)
  const [layer, setLayer] = useState<RibbonLayerConfig>(INITIAL_RIBBON_LAYER)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [overlayLayers, setOverlayLayers] = useState<OverlayLayerConfig[]>([])
  const [selectedOverlayLayerId, setSelectedOverlayLayerId] = useState<string | null>(null)
  const [play, setPlay] = useState(true)
  const [exportBusy, setExportBusy] = useState(false)
  const [screenTab, setScreenTab] = useState<'design' | 'apply'>('design')
  // 마스터 시드(PRD §11): 화면 초깃값은 아직 어떤 시드에서도 뽑히지 않았으므로 null이다.
  // "전체 무작위"·"시드 불러오기"가 값을 채운다 — 같은 시드를 CLI에 넣으면 같은 리본이 나온다.
  const [masterSeed, setMasterSeed] = useState<number | null>(null)

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
  // 원본 가로 px를 현재 스테이지 짧은 변 px로 나눠 처음 크기를 정한다(티켓 20260926_1741).
  async function handleAddImageLayer(file: File) {
    const url = URL.createObjectURL(file)
    imageLayerUrlsRef.current.add(url)
    const naturalWidth = await readImageNaturalWidth(url)
    const { width, height } = resolveStageSize(stageRatio)
    const newLayer = createImageLayer(
      url,
      naturalWidth ? { naturalWidth, stageShortSide: Math.min(width, height) } : undefined
    )
    setOverlayLayers((prev) => [newLayer, ...prev])
    setSelectedOverlayLayerId(newLayer.id)
  }

  // 텍스트 레이어 추가(티켓 20260924_2158): 배열 맨 앞(가장 위)에 넣고 바로 선택한다.
  function handleAddTextLayer() {
    const newLayer = createTextLayer()
    setOverlayLayers((prev) => [newLayer, ...prev])
    setSelectedOverlayLayerId(newLayer.id)
  }

  // 삭제 대상이 선택돼 있었으면 선택을 해제한다(인접 레이어로 옮기지 않는다 — 기존 동작 유지).
  // 이미지 레이어를 지울 때만 blob URL을 정리한다(텍스트 레이어는 원본 파일이 없다).
  function handleRemoveOverlayLayer(id: string) {
    setOverlayLayers((prev) => {
      const target = prev.find((l) => l.id === id)
      if (target && target.type === 'image' && imageLayerUrlsRef.current.has(target.assetUrl)) {
        URL.revokeObjectURL(target.assetUrl)
        imageLayerUrlsRef.current.delete(target.assetUrl)
      }
      return removeImageLayer(prev, id)
    })
    setSelectedOverlayLayerId((prev) => deselectIfRemoved(prev, id))
  }

  // id로 대상을 찾아 스왑하므로(moveImageLayer) 선택 상태는 배열 위치가 바뀌어도 그대로
  // 같은 레이어를 가리킨다 — 별도로 갱신할 필요가 없다.
  function handleMoveOverlayLayer(id: string, direction: 'up' | 'down') {
    setOverlayLayers((prev) => moveImageLayer(prev, id, direction))
  }

  // 프리셋 불러오기(티켓 20260924_2159): 스테이지 비율·오버레이 레이어를 통째로 교체한다.
  // 기존 이미지 레이어 중 이 화면에서 만든 blob URL은 교체로 사라지므로 함께 정리한다
  // (handleRemoveOverlayLayer와 같은 정리 방식).
  function handleLoadPreset(newStageRatio: StageRatio, newLayers: OverlayLayerConfig[]) {
    setStageRatio(newStageRatio)
    setOverlayLayers((prev) => {
      prev.forEach((l) => {
        if (l.type === 'image' && imageLayerUrlsRef.current.has(l.assetUrl)) {
          URL.revokeObjectURL(l.assetUrl)
          imageLayerUrlsRef.current.delete(l.assetUrl)
        }
      })
      return newLayers
    })
    setSelectedOverlayLayerId(null)
  }

  function handleImageLayerChange(id: string, patch: Partial<ImageLayerConfig>) {
    setOverlayLayers((prev) => prev.map((l) => (l.id === id && l.type === 'image' ? { ...l, ...patch } : l)))
  }

  function handleTextLayerChange(id: string, patch: Partial<TextLayerConfig>) {
    setOverlayLayers((prev) => prev.map((l) => (l.id === id && l.type === 'text' ? { ...l, ...patch } : l)))
  }

  // 원본을 바꾸면 새 파일의 원본 픽셀 크기로 가로 크기를 다시 맞춘다(비율은 새 이미지 기준으로 자동 계산).
  async function handleReplaceImageLayerAsset(id: string, file: File) {
    const url = URL.createObjectURL(file)
    imageLayerUrlsRef.current.add(url)
    const naturalWidth = await readImageNaturalWidth(url)
    const { width, height } = resolveStageSize(stageRatio)
    const widthPct = naturalWidth
      ? computeInitialImageWidthPct({ naturalWidth, stageShortSide: Math.min(width, height) })
      : null
    setOverlayLayers((prev) =>
      prev.map((l) => {
        if (l.id !== id || l.type !== 'image') return l
        if (imageLayerUrlsRef.current.has(l.assetUrl)) {
          URL.revokeObjectURL(l.assetUrl)
          imageLayerUrlsRef.current.delete(l.assetUrl)
        }
        return { ...l, assetUrl: url, ...(widthPct !== null ? { widthPct } : {}) }
      })
    )
  }

  // 마스터 시드 규칙(PRD §11)으로 리본 랜덤 속성을 채운 패치를 만든다. 두 핸들러
  // (전체 무작위·시드 불러오기)가 공유한다 — 배경색·끝색·나머지 리본 속성·곡선 시드까지 전부
  // random 쪽 값으로 교체하고, 시작 색만 연결 여부(linkStartToBackground)에 따라 정한다.
  function applyRandomRibbon(random: RandomRibbonValues, prev: RibbonLayerConfig): RibbonLayerConfig {
    return {
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
    }
  }

  function handleRandomizeAll() {
    const newMasterSeed = generateRandomSeed()
    const random = deriveRibbonFromSeed(newMasterSeed)
    setMasterSeed(newMasterSeed)
    setLayer((prev) => ({
      ...applyRandomRibbon(random, prev),
      // 업로드한 이미지를 쓰는 중이면 유지하고, 브랜드 글자를 쓰는 중이면 글자도 새로 고른다
      // (마스터 시드가 결정하는 값이 아니라 이 화면 전용 랜덤이라 그대로 Math.random을 쓴다)
      source: prev.source.kind === 'upload' ? prev.source : { kind: 'letter', letter: choice(LETTER_KEYS) },
    }))
  }

  // 시드 불러오기(PRD §11): 입력한 마스터 시드로 리본 속성을 다시 채운다. 원천 그래픽(글자/업로드)은
  // 건드리지 않는다 — CLI가 재현하는 대상은 리본 속성뿐이라 여기서도 그 범위만 맞춘다.
  function handleApplyMasterSeed(seed: number) {
    const random = deriveRibbonFromSeed(seed)
    setMasterSeed(seed)
    setLayer((prev) => applyRandomRibbon(random, prev))
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
    <div className="w-full space-y-6 p-4 md:p-8">
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
              overlayLayers={overlayLayers}
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
          <Tabs value={screenTab} onValueChange={(v) => setScreenTab(v as 'design' | 'apply')}>
            <CardHeader>
              <TabsList>
                <TabsTrigger value="design">제작</TabsTrigger>
                <TabsTrigger value="apply">적용</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <fieldset disabled={exportBusy} className="contents">
                <TabsContent value="design" className="mt-0">
                  <AssetGeneratorPanel
                    stageRatio={stageRatio}
                    onStageRatioChange={setStageRatio}
                    layer={layer}
                    onLayerChange={handleLayerChange}
                    onSelectLetter={handleSelectLetter}
                    onFileSelected={handleFileSelected}
                    uploadedFileName={uploadedFileName}
                    onRandomizeAll={handleRandomizeAll}
                    overlayLayers={overlayLayers}
                    selectedOverlayLayerId={selectedOverlayLayerId}
                    onSelectOverlayLayer={setSelectedOverlayLayerId}
                    onAddImageLayer={handleAddImageLayer}
                    onAddTextLayer={handleAddTextLayer}
                    onRemoveOverlayLayer={handleRemoveOverlayLayer}
                    onMoveOverlayLayer={handleMoveOverlayLayer}
                    onImageLayerChange={handleImageLayerChange}
                    onTextLayerChange={handleTextLayerChange}
                    onReplaceImageLayerAsset={handleReplaceImageLayerAsset}
                    onLoadPreset={handleLoadPreset}
                    masterSeed={masterSeed}
                    onApplyMasterSeed={handleApplyMasterSeed}
                  />
                </TabsContent>
                <TabsContent value="apply" className="mt-0">
                  <ApplyTab viewportRef={viewportRef} />
                </TabsContent>
              </fieldset>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  )
}
