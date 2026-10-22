'use client'

import { useEffect, useRef } from 'react'
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
} from './shapeStudioConfig'

interface ShapeStudioPanelProps {
  state: ShapeStudioState
  presets: AnyShapePreset[]
  glyphsMap: Record<string, GlyphDefinition>
  randOn: RandomToggleState
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
  onUpdateSegment: (index: number, key: keyof SegmentItem, value: number, commitHistory: boolean) => void
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
  state,
  presets,
  glyphsMap,
  randOn,
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
  onChangeExportSize,
  onExportPng,
  onChangeVideoSize,
  onExportVideo,
  onCancelVideo,
}: ShapeStudioPanelProps) {
  const isGlyphMode = Boolean(state.glyph)
  const randOptions = isGlyphMode ? RAND_GLYPH_OPTS : RAND_SEG_OPTS
  const colorStartedRef = useRef<Record<string, boolean>>({})

  return (
    <aside className="w-full overflow-y-auto border-t border-[#e0e4df] bg-[#f8f9f6] text-[#1e2322] lg:w-[352px] lg:shrink-0 lg:border-t-0 lg:border-l">
      <div className="flex items-center justify-between px-5 pt-[18px] pb-3">
        <h2 className="m-0 text-[15px] font-semibold tracking-[-0.3px] whitespace-nowrap">
          Shape Generator
        </h2>
        <Badge
          variant="outline"
          className="border-[#dae1d2] px-1.5 py-0.5 text-[9px] font-normal text-[#87947a] whitespace-nowrap"
        >
          Segments + Metaball
        </Badge>
      </div>

      {/* 1. Shape */}
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
          투명 배경 이미지는 불투명한 부분이, 흰 배경 이미지는 어두운 부분이 쉐입이 돼요. 파일을
          캔버스에 끌어다 놓아도 됩니다. 추가한 쉐입은 이 탭을 닫으면 사라져요.
        </p>
      </section>

      {/* 2. Random */}
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

      {/* 3. Canvas */}
      <section className="border-t border-[#e0e4df] px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
          <span>Canvas</span>
          <span className="text-[10px] font-normal text-[#7f8582]">비율</span>
        </div>
        <div className="flex gap-0.5 rounded-full bg-[#e5e8e1] p-1">
          {(
            [
              ['1:1', 'Square'],
              ['4:5', 'Vertical'],
              ['16:9', 'Horizontal'],
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

      {/* 4. Segments */}
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
              세그먼트는 위에서 아래로 쌓는 둥근 사각형 블록 하나예요. 블록마다 높이와 위·아래
              모서리 둥글기를 조절하고, 블록을 합쳐 하나의 쉐입을 만듭니다.
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

      {/* 5. Blend */}
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

      {/* 6. Motion */}
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

      {/* 7. Gradient */}
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

      {/* 8. Background */}
      <section className="border-t border-[#e0e4df] px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
          <span>Background</span>
          <span className="text-[10px] font-normal text-[#7f8582] break-keep wrap-break-word">
            배경 &amp; 질감
          </span>
        </div>

        <div className="flex items-center justify-between gap-2.5 text-[11px]">
          <span className="whitespace-nowrap">배경 방식</span>
          <Select value={state.bgMode} onValueChange={(v) => onChangeBgMode(v as BackgroundMode)}>
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

      {/* 9. Export */}
      <section className="border-t border-[#e0e4df] px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
          <span>Export</span>
          <span className="text-[10px] font-normal text-[#7f8582] break-keep wrap-break-word">
            로컬 다운로드
          </span>
        </div>

        <div className="flex gap-1.5">
          <Select value={String(exportSize)} onValueChange={(v) => onChangeExportSize(Number(v))}>
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
        <p className="mt-2 text-[10px] leading-[1.6] text-[#8c9288] break-keep wrap-break-word text-pretty">
          Genie Healthcare 프로젝트의 Shape generator 영상과 브랜드 컬러(Pulse Blue, Vitality
          Green, Serene Blue, Heart Coral, Therapeutic Violet)를 분석해 만든 독립 프로토타입입니다.
        </p>
      </section>
    </aside>
  )
}
