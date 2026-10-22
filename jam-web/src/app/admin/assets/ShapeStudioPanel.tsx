'use client'

import { useEffect, useRef, useState } from 'react'
import { IconArrowsShuffle, IconRefresh, IconUpload } from '@tabler/icons-react'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Input } from '@/components/admin/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select'
import { Switch } from '@/components/admin/ui/switch'
import {
  getLayerKeys,
  type GradientDirection,
  type ImageLayerConfig,
  type LetterKey,
  type OverlayLayerConfig,
  type RibbonLayerConfig,
  type StageRatio,
  type TextLayerConfig,
} from '@/lib/asset-generator'
import ApplyTab from '@/app/admin/asset-generator/ApplyTab'
import type { AssetGeneratorViewportHandle } from '@/app/admin/asset-generator/AssetGeneratorViewport'
import {
  BLUR_RANGE,
  computeEffectiveStartColor,
  COUNT_RANGE,
  GAP_RANGE,
  generateRandomSeed,
  GRADIENT_DIRECTION_OPTIONS,
  IRREGULARITY_RANGE,
  LETTER_KEYS,
  ROTATION_RANGE,
  SIZE_RANGE,
  SPEED_RANGE,
} from '@/app/admin/asset-generator/assetGeneratorHelpers'
import ImageLayerFields from '@/app/admin/asset-generator/ImageLayerFields'
import LayerSidebar from '@/app/admin/asset-generator/LayerSidebar'
import PresetPanel from '@/app/admin/asset-generator/PresetPanel'
import TextLayerFields from '@/app/admin/asset-generator/TextLayerFields'
import {
  COLOR_LABELS,
  drawPresetThumb,
  GRADIENT_PRESETS,
  RAND_GLYPH_OPTS,
  RAND_SEG_OPTS,
  type AnyShapePreset,
  type BackgroundMode,
  type CanvasRatio,
  type GlyphDefinition,
  type GradientPreset,
  type RandomOptionKey,
  type RandomToggleState,
  type SegmentItem,
  type ShapeStudioState,
  type StudioEngineMode,
} from './shapeStudioConfig'

interface ShapeStudioPanelProps {
  viewportRef: React.RefObject<AssetGeneratorViewportHandle | null>
  engineMode: StudioEngineMode
  onChangeEngineMode: (mode: StudioEngineMode) => void
  state: ShapeStudioState
  presets: AnyShapePreset[]
  glyphsMap: Record<string, GlyphDefinition>
  randOn: RandomToggleState
  ribbonLayer: RibbonLayerConfig
  uploadedRibbonFileName: string | null
  overlayLayers: OverlayLayerConfig[]
  selectedOverlayLayerId: string | null
  exportSize: number
  videoSize: number
  exportBusy: boolean
  videoRecording: boolean
  videoButtonLabel: string
  onSelectShapePreset: (preset: AnyShapePreset) => void
  onAddShapeClick: () => void
  onRandomize: () => void
  onToggleRandOption: (key: RandomOptionKey, label: string, checked: boolean) => void
  onChangeRatio: (ratio: CanvasRatio) => void
  onChangeSegmentCount: (count: number) => void
  onUpdateSegment: (
    index: number,
    key: keyof SegmentItem,
    value: number,
    commitHistory: boolean
  ) => void
  onUpdateNumberParam: (
    key:
      | 'width'
      | 'merge'
      | 'overlap'
      | 'soft'
      | 'scale'
      | 'rotation'
      | 'warp'
      | 'direction'
      | 'flow'
      | 'shift'
      | 'contour'
      | 'rim'
      | 'bgAngle'
      | 'grain'
      | 'speed'
      | 'metal'
      | 'vivid',
    value: number,
    commitHistory: boolean
  ) => void
  onToggleMetaball: (checked: boolean) => void
  onToggleAnimate: (checked: boolean) => void
  onSelectGradientPreset: (preset: GradientPreset) => void
  onUpdateColor: (index: number, color: string, commitHistory: boolean) => void
  onChangeBgMode: (mode: BackgroundMode) => void
  onUpdateBgColor: (key: 'bgA' | 'bgB', color: string, commitHistory: boolean) => void
  onRibbonLayerChange: (patch: Partial<RibbonLayerConfig>) => void
  onSelectRibbonLetter: (letter: LetterKey) => void
  onSelectRibbonFile: (file: File) => void
  onRandomizeRibbonAll: () => void
  onSelectOverlayLayer: (id: string) => void
  onAddImageLayer: (file: File) => void
  onAddTextLayer: () => void
  onRemoveOverlayLayer: (id: string) => void
  onMoveOverlayLayer: (id: string, direction: 'up' | 'down') => void
  onImageLayerChange: (id: string, patch: Partial<ImageLayerConfig>) => void
  onTextLayerChange: (id: string, patch: Partial<TextLayerConfig>) => void
  onReplaceImageLayerAsset: (id: string, file: File) => void
  onLoadPreset: (stageRatio: StageRatio, layers: OverlayLayerConfig[]) => void
  onChangeExportSize: (size: number) => void
  onExportPng: () => void
  onChangeVideoSize: (size: number) => void
  onExportVideo: () => void
  onCancelVideo: () => void
}

function PresetThumbButton({
  preset,
  active,
  glyphsMap,
  onClick,
}: {
  preset: AnyShapePreset
  active: boolean
  glyphsMap: Record<string, GlyphDefinition>
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (canvasRef.current) {
      drawPresetThumb(canvasRef.current, preset, glyphsMap)
    }
  }, [preset, glyphsMap])

  const displayLabel = preset.name.length > 9 ? `${preset.name.slice(0, 8)}…` : preset.name

  return (
    <Button
      type="button"
      variant="outline"
      title={preset.name}
      onClick={onClick}
      className={`h-auto flex-col gap-1 px-1 py-2 text-[10px] ${
        active
          ? 'border-[#8fae6c] bg-[#e5edd8] text-[#1e2322]'
          : 'border-[#e0e4df] bg-[#f0f2ec] text-[#1e2322] hover:bg-[#e8ece4]'
      }`}
    >
      <canvas ref={canvasRef} width={88} height={88} className="h-11 w-11" />
      <span className="whitespace-nowrap">{displayLabel}</span>
    </Button>
  )
}

interface RangeSliderRowProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  disabled?: boolean
  onChange: (value: number, commitHistory: boolean) => void
}

function RangeSliderRow({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  disabled = false,
  onChange,
}: RangeSliderRowProps) {
  const startedRef = useRef(false)

  return (
    <div>
      <label
        htmlFor={id}
        className="mt-2.5 mb-1 flex items-center justify-between gap-2.5 text-[11px]"
      >
        <span className="break-keep wrap-break-word">{label}</span>
        <output className="text-[10px] text-[#6f766c] tabular-nums">
          {value}
          {unit}
        </output>
      </label>
      <Input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onPointerDown={() => {
          startedRef.current = false
        }}
        onChange={(e) => {
          const commit = !startedRef.current
          startedRef.current = true
          onChange(Number(e.target.value), commit)
        }}
        onBlur={() => {
          startedRef.current = false
        }}
        className="h-3.5 w-full cursor-pointer border-0 bg-transparent p-0 accent-[#5f7a45] shadow-none focus-visible:ring-0"
      />
    </div>
  )
}

export default function ShapeStudioPanel({
  viewportRef,
  engineMode,
  onChangeEngineMode,
  state,
  presets,
  glyphsMap,
  randOn,
  ribbonLayer,
  uploadedRibbonFileName,
  overlayLayers,
  selectedOverlayLayerId,
  exportSize,
  videoSize,
  exportBusy,
  videoRecording,
  videoButtonLabel,
  onSelectShapePreset,
  onAddShapeClick,
  onRandomize,
  onToggleRandOption,
  onChangeRatio,
  onChangeSegmentCount,
  onUpdateSegment,
  onUpdateNumberParam,
  onToggleMetaball,
  onToggleAnimate,
  onSelectGradientPreset,
  onUpdateColor,
  onChangeBgMode,
  onUpdateBgColor,
  onRibbonLayerChange,
  onSelectRibbonLetter,
  onSelectRibbonFile,
  onRandomizeRibbonAll,
  onSelectOverlayLayer,
  onAddImageLayer,
  onAddTextLayer,
  onRemoveOverlayLayer,
  onMoveOverlayLayer,
  onImageLayerChange,
  onTextLayerChange,
  onReplaceImageLayerAsset,
  onLoadPreset,
  onChangeExportSize,
  onExportPng,
  onChangeVideoSize,
  onExportVideo,
  onCancelVideo,
}: ShapeStudioPanelProps) {
  const [screenTab, setScreenTab] = useState<'design' | 'apply'>('design')
  const ribbonFileInputRef = useRef<HTMLInputElement | null>(null)

  const isGlyphMode = Boolean(state.glyph)
  const randOptions = isGlyphMode ? RAND_GLYPH_OPTS : RAND_SEG_OPTS
  const colorStartedRef = useRef<Record<string, boolean>>({})

  const effectiveRibbonStartColor = computeEffectiveStartColor(ribbonLayer)

  return (
    <aside className="w-full overflow-y-auto border-t border-[#e0e4df] bg-[#f8f9f6] text-[#1e2322] lg:w-[352px] lg:shrink-0 lg:border-t-0 lg:border-l">
      <div className="flex items-center justify-between px-5 pt-[18px] pb-3">
        <h2 className="m-0 text-[15px] font-semibold tracking-[-0.3px] whitespace-nowrap">
          {engineMode === 'shape' ? 'Shape Generator' : 'Ribbon Generator'}
        </h2>
        <Badge
          variant="outline"
          className="border-[#dae1d2] px-1.5 py-0.5 text-[9px] font-normal text-[#87947a] whitespace-nowrap"
        >
          {engineMode === 'shape' ? 'Segments + Metaball' : '2D Curve + Stamp'}
        </Badge>
      </div>

      {/* 제작 / 콘텐츠 적용 화면 전환 */}
      <div className="px-5 pb-3">
        <div className="flex gap-0.5 rounded-full bg-[#e5e8e1] p-1">
          {(
            [
              ['design', '제작'],
              ['apply', '콘텐츠 적용'],
            ] as const
          ).map(([tabKey, label]) => (
            <Button
              key={tabKey}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setScreenTab(tabKey)}
              className={`h-7 flex-1 rounded-full px-2 text-[11px] ${
                screenTab === tabKey
                  ? 'bg-white text-[#1e2322] shadow-xs hover:bg-white'
                  : 'bg-transparent text-[#1e2322] hover:bg-white/50'
              }`}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {screenTab === 'apply' ? (
        <section className="border-t border-[#e0e4df] px-5 py-4">
          <fieldset disabled={exportBusy} className="contents">
            <ApplyTab viewportRef={viewportRef} />
          </fieldset>
        </section>
      ) : (
        <fieldset disabled={exportBusy} className="contents">
          {/* 0. Engine Mode */}
          <section className="border-t border-[#e0e4df] px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
              <span>Mode</span>
              <span className="text-[10px] font-normal text-[#7f8582]">생성 엔진</span>
            </div>
            <div className="flex gap-0.5 rounded-full bg-[#e5e8e1] p-1">
              {(
                [
                  ['shape', 'Shape (WebGL)'],
                  ['ribbon', 'Ribbon (2D 곡선)'],
                ] as const
              ).map(([modeKey, label]) => (
                <Button
                  key={modeKey}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChangeEngineMode(modeKey)}
                  className={`h-7 flex-1 rounded-full px-2 text-[11px] ${
                    engineMode === modeKey
                      ? 'bg-white text-[#1e2322] shadow-xs hover:bg-white'
                      : 'bg-transparent text-[#1e2322] hover:bg-white/50'
                  }`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </section>

          {/* 1. Preset (서버 DB 저장 · 불러오기) */}
          <section className="border-t border-[#e0e4df] px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
              <span>Preset</span>
              <span className="text-[10px] font-normal text-[#7f8582]">
                서버 프리셋 저장 · 불러오기
              </span>
            </div>
            <PresetPanel
              stageRatio={state.ratio}
              overlayLayers={overlayLayers}
              onLoadPreset={onLoadPreset}
            />
          </section>

          {/* 2. Canvas 비율 */}
          <section className="border-t border-[#e0e4df] px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
              <span>Canvas</span>
              <span className="text-[10px] font-normal text-[#7f8582]">비율</span>
            </div>
            <div className="flex gap-0.5 rounded-full bg-[#e5e8e1] p-1">
              {(
                [
                  ['1:1', '1:1'],
                  ['4:5', '4:5'],
                  ['9:16', '9:16'],
                  ['16:9', '16:9'],
                ] as const
              ).map(([ratio, label]) => (
                <Button
                  key={ratio}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChangeRatio(ratio)}
                  className={`h-7 flex-1 rounded-full px-2 text-[11px] ${
                    state.ratio === ratio
                      ? 'bg-white text-[#1e2322] shadow-xs hover:bg-white'
                      : 'bg-transparent text-[#1e2322] hover:bg-white/50'
                  }`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </section>

          {engineMode === 'shape' ? (
            <>
              {/* Shape 1. Shape Presets */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span>Shape</span>
                  <span className="text-[10px] font-normal text-[#7f8582] break-keep wrap-break-word">
                    형태 프리셋
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {presets.map((p) => (
                    <PresetThumbButton
                      key={p.id}
                      preset={p}
                      active={state.shape === p.id}
                      glyphsMap={glyphsMap}
                      onClick={() => onSelectShapePreset(p)}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onAddShapeClick}
                  className="mt-2 h-9 w-full border-[#e0e4df] bg-white text-xs text-[#1e2322] hover:bg-[#e8ece4] whitespace-nowrap"
                >
                  + PNG / SVG 쉐입 추가
                </Button>
                <p className="mt-2 text-[10px] leading-[1.6] text-[#8c9288] break-keep wrap-break-word text-pretty">
                  투명 배경 이미지는 불투명한 부분이, 흰 배경 이미지는 어두운 부분이 쉐입이 돼요.
                  파일을 캔버스에 끌어다 놓아도 됩니다. 추가한 쉐입은 이 탭을 닫으면 사라져요.
                </p>
              </section>

              {/* Shape 2. Random */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRandomize}
                  className="mb-3 h-10 w-full rounded-full border-[#b9c7aa] bg-[#dfe5d9] font-semibold text-[#1e2322] hover:bg-[#d3dccb] whitespace-nowrap"
                >
                  랜덤 생성
                </Button>
                <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
                  {randOptions.map(([key, label]) => {
                    const checkId = `rand-${key}`
                    return (
                      <label
                        key={key}
                        htmlFor={checkId}
                        className="flex cursor-pointer items-center gap-2 text-[11px]"
                      >
                        <Checkbox
                          id={checkId}
                          checked={randOn[key]}
                          onCheckedChange={(v) => onToggleRandOption(key, label, Boolean(v))}
                        />
                        <span className="whitespace-nowrap">{label}</span>
                      </label>
                    )
                  })}
                </div>
                <p className="mt-2 text-[10px] leading-[1.6] text-[#8c9288] break-keep wrap-break-word text-pretty">
                  체크한 항목만 &quot;랜덤 생성&quot;을 누를 때 바뀌어요. 선택한 쉐입에 맞는 항목이
                  표시됩니다.
                </p>
              </section>

              {/* Shape 3. Segments */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span>Segments</span>
                  <span className="text-[10px] font-normal text-[#7f8582] break-keep wrap-break-word">
                    세그먼트 개수 · 크기
                  </span>
                </div>

                {isGlyphMode ? (
                  <p className="mb-2.5 text-[10px] leading-[1.6] text-[#8c9288] break-keep wrap-break-word text-pretty">
                    로고 글자 쉐입은 세그먼트를 쓰지 않아요. 너비 슬라이더로 글자 크기를 조절하세요.
                  </p>
                ) : (
                  <div>
                    <div className="flex gap-0.5 rounded-full bg-[#e5e8e1] p-1">
                      {([2, 3, 4] as const).map((cnt) => (
                        <Button
                          key={cnt}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onChangeSegmentCount(cnt)}
                          className={`h-7 flex-1 rounded-full px-2 text-[11px] ${
                            state.segments.length === cnt
                              ? 'bg-white text-[#1e2322] shadow-xs hover:bg-white'
                              : 'bg-transparent text-[#1e2322] hover:bg-white/50'
                          }`}
                        >
                          {cnt}
                        </Button>
                      ))}
                    </div>
                    <p className="mt-2.5 text-[10px] leading-[1.6] text-[#8c9288] break-keep wrap-break-word text-pretty">
                      세그먼트는 위에서 아래로 쌓는 둥근 사각형 블록 하나예요. 블록마다 높이와
                      위·아래 모서리 둥글기를 조절하고, 블록을 합쳐 하나의 쉐입을 만듭니다.
                    </p>
                  </div>
                )}

                <RangeSliderRow
                  id="width"
                  label="전체 너비"
                  value={state.width}
                  min={160}
                  max={560}
                  unit="px"
                  onChange={(v, commit) => onUpdateNumberParam('width', v, commit)}
                />

                {!isGlyphMode && (
                  <div className="mt-2 space-y-2">
                    {state.segments.map((segItem, idx) => (
                      <div key={idx} className="rounded-[10px] bg-[#eff2eb] px-3 pt-1 pb-2.5">
                        <h4 className="mt-2 mb-0 text-[10px] font-semibold tracking-[0.2px] text-[#6f7969]">
                          Segment {idx + 1}
                        </h4>
                        <RangeSliderRow
                          id={`seg-${idx}-h`}
                          label="Height"
                          value={segItem.h}
                          min={24}
                          max={340}
                          unit="px"
                          onChange={(v, commit) => onUpdateSegment(idx, 'h', v, commit)}
                        />
                        <RangeSliderRow
                          id={`seg-${idx}-rt`}
                          label="Top R"
                          value={segItem.rt}
                          min={0}
                          max={400}
                          unit="px"
                          onChange={(v, commit) => onUpdateSegment(idx, 'rt', v, commit)}
                        />
                        <RangeSliderRow
                          id={`seg-${idx}-rb`}
                          label="Bottom R"
                          value={segItem.rb}
                          min={0}
                          max={400}
                          unit="px"
                          onChange={(v, commit) => onUpdateSegment(idx, 'rb', v, commit)}
                        />
                        <RangeSliderRow
                          id={`seg-${idx}-w`}
                          label="Width"
                          value={segItem.w}
                          min={40}
                          max={140}
                          unit="%"
                          onChange={(v, commit) => onUpdateSegment(idx, 'w', v, commit)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Shape 4. Blend */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span>Blend</span>
                  <span className="text-[10px] font-normal text-[#7f8582] break-keep wrap-break-word">
                    연결 방식
                  </span>
                </div>

                <label
                  htmlFor="metaball-check"
                  className="flex cursor-pointer items-center gap-2 text-[11px]"
                >
                  <Checkbox
                    id="metaball-check"
                    checked={state.metaball}
                    disabled={isGlyphMode}
                    onCheckedChange={(v) => onToggleMetaball(Boolean(v))}
                  />
                  <span>Metaball merge</span>
                </label>

                <RangeSliderRow
                  id="merge"
                  label="합치는 강도"
                  value={state.merge}
                  min={0}
                  max={140}
                  unit="px"
                  disabled={isGlyphMode}
                  onChange={(v, commit) => onUpdateNumberParam('merge', v, commit)}
                />

                <div className="grid grid-cols-2 gap-3">
                  <RangeSliderRow
                    id="overlap"
                    label="겹침"
                    value={state.overlap}
                    min={-40}
                    max={100}
                    unit="px"
                    disabled={isGlyphMode}
                    onChange={(v, commit) => onUpdateNumberParam('overlap', v, commit)}
                  />
                  <RangeSliderRow
                    id="soft"
                    label="윤곽 번짐"
                    value={state.soft}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v, commit) => onUpdateNumberParam('soft', v, commit)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <RangeSliderRow
                    id="scale"
                    label="크기"
                    value={state.scale}
                    min={50}
                    max={300}
                    unit="%"
                    onChange={(v, commit) => onUpdateNumberParam('scale', v, commit)}
                  />
                  <RangeSliderRow
                    id="rotation"
                    label="회전"
                    value={state.rotation}
                    min={-180}
                    max={180}
                    unit="°"
                    onChange={(v, commit) => onUpdateNumberParam('rotation', v, commit)}
                  />
                </div>

                <RangeSliderRow
                  id="warp"
                  label="유기적 변형"
                  value={state.warp}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v, commit) => onUpdateNumberParam('warp', v, commit)}
                />
              </section>

              {/* Shape 5. Motion */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span>Motion</span>
                  <span className="text-[10px] font-normal text-[#7f8582]">움직임</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="animate-switch" className="cursor-pointer break-keep wrap-break-word">
                    모션 재생
                  </label>
                  <Switch
                    id="animate-switch"
                    checked={state.animate}
                    onCheckedChange={(v) => onToggleAnimate(Boolean(v))}
                  />
                </div>

                <RangeSliderRow
                  id="speed"
                  label="속도"
                  value={state.speed}
                  min={10}
                  max={300}
                  unit="%"
                  disabled={!state.animate}
                  onChange={(v, commit) => onUpdateNumberParam('speed', v, commit)}
                />
              </section>

              {/* Shape 6. Gradient */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span>Gradient</span>
                  <span className="text-[10px] font-normal text-[#7f8582] break-keep wrap-break-word">
                    Genie 브랜드 컬러
                  </span>
                </div>

                <div className="mb-3 grid grid-cols-3 gap-1.5">
                  {GRADIENT_PRESETS.map((g) => (
                    <Button
                      key={g.id}
                      type="button"
                      variant="outline"
                      onClick={() => onSelectGradientPreset(g)}
                      className={`h-auto flex-col items-stretch gap-1 p-1.5 text-[10px] ${
                        state.grad === g.id
                          ? 'border-[#8fae6c] bg-[#e5edd8] text-[#1e2322]'
                          : 'border-[#e0e4df] bg-[#f0f2ec] text-[#1e2322] hover:bg-[#e8ece4]'
                      }`}
                    >
                      <span
                        className="block h-5 w-full rounded-[5px]"
                        style={{ background: `linear-gradient(90deg,${g.c.join(',')})` }}
                      />
                      <span className="text-center whitespace-nowrap">{g.name}</span>
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-6 gap-1.5">
                  {COLOR_LABELS.map((label, idx) => (
                    <label
                      key={label}
                      className="flex flex-col items-center gap-1 text-center text-[9px] text-[#7f8582]"
                    >
                      <Input
                        type="color"
                        aria-label={`${label} 색`}
                        value={state.colors[idx]}
                        onPointerDown={() => {
                          colorStartedRef.current[`c${idx}`] = false
                        }}
                        onChange={(e) => {
                          const commit = !colorStartedRef.current[`c${idx}`]
                          colorStartedRef.current[`c${idx}`] = true
                          onUpdateColor(idx, e.target.value, commit)
                        }}
                        onBlur={() => {
                          colorStartedRef.current[`c${idx}`] = false
                        }}
                        className="h-[26px] w-full cursor-pointer rounded-[5px] border border-black/10 bg-transparent p-0"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <RangeSliderRow
                  id="direction"
                  label="흐름 방향"
                  value={state.direction}
                  min={-180}
                  max={180}
                  unit="°"
                  onChange={(v, commit) => onUpdateNumberParam('direction', v, commit)}
                />

                <div className="grid grid-cols-2 gap-3">
                  <RangeSliderRow
                    id="flow"
                    label="컬러 반복"
                    value={state.flow}
                    min={50}
                    max={300}
                    unit="%"
                    onChange={(v, commit) => onUpdateNumberParam('flow', v, commit)}
                  />
                  <RangeSliderRow
                    id="shift"
                    label="컬러 이동"
                    value={state.shift}
                    min={-100}
                    max={100}
                    onChange={(v, commit) => onUpdateNumberParam('shift', v, commit)}
                  />
                </div>

                <RangeSliderRow
                  id="vivid"
                  label="색 선명도"
                  value={state.vivid}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v, commit) => onUpdateNumberParam('vivid', v, commit)}
                />

                <RangeSliderRow
                  id="metal"
                  label="메탈릭 질감"
                  value={state.metal}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v, commit) => onUpdateNumberParam('metal', v, commit)}
                />

                <div className="grid grid-cols-2 gap-3">
                  <RangeSliderRow
                    id="contour"
                    label="형태 따라 휘기"
                    value={state.contour}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v, commit) => onUpdateNumberParam('contour', v, commit)}
                  />
                  <RangeSliderRow
                    id="rim"
                    label="가장자리 빛"
                    value={state.rim}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v, commit) => onUpdateNumberParam('rim', v, commit)}
                  />
                </div>
              </section>

              {/* Shape 7. Background */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span>Background</span>
                  <span className="text-[10px] font-normal text-[#7f8582] break-keep wrap-break-word">
                    배경 &amp; 질감
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2.5 text-[11px]">
                  <span className="whitespace-nowrap">배경 방식</span>
                  <Select
                    value={state.bgMode}
                    onValueChange={(v) => onChangeBgMode(v as BackgroundMode)}
                  >
                    <SelectTrigger aria-label="배경 방식" className="h-8 w-[140px] text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gradient">Gradient</SelectItem>
                      <SelectItem value="solid">Solid</SelectItem>
                      <SelectItem value="transparent">Transparent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['bgA', '배경 A'],
                      ['bgB', '배경 B'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex flex-col items-center gap-1 text-center text-[9px] text-[#7f8582]"
                    >
                      <Input
                        type="color"
                        aria-label={label}
                        value={state[key]}
                        onPointerDown={() => {
                          colorStartedRef.current[key] = false
                        }}
                        onChange={(e) => {
                          const commit = !colorStartedRef.current[key]
                          colorStartedRef.current[key] = true
                          onUpdateBgColor(key, e.target.value, commit)
                        }}
                        onBlur={() => {
                          colorStartedRef.current[key] = false
                        }}
                        className="h-[26px] w-full cursor-pointer rounded-[5px] border border-black/10 bg-transparent p-0"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <RangeSliderRow
                    id="bgAngle"
                    label="배경 각도"
                    value={state.bgAngle}
                    min={-180}
                    max={180}
                    unit="°"
                    onChange={(v, commit) => onUpdateNumberParam('bgAngle', v, commit)}
                  />
                  <RangeSliderRow
                    id="grain"
                    label="그레인"
                    value={state.grain}
                    min={0}
                    max={20}
                    unit="%"
                    onChange={(v, commit) => onUpdateNumberParam('grain', v, commit)}
                  />
                </div>
              </section>
            </>
          ) : (
            <>
              {/* Ribbon 1. Random */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRandomizeRibbonAll}
                  className="h-10 w-full rounded-full border-[#b9c7aa] bg-[#dfe5d9] font-semibold text-[#1e2322] hover:bg-[#d3dccb] whitespace-nowrap"
                >
                  <IconArrowsShuffle className="mr-1.5 h-4 w-4" />
                  전체 무작위
                </Button>
              </section>

              {/* Ribbon 2. Source Graphic */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span>Source</span>
                  <span className="text-[10px] font-normal text-[#7f8582]">원천 그래픽</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {LETTER_KEYS.map((key) => {
                    const active =
                      ribbonLayer.source.kind === 'letter' && ribbonLayer.source.letter === key
                    return (
                      <Button
                        key={key}
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (ribbonFileInputRef.current) ribbonFileInputRef.current.value = ''
                          onSelectRibbonLetter(key)
                        }}
                        className={`h-10 text-sm font-bold ${
                          active
                            ? 'border-[#8fae6c] bg-[#e5edd8] text-[#1e2322]'
                            : 'border-[#e0e4df] bg-[#f0f2ec] text-[#1e2322] hover:bg-[#e8ece4]'
                        }`}
                      >
                        {key}
                      </Button>
                    )
                  })}
                </div>
                <input
                  ref={ribbonFileInputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onSelectRibbonFile(f)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => ribbonFileInputRef.current?.click()}
                  className="mt-2 h-9 w-full border-[#e0e4df] bg-white text-xs text-[#1e2322] hover:bg-[#e8ece4] whitespace-nowrap"
                >
                  <IconUpload className="mr-1.5 h-3.5 w-3.5" />
                  {uploadedRibbonFileName ?? 'PNG · SVG 업로드'}
                </Button>
              </section>

              {/* Ribbon 3. Stamp Image Properties */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span>Ribbon Stamp</span>
                  <span className="text-[10px] font-normal text-[#7f8582]">
                    크기 · 블러 · 회전
                  </span>
                </div>
                <RangeSliderRow
                  id="ribbon-size"
                  label="크기"
                  value={ribbonLayer.sizePct}
                  min={SIZE_RANGE.min}
                  max={SIZE_RANGE.max}
                  step={SIZE_RANGE.step}
                  unit="%"
                  onChange={(v) => onRibbonLayerChange({ sizePct: v })}
                />
                <RangeSliderRow
                  id="ribbon-blur"
                  label="블러"
                  value={ribbonLayer.blurPct}
                  min={BLUR_RANGE.min}
                  max={BLUR_RANGE.max}
                  step={BLUR_RANGE.step}
                  unit="%"
                  onChange={(v) => onRibbonLayerChange({ blurPct: v })}
                />
                <RangeSliderRow
                  id="ribbon-rotation"
                  label="회전"
                  value={ribbonLayer.rotationDeg}
                  min={ROTATION_RANGE.min}
                  max={ROTATION_RANGE.max}
                  step={ROTATION_RANGE.step}
                  unit="°"
                  onChange={(v) => onRibbonLayerChange({ rotationDeg: v })}
                />
                <label
                  htmlFor="ribbon-follow-path"
                  className="mt-3 flex cursor-pointer items-center justify-between gap-3 text-[11px]"
                >
                  <div>
                    <div className="font-medium text-[#1e2322]">진행 방향 회전</div>
                    <div className="text-[10px] text-[#8c9288]">
                      켜면 회전값이 곡선 진행 방향에 더해져요.
                    </div>
                  </div>
                  <Checkbox
                    id="ribbon-follow-path"
                    checked={ribbonLayer.followPath}
                    onCheckedChange={(v) => onRibbonLayerChange({ followPath: v === true })}
                  />
                </label>
              </section>

              {/* Ribbon 4. Curve & Motion */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span>Curve &amp; Motion</span>
                  <span className="text-[10px] font-normal text-[#7f8582]">이동 곡선 · 모션</span>
                </div>

                <div className="mb-2 flex items-center justify-between text-xs">
                  <label
                    htmlFor="ribbon-animate-switch"
                    className="cursor-pointer break-keep wrap-break-word"
                  >
                    모션 재생
                  </label>
                  <Switch
                    id="ribbon-animate-switch"
                    checked={state.animate}
                    onCheckedChange={(v) => onToggleAnimate(Boolean(v))}
                  />
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <RangeSliderRow
                      id="ribbon-irregularity"
                      label="불규칙성"
                      value={ribbonLayer.irregularityPct}
                      min={IRREGULARITY_RANGE.min}
                      max={IRREGULARITY_RANGE.max}
                      step={IRREGULARITY_RANGE.step}
                      unit="%"
                      onChange={(v) => onRibbonLayerChange({ irregularityPct: v })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRibbonLayerChange({ seed: generateRandomSeed() })}
                    className="h-7 border-[#e0e4df] bg-white px-2 text-[10px] text-[#1e2322] hover:bg-[#e8ece4] whitespace-nowrap"
                  >
                    <IconRefresh className="mr-1 h-3 w-3" />
                    곡선 무작위
                  </Button>
                </div>

                <RangeSliderRow
                  id="ribbon-speed"
                  label="속도"
                  value={ribbonLayer.speed}
                  min={SPEED_RANGE.min}
                  max={SPEED_RANGE.max}
                  step={SPEED_RANGE.step}
                  unit=" px/s"
                  onChange={(v) => onRibbonLayerChange({ speed: v })}
                />
                <RangeSliderRow
                  id="ribbon-gap"
                  label="복사 간격"
                  value={ribbonLayer.gap}
                  min={GAP_RANGE.min}
                  max={GAP_RANGE.max}
                  step={GAP_RANGE.step}
                  unit="px"
                  onChange={(v) => onRibbonLayerChange({ gap: v })}
                />
                <RangeSliderRow
                  id="ribbon-count"
                  label="복사 수"
                  value={ribbonLayer.count}
                  min={COUNT_RANGE.min}
                  max={COUNT_RANGE.max}
                  step={COUNT_RANGE.step}
                  unit="개"
                  onChange={(v) => onRibbonLayerChange({ count: v })}
                />
              </section>

              {/* Ribbon 5. Gradient & Background */}
              <section className="border-t border-[#e0e4df] px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span>Gradient &amp; Stage</span>
                  <span className="text-[10px] font-normal text-[#7f8582]">
                    그라데이션 · 배경색
                  </span>
                </div>

                <div className="mb-3 flex gap-0.5 rounded-full bg-[#e5e8e1] p-1">
                  {GRADIENT_DIRECTION_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onRibbonLayerChange({ direction: opt.value as GradientDirection })
                      }
                      className={`h-7 flex-1 rounded-full px-2 text-[11px] ${
                        ribbonLayer.direction === opt.value
                          ? 'bg-white text-[#1e2322] shadow-xs hover:bg-white'
                          : 'bg-transparent text-[#1e2322] hover:bg-white/50'
                      }`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col items-center gap-1 text-center text-[9px] text-[#7f8582]">
                    <Input
                      type="color"
                      aria-label="스테이지 배경색"
                      value={ribbonLayer.backgroundColor}
                      onChange={(e) =>
                        onRibbonLayerChange({
                          backgroundColor: e.target.value,
                          startColor: ribbonLayer.linkStartToBackground
                            ? e.target.value
                            : ribbonLayer.startColor,
                        })
                      }
                      className="h-[28px] w-full cursor-pointer rounded-[5px] border border-black/10 bg-transparent p-0"
                    />
                    <span>배경색</span>
                  </label>
                  <label className="flex flex-col items-center gap-1 text-center text-[9px] text-[#7f8582]">
                    <Input
                      type="color"
                      aria-label="시작 색"
                      value={effectiveRibbonStartColor}
                      disabled={ribbonLayer.linkStartToBackground}
                      onChange={(e) => onRibbonLayerChange({ startColor: e.target.value })}
                      className="h-[28px] w-full cursor-pointer rounded-[5px] border border-black/10 bg-transparent p-0"
                    />
                    <span>시작 색</span>
                  </label>
                  <label className="flex flex-col items-center gap-1 text-center text-[9px] text-[#7f8582]">
                    <Input
                      type="color"
                      aria-label="끝 색"
                      value={ribbonLayer.endColor}
                      onChange={(e) => onRibbonLayerChange({ endColor: e.target.value })}
                      className="h-[28px] w-full cursor-pointer rounded-[5px] border border-black/10 bg-transparent p-0"
                    />
                    <span>끝 색</span>
                  </label>
                </div>

                <label
                  htmlFor="ribbon-link-bg"
                  className="mt-3 flex cursor-pointer items-center gap-2 text-[11px]"
                >
                  <Checkbox
                    id="ribbon-link-bg"
                    checked={ribbonLayer.linkStartToBackground}
                    onCheckedChange={(v) =>
                      onRibbonLayerChange({
                        linkStartToBackground: v === true,
                        startColor:
                          v === true ? ribbonLayer.backgroundColor : ribbonLayer.startColor,
                      })
                    }
                  />
                  <span>시작 색 = 배경색</span>
                </label>
              </section>
            </>
          )}

          {/* 공통 Overlay Layers (이미지 · 텍스트 레이어) */}
          <section className="border-t border-[#e0e4df] px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
              <span>Overlay Layers</span>
              <span className="text-[10px] font-normal text-[#7f8582]">
                이미지 · 텍스트 레이어
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <LayerSidebar
                layers={overlayLayers}
                selectedId={selectedOverlayLayerId}
                onSelect={onSelectOverlayLayer}
                onAddImage={onAddImageLayer}
                onAddText={onAddTextLayer}
                onRemove={onRemoveOverlayLayer}
                onMove={onMoveOverlayLayer}
              />
              {(() => {
                const selectedLayer = overlayLayers.find((l) => l.id === selectedOverlayLayerId)
                if (!selectedLayer) return null
                const selectedKey = getLayerKeys(overlayLayers).find(
                  (k) => k.id === selectedLayer.id
                )?.key
                return (
                  <>
                    <p className="text-xs font-medium">
                      선택한 레이어: <span className="font-mono">{selectedKey}</span>
                    </p>
                    {selectedLayer.type === 'image' ? (
                      <ImageLayerFields
                        layer={selectedLayer}
                        onChange={(patch) => onImageLayerChange(selectedLayer.id, patch)}
                        onReplaceAsset={(file) =>
                          onReplaceImageLayerAsset(selectedLayer.id, file)
                        }
                      />
                    ) : (
                      <TextLayerFields
                        layer={selectedLayer}
                        onChange={(patch) => onTextLayerChange(selectedLayer.id, patch)}
                      />
                    )}
                  </>
                )
              })()}
            </div>
          </section>

          {/* 공통 Export */}
          <section className="border-t border-[#e0e4df] px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
              <span>Export</span>
              <span className="text-[10px] font-normal text-[#7f8582] break-keep wrap-break-word">
                로컬 다운로드
              </span>
            </div>

            <div className="flex gap-1.5">
              <Select
                value={String(exportSize)}
                onValueChange={(v) => onChangeExportSize(Number(v))}
              >
                <SelectTrigger aria-label="PNG 크기" className="h-9 flex-1 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1024">긴 변 1024px</SelectItem>
                  <SelectItem value="2048">긴 변 2048px</SelectItem>
                  <SelectItem value="4096">긴 변 4096px</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={exportBusy}
                onClick={onExportPng}
                className="h-9 flex-1 bg-[#1e2322] text-xs text-white hover:bg-[#40483f] whitespace-nowrap"
              >
                PNG 저장
              </Button>
            </div>

            <div className="mt-2 flex gap-1.5">
              <Select value={String(videoSize)} onValueChange={(v) => onChangeVideoSize(Number(v))}>
                <SelectTrigger aria-label="동영상 크기" className="h-9 flex-1 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720">긴 변 720px</SelectItem>
                  <SelectItem value="1080">긴 변 1080px</SelectItem>
                  <SelectItem value="1440">긴 변 1440px</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={exportBusy}
                onClick={onExportVideo}
                className="h-9 flex-1 bg-[#1e2322] text-xs text-white hover:bg-[#40483f] whitespace-nowrap"
              >
                {videoButtonLabel}
              </Button>
            </div>

            {videoRecording && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancelVideo}
                className="mt-2 h-8 w-full text-xs whitespace-nowrap"
              >
                녹화 취소
              </Button>
            )}

            <p className="mt-2 text-[10px] leading-[1.6] text-[#8c9288] break-keep wrap-break-word text-pretty">
              동영상은 모션을 켠 상태로 15초 동안 녹화해요. 녹화 중에는 이 탭을 그대로 띄워 두세요.
            </p>
          </section>
        </fieldset>
      )}
    </aside>
  )
}
