/**
 * 쉐이더 랩 — 레이어 정의 (티켓 20260912_1951 — 1차 6종, 티켓 20260912_2157 — 2차 1차분:
 * 텍스트 레이어 추가 + 기존 6종 범위 감사)
 *
 * `@basementstudio/shader-lab` 런타임은 25종 이상의 레이어 타입을 지원하지만(패키지 README
 * 참고), 1차는 속성 패널 UI를 새로 이식해야 하는 작업량을 고려해 다음 6종만 노출했다:
 * 미디어(이미지), 디스플레이스먼트맵, 블룸, 디더링, ASCII, 하프톤. 이번 2차(20260912_2157)
 * 1차분은 텍스트(Text) 레이어를 추가하고, 기존 6종의 파라미터 범위를 원본
 * `src/lib/editor/config/layer-registry.ts`(비공개 앱 소스)와 대조해 어긋난 부분을 바로잡았다
 * — 감사 결과는 아래 "20260912_2157 범위 감사 결과" 절 참고. 나머지 4종(플루이드·픽셀
 * 트레일·매그니파이 렌즈·메시 그라디언트)과 이펙트 18종은 다음 세션 범위다.
 *
 * 각 필드 목록은 원본 저장소(Apache 2.0) 에디터 앱의 `layer-registry.ts`가 정의한 파라미터
 * 세트를 참고해 다시 정리했다. 하프톤은 원본이 CMYK 인쇄 각도·프리셋까지 세분화하지만, 1차는
 * 핵심 파라미터(색상 모드·모양·간격·대비 등)만 노출하도록 축소했다 — 완료 기록의 "주요
 * 의사결정" 참고(20260912_2157 감사 결과, 하프톤이 노출하는 파라미터들의 min/max/step/기본값
 * 자체는 전부 원본과 일치함을 재확인했다 — 노출 안 하는 파라미터가 있을 뿐, 노출하는 것들의
 * 범위가 틀린 건 아니었다).
 *
 * ## 20260912_2157 범위 감사 결과 (`gh api repos/basementstudio/shader-lab/contents/
 * src/lib/editor/config/layer-registry.ts`로 재조회해 대조)
 *
 * - **이미지·디스플레이스먼트맵·블룸**: 노출 중인 모든 필드의 min/max/step/기본값이 원본과
 *   전부 일치함을 확인했다(수정 없음).
 * - **하프톤**: 노출 중인 필드(colorMode 3종 축소·shape·spacing·dotSize·angle·contrast·
 *   softness·invertLuma·ink·duotoneLight·duotoneDark)의 범위는 전부 원본과 일치했다.
 *   원본에만 있는 CMYK/커스텀 팔레트·잉크 프리셋·중첩 블룸 등은 1차에서 의도적으로 제외한
 *   범위이므로 이번에 추가하지 않았다(기존 결정 유지).
 * - **디더링**: 노출 중인 필드는 전부 원본과 일치했지만, 원본에 있는 `dotScale`(런타임
 *   `dithering-pass.js`가 실제로 읽는 파라미터, min 0.1/max 1/step 0.1/기본값 1)이 1차에서
 *   누락돼 있었다 — **추가함.** (원본에도 있는 `preset` select는 "Custom"/"Game Boy" 두
 *   값을 고르면 내부적으로 algorithm·colorMode·pixelSize 등 여러 필드를 한 번에 프리셋으로
 *   덮어쓰는 **에디터 UI 전용 편의 기능**이고, 런타임 `dithering-pass.js`의 `updateParams()`가
 *   직접 읽는 파라미터가 아니다 — 프리셋 적용 로직 자체를 새로 만들어야 해 이번 범위 밖으로
 *   남긴다.)
 * - **ASCII**: 노출 중인 필드(columns·fontFamily·charset 9종·boldness·colorMode·monoColor·
 *   invert)의 범위는 원본과 일치했지만, 원본에 있고 런타임(`ascii-pass.js`)도 실제로 읽는
 *   파라미터 다수가 1차에서 통째로 누락돼 있었다 — **추가함**: `fontWeight`(100~900,
 *   기본 400 — ASCII 글리프 자체의 굵기, 아래 `boldness`와는 다른 파라미터), `bgOpacity`
 *   (0~1, 기본 0, colorMode가 원본색상일 때만), `signalBlackPoint`/`signalWhitePoint`
 *   (0~1, 기본 0/1), `rowWarp`(0~1, 기본 0), `breakGrid`(select, 기본 off) +
 *   `breakThreshold`(0.001~0.5, 기본 0.06, breakGrid가 off가 아닐 때만), `charset`에
 *   "커스텀" 옵션 + `customChars`(텍스트, 기본 " .:-=+*#%@", 최대 128자, charset이 커스텀일
 *   때만). 기존 `boldness` 필드와 이름이 겹쳐 보일 수 있어 라벨을 각각 "폰트 굵기"(fontWeight)
 *   / "두께 보정"(boldness)으로 구분했다(원본 라벨은 각각 Weight/Boldness).
 *
 * 출처: https://github.com/basementstudio/shader-lab (Apache License 2.0)
 * 이식 시점: 2026-09-12, npm `@basementstudio/shader-lab@3.0.2`
 */
import type { ShaderLabLayerType, ShaderLabLayerKind, ShaderLabParameterValue } from '@basementstudio/shader-lab'
import { buildDefaultParams, type ShaderLabFieldDefinitions } from './paramFields'
import { SHADER_LAB_DEFAULT_TEXT_FONT, SHADER_LAB_TEXT_FONT_OPTIONS } from './textFontOptions'

/** 지금까지 노출한 레이어 타입. 다음 세션에 여기에 항목을 추가하면 UI가 늘어난다. */
export const SHADER_LAB_LAYER_TYPES = [
  'image',
  'displacement-map',
  'bloom',
  'dithering',
  'ascii',
  'halftone',
  'text',
] as const satisfies readonly ShaderLabLayerType[]

export type SupportedShaderLabLayerType = (typeof SHADER_LAB_LAYER_TYPES)[number]

interface LayerTypeDefinition {
  kind: ShaderLabLayerKind
  label: string
  defaultName: string
  description: string
  fields: ShaderLabFieldDefinitions
}

const imageFields: ShaderLabFieldDefinitions = [
  {
    key: 'fitMode',
    label: '채우기',
    type: 'select',
    defaultValue: 'cover',
    options: [
      { label: '캔버스 채우기', value: 'cover' },
      { label: '비율 유지', value: 'contain' },
    ],
  },
  { key: 'scale', label: '확대/축소', type: 'number', defaultValue: 1, min: 0.25, max: 4, step: 0.01 },
  { key: 'offset', label: '위치 오프셋', type: 'vec2', defaultValue: [0, 0], min: -1, max: 1, step: 0.01 },
]

const displacementMapFields: ShaderLabFieldDefinitions = [
  { key: 'strength', label: '강도', type: 'number', defaultValue: 20, min: 0, max: 200, step: 1, unit: 'px' },
  {
    key: 'direction',
    label: '방향',
    type: 'select',
    defaultValue: 'both',
    options: [
      { label: '전체', value: 'both' },
      { label: '가로', value: 'horizontal' },
      { label: '세로', value: 'vertical' },
    ],
  },
  {
    key: 'channel',
    label: '기준 채널',
    type: 'select',
    defaultValue: 'luminance',
    options: [
      { label: '밝기', value: 'luminance' },
      { label: 'Red', value: 'red' },
      { label: 'Green', value: 'green' },
      { label: 'Blue', value: 'blue' },
    ],
  },
  { key: 'midpoint', label: '중간점', type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
]

const bloomFields: ShaderLabFieldDefinitions = [
  { key: 'bloomIntensity', label: '강도', type: 'number', defaultValue: 1.25, min: 0, max: 2, step: 0.01, group: '블룸' },
  { key: 'bloomThreshold', label: '임계값', type: 'number', defaultValue: 0.6, min: 0, max: 1, step: 0.01, group: '블룸' },
  { key: 'bloomRadius', label: '반경', type: 'number', defaultValue: 6, min: 0, max: 24, step: 0.25, group: '블룸' },
  { key: 'bloomSoftness', label: '부드러움', type: 'number', defaultValue: 0.35, min: 0, max: 1, step: 0.01, group: '블룸' },
  { key: 'bloomKnee', label: '니(knee)', type: 'number', defaultValue: 0.2, min: 0, max: 0.5, step: 0.01, group: '하이라이트' },
  { key: 'highlightDrive', label: '하이라이트 강조', type: 'number', defaultValue: 1.5, min: 1, max: 4, step: 0.01, group: '하이라이트' },
]

const ditheringFields: ShaderLabFieldDefinitions = [
  {
    key: 'algorithm',
    label: '알고리즘',
    type: 'select',
    defaultValue: 'bayer-4x4',
    group: '패턴',
    options: [
      { label: 'Bayer 2x2', value: 'bayer-2x2' },
      { label: 'Bayer 4x4', value: 'bayer-4x4' },
      { label: 'Bayer 8x8', value: 'bayer-8x8' },
      { label: '노이즈', value: 'noise' },
    ],
  },
  { key: 'pixelSize', label: '픽셀 크기', type: 'number', defaultValue: 1, min: 1, max: 24, step: 1, group: '패턴' },
  { key: 'spread', label: '강도', type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.01, group: '패턴' },
  {
    key: 'colorMode',
    label: '색상 모드',
    type: 'select',
    defaultValue: 'source',
    group: '색상',
    options: [
      { label: '단색', value: 'monochrome' },
      { label: '원본 색상', value: 'source' },
      { label: '듀오톤', value: 'duo-tone' },
    ],
  },
  {
    key: 'monoColor',
    label: '색상',
    type: 'color',
    defaultValue: '#f5f5f0',
    group: '색상',
    visibleWhen: { key: 'colorMode', equals: 'monochrome' },
  },
  {
    key: 'shadowColor',
    label: '어두운 영역',
    type: 'color',
    defaultValue: '#101010',
    group: '색상',
    visibleWhen: { key: 'colorMode', equals: 'duo-tone' },
  },
  {
    key: 'highlightColor',
    label: '밝은 영역',
    type: 'color',
    defaultValue: '#f5f2e8',
    group: '색상',
    visibleWhen: { key: 'colorMode', equals: 'duo-tone' },
  },
  { key: 'levels', label: '색상 단계', type: 'number', defaultValue: 4, min: 2, max: 16, step: 1, group: '색상' },
  {
    key: 'dotScale',
    label: '도트 스케일',
    type: 'number',
    defaultValue: 1,
    min: 0.1,
    max: 1,
    step: 0.1,
    group: '효과',
    description: '20260912_2157 감사에서 발견한 누락 필드 — 원본·런타임 모두 지원해요.',
  },
  {
    key: 'animateDither',
    label: '디더 애니메이션',
    type: 'boolean',
    defaultValue: false,
    group: '효과',
    description: '재생 중일 때만 패턴이 움직여요.',
  },
  {
    key: 'ditherSpeed',
    label: '애니메이션 속도',
    type: 'number',
    defaultValue: 1,
    min: 0,
    max: 3,
    step: 0.5,
    group: '효과',
    visibleWhen: { key: 'animateDither', equals: true },
  },
  { key: 'chromaticSplit', label: '색수차', type: 'boolean', defaultValue: false, group: '효과' },
]

const asciiFields: ShaderLabFieldDefinitions = [
  { key: 'columns', label: '가로 글자 수', type: 'number', defaultValue: 80, min: 4, max: 400, step: 1, group: '격자' },
  {
    key: 'breakGrid',
    label: '격자 병합',
    type: 'select',
    defaultValue: 'off',
    group: '격자',
    description: '평평한 영역의 셀을 더 큰 단위로 합쳐요.',
    options: [
      { label: '끔', value: 'off' },
      { label: '2배', value: '2x' },
      { label: '4배', value: '4x' },
      { label: '8배', value: '8x' },
      { label: '16배', value: '16x' },
    ],
  },
  {
    key: 'breakThreshold',
    label: '병합 임계값',
    type: 'number',
    defaultValue: 0.06,
    min: 0.001,
    max: 0.5,
    step: 0.001,
    group: '격자',
    description: '값이 작을수록 더 균일한 영역만 합쳐요.',
    visibleWhen: { key: 'breakGrid', notEquals: 'off' },
  },
  {
    key: 'fontFamily',
    label: '폰트',
    type: 'select',
    defaultValue: 'mono',
    group: '글리프',
    description: '고정폭·고딕·세리프 중 항상 쓸 수 있는 3종만 노출해요(나머지는 상용 폰트).',
    options: [
      { label: '고정폭', value: 'mono' },
      { label: '고딕', value: 'sans' },
      { label: '세리프', value: 'display-serif' },
    ],
  },
  {
    key: 'fontWeight',
    label: '폰트 굵기',
    type: 'number',
    defaultValue: 400,
    min: 100,
    max: 900,
    step: 1,
    group: '글리프',
    description: '20260912_2157 감사에서 발견한 누락 필드 — 아래 "두께 보정"과는 다른 값이에요.',
  },
  {
    key: 'charset',
    label: '문자 세트',
    type: 'select',
    defaultValue: 'light',
    group: '글리프',
    options: [
      { label: '가볍게', value: 'light' },
      { label: '빽빽하게', value: 'dense' },
      { label: '블록', value: 'blocks' },
      { label: '음영', value: 'shades' },
      { label: '박스', value: 'boxes' },
      { label: '해칭', value: 'hatching' },
      { label: '16진수', value: 'hex' },
      { label: '이진수', value: 'binary' },
      { label: '가타카나', value: 'katakana' },
      { label: '커스텀', value: 'custom' },
    ],
  },
  {
    key: 'customChars',
    label: '커스텀 문자',
    type: 'text',
    defaultValue: ' .:-=+*#%@',
    maxLength: 128,
    group: '글리프',
    description: '어두운 톤부터 밝은 톤 순서로 나열해요.',
    visibleWhen: { key: 'charset', equals: 'custom' },
  },
  {
    key: 'boldness',
    label: '두께 보정',
    type: 'number',
    defaultValue: 0,
    min: -1,
    max: 1,
    step: 0.01,
    group: '글리프',
    description: '음수면 얇게, 양수면 굵게 보정해요.',
  },
  {
    key: 'colorMode',
    label: '색상 모드',
    type: 'select',
    defaultValue: 'monochrome',
    group: '색상',
    options: [
      { label: '원본 색상', value: 'source' },
      { label: '단색', value: 'monochrome' },
    ],
  },
  {
    key: 'monoColor',
    label: '색상',
    type: 'color',
    defaultValue: '#f5f5f0',
    group: '색상',
    visibleWhen: { key: 'colorMode', equals: 'monochrome' },
  },
  {
    key: 'bgOpacity',
    label: '배경 불투명도',
    type: 'number',
    defaultValue: 0,
    min: 0,
    max: 1,
    step: 0.01,
    group: '색상',
    description: '글리프 뒤에 원본 색상을 채워요.',
    visibleWhen: { key: 'colorMode', equals: 'source' },
  },
  { key: 'signalBlackPoint', label: '블랙 포인트', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01, group: '신호' },
  { key: 'signalWhitePoint', label: '화이트 포인트', type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.01, group: '신호' },
  { key: 'invert', label: '반전', type: 'boolean', defaultValue: false, group: '신호' },
  {
    key: 'rowWarp',
    label: '행 흔들림',
    type: 'number',
    defaultValue: 0,
    min: 0,
    max: 1,
    step: 0.01,
    group: '왜곡',
    description: '밝기에 따라 각 행을 가로로 밀어요.',
  },
]

const halftoneFields: ShaderLabFieldDefinitions = [
  {
    key: 'colorMode',
    label: '색상 모드',
    type: 'select',
    defaultValue: 'source',
    options: [
      { label: '원본 색상', value: 'source' },
      { label: '단색', value: 'monochrome' },
      { label: '듀오톤', value: 'duotone' },
    ],
  },
  {
    key: 'shape',
    label: '도트 모양',
    type: 'select',
    defaultValue: 'circle',
    options: [
      { label: '원', value: 'circle' },
      { label: '사각형', value: 'square' },
      { label: '다이아몬드', value: 'diamond' },
      { label: '선', value: 'line' },
    ],
  },
  { key: 'spacing', label: '간격', type: 'number', defaultValue: 5, min: 2, max: 48, step: 1 },
  { key: 'dotSize', label: '도트 크기', type: 'number', defaultValue: 1, min: 0.1, max: 3, step: 0.01 },
  { key: 'angle', label: '각도', type: 'number', defaultValue: 28, min: 0, max: 360, step: 1 },
  { key: 'contrast', label: '대비', type: 'number', defaultValue: 1, min: 0, max: 2, step: 0.01 },
  { key: 'softness', label: '부드러움', type: 'number', defaultValue: 0.25, min: 0, max: 1, step: 0.01 },
  {
    key: 'ink',
    label: '잉크 색상',
    type: 'color',
    defaultValue: '#0d1014',
    visibleWhen: { key: 'colorMode', equals: 'monochrome' },
  },
  {
    key: 'duotoneLight',
    label: '밝은 색상',
    type: 'color',
    defaultValue: '#f5f5f0',
    visibleWhen: { key: 'colorMode', equals: 'duotone' },
  },
  {
    key: 'duotoneDark',
    label: '어두운 색상',
    type: 'color',
    defaultValue: '#1d1d1c',
    visibleWhen: { key: 'colorMode', equals: 'duotone' },
  },
  { key: 'invertLuma', label: '반전', type: 'boolean', defaultValue: false },
]

/**
 * 텍스트 레이어 (티켓 20260912_2157 신규). 파라미터 이름·범위·기본값은 원본
 * `layer-registry.ts`의 `textParams`를 그대로 따랐다(착수 시 `gh api`로 재조회해 확인) —
 * 단 `fontFamily`/`fontWeight`는 JAM! 전용 폰트 매핑 때문에 다르다. 이유는
 * `./textFontOptions.ts` 상단 주석 참고: `fontFamily` 값은 패키지 내부 고정 목록의
 * 식별자여야 하고, 그 식별자가 가리키는 CSS 변수를 우리가 Pretendard Variable로 덮어써야
 * 실제로 그 폰트가 렌더링된다(값 자체는 UI에 노출하지 않고 `SHADER_LAB_TEXT_FONT_OPTIONS`
 * 배열에서 가져온다 — 나중에 폰트를 추가하려면 그 배열에 항목만 추가하면 된다).
 *
 * 실제 렌더링 방식(패키지 `renderer/text-pass.js`의 `updateParams()`)은 Canvas 2D로 텍스트를
 * 그려 텍스처로 올리는 방식이다 — `text`/`anchor`/`offset`/`fontSize`/`fontFamily`/
 * `fontWeight`/`letterSpacing`/`textColor`/`backgroundColor`/`backgroundAlpha` 키를 그대로
 * 읽는다(파라미터 이름 전부 대조 완료).
 */
const textFields: ShaderLabFieldDefinitions = [
  { key: 'text', label: '텍스트', type: 'text', defaultValue: 'basement.studio', maxLength: 32, group: '내용' },
  {
    key: 'anchor',
    label: '기준점',
    type: 'select',
    defaultValue: 'center',
    group: '배치',
    options: [
      { label: '왼쪽 위', value: 'top-left' },
      { label: '위', value: 'top-center' },
      { label: '오른쪽 위', value: 'top-right' },
      { label: '왼쪽', value: 'center-left' },
      { label: '가운데', value: 'center' },
      { label: '오른쪽', value: 'center-right' },
      { label: '왼쪽 아래', value: 'bottom-left' },
      { label: '아래', value: 'bottom-center' },
      { label: '오른쪽 아래', value: 'bottom-right' },
    ],
  },
  { key: 'offset', label: '위치 오프셋', type: 'vec2', defaultValue: [0, 0], min: -1, max: 1, step: 0.01, group: '배치' },
  { key: 'fontSize', label: '글자 크기', type: 'number', defaultValue: 48, min: 48, max: 600, step: 1, group: '글꼴' },
  {
    key: 'fontFamily',
    label: '폰트',
    type: 'select',
    defaultValue: SHADER_LAB_DEFAULT_TEXT_FONT.value,
    group: '글꼴',
    description: '추후 폰트가 추가될 예정이에요(현재는 Pretendard Variable 단일 옵션).',
    options: SHADER_LAB_TEXT_FONT_OPTIONS,
  },
  {
    key: 'fontWeight',
    label: '굵기',
    type: 'number',
    defaultValue: SHADER_LAB_DEFAULT_TEXT_FONT.fontWeightRange.default,
    min: SHADER_LAB_DEFAULT_TEXT_FONT.fontWeightRange.min,
    max: SHADER_LAB_DEFAULT_TEXT_FONT.fontWeightRange.max,
    step: 1,
    group: '글꼴',
    description: '이 폰트 슬롯이 실제로 반영하는 범위로 맞췄어요(자세한 근거는 textFontOptions.ts 참고).',
  },
  { key: 'letterSpacing', label: '자간', type: 'number', defaultValue: -0.05, min: -0.2, max: 0.3, step: 0.01, group: '글꼴' },
  { key: 'textColor', label: '텍스트 색상', type: 'color', defaultValue: '#ffffff', group: '색상' },
  { key: 'backgroundColor', label: '배경 색상', type: 'color', defaultValue: '#000000', group: '색상' },
  { key: 'backgroundAlpha', label: '배경 투명도', type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.01, group: '색상' },
]

export const SHADER_LAB_LAYER_REGISTRY: Record<SupportedShaderLabLayerType, LayerTypeDefinition> = {
  image: {
    kind: 'source',
    label: '이미지',
    defaultName: '이미지',
    description: '업로드한 이미지를 소스로 사용해요.',
    fields: imageFields,
  },
  'displacement-map': {
    kind: 'effect',
    label: '디스플레이스먼트맵',
    defaultName: '디스플레이스먼트맵',
    description: '밝기 값을 따라 픽셀을 밀어내 왜곡해요.',
    fields: displacementMapFields,
  },
  bloom: {
    kind: 'effect',
    label: '블룸',
    defaultName: '블룸',
    description: '밝은 영역에 은은한 빛 번짐을 더해요.',
    fields: bloomFields,
  },
  dithering: {
    kind: 'effect',
    label: '디더링',
    defaultName: '디더링',
    description: '색상 단계를 줄이고 패턴으로 채워요.',
    fields: ditheringFields,
  },
  ascii: {
    kind: 'effect',
    label: 'ASCII',
    defaultName: 'ASCII',
    description: '이미지를 텍스트 글리프로 바꿔요.',
    fields: asciiFields,
  },
  halftone: {
    kind: 'effect',
    label: '하프톤',
    defaultName: '하프톤',
    description: '인쇄 망점 스타일의 도트 패턴으로 바꿔요.',
    fields: halftoneFields,
  },
  text: {
    kind: 'source',
    label: '텍스트',
    defaultName: '텍스트',
    description: '문구를 캔버스에 직접 그려요.',
    fields: textFields,
  },
}

export function getLayerTypeDefinition(type: SupportedShaderLabLayerType): LayerTypeDefinition {
  return SHADER_LAB_LAYER_REGISTRY[type]
}

export function getDefaultParamsForType(type: SupportedShaderLabLayerType): Record<string, ShaderLabParameterValue> {
  return buildDefaultParams(SHADER_LAB_LAYER_REGISTRY[type].fields) as Record<string, ShaderLabParameterValue>
}

export function isSupportedLayerType(type: string): type is SupportedShaderLabLayerType {
  return (SHADER_LAB_LAYER_TYPES as readonly string[]).includes(type)
}
