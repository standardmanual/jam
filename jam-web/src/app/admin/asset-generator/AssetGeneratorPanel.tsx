'use client'

/**
 * JAM! 에셋 제너레이터 — 설정 패널 (섹션·한 줄 행·전체 무작위) (티켓 20260924_2156)
 *
 * 프로토타입의 접기·펼치기 섹션 구성과 한 줄 행(레이블·슬라이더·값) 정렬은 그대로 유지하되,
 * 프로토타입 전용 CSS 대신 어드민 디자인시스템(shadcn 기반) 컴포넌트로 옮긴다 — 슬라이더는
 * `admin/ui`에 전용 컴포넌트가 없어 `input[type=range]`를 shadcn 톤에 맞춰 감싼 `SliderRow`를
 * 공용으로 쓴다.
 *
 * 원본: jam-doc/assets/prototypes/20260924_jam-asset-generator.html 94~135줄(섹션 5개),
 * 용어 "무작위"는 프로토타입의 "전체 랜덤"·"다시 뽑기"를
 * `docs/specs/UX_WRITING_GUIDELINE.md`(저작 도구 고정 용어, X: 랜덤·다시 뽑기)에 맞춰 바꿨다
 * (기존 사례: `src/app/admin/badges/BlobAnimationFields.tsx`의 시드 재추첨 버튼).
 *
 * "이미지 레이어" 섹션(티켓 20260924_2157)은 리본 레이어 위에 얹는 PNG/SVG 오버레이를
 * 관리한다 — 위의 "이미지" 섹션(리본 원천 그래픽 자체의 크기·블러·회전)과는 다른 개념이다.
 */
import { useRef } from 'react'
import { IconArrowsShuffle, IconRefresh, IconUpload } from '@tabler/icons-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/admin/ui/accordion'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Input } from '@/components/admin/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/admin/ui/tooltip'
import type { GradientDirection, ImageLayerConfig, LetterKey, RibbonLayerConfig, StageRatio } from '@/lib/asset-generator'
import ImageLayerFields from './ImageLayerFields'
import LayerSidebar from './LayerSidebar'
import SliderRow from './SliderRow'
import {
  BLUR_RANGE,
  computeEffectiveStartColor,
  COUNT_RANGE,
  formatCount,
  formatDegree,
  formatPercent,
  formatPx,
  formatPxPerSecond,
  GAP_RANGE,
  generateRandomSeed,
  GRADIENT_DIRECTION_OPTIONS,
  IRREGULARITY_RANGE,
  LETTER_KEYS,
  resolveStageSize,
  ROTATION_RANGE,
  SIZE_RANGE,
  SPEED_RANGE,
  STAGE_RATIO_OPTIONS,
} from './assetGeneratorHelpers'

interface AssetGeneratorPanelProps {
  stageRatio: StageRatio
  onStageRatioChange: (ratio: StageRatio) => void
  layer: RibbonLayerConfig
  onLayerChange: (patch: Partial<RibbonLayerConfig>) => void
  onSelectLetter: (letter: LetterKey) => void
  onFileSelected: (file: File) => void
  uploadedFileName: string | null
  onRandomizeAll: () => void
  imageLayers: ImageLayerConfig[]
  selectedImageLayerId: string | null
  onSelectImageLayer: (id: string) => void
  onAddImageLayer: (file: File) => void
  onRemoveImageLayer: (id: string) => void
  onMoveImageLayer: (id: string, direction: 'up' | 'down') => void
  onImageLayerChange: (id: string, patch: Partial<ImageLayerConfig>) => void
  onReplaceImageLayerAsset: (id: string, file: File) => void
}

export default function AssetGeneratorPanel({
  stageRatio,
  onStageRatioChange,
  layer,
  onLayerChange,
  onSelectLetter,
  onFileSelected,
  uploadedFileName,
  onRandomizeAll,
  imageLayers,
  selectedImageLayerId,
  onSelectImageLayer,
  onAddImageLayer,
  onRemoveImageLayer,
  onMoveImageLayer,
  onImageLayerChange,
  onReplaceImageLayerAsset,
}: AssetGeneratorPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { width: stageWidth, height: stageHeight } = resolveStageSize(stageRatio)
  const effectiveStartColor = computeEffectiveStartColor(layer)

  function handleSelectLetter(letter: LetterKey) {
    if (fileInputRef.current) fileInputRef.current.value = ''
    onSelectLetter(letter)
  }

  function handleFile(file: File | null | undefined) {
    if (!file) return
    onFileSelected(file)
  }

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" variant="default" className="w-full" onClick={onRandomizeAll}>
        <IconArrowsShuffle className="h-4 w-4" />
        전체 무작위
      </Button>

      <Accordion type="multiple" defaultValue={['source', 'stage', 'image', 'gradient', 'curve', 'imageLayers']} className="w-full">
        <AccordionItem value="source">
          <AccordionTrigger>원천 그래픽</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3">
            <div className="flex gap-2">
              {LETTER_KEYS.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant={layer.source.kind === 'letter' && layer.source.letter === key ? 'default' : 'outline'}
                  className="h-10 flex-1 text-base font-bold"
                  onClick={() => handleSelectLetter(key)}
                >
                  {key}
                </Button>
              ))}
            </div>
            <div
              className="flex flex-col gap-1.5 rounded-md border border-dashed border-input p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                handleFile(e.dataTransfer.files?.[0])
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <IconUpload className="h-4 w-4" />
                {uploadedFileName ?? 'PNG·SVG 업로드'}
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="stage">
          <AccordionTrigger>
            <span className="flex w-full items-center justify-between pr-2">
              <span>스테이지</span>
              <span className="font-mono text-xs font-normal text-muted-foreground">
                {stageWidth} × {stageHeight}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3">
            <Tabs value={stageRatio} onValueChange={(v) => onStageRatioChange(v as StageRatio)}>
              <TabsList className="w-full">
                {STAGE_RATIO_OPTIONS.map((opt) => (
                  <TabsTrigger key={opt.value} value={opt.value} className="flex-1">
                    {opt.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <label className="flex items-center justify-between gap-2">
              <span className="text-sm text-foreground">배경색</span>
              <Input
                type="color"
                value={layer.backgroundColor}
                onChange={(e) =>
                  onLayerChange({
                    backgroundColor: e.target.value,
                    startColor: layer.linkStartToBackground ? e.target.value : layer.startColor,
                  })
                }
                className="h-9 w-16 p-1"
              />
            </label>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="image">
          <AccordionTrigger>이미지</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3">
            <SliderRow
              label="크기"
              value={layer.sizePct}
              {...SIZE_RANGE}
              format={formatPercent}
              onChange={(v) => onLayerChange({ sizePct: v })}
            />
            <SliderRow
              label="블러"
              value={layer.blurPct}
              {...BLUR_RANGE}
              format={formatPercent}
              onChange={(v) => onLayerChange({ blurPct: v })}
            />
            <SliderRow
              label="회전"
              value={layer.rotationDeg}
              {...ROTATION_RANGE}
              format={formatDegree}
              onChange={(v) => onLayerChange({ rotationDeg: v })}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm text-foreground">진행 방향 회전</span>
                <span className="text-xs text-muted-foreground">켜면 회전값이 곡선 진행 방향에 더해져요.</span>
              </div>
              <Checkbox
                checked={layer.followPath}
                onCheckedChange={(v) => onLayerChange({ followPath: v === true })}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="gradient">
          <AccordionTrigger>그라데이션</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-foreground">방향</span>
              <Tabs value={layer.direction} onValueChange={(v) => onLayerChange({ direction: v as GradientDirection })}>
                <TabsList className="w-full">
                  {GRADIENT_DIRECTION_OPTIONS.map((opt) => (
                    <TabsTrigger key={opt.value} value={opt.value} className="flex-1 text-xs">
                      {opt.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={effectiveStartColor}
                disabled={layer.linkStartToBackground}
                onChange={(e) => onLayerChange({ startColor: e.target.value })}
                className="h-9 w-14 p-1"
                title={layer.linkStartToBackground ? '시작 색 (배경색과 연결됨)' : '시작 색'}
              />
              <Input
                type="color"
                value={layer.endColor}
                onChange={(e) => onLayerChange({ endColor: e.target.value })}
                className="h-9 w-14 p-1"
                title="끝 색"
              />
              <label className="flex flex-1 items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={layer.linkStartToBackground}
                  onCheckedChange={(v) =>
                    onLayerChange({
                      linkStartToBackground: v === true,
                      startColor: v === true ? layer.backgroundColor : layer.startColor,
                    })
                  }
                />
                시작 색 = 배경색
              </label>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="curve">
          <AccordionTrigger>이동 곡선</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3">
            <SliderRow
              label="불규칙성"
              value={layer.irregularityPct}
              {...IRREGULARITY_RANGE}
              format={formatPercent}
              onChange={(v) => onLayerChange({ irregularityPct: v })}
              action={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onLayerChange({ seed: generateRandomSeed() })}
                    >
                      <IconRefresh className="h-3.5 w-3.5" />
                      무작위
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>곡선을 새로 뽑아요</TooltipContent>
                </Tooltip>
              }
            />
            <SliderRow
              label="속도"
              value={layer.speed}
              {...SPEED_RANGE}
              format={formatPxPerSecond}
              onChange={(v) => onLayerChange({ speed: v })}
            />
            <SliderRow
              label="복사 간격"
              value={layer.gap}
              {...GAP_RANGE}
              format={formatPx}
              onChange={(v) => onLayerChange({ gap: v })}
            />
            <SliderRow
              label="복사 수"
              value={layer.count}
              {...COUNT_RANGE}
              format={formatCount}
              onChange={(v) => onLayerChange({ count: v })}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="imageLayers">
          <AccordionTrigger>이미지 레이어</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3">
            <LayerSidebar
              imageLayers={imageLayers}
              selectedId={selectedImageLayerId}
              onSelect={onSelectImageLayer}
              onAdd={onAddImageLayer}
              onRemove={onRemoveImageLayer}
              onMove={onMoveImageLayer}
            />
            {(() => {
              const selectedImageLayer = imageLayers.find((l) => l.id === selectedImageLayerId)
              if (!selectedImageLayer) return null
              return (
                <ImageLayerFields
                  layer={selectedImageLayer}
                  onChange={(patch) => onImageLayerChange(selectedImageLayer.id, patch)}
                  onReplaceAsset={(file) => onReplaceImageLayerAsset(selectedImageLayer.id, file)}
                />
              )
            })()}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
