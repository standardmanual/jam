/**
 * JAM! 에셋 제너레이터 어드민 화면 — 기본값·슬라이더 범위·파일명 규칙 (티켓 20260924_2156)
 *
 * 그리기 자체(곡선·스탬프·레이어 합성)는 `jam-web/src/lib/asset-generator/`(티켓 20260924_2155)를
 * 그대로 쓴다. 여기는 그 모듈을 어드민 화면에 붙이는 데 필요한, 캔버스에 의존하지 않는 순수
 * 계산·상수만 둔다 — 테스트는 `__tests__/assetGeneratorHelpers.test.ts`.
 *
 * 원본: jam-doc/assets/prototypes/20260924_jam-asset-generator.html
 * (state 초깃값 161~167줄, applyAspect 302줄, readSeconds 515줄, fileName 503줄,
 * MUXER_URL·MUXER_SRI 492~493줄).
 */
import type {
  FontLoader,
  GradientDirection,
  ImageLayerConfig,
  LetterKey,
  RibbonLayerConfig,
  StageRatio,
  TextLayerConfig,
  TextLayerFont,
} from '@/lib/asset-generator'
import { ensureGoogleFontLoaded, waitForGoogleFontLoaded } from '@/lib/admin/shaderLab/googleFonts'

/** 스테이지 긴 변 고정 길이(px). 원본 MAX_LONG. */
export const STAGE_MAX_LONG_SIDE_PX = 1280

/** 비율별 스테이지 크기 (원본 applyAspect). */
export function resolveStageSize(ratio: StageRatio): { width: number; height: number } {
  if (ratio === '1:1') return { width: STAGE_MAX_LONG_SIDE_PX, height: STAGE_MAX_LONG_SIDE_PX }
  if (ratio === '4:5') return { width: (STAGE_MAX_LONG_SIDE_PX * 4) / 5, height: STAGE_MAX_LONG_SIDE_PX }
  return { width: Math.round((STAGE_MAX_LONG_SIDE_PX * 9) / 16), height: STAGE_MAX_LONG_SIDE_PX }
}

export const STAGE_RATIO_OPTIONS: { value: StageRatio; label: string }[] = [
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
  { value: '9:16', label: '9:16' },
]

export const GRADIENT_DIRECTION_OPTIONS: { value: GradientDirection; label: string }[] = [
  { value: 'h', label: '좌 → 우' },
  { value: 'v', label: '상 → 하' },
  { value: 'r', label: '중심 → 바깥' },
]

export const LETTER_KEYS: readonly LetterKey[] = ['J', 'A', 'M']

export const INITIAL_STAGE_RATIO: StageRatio = '1:1'

/** 원본 state 초깃값(161~167줄)과 같다. */
export const INITIAL_RIBBON_LAYER: RibbonLayerConfig = {
  type: 'ribbon',
  source: { kind: 'letter', letter: 'J' },
  sizePct: 22,
  blurPct: 0,
  rotationDeg: 0,
  followPath: false,
  direction: 'h',
  backgroundColor: '#ff1a00',
  startColor: '#ff1a00',
  endColor: '#ff4dff',
  linkStartToBackground: true,
  irregularityPct: 35,
  seed: 7,
  speed: 1500,
  gap: 14,
  count: 260,
}

interface SliderRange {
  min: number
  max: number
  step: number
}

export const SIZE_RANGE: SliderRange = { min: 5, max: 100, step: 1 }
export const BLUR_RANGE: SliderRange = { min: 0, max: 100, step: 1 }
export const ROTATION_RANGE: SliderRange = { min: -180, max: 180, step: 1 }
export const IRREGULARITY_RANGE: SliderRange = { min: 0, max: 100, step: 1 }
export const SPEED_RANGE: SliderRange = { min: 1000, max: 2000, step: 10 }
export const GAP_RANGE: SliderRange = { min: 2, max: 120, step: 1 }
export const COUNT_RANGE: SliderRange = { min: 200, max: 800, step: 5 }
export const HEAD_POSITION_RANGE: SliderRange = { min: 0, max: 100, step: 0.1 }
/** 이미지 레이어 위치(%, 티켓 20260924_2157) — 스테이지 가로/세로 기준. */
export const IMAGE_POSITION_RANGE: SliderRange = { min: 0, max: 100, step: 1 }
/** 이미지 레이어 크기(%) — 스테이지 짧은 변 기준. 오버레이가 스테이지보다 커질 수도 있어 100을 넘긴다. */
export const IMAGE_SIZE_RANGE: SliderRange = { min: 1, max: 200, step: 1 }
export const OPACITY_RANGE: SliderRange = { min: 0, max: 100, step: 1 }
/** 텍스트 레이어 글자 크기(%, 티켓 20260924_2158) — 스테이지 짧은 변 기준. */
export const TEXT_SIZE_RANGE: SliderRange = { min: 1, max: 60, step: 1 }
/** 글꼴 굵기(CSS font-weight 값 범위). */
export const FONT_WEIGHT_RANGE: SliderRange = { min: 100, max: 900, step: 100 }
/** 자간(글자 크기 대비 배수). 음수면 좁아지고 양수면 벌어진다. */
export const LETTER_SPACING_RANGE: SliderRange = { min: -0.2, max: 1, step: 0.01 }
/** 행간(글자 크기 대비 배수). */
export const LINE_HEIGHT_RANGE: SliderRange = { min: 0.8, max: 3, step: 0.1 }

export const TEXT_ALIGN_OPTIONS: { value: TextLayerConfig['align']; label: string }[] = [
  { value: 'left', label: '왼쪽' },
  { value: 'center', label: '가운데' },
  { value: 'right', label: '오른쪽' },
]

export const formatPercent = (value: number): string => `${value}%`
export const formatDegree = (value: number): string => `${value}°`
export const formatPxPerSecond = (value: number): string => `${value}px/s`
export const formatPx = (value: number): string => `${value}px`
export const formatCount = (value: number): string => `${value}개`
export const formatWeight = (value: number): string => `${value}`
export const formatMultiplier = (value: number): string => `×${value.toFixed(2)}`

/** 시작 색 실제 값(PRD §6): 연결이 켜져 있으면 배경색을 그대로 따른다. */
export function computeEffectiveStartColor(
  layer: Pick<RibbonLayerConfig, 'linkStartToBackground' | 'backgroundColor' | 'startColor'>
): string {
  return layer.linkStartToBackground ? layer.backgroundColor : layer.startColor
}

/** 곡선 시드를 새로 뽑는다("무작위" 버튼, 원본 reseed 클릭 처리 398줄). */
export function generateRandomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 1e9)
}

/** 영상 길이(초) 입력값 보정(원본 readSeconds, 515줄): 1~60초로 자르고 정수로 반올림한다. */
export function clampDurationSeconds(raw: number): number {
  const base = Number.isFinite(raw) && raw > 0 ? raw : 5
  return Math.min(60, Math.max(1, Math.round(base)))
}

export const DEFAULT_VIDEO_DURATION_SECONDS = 5

export const VIDEO_FPS = 60
export const VIDEO_BITRATE_BPS = 12_000_000
export const H264_CODEC_CANDIDATES = ['avc1.64002A', 'avc1.4D002A', 'avc1.42002A'] as const

/** MP4 묶음 라이브러리(mp4-muxer, MIT). 프로토타입(492~493줄)과 같은 버전·무결성 해시를 그대로 쓴다. */
export const MP4_MUXER_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js'
export const MP4_MUXER_SCRIPT_INTEGRITY = 'sha384-wr0AQH9RBAKio/g7bHM5245MBCU5B/b0Y9u42cTxRYQQJXKEijZvWEJKL9JG26hs'

/** 레이어 식별자 생성(재작업, 20260924_2157). shader-lab의 `layerFactory.ts`와 같은 방식이지만
 * shader-lab 파일은 고치지 않으므로 여기 따로 둔다(수정 금지 대상 모방 아님, 중복 작성). */
function generateLayerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `image-layer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 새 이미지 레이어 기본값(티켓 20260924_2157): 중앙 배치, 짧은 변의 30%, 완전 불투명. */
export function createImageLayer(assetUrl: string): ImageLayerConfig {
  return {
    type: 'image',
    id: generateLayerId(),
    assetUrl,
    xPct: 50,
    yPct: 50,
    widthPct: 30,
    heightPct: 30,
    rotationDeg: 0,
    opacityPct: 100,
  }
}

/** 구글 폰트를 쓰지 않는 시스템 기본 글꼴 식별자(티켓 20260924_2158). `system-ui`는 캔버스
 * `font` 속성이 실제로 해석하는 CSS 값이라 그대로 폰트명으로 쓴다 — 구글 폰트 로드 대상이
 * 아니므로 `loadFontInBrowser`가 이 값이면 아무 것도 하지 않는다. */
export const SYSTEM_DEFAULT_FONT: TextLayerFont = { family: 'system-ui', weight: 400 }

export function isSystemDefaultFont(font: Pick<TextLayerFont, 'family'>): boolean {
  return font.family === SYSTEM_DEFAULT_FONT.family
}

/** 새 텍스트 레이어 기본값(티켓 20260924_2158): 중앙 배치, 시스템 기본 글꼴, 빈 글자(직접 입력). */
export function createTextLayer(): TextLayerConfig {
  return {
    type: 'text',
    id: generateLayerId(),
    content: '',
    font: { ...SYSTEM_DEFAULT_FONT },
    sizePct: 10,
    letterSpacing: 0,
    lineHeight: 1.2,
    align: 'center',
    color: '#111111',
    xPct: 50,
    yPct: 50,
    rotationDeg: 0,
    opacityPct: 100,
  }
}

/**
 * 브라우저용 `FontLoader`(render.ts) 구현(티켓 20260924_2158). 시스템 기본 글꼴은 로드가
 * 필요 없어 즉시 끝낸다. 구글 폰트는 `googleFonts.ts`(20260916_2001)의 `<link>` 삽입·다운로드
 * 대기 함수를 그대로 재사용한다(수정·복사 금지, 티켓 완료 조건). `ensureGoogleFontLoaded`는
 * 굵기 400 스타일시트만 요청하므로, 로드 확인도 그 굵기 기준으로 한다(요청한 시각적 굵기가
 * 400이 아니어도 브라우저가 같은 패밀리 안에서 가장 가까운 굵기로 대체해 그린다).
 * `document.fonts.check`가 아직 로드되지 않았다고 판단하면(네트워크 실패·존재하지 않는
 * 폰트명 등) 에러를 던져 호출부가 실패로 처리하게 한다.
 */
/** `ensureGoogleFontLoaded`가 삽입한 `<link>`의 스타일시트가 파싱될 때까지 기다린다. 그 전에는
 * 일치하는 폰트페이스가 없어 `document.fonts.load`·`check`가 즉시 통과해 버려 대기·실패 감지가
 * 비어 있었다(카리나 실렌더 2026-09-25). 이미 파싱됐으면(`sheet` 존재) 바로 돌아온다. */
async function waitForGoogleFontStylesheet(family: string): Promise<void> {
  const link = document.head.querySelector<HTMLLinkElement>(`link[data-shader-lab-google-font="${family.replace(/"/g, '\\"')}"]`)
  if (!link || link.sheet) return
  await new Promise<void>((resolve, reject) => {
    link.addEventListener('load', () => resolve(), { once: true })
    link.addEventListener('error', () => reject(new Error(`"${family}" 폰트를 불러오지 못했어요.`)), { once: true })
    setTimeout(resolve, 10_000)
  })
}

export const loadFontInBrowser: FontLoader = async (font) => {
  if (isSystemDefaultFont(font)) return
  ensureGoogleFontLoaded(font.family)
  if (typeof document !== 'undefined') await waitForGoogleFontStylesheet(font.family)
  await waitForGoogleFontLoaded(font.family, 400)
  if (typeof document !== 'undefined' && document.fonts && !document.fonts.check(`400 16px "${font.family}"`)) {
    throw new Error(`"${font.family}" 폰트를 불러오지 못했어요.`)
  }
}

/**
 * 오버레이 레이어(이미지·텍스트) 목록에서 id로 지정한 레이어를 한 칸 위/아래로 옮긴다(배열 안
 * 위치를 스왑). id를 찾지 못했거나 배열 경계를 벗어나면(리본 레이어 방향이거나 목록 맨 위/아래)
 * 원본을 그대로 돌려준다(원본 자체를 바꾸지 않는다).
 *
 * 재작업(20260924_2157): 인덱스 대신 id로 대상을 찾는다 — 이전에는 호출부(page.tsx)가
 * 스왑 뒤 선택 인덱스를 별도로 갱신해야 했는데, 스왑 상대가 선택 인덱스와 같은 경우를
 * 놓쳐 선택이 다른 레이어를 가리키는 버그가 있었다(리뷰 재현: A·B·C 중 B를 선택하고 C를
 * 위로 이동하면 선택 인덱스 1에는 이제 C가 들어간다). id 기반으로는 선택 상태
 * (`selectedImageLayerId`)가 배열 위치와 무관해 이 문제 자체가 생기지 않는다
 * (참고: `src/app/admin/shader-lab/ShaderLabLayerSidebar.tsx`).
 *
 * 제네릭화(재작업, 20260924_2158): 이미지 레이어 전용이던 시그니처를 `id`를 가진 어떤 레이어
 * 배열에도 쓸 수 있게 넓혔다 — 오버레이 목록(이미지·텍스트 혼합)에 그대로 쓴다. 함수 이름은
 * 유지한다(호출부·테스트가 이미 이 이름을 쓰고 있고, 동작은 "오버레이 레이어 이동"으로 같다).
 */
export function moveImageLayer<T extends { id: string }>(layers: T[], id: string, direction: 'up' | 'down'): T[] {
  const index = layers.findIndex((l) => l.id === id)
  if (index === -1) return layers
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= layers.length) return layers
  const next = [...layers]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** 오버레이 레이어 목록에서 id로 지정한 레이어를 제거한다(순수 함수, blob URL 정리는 호출부
 * 책임). 제네릭화 사유는 `moveImageLayer` 참고. */
export function removeImageLayer<T extends { id: string }>(layers: T[], id: string): T[] {
  return layers.filter((l) => l.id !== id)
}

/**
 * 삭제한 레이어가 선택돼 있었으면 선택을 해제한다(그 외 삭제는 선택을 그대로 둔다).
 * id 기반 선택이라 삭제되지 않은 레이어의 선택은 배열 위치가 바뀌어도 영향받지 않는다 —
 * 이 함수는 "삭제된 레이어 자신이 선택돼 있던 경우"만 처리하면 된다.
 */
export function deselectIfRemoved(selectedId: string | null, removedId: string): string | null {
  return selectedId === removedId ? null : selectedId
}

/** 저장 파일명(원본 fileName, 503줄): jam-asset_{비율}_{yyyyMMdd-HHmmss}.{ext} */
export function buildExportFileName(ratio: StageRatio, ext: string, date: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `jam-asset_${ratio.replace(':', 'x')}_${stamp}.${ext}`
}
