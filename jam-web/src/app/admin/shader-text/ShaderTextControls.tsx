'use client'

import type { ChangeEvent, ReactNode } from 'react'
import { IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/admin/ui/accordion'
import { Button } from '@/components/admin/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Switch } from '@/components/admin/ui/switch'
import { Textarea } from '@/components/admin/ui/textarea'
import {
  ECHO_PATTERNS,
  ECHO_PATTERN_LABELS,
  MAX_TEXT_LENGTH,
  SHADER_TEXT_RANGES,
  type ShaderTextBackgroundMode,
  type ShaderTextEchoPattern,
  type ShaderTextParams,
} from '@/lib/admin/shaderTextDissolve'

interface ShaderTextControlsProps {
  params: ShaderTextParams
  onChange: (next: ShaderTextParams) => void
  playing: boolean
  onTogglePlaying: () => void
  silhouetteFileName: string | null
  onSilhouetteFileSelected: (file: File | null) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// 공용 필드 — 어드민 화면이라 MODULAR 적용 대상이 아니다(정책). 네이티브 select만 금지 —
// range/color 입력은 `BlobAnimationFields.tsx`(20260901_1944)와 동일하게 그대로 쓴다.
// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

function SliderField({
  label,
  value,
  range,
  decimals = 0,
  suffix = '',
  hint,
  onChange,
}: {
  label: string
  value: number
  range: { min: number; max: number; step: number }
  decimals?: number
  suffix?: string
  hint?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-foreground">
        {label} <span className="text-muted-foreground font-mono">{value.toFixed(decimals)}{suffix}</span>
      </span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
        className="accent-primary"
      />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-sm text-foreground">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-foreground">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-11 h-9 shrink-0 rounded-lg border border-border bg-white p-1 cursor-pointer"
      />
    </label>
  )
}

const R = SHADER_TEXT_RANGES

/**
 * 쉐이더 텍스트(디졸브 에코) 컨트롤 패널 (티켓 20260912_1532)
 *
 * Brik "Dissolve" 참고 툴의 컨트롤 패널 전체 항목을 그룹별 아코디언으로 배치한다. 기본값은
 * 전부 펼쳐 둔다(스크롤 가능한 패널) — 처음 여는 화면에서 어떤 옵션이 있는지 한눈에 보이도록.
 */
export default function ShaderTextControls({
  params,
  onChange,
  playing,
  onTogglePlaying,
  silhouetteFileName,
  onSilhouetteFileSelected,
}: ShaderTextControlsProps) {
  const set = <K extends keyof ShaderTextParams>(key: K, value: ShaderTextParams[K]) =>
    onChange({ ...params, [key]: value })
  const setFont = <K extends keyof ShaderTextParams['font']>(key: K, value: ShaderTextParams['font'][K]) =>
    onChange({ ...params, font: { ...params.font, [key]: value } })
  const setEcho = <K extends keyof ShaderTextParams['echo']>(key: K, value: ShaderTextParams['echo'][K]) =>
    onChange({ ...params, echo: { ...params.echo, [key]: value } })
  const setHalo = <K extends keyof ShaderTextParams['halo']>(key: K, value: ShaderTextParams['halo'][K]) =>
    onChange({ ...params, halo: { ...params.halo, [key]: value } })
  const setNoise = <K extends keyof ShaderTextParams['noise']>(key: K, value: ShaderTextParams['noise'][K]) =>
    onChange({ ...params, noise: { ...params.noise, [key]: value } })
  const setGrain = <K extends keyof ShaderTextParams['grain']>(key: K, value: ShaderTextParams['grain'][K]) =>
    onChange({ ...params, grain: { ...params.grain, [key]: value } })
  const setGradientMap = <K extends keyof ShaderTextParams['gradientMap']>(
    key: K,
    value: ShaderTextParams['gradientMap'][K]
  ) => onChange({ ...params, gradientMap: { ...params.gradientMap, [key]: value } })
  const setAnimation = <K extends keyof ShaderTextParams['animation']>(
    key: K,
    value: ShaderTextParams['animation'][K]
  ) => onChange({ ...params, animation: { ...params.animation, [key]: value } })
  const setBackground = <K extends keyof ShaderTextParams['background']>(
    key: K,
    value: ShaderTextParams['background'][K]
  ) => onChange({ ...params, background: { ...params.background, [key]: value } })

  return (
    <Accordion
      type="multiple"
      defaultValue={[
        'source',
        'echo',
        'echo-path',
        'halo',
        'noise',
        'grain',
        'gradient',
        'animation',
        'main-anim',
        'echo-anim',
        'background',
      ]}
      className="max-h-[70vh] overflow-y-auto pr-1"
    >
      {/* Source Content */}
      <AccordionItem value="source">
        <AccordionTrigger>Source Content — 문구·폰트</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          <Field label="텍스트" hint="줄바꿈이 그대로 반영돼요.">
            <Textarea
              value={params.text}
              maxLength={MAX_TEXT_LENGTH}
              rows={3}
              onChange={(e) => set('text', e.target.value)}
              placeholder={'JAM!'}
            />
          </Field>

          <ToggleField
            label="실루엣 이미지 사용"
            hint="켜면 텍스트 대신 업로드한 이미지의 알파(투명도)를 마스크로 써요. 이미지는 저장되지 않아 재편집 시 다시 올려야 해요."
            checked={params.source.silhouette}
            onChange={(v) => set('source', { silhouette: v })}
          />
          {params.source.silhouette && (
            <Field label="실루엣 이미지" hint="배경이 투명한 로고·실루엣 PNG를 권장해요.">
              <input
                type="file"
                accept="image/png,image/webp"
                onChange={(e) => onSilhouetteFileSelected(e.target.files?.[0] ?? null)}
                className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
              />
              {silhouetteFileName && (
                <span className="text-xs text-muted-foreground">선택됨: {silhouetteFileName}</span>
              )}
            </Field>
          )}

          <SliderField
            label="폰트 굵기"
            value={params.font.weight}
            range={R.font.weight}
            hint="Pretendard Variable 가변 축 — 이 화면 전용으로 별도 로드한 웹폰트라 임의의 굵기로 연속 조절돼요."
            onChange={(v) => setFont('weight', v)}
          />

          <SliderField label="폰트 크기" value={params.font.size} range={R.font.size} suffix="px" onChange={(v) => setFont('size', v)} />
          <SliderField label="자간" value={params.font.tracking} range={R.font.tracking} decimals={1} suffix="px" onChange={(v) => setFont('tracking', v)} />
          <SliderField label="줄간격" value={params.font.lineHeight} range={R.font.lineHeight} decimals={2} suffix="배" onChange={(v) => setFont('lineHeight', v)} />
          <SliderField label="Position X" value={params.font.positionX} range={R.font.positionX} suffix="%" onChange={(v) => setFont('positionX', v)} />
          <SliderField label="Position Y" value={params.font.positionY} range={R.font.positionY} suffix="%" onChange={(v) => setFont('positionY', v)} />
        </AccordionContent>
      </AccordionItem>

      {/* Text Echo */}
      <AccordionItem value="echo">
        <AccordionTrigger>Text Echo — 에코 복제</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          <SliderField label="에코 개수" value={params.echo.copies} range={R.echo.copies} onChange={(v) => setEcho('copies', Math.round(v))} />
          <SliderField label="오프셋 X" value={params.echo.offsetX} range={R.echo.offsetX} suffix="px" onChange={(v) => setEcho('offsetX', v)} />
          <SliderField label="오프셋 Y" value={params.echo.offsetY} range={R.echo.offsetY} suffix="px" onChange={(v) => setEcho('offsetY', v)} />
          <SliderField label="페이드" value={params.echo.fade} range={R.echo.fade} suffix="%" onChange={(v) => setEcho('fade', v)} />
          <SliderField label="스캐터" value={params.echo.scatter} range={R.echo.scatter} onChange={(v) => setEcho('scatter', v)} />
          <SliderField label="스케일 감쇠" value={params.echo.scaleDecay} range={R.echo.scaleDecay} suffix="%" onChange={(v) => setEcho('scaleDecay', v)} />
          <SliderField label="회전" value={params.echo.rotation} range={R.echo.rotation} decimals={1} suffix="°" onChange={(v) => setEcho('rotation', v)} />
        </AccordionContent>
      </AccordionItem>

      {/* Echo Path / Freehand Brush */}
      <AccordionItem value="echo-path">
        <AccordionTrigger>Echo Path / Freehand Brush — 배치 프리셋</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          <Field label="배치 프리셋" hint="실제 드로잉 UI 대신 오프셋 계산식으로 대체한 프리셋 3종이에요.">
            <Select value={params.echo.pattern} onValueChange={(v) => setEcho('pattern', v as ShaderTextEchoPattern)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ECHO_PATTERNS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {ECHO_PATTERN_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </AccordionContent>
      </AccordionItem>

      {/* Halo & Glow */}
      <AccordionItem value="halo">
        <AccordionTrigger>Halo &amp; Glow — 헤일로·글로우</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          <SliderField label="바깥 확산" value={params.halo.outerSpread} range={R.halo.outerSpread} suffix="px" onChange={(v) => setHalo('outerSpread', v)} />
          <SliderField label="바깥 강도" value={params.halo.outerIntensity} range={R.halo.outerIntensity} suffix="%" onChange={(v) => setHalo('outerIntensity', v)} />
          <SliderField label="안쪽 확산" value={params.halo.innerSpread} range={R.halo.innerSpread} suffix="px" onChange={(v) => setHalo('innerSpread', v)} />
          <SliderField label="안쪽 강도" value={params.halo.innerIntensity} range={R.halo.innerIntensity} suffix="%" onChange={(v) => setHalo('innerIntensity', v)} />
          <SliderField label="헤일로 오프셋 X" value={params.halo.offsetX} range={R.halo.offsetX} suffix="px" onChange={(v) => setHalo('offsetX', v)} />
          <SliderField label="헤일로 오프셋 Y" value={params.halo.offsetY} range={R.halo.offsetY} suffix="px" onChange={(v) => setHalo('offsetY', v)} />
          <SliderField label="헤일로 콘트라스트" value={params.halo.contrast} range={R.halo.contrast} onChange={(v) => setHalo('contrast', v)} />
          <ToggleField
            label="Preserve Sharp Core"
            hint="켜면 코어(메인 문구)는 글로우 계산에서 제외해 선명하게 남겨요."
            checked={params.halo.preserveSharpCore}
            onChange={(v) => setHalo('preserveSharpCore', v)}
          />
        </AccordionContent>
      </AccordionItem>

      {/* Noise Texture Engine */}
      <AccordionItem value="noise">
        <AccordionTrigger>Noise Texture Engine — 노이즈 텍스처</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          <ToggleField label="노이즈 활성화" checked={params.noise.enabled} onChange={(v) => setNoise('enabled', v)} />
          {params.noise.enabled && (
            <>
              <Field label="노이즈 타입" hint="현재는 Perlin 1종만 지원해요.">
                <Select value={params.noise.type} onValueChange={() => setNoise('type', 'perlin')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perlin">Perlin</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <SliderField label="스케일" value={params.noise.scale} range={R.noise.scale} onChange={(v) => setNoise('scale', v)} />
              <SliderField label="강도" value={params.noise.intensity} range={R.noise.intensity} suffix="%" onChange={(v) => setNoise('intensity', v)} />
              <Field label="블렌드 모드" hint="현재는 Overlay 1종만 지원해요.">
                <Select value={params.noise.blendMode} onValueChange={() => setNoise('blendMode', 'overlay')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="overlay">Overlay</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* Grain & Dissolve */}
      <AccordionItem value="grain">
        <AccordionTrigger>Grain &amp; Dissolve — 그레인</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          <SliderField label="그레인 크기" value={params.grain.size} range={R.grain.size} onChange={(v) => setGrain('size', v)} />
          <SliderField label="그레인 양" value={params.grain.amount} range={R.grain.amount} suffix="%" onChange={(v) => setGrain('amount', v)} />
          <SliderField label="가장자리 부드럽기" value={params.edgeBlur} range={R.edgeBlur} decimals={1} suffix="px" onChange={(v) => set('edgeBlur', v)} />
        </AccordionContent>
      </AccordionItem>

      {/* Gradient Map */}
      <AccordionItem value="gradient">
        <AccordionTrigger>Gradient Map — 색상 매핑</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          <ColorField label="그림자(Shadows)" value={params.gradientMap.shadow} onChange={(v) => setGradientMap('shadow', v)} />
          <ColorField label="헤일로(Halo)" value={params.gradientMap.halo} onChange={(v) => setGradientMap('halo', v)} />
          <ColorField label="코어(Core)" value={params.gradientMap.core} onChange={(v) => setGradientMap('core', v)} />
          <ColorField label="이너 코어(Inner Core)" value={params.gradientMap.innerCore} onChange={(v) => setGradientMap('innerCore', v)} />
          <SliderField label="Halo Position" value={params.gradientMap.haloPosition} range={R.gradientMap.haloPosition} decimals={2} onChange={(v) => setGradientMap('haloPosition', v)} />
          <SliderField label="Core Position" value={params.gradientMap.corePosition} range={R.gradientMap.corePosition} decimals={2} onChange={(v) => setGradientMap('corePosition', v)} />
        </AccordionContent>
      </AccordionItem>

      {/* Animation System */}
      <AccordionItem value="animation">
        <AccordionTrigger>Animation System — 재생</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Button type="button" size="sm" variant="outline" onClick={onTogglePlaying}>
              {playing ? (
                <>
                  <IconPlayerPause className="h-4 w-4 mr-1" />
                  일시정지
                </>
              ) : (
                <>
                  <IconPlayerPlay className="h-4 w-4 mr-1" />
                  재생
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">재생 중에는 적용할 수 없어요. 원하는 프레임에서 멈추세요.</span>
          </div>
          <SliderField label="애니메이션 속도" value={params.animation.speed} range={R.animation.speed} decimals={2} onChange={(v) => setAnimation('speed', v)} />
          <ToggleField
            label="노이즈 애니메이션"
            hint="켜면 노이즈 패턴이 위상에 따라 계속 바뀌어요."
            checked={params.animation.noiseAnimated}
            onChange={(v) => setAnimation('noiseAnimated', v)}
          />
        </AccordionContent>
      </AccordionItem>

      {/* Main Text Animation */}
      <AccordionItem value="main-anim">
        <AccordionTrigger>Main Text Animation — 메인 문구</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          <ToggleField
            label="애니메이션 사용"
            hint="타입: Wave — 메인 문구가 위아래로 흔들려요."
            checked={params.animation.mainWave.enabled}
            onChange={(v) => setAnimation('mainWave', { ...params.animation.mainWave, enabled: v })}
          />
          {params.animation.mainWave.enabled && (
            <SliderField
              label="진폭"
              value={params.animation.mainWave.amplitude}
              range={R.animation.mainWaveAmplitude}
              suffix="px"
              onChange={(v) => setAnimation('mainWave', { ...params.animation.mainWave, amplitude: v })}
            />
          )}
        </AccordionContent>
      </AccordionItem>

      {/* Echo Animation */}
      <AccordionItem value="echo-anim">
        <AccordionTrigger>Echo Animation — 에코</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          <ToggleField
            label="애니메이션 사용"
            hint="타입: Float — 에코들이 각자 다른 위상으로 떠다녀요."
            checked={params.animation.echoFloat.enabled}
            onChange={(v) => setAnimation('echoFloat', { ...params.animation.echoFloat, enabled: v })}
          />
          {params.animation.echoFloat.enabled && (
            <SliderField
              label="진폭"
              value={params.animation.echoFloat.amplitude}
              range={R.animation.echoFloatAmplitude}
              suffix="px"
              onChange={(v) => setAnimation('echoFloat', { ...params.animation.echoFloat, amplitude: v })}
            />
          )}
        </AccordionContent>
      </AccordionItem>

      {/* Background */}
      <AccordionItem value="background">
        <AccordionTrigger>Background — 배경</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          <Field label="배경 방식">
            <Select value={params.background.mode} onValueChange={(v) => setBackground('mode', v as ShaderTextBackgroundMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transparent">투명(알파 유지 PNG)</SelectItem>
                <SelectItem value="color">단색</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {params.background.mode === 'color' && (
            <ColorField label="배경색" value={params.background.color} onChange={(v) => setBackground('color', v)} />
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
