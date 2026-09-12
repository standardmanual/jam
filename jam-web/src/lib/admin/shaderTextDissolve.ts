/**
 * 쉐이더 텍스트 생성기 — 디졸브 에코 — 저작 파라미터 정의·정규화 (티켓 20260912_1532)
 *
 * `badges.image_gen_params`(마이그레이션 126, `20260902_1613`이 추가)를 **재사용**한다. 다른
 * 저작 도구(액티비티 배지 이미지 생성기)가 만든 값과 섞이지 않도록 `generator` discriminator로
 * 구분한다 — `parseShaderTextParams`는 `generator`가 일치하지 않으면 `null`을 돌려준다.
 *
 * DOM·React에 의존하지 않는 순수 모듈이라 어드민 클라이언트(저작 화면)와 서버 라우트(저장 시
 * 검증)가 같은 코드를 쓴다. 실제 캔버스 합성(폰트 로딩 포함)은 DOM이 필요해
 * `composeShaderTextDissolve.ts`에 따로 둔다.
 */
import type { Json } from '@/types/database.generated'

/** 현재 저장 포맷 버전. 형태가 바뀌면 올리고, 과거 값은 `parse`에서 마이그레이션한다. */
export const SHADER_TEXT_PARAMS_VERSION = 1

/** `badges.image_gen_params`에 이 도구가 만든 값임을 표시하는 discriminator */
export const SHADER_TEXT_GENERATOR = 'shader-text-dissolve' as const

/** 출력 규격 — 1:1, 1280×1280 고정 (사용자 결정) */
export const CANVAS_SIZE = 1280

/** 업로드 상한(바이트). 서버·클라이언트가 같은 값으로 판단한다. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * 애니메이션 위상이 1초에 얼마나 나아가는지(rad/s). `blobAnimation.ts`의 `BLOB_PHASE_RATE`와
 * 같은 이유로 렌더러·미리보기 캔버스가 같은 값을 쓰도록 한 곳에 둔다. 실제 진행량은
 * `speed`를 곱해 정해진다 — `phase += SHADER_TEXT_PHASE_RATE * speed * dt`.
 */
export const SHADER_TEXT_PHASE_RATE = 1

/** jsonb에 담길 문구 상한 — 운영자가 실수로 대용량 텍스트를 붙여넣는 경우 방어 */
export const MAX_TEXT_LENGTH = 300

/** 프리셋 이름 상한 */
export const MAX_PRESET_NAME_LENGTH = 60

/**
 * Pretendard **static** 배포판이 제공하는 9단계 고정 굵기(가변 축 보간 아님).
 * `jam-web/src/app/globals.css`가 CDN static 번들을 import하므로 이 9개 값만 실제로 로드된다.
 */
export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export type ShaderTextFontWeight = (typeof FONT_WEIGHTS)[number]

export const FONT_WEIGHT_LABELS: Record<ShaderTextFontWeight, string> = {
  100: 'Thin (100)',
  200: 'Extra Light (200)',
  300: 'Light (300)',
  400: 'Regular (400)',
  500: 'Medium (500)',
  600: 'SemiBold (600)',
  700: 'Bold (700)',
  800: 'Extra Bold (800)',
  900: 'Black (900)',
}

/** Echo Path / Freehand Brush — 실제 드로잉 UI 없이 대체하는 배치 프리셋 3종 (사용자 결정) */
export const ECHO_PATTERNS = ['linear', 'zigzag', 'circular'] as const
export type ShaderTextEchoPattern = (typeof ECHO_PATTERNS)[number]

export const ECHO_PATTERN_LABELS: Record<ShaderTextEchoPattern, string> = {
  linear: '직선',
  zigzag: '지그재그',
  circular: '원형 배치',
}

export const NOISE_TYPES = ['perlin'] as const
export type ShaderTextNoiseType = (typeof NOISE_TYPES)[number]

export const NOISE_BLEND_MODES = ['overlay'] as const
export type ShaderTextNoiseBlendMode = (typeof NOISE_BLEND_MODES)[number]

export const BACKGROUND_MODES = ['color', 'transparent'] as const
export type ShaderTextBackgroundMode = (typeof BACKGROUND_MODES)[number]

// ─────────────────────────────────────────────────────────────────────────────
// 파라미터 타입
// ─────────────────────────────────────────────────────────────────────────────

export interface ShaderTextSourceParams {
  /** Brik "Source Content"의 실루엣 이미지 옵션. 켜면 텍스트 대신 업로드 이미지의 알파를 마스크로 쓴다. */
  silhouette: boolean
}

export interface ShaderTextFontParams {
  weight: ShaderTextFontWeight
  size: number
  tracking: number
  lineHeight: number
  /** 0~100(%). 캔버스 안에서 텍스트 블록 중심의 가로 위치 */
  positionX: number
  /** 0~100(%). 세로 위치 */
  positionY: number
}

export interface ShaderTextEchoParams {
  copies: number
  offsetX: number
  offsetY: number
  /** 0~100. 클수록 뒤로 갈수록 빨리 옅어진다 */
  fade: number
  /** 0~50. 에코마다 흩뿌리는 정도(결정론적 시드 기반 — 리렌더마다 흔들리지 않는다) */
  scatter: number
  /** 0~100(%). 에코가 뒤로 갈수록 작아지는 정도 */
  scaleDecay: number
  /** 도(deg). 에코 인덱스에 비례해 누적 회전 */
  rotation: number
  pattern: ShaderTextEchoPattern
}

export interface ShaderTextHaloParams {
  outerSpread: number
  outerIntensity: number
  innerSpread: number
  innerIntensity: number
  offsetX: number
  offsetY: number
  /** -100~100 */
  contrast: number
  /** 헤일로/글로우를 만들 때 코어(메인 카피)를 블러 소스에서 빼 선명하게 유지 */
  preserveSharpCore: boolean
}

export interface ShaderTextNoiseParams {
  enabled: boolean
  type: ShaderTextNoiseType
  scale: number
  intensity: number
  blendMode: ShaderTextNoiseBlendMode
}

export interface ShaderTextGrainParams {
  size: number
  amount: number
}

export interface ShaderTextGradientMapParams {
  shadow: string
  halo: string
  core: string
  innerCore: string
  /** 0~1. 그림자→헤일로 색 전환 위치 */
  haloPosition: number
  /** 0~1. 헤일로→코어 색 전환 위치 (이너 코어는 1 고정) */
  corePosition: number
}

export interface ShaderTextAnimationSubParams {
  enabled: boolean
  amplitude: number
}

export interface ShaderTextAnimationParams {
  playing: boolean
  speed: number
  mainWave: ShaderTextAnimationSubParams
  echoFloat: ShaderTextAnimationSubParams
  noiseAnimated: boolean
  /**
   * 정지 이미지로 구울 때 쓰는 위상. `20260902_1613`의 블롭 `phase` 저장 패턴과 동일 —
   * 재생 중 rAF가 누적하다가 일시정지 시점에 이 값으로 확정해 저장한다.
   */
  bakedPhase: number
}

export interface ShaderTextBackgroundParams {
  mode: ShaderTextBackgroundMode
  color: string
}

export interface ShaderTextParams {
  version: number
  generator: typeof SHADER_TEXT_GENERATOR
  text: string
  source: ShaderTextSourceParams
  font: ShaderTextFontParams
  echo: ShaderTextEchoParams
  halo: ShaderTextHaloParams
  noise: ShaderTextNoiseParams
  grain: ShaderTextGrainParams
  gradientMap: ShaderTextGradientMapParams
  edgeBlur: number
  animation: ShaderTextAnimationParams
  background: ShaderTextBackgroundParams
  canvasSize: number
}

// ─────────────────────────────────────────────────────────────────────────────
// 슬라이더 범위 — 어드민 UI와 저장 시 정규화가 같은 값을 쓴다(어긋나지 않게 한 곳에서 정의)
// ─────────────────────────────────────────────────────────────────────────────

export const SHADER_TEXT_RANGES = {
  font: {
    size: { min: 20, max: 320, step: 1 },
    tracking: { min: -20, max: 40, step: 0.5 },
    lineHeight: { min: 0.8, max: 2.5, step: 0.05 },
    positionX: { min: 0, max: 100, step: 1 },
    positionY: { min: 0, max: 100, step: 1 },
  },
  echo: {
    copies: { min: 1, max: 60, step: 1 },
    offsetX: { min: -50, max: 50, step: 1 },
    offsetY: { min: -50, max: 50, step: 1 },
    fade: { min: 0, max: 100, step: 1 },
    scatter: { min: 0, max: 50, step: 1 },
    scaleDecay: { min: 0, max: 100, step: 1 },
    rotation: { min: -45, max: 45, step: 0.5 },
  },
  halo: {
    outerSpread: { min: 0, max: 120, step: 1 },
    outerIntensity: { min: 0, max: 100, step: 1 },
    innerSpread: { min: 0, max: 60, step: 1 },
    innerIntensity: { min: 0, max: 100, step: 1 },
    offsetX: { min: -50, max: 50, step: 1 },
    offsetY: { min: -50, max: 50, step: 1 },
    contrast: { min: -100, max: 100, step: 1 },
  },
  noise: {
    scale: { min: 1, max: 64, step: 1 },
    intensity: { min: 0, max: 100, step: 1 },
  },
  grain: {
    size: { min: 1, max: 8, step: 1 },
    amount: { min: 0, max: 100, step: 1 },
  },
  gradientMap: {
    haloPosition: { min: 0, max: 1, step: 0.01 },
    corePosition: { min: 0, max: 1, step: 0.01 },
  },
  edgeBlur: { min: 0, max: 20, step: 0.5 },
  animation: {
    speed: { min: 0.1, max: 3, step: 0.05 },
    mainWaveAmplitude: { min: 0, max: 60, step: 1 },
    echoFloatAmplitude: { min: 0, max: 60, step: 1 },
  },
} as const

export const DEFAULT_SHADER_TEXT_PARAMS: ShaderTextParams = {
  version: SHADER_TEXT_PARAMS_VERSION,
  generator: SHADER_TEXT_GENERATOR,
  text: 'JAM!',
  source: { silhouette: false },
  font: { weight: 700, size: 96, tracking: 0, lineHeight: 1.1, positionX: 50, positionY: 50 },
  echo: { copies: 24, offsetX: 0, offsetY: 6, fade: 70, scatter: 0, scaleDecay: 0, rotation: 0, pattern: 'linear' },
  halo: {
    outerSpread: 14,
    outerIntensity: 35,
    innerSpread: 6,
    innerIntensity: 55,
    offsetX: 0,
    offsetY: 0,
    contrast: 0,
    preserveSharpCore: false,
  },
  noise: { enabled: true, type: 'perlin', scale: 4, intensity: 18, blendMode: 'overlay' },
  grain: { size: 2, amount: 20 },
  gradientMap: {
    shadow: '#05040a',
    halo: '#1c3a8f',
    core: '#ff6a2c',
    innerCore: '#fff2b0',
    haloPosition: 0.33,
    corePosition: 0.66,
  },
  edgeBlur: 2,
  animation: {
    playing: false,
    speed: 1,
    mainWave: { enabled: true, amplitude: 8 },
    echoFloat: { enabled: true, amplitude: 4 },
    noiseAnimated: false,
    bakedPhase: 0,
  },
  background: { mode: 'transparent', color: '#000000' },
  canvasSize: CANVAS_SIZE,
}

// ─────────────────────────────────────────────────────────────────────────────
// 정규화
// ─────────────────────────────────────────────────────────────────────────────

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** `Number(value)` 강제변환을 쓰지 않는다 — `Number(null)`이 0이라 "값 없음"과 "0"이 섞인다. */
function num(value: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clamp(value, range.min, range.max)
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n/g, '\n').slice(0, max)
}

function weight(value: unknown, fallback: ShaderTextFontWeight): ShaderTextFontWeight {
  return typeof value === 'number' && (FONT_WEIGHTS as readonly number[]).includes(value)
    ? (value as ShaderTextFontWeight)
    : fallback
}

function pattern(value: unknown, fallback: ShaderTextEchoPattern): ShaderTextEchoPattern {
  return typeof value === 'string' && (ECHO_PATTERNS as readonly string[]).includes(value)
    ? (value as ShaderTextEchoPattern)
    : fallback
}

function backgroundMode(value: unknown, fallback: ShaderTextBackgroundMode): ShaderTextBackgroundMode {
  return typeof value === 'string' && (BACKGROUND_MODES as readonly string[]).includes(value)
    ? (value as ShaderTextBackgroundMode)
    : fallback
}

/**
 * DB/요청 본문의 임의 값을 저장·렌더링 가능한 파라미터로 정규화한다.
 *
 * `generator`가 이 도구의 discriminator와 다르면(다른 저작 도구가 만든 값, 또는 형식이 아예
 * 다른 값) `null`을 돌려준다 — 관용적으로 필드를 메우면 다른 도구의 값을 잘못 해석하게 된다.
 * discriminator가 일치하면 이후 개별 필드는 관용적으로 기본값을 메운다.
 */
export function parseShaderTextParams(value: unknown): ShaderTextParams | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.generator !== SHADER_TEXT_GENERATOR) return null

  const d = DEFAULT_SHADER_TEXT_PARAMS
  const rawSource = (raw.source ?? {}) as Record<string, unknown>
  const rawFont = (raw.font ?? {}) as Record<string, unknown>
  const rawEcho = (raw.echo ?? {}) as Record<string, unknown>
  const rawHalo = (raw.halo ?? {}) as Record<string, unknown>
  const rawNoise = (raw.noise ?? {}) as Record<string, unknown>
  const rawGrain = (raw.grain ?? {}) as Record<string, unknown>
  const rawGradientMap = (raw.gradientMap ?? {}) as Record<string, unknown>
  const rawAnimation = (raw.animation ?? {}) as Record<string, unknown>
  const rawMainWave = (rawAnimation.mainWave ?? {}) as Record<string, unknown>
  const rawEchoFloat = (rawAnimation.echoFloat ?? {}) as Record<string, unknown>
  const rawBackground = (raw.background ?? {}) as Record<string, unknown>
  const R = SHADER_TEXT_RANGES

  return {
    version: SHADER_TEXT_PARAMS_VERSION,
    generator: SHADER_TEXT_GENERATOR,
    text: text(raw.text, MAX_TEXT_LENGTH),
    source: { silhouette: bool(rawSource.silhouette, d.source.silhouette) },
    font: {
      weight: weight(rawFont.weight, d.font.weight),
      size: num(rawFont.size, R.font.size, d.font.size),
      tracking: num(rawFont.tracking, R.font.tracking, d.font.tracking),
      lineHeight: num(rawFont.lineHeight, R.font.lineHeight, d.font.lineHeight),
      positionX: num(rawFont.positionX, R.font.positionX, d.font.positionX),
      positionY: num(rawFont.positionY, R.font.positionY, d.font.positionY),
    },
    echo: {
      copies: Math.round(num(rawEcho.copies, R.echo.copies, d.echo.copies)),
      offsetX: num(rawEcho.offsetX, R.echo.offsetX, d.echo.offsetX),
      offsetY: num(rawEcho.offsetY, R.echo.offsetY, d.echo.offsetY),
      fade: num(rawEcho.fade, R.echo.fade, d.echo.fade),
      scatter: num(rawEcho.scatter, R.echo.scatter, d.echo.scatter),
      scaleDecay: num(rawEcho.scaleDecay, R.echo.scaleDecay, d.echo.scaleDecay),
      rotation: num(rawEcho.rotation, R.echo.rotation, d.echo.rotation),
      pattern: pattern(rawEcho.pattern, d.echo.pattern),
    },
    halo: {
      outerSpread: num(rawHalo.outerSpread, R.halo.outerSpread, d.halo.outerSpread),
      outerIntensity: num(rawHalo.outerIntensity, R.halo.outerIntensity, d.halo.outerIntensity),
      innerSpread: num(rawHalo.innerSpread, R.halo.innerSpread, d.halo.innerSpread),
      innerIntensity: num(rawHalo.innerIntensity, R.halo.innerIntensity, d.halo.innerIntensity),
      offsetX: num(rawHalo.offsetX, R.halo.offsetX, d.halo.offsetX),
      offsetY: num(rawHalo.offsetY, R.halo.offsetY, d.halo.offsetY),
      contrast: num(rawHalo.contrast, R.halo.contrast, d.halo.contrast),
      preserveSharpCore: bool(rawHalo.preserveSharpCore, d.halo.preserveSharpCore),
    },
    noise: {
      enabled: bool(rawNoise.enabled, d.noise.enabled),
      type: 'perlin',
      scale: num(rawNoise.scale, R.noise.scale, d.noise.scale),
      intensity: num(rawNoise.intensity, R.noise.intensity, d.noise.intensity),
      blendMode: 'overlay',
    },
    grain: {
      size: num(rawGrain.size, R.grain.size, d.grain.size),
      amount: num(rawGrain.amount, R.grain.amount, d.grain.amount),
    },
    gradientMap: {
      shadow: color(rawGradientMap.shadow, d.gradientMap.shadow),
      halo: color(rawGradientMap.halo, d.gradientMap.halo),
      core: color(rawGradientMap.core, d.gradientMap.core),
      innerCore: color(rawGradientMap.innerCore, d.gradientMap.innerCore),
      haloPosition: num(rawGradientMap.haloPosition, R.gradientMap.haloPosition, d.gradientMap.haloPosition),
      corePosition: num(rawGradientMap.corePosition, R.gradientMap.corePosition, d.gradientMap.corePosition),
    },
    edgeBlur: num(raw.edgeBlur, R.edgeBlur, d.edgeBlur),
    animation: {
      playing: false, // 저장된 재생 상태를 그대로 복원하지 않는다 — 재편집은 항상 정지 상태로 연다.
      speed: num(rawAnimation.speed, R.animation.speed, d.animation.speed),
      mainWave: {
        enabled: bool(rawMainWave.enabled, d.animation.mainWave.enabled),
        amplitude: num(rawMainWave.amplitude, R.animation.mainWaveAmplitude, d.animation.mainWave.amplitude),
      },
      echoFloat: {
        enabled: bool(rawEchoFloat.enabled, d.animation.echoFloat.enabled),
        amplitude: num(rawEchoFloat.amplitude, R.animation.echoFloatAmplitude, d.animation.echoFloat.amplitude),
      },
      noiseAnimated: bool(rawAnimation.noiseAnimated, d.animation.noiseAnimated),
      bakedPhase: typeof rawAnimation.bakedPhase === 'number' && Number.isFinite(rawAnimation.bakedPhase)
        ? Math.max(0, rawAnimation.bakedPhase)
        : d.animation.bakedPhase,
    },
    background: {
      mode: backgroundMode(rawBackground.mode, d.background.mode),
      color: color(rawBackground.color, d.background.color),
    },
    canvasSize: CANVAS_SIZE,
  }
}

/**
 * 순수 값(named interface)을 `JSON.parse(JSON.stringify(...))`로 한 번 왕복시켜 진짜 구조적
 * plain object로 만든다. Supabase 생성 타입의 `Json`은 재귀 인덱스 시그니처 유니언이라, named
 * interface를 캐스팅 없이 그대로 대입하면 "Index signature is missing" 오류가 난다(값 자체는
 * 이미 숫자·문자열·불리언·중첩 객체뿐이라 JSON으로 안전하게 왕복된다) — 컬럼명 검증을 끄는
 * `as unknown as XxxInsert` 전체 캐스팅과 달리, 이 왕복은 실제로 JSON 직렬화 가능함을 보장하는
 * 안전한 변환이다.
 */
function toJson<T>(value: T): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

/** 저장용 평문 객체. `parse`를 통과한 값만 넘긴다(라우트에서 검증한 뒤 호출). */
export function serializeShaderTextParams(params: ShaderTextParams): Json {
  return toJson({ ...params, version: SHADER_TEXT_PARAMS_VERSION, generator: SHADER_TEXT_GENERATOR, canvasSize: CANVAS_SIZE })
}

/**
 * 스타일 프리셋 저장 형태 — **문구(`text`)는 뺀다**(티켓 권장). 매번 프리셋을 불러올 때마다
 * 입력해 둔 문구가 지워지면 불편하다. 나머지 스타일 값 전체를 저장한다.
 */
export type ShaderTextStyleParams = Omit<ShaderTextParams, 'text' | 'canvasSize'>

export function extractShaderTextStyle(params: ShaderTextParams): ShaderTextStyleParams {
  return {
    version: params.version,
    generator: params.generator,
    source: params.source,
    font: params.font,
    echo: params.echo,
    halo: params.halo,
    noise: params.noise,
    grain: params.grain,
    gradientMap: params.gradientMap,
    edgeBlur: params.edgeBlur,
    animation: params.animation,
    background: params.background,
  }
}

/** 프리셋 저장용 — `Json` 왕복 이유는 `serializeShaderTextParams` 주석 참조. */
export function serializeShaderTextStyle(style: ShaderTextStyleParams): Json {
  return toJson(style)
}

/** 프리셋 스타일을 현재 draft에 병합한다 — 문구는 유지하고 나머지 스타일만 교체한다. */
export function applyShaderTextStyle(current: ShaderTextParams, style: ShaderTextStyleParams): ShaderTextParams {
  return { ...current, ...style, text: current.text, canvasSize: CANVAS_SIZE }
}

/**
 * jsonb에 저장된 임의 값을 프리셋 스타일로 정규화한다. 전체 파라미터 파서를 재사용하고 `text`만
 * 현재 값을 임시로 채워 통과시킨 뒤(discriminator·나머지 필드 검증은 동일 로직) 다시 벗겨낸다.
 */
export function parseShaderTextStyle(value: unknown): ShaderTextStyleParams | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const withDiscriminator = { ...(value as Record<string, unknown>), generator: SHADER_TEXT_GENERATOR, text: '' }
  const parsed = parseShaderTextParams(withDiscriminator)
  if (!parsed) return null
  return extractShaderTextStyle(parsed)
}
