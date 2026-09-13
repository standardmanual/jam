/**
 * 쉐이더 랩 — 레이어 정의 (티켓 20260912_1951 — 1차 6종, 티켓 20260912_2157 — 2차 1차분:
 * 텍스트 레이어 추가 + 기존 6종 범위 감사, 2차 2차분: 나머지 소스 4종 + 이펙트 18종 신규 구현)
 *
 * `@basementstudio/shader-lab` 런타임(npm `@basementstudio/shader-lab@3.0.2`)은 아래 29종
 * 전부(비디오·카메라·커스텀 셰이더 3종 제외)를 지원한다. 1차는 속성 패널 UI를 새로 이식해야
 * 하는 작업량을 고려해 6종만 노출했고(미디어(이미지)·디스플레이스먼트맵·블룸·디더링·ASCII·
 * 하프톤), 2차 1차분에서 텍스트(Text)를 추가했다. 이번 2차 2차분(20260912_2157)에서 나머지
 * 전부를 추가해 총 29종을 노출한다:
 *
 * - 소스 4종(신규): 플루이드(fluid)·픽셀 트레일(pixel-trail)·매그니파이 렌즈(magnify-lens)·
 *   메시 그라디언트(gradient — 패키지 내부 타입명은 `gradient`이지만 사용자 요구로 라벨은
 *   "메시 그라디언트")
 * - 이펙트 Core 9종(신규): 잉크(ink)·패턴(pattern)·CRT(crt)·파티클 그리드(particle-grid)·
 *   픽셀레이션(pixelation)·복셀(voxel)·포스터라이즈(posterize)·쓰레숄드(threshold)·
 *   플로터(plotter)
 * - 이펙트 Distort 9종(신규): 블롭 트래킹(blob-tracking)·서킷 벤트(circuit-bent)·방향성
 *   블러(directional-blur)·픽셀 소팅(pixel-sorting)·슬라이스(slice)·엣지 디텍트(edge-detect)·
 *   색수차(chromatic-aberration)·프로그레시브 블러(smear — 패키지 내부 타입명은 `smear`,
 *   원본 라벨은 "Progressive Blur")·플루티드 글래스(fluted-glass)
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
 * ## 2차 2차분(신규 22종) 작업 방식
 *
 * 원본 `layer-registry.ts`의 각 `xxxParams` 배열을 그대로 옮기되(키·라벨·범위·기본값·
 * visibleWhen 전부), 실제 설치된 런타임(`node_modules/@basementstudio/shader-lab/dist/src/
 * renderer/*.js`)의 각 `updateParams(params)` 본문을 `grep -o "params\.[a-zA-Z0-9_]*"`로
 * 전수 대조해 원본 UI가 노출하지 않는 값을 넣지 않았는지, 반대로 런타임이 읽는데 원본 UI도
 * 안 보여주는 필드가 있는지 확인했다. 결과:
 * - **제외한 필드**: 메시 그라디언트(`gradient`)의 `preset`(Custom/Forest/Ember/Abyss/Violet)은
 *   `gradient-pass.js`의 `updateParams()`가 전혀 읽지 않는 **에디터 UI 전용 프리셋 버튼**이다
 *   (디더링의 `preset`과 동일한 성격) — 제외했다. 나머지 21종은 원본이 노출하는 필드 전부가
 *   런타임에서도 실제로 읽힘을 확인해 그대로 옮겼다(패턴의 `preset`(Bars/Candles/Shapes),
 *   플루티드 글래스의 `preset`(Architectural/Painterly)은 이름이 같아도 각각의 런타임이
 *   실제로 읽는 값이라 포함했다 — 대조 없이 이름만 보고 넘겨짚지 않았다).
 * - **블롭 트래킹의 `innerEffectParams`**: 원본 자체가 이 필드를 일반 입력 폼에 절대 노출하지
 *   않도록 `visibleWhen: { key: "__blobTrackingInternal", equals: "__never__" }`(항상 거짓)로
 *   막아뒀다 — 원본 앱이 별도의 중첩 이펙트 속성 패널(재귀적으로 다른 이펙트 UI를 그리는
 *   전용 컴포넌트)로 이 값을 채워 넣기 때문이다. 그 중첩 편집 UI 자체는 이번 티켓 범위가
 *   아니라서(`innerEffectType`을 "없음"이 아닌 값으로 바꿔도 하위 이펙트가 자체 기본값으로만
 *   렌더링되고 세부 조정은 불가) 원본과 동일하게 항상 숨김 처리만 하고 넘겼다(런타임 확인 결과
 *   `innerEffectParams`가 비어 있으면 하위 패스에 `updateParams()`를 아예 호출하지 않아
 *   예외 위험도 없다) — `innerEffectType` select 자체(어떤 이펙트를 얹을지 고르는 것)는 정상
 *   노출한다.
 * - **플루이드의 `seed`/`paused`**: 런타임(`fluid-pass.js`)은 읽지만 원본 UI(`layer-registry.
 *   ts`의 `fluidParams`)도 노출하지 않는 파라미터라 우리도 추가하지 않았다(원본과 동일하게
 *   기본값에 맡긴다).
 *
 * 출처: https://github.com/basementstudio/shader-lab (Apache License 2.0)
 * 이식 시점: 2026-09-12, npm `@basementstudio/shader-lab@3.0.2`
 */
import type {
  ShaderLabLayerType,
  ShaderLabLayerKind,
  ShaderLabParameterValue,
  ShaderLabEffectLayerType,
} from '@basementstudio/shader-lab'
import { buildDefaultParams, type ShaderLabFieldDefinitions } from './paramFields'
import { SHADER_LAB_DEFAULT_TEXT_FONT, SHADER_LAB_TEXT_FONT_OPTIONS } from './textFontOptions'

/** 지금까지 노출한 레이어 타입(2차 2차분에서 비디오·카메라·커스텀 셰이더 3종을 제외한
 *  전부인 29종으로 확장했다). */
export const SHADER_LAB_LAYER_TYPES = [
  'image',
  'displacement-map',
  'bloom',
  'dithering',
  'ascii',
  'halftone',
  'text',
  // 2차 2차분(20260912_2157) — 소스 4종
  'fluid',
  'pixel-trail',
  'magnify-lens',
  'gradient',
  // 티켓 20260913_1948 — 리퀴드 메탈(원본 basement.studio에 없는 JAM! 확장, @paper-design/shaders 통합)
  'liquid-metal',
  // 2차 2차분 — 이펙트 Core 9종
  'ink',
  'pattern',
  'crt',
  'particle-grid',
  'pixelation',
  'voxel',
  'posterize',
  'threshold',
  'plotter',
  // 2차 2차분 — 이펙트 Distort 9종
  'blob-tracking',
  'circuit-bent',
  'directional-blur',
  'pixel-sorting',
  'slice',
  'edge-detect',
  'chromatic-aberration',
  'smear',
  'fluted-glass',
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

// ============================================================================
// 2차 2차분(20260912_2157) — 소스 4종
// ============================================================================

const fluidFields: ShaderLabFieldDefinitions = [
  { key: 'simRes', label: '시뮬레이션 해상도', type: 'number', defaultValue: 192, min: 32, max: 512, step: 32 },
  { key: 'dyeRes', label: '염료 해상도', type: 'number', defaultValue: 1024, min: 128, max: 2048, step: 64 },
  { key: 'iterations', label: '반복 횟수', type: 'number', defaultValue: 20, min: 1, max: 32, step: 1 },
  { key: 'densityDissipation', label: '밀도 감쇠', type: 'number', defaultValue: 4, min: 0, max: 8, step: 0.01 },
  { key: 'velocityDissipation', label: '속도 감쇠', type: 'number', defaultValue: 0.2, min: 0, max: 4, step: 0.01 },
  { key: 'pressureDissipation', label: '압력 감쇠', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01 },
  { key: 'curlStrength', label: '소용돌이', type: 'number', defaultValue: 30, min: 0, max: 80, step: 1 },
  { key: 'radius', label: '반경', type: 'number', defaultValue: 1, min: 0.05, max: 2, step: 0.01 },
  { key: 'splatForce', label: '터치 힘', type: 'number', defaultValue: 6000, min: 500, max: 15000, step: 100 },
  { key: 'autoSplats', label: '자동 스플랫', type: 'boolean', defaultValue: true },
  { key: 'brightness', label: '밝기', type: 'number', defaultValue: 1.6, min: 0.1, max: 4, step: 0.01 },
  {
    key: 'colorMode',
    label: '색상 모드',
    type: 'select',
    defaultValue: 'monochrome',
    options: [
      { label: '단색', value: 'monochrome' },
      { label: '듀오톤', value: 'duotone' },
      { label: '원본 색상', value: 'source' },
    ],
  },
  { key: 'monoDark', label: '단색 - 어두움', type: 'color', defaultValue: '#000000', visibleWhen: { key: 'colorMode', equals: 'monochrome' } },
  { key: 'monoLight', label: '단색 - 밝음', type: 'color', defaultValue: '#ffffff', visibleWhen: { key: 'colorMode', equals: 'monochrome' } },
  { key: 'duotoneDark', label: '듀오톤 - 어두운색', type: 'color', defaultValue: '#101010', visibleWhen: { key: 'colorMode', equals: 'duotone' } },
  { key: 'duotoneLight', label: '듀오톤 - 밝은색', type: 'color', defaultValue: '#f3f3ef', visibleWhen: { key: 'colorMode', equals: 'duotone' } },
]

const pixelTrailFields: ShaderLabFieldDefinitions = [
  { key: 'cellSize', label: '셀 크기', type: 'number', defaultValue: 24, min: 4, max: 128, step: 1, unit: 'px' },
  { key: 'radius', label: '반경', type: 'number', defaultValue: 0.04, min: 0.005, max: 0.3, step: 0.005 },
  { key: 'decay', label: '감쇠', type: 'number', defaultValue: 0.9, min: 0.5, max: 0.999, step: 0.001 },
  { key: 'displaceAmount', label: '변위량', type: 'number', defaultValue: 0.02, min: 0, max: 0.2, step: 0.001 },
  { key: 'intensity', label: '강도', type: 'number', defaultValue: 1, min: 0, max: 2, step: 0.05 },
]

const magnifyLensFields: ShaderLabFieldDefinitions = [
  { key: 'radius', label: '반경', type: 'number', defaultValue: 0.18, min: 0.02, max: 0.5, step: 0.005 },
  { key: 'softness', label: '부드러움', type: 'number', defaultValue: 0.4, min: 0, max: 1, step: 0.01 },
  { key: 'zoom', label: '확대 배율', type: 'number', defaultValue: 1.8, min: 1, max: 4, step: 0.05 },
  { key: 'chromaStrength', label: '색수차 강도', type: 'number', defaultValue: 0.012, min: 0, max: 0.05, step: 0.001 },
  { key: 'followLag', label: '추적 지연', type: 'number', defaultValue: 0.2, min: 0, max: 0.95, step: 0.01 },
]

/**
 * 메시 그라디언트(패키지 내부 타입명 `gradient`). 원본 `preset`(Custom/Forest/Ember/Abyss/
 * Violet)은 런타임 `gradient-pass.js`의 `updateParams()`가 전혀 읽지 않는 에디터 UI 전용
 * 프리셋 버튼이라 제외했다(위 파일 상단 주석 "2차 2차분 작업 방식" 참고). 나머지 필드는
 * 전부 런타임이 실제로 읽는 것을 확인했다.
 */
const gradientFields: ShaderLabFieldDefinitions = [
  { key: 'activePoints', label: '포인트 수', type: 'number', defaultValue: 3, min: 2, max: 5, step: 1, group: '포인트' },
  { key: 'point1Color', label: '포인트 1 색상', type: 'color', defaultValue: '#0E0C0C', group: '포인트' },
  { key: 'point1Position', label: '포인트 1 위치', type: 'vec2', defaultValue: [-0.82, -0.62], min: -1.5, max: 1.5, step: 0.01, group: '포인트' },
  { key: 'point1Weight', label: '포인트 1 가중치', type: 'number', defaultValue: 0.42, min: 0, max: 3, step: 0.01, group: '포인트' },
  { key: 'point2Color', label: '포인트 2 색상', type: 'color', defaultValue: '#C1FF00', group: '포인트' },
  { key: 'point2Position', label: '포인트 2 위치', type: 'vec2', defaultValue: [0.22, 0.72], min: -1.5, max: 1.5, step: 0.01, group: '포인트' },
  { key: 'point2Weight', label: '포인트 2 가중치', type: 'number', defaultValue: 1.55, min: 0, max: 3, step: 0.01, group: '포인트' },
  {
    key: 'point3Color',
    label: '포인트 3 색상',
    type: 'color',
    defaultValue: '#B2DAD5',
    group: '포인트',
    visibleWhen: { key: 'activePoints', gte: 3 },
  },
  {
    key: 'point3Position',
    label: '포인트 3 위치',
    type: 'vec2',
    defaultValue: [0.88, -0.26],
    min: -1.5,
    max: 1.5,
    step: 0.01,
    group: '포인트',
    visibleWhen: { key: 'activePoints', gte: 3 },
  },
  {
    key: 'point3Weight',
    label: '포인트 3 가중치',
    type: 'number',
    defaultValue: 0.64,
    min: 0,
    max: 3,
    step: 0.01,
    group: '포인트',
    visibleWhen: { key: 'activePoints', gte: 3 },
  },
  {
    key: 'point4Color',
    label: '포인트 4 색상',
    type: 'color',
    defaultValue: '#3B4148',
    group: '포인트',
    visibleWhen: { key: 'activePoints', gte: 4 },
  },
  {
    key: 'point4Position',
    label: '포인트 4 위치',
    type: 'vec2',
    defaultValue: [-0.34, 0.52],
    min: -1.5,
    max: 1.5,
    step: 0.01,
    group: '포인트',
    visibleWhen: { key: 'activePoints', gte: 4 },
  },
  {
    key: 'point4Weight',
    label: '포인트 4 가중치',
    type: 'number',
    defaultValue: 0.82,
    min: 0,
    max: 3,
    step: 0.01,
    group: '포인트',
    visibleWhen: { key: 'activePoints', gte: 4 },
  },
  {
    key: 'point5Color',
    label: '포인트 5 색상',
    type: 'color',
    defaultValue: '#F3E7D0',
    group: '포인트',
    visibleWhen: { key: 'activePoints', gte: 5 },
  },
  {
    key: 'point5Position',
    label: '포인트 5 위치',
    type: 'vec2',
    defaultValue: [0.58, -0.76],
    min: -1.5,
    max: 1.5,
    step: 0.01,
    group: '포인트',
    visibleWhen: { key: 'activePoints', gte: 5 },
  },
  {
    key: 'point5Weight',
    label: '포인트 5 가중치',
    type: 'number',
    defaultValue: 0.48,
    min: 0,
    max: 3,
    step: 0.01,
    group: '포인트',
    visibleWhen: { key: 'activePoints', gte: 5 },
  },
  {
    key: 'noiseType',
    label: '노이즈 종류',
    type: 'select',
    defaultValue: 'ridge',
    group: '왜곡',
    options: [
      { label: '심플렉스', value: 'simplex' },
      { label: '펄린', value: 'perlin' },
      { label: '값', value: 'value' },
      { label: '보로노이', value: 'voronoi' },
      { label: '릿지', value: 'ridge' },
      { label: '터뷸런스', value: 'turbulence' },
    ],
  },
  { key: 'noiseSeed', label: '시드', type: 'number', defaultValue: 70.3, min: 0, max: 100, step: 0.1, group: '왜곡' },
  { key: 'warpAmount', label: '왜곡량', type: 'number', defaultValue: 0.18, min: 0, max: 1, step: 0.01, group: '왜곡' },
  { key: 'warpScale', label: '왜곡 스케일', type: 'number', defaultValue: 2.35, min: 0.1, max: 6, step: 0.01, group: '왜곡' },
  { key: 'warpIterations', label: '왜곡 반복', type: 'number', defaultValue: 1, min: 1, max: 5, step: 1, group: '왜곡' },
  { key: 'warpDecay', label: '왜곡 감쇠', type: 'number', defaultValue: 1, min: 0.1, max: 3, step: 0.01, group: '왜곡' },
  { key: 'warpBias', label: '왜곡 편향', type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.01, group: '왜곡' },
  { key: 'vortexAmount', label: '소용돌이량', type: 'number', defaultValue: 0.69, min: -1, max: 1, step: 0.01, group: '왜곡' },
  { key: 'falloff', label: '감쇠 반경', type: 'number', defaultValue: 2.05, min: 0.5, max: 4, step: 0.01, group: '왜곡' },
  {
    key: 'tonemapMode',
    label: '톤맵',
    type: 'select',
    defaultValue: 'cinematic',
    group: '마무리',
    options: [
      { label: '없음', value: 'none' },
      { label: 'ACES', value: 'aces' },
      { label: '라인하르트', value: 'reinhard' },
      { label: '토토스', value: 'totos' },
      { label: '시네마틱', value: 'cinematic' },
    ],
  },
  { key: 'glowStrength', label: '글로우 강도', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01, group: '마무리' },
  { key: 'glowThreshold', label: '글로우 임계값', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01, group: '마무리' },
  { key: 'grainAmount', label: '그레인', type: 'number', defaultValue: 0.08, min: 0, max: 1, step: 0.01, group: '마무리' },
  { key: 'vignetteStrength', label: '비네트 강도', type: 'number', defaultValue: 0.12, min: 0, max: 1, step: 0.01, group: '마무리' },
  { key: 'vignetteRadius', label: '비네트 반경', type: 'number', defaultValue: 1.5, min: 0, max: 1.5, step: 0.01, group: '마무리' },
  { key: 'vignetteSoftness', label: '비네트 부드러움', type: 'number', defaultValue: 1, min: 0.01, max: 1, step: 0.01, group: '마무리' },
]

// ============================================================================
// 티켓 20260913_1948 — 리퀴드 메탈 (원본 basement.studio에 없는 JAM! 확장)
// ============================================================================

/**
 * `@paper-design/shaders`(Apache 2.0, https://shaders.paper.design)의 "Liquid Metal" GLSL
 * 셰이더를 통합했다. 이 레이어는 원본 basement.studio 저장소에는 존재하지 않는다 — 사용자
 * 요청으로 JAM!이 자체 추가한 소스 타입이다. 실제 렌더링은 `renderer/liquid-metal-pass.js`
 * (patch-package로 신규 추가, `patches/@basementstudio+shader-lab+3.0.2.patch` 참고)가
 * `@paper-design/shaders`의 `ShaderMount`를 숨겨진 DOM에 마운트해 그 WebGL 캔버스를
 * `THREE.CanvasTexture`로 이 WebGPU 파이프라인에 공급하는 방식이다.
 *
 * 원본 `LiquidMetalParams`는 로고 이미지를 업로드해 마스크로 쓰는 기능(`image`,
 * `toProcessedLiquidMetal()`)이 핵심이지만, 그 전처리가 무거운 비동기 canvas 로직이라 이번
 * 범위에서는 제외했다 — `shape`(도형 프리셋) 기반으로만 동작한다. 라이브러리 내장
 * "Backdrop" 프리셋(`shape: "none"`)이 이미 이미지 없이 전체 화면을 채우는 표준 사용법이라
 * 이 범위로도 정상적인 시각 효과를 낸다. 오브젝트 배치(fit/scale/rotation/offset 등)는
 * "Backdrop" 프리셋 고정값을 그대로 쓰고 UI에는 노출하지 않는다(범위 최소화).
 */
const liquidMetalFields: ShaderLabFieldDefinitions = [
  {
    key: 'shape',
    label: '모양',
    type: 'select',
    defaultValue: 'none',
    group: '모양',
    description: '전체 화면을 채우려면 "없음"을 선택하세요.',
    options: [
      { label: '없음(전체 화면)', value: 'none' },
      { label: '원', value: 'circle' },
      { label: '데이지', value: 'daisy' },
      { label: '다이아몬드', value: 'diamond' },
      { label: '메타볼', value: 'metaballs' },
    ],
  },
  { key: 'colorBack', label: '배경 색상', type: 'color', defaultValue: '#AAAAAC', group: '색상' },
  { key: 'colorTint', label: '틴트 색상', type: 'color', defaultValue: '#ffffff', group: '색상' },
  { key: 'repetition', label: '줄무늬 밀도', type: 'number', defaultValue: 1.5, min: 1, max: 10, step: 0.1, group: '패턴' },
  { key: 'softness', label: '경계 부드러움', type: 'number', defaultValue: 0.05, min: 0, max: 1, step: 0.01, group: '패턴' },
  { key: 'distortion', label: '왜곡', type: 'number', defaultValue: 0.1, min: 0, max: 1, step: 0.01, group: '패턴' },
  { key: 'contour', label: '윤곽 강도', type: 'number', defaultValue: 0.4, min: 0, max: 1, step: 0.01, group: '패턴' },
  { key: 'angle', label: '방향', type: 'number', defaultValue: 90, min: 0, max: 360, step: 1, group: '패턴' },
  { key: 'shiftRed', label: '빨강 채널 분산', type: 'number', defaultValue: 0.3, min: -1, max: 1, step: 0.01, group: '색수차' },
  { key: 'shiftBlue', label: '파랑 채널 분산', type: 'number', defaultValue: 0.3, min: -1, max: 1, step: 0.01, group: '색수차' },
]

// ============================================================================
// 2차 2차분(20260912_2157) — 이펙트 Core 9종
// ============================================================================

const inkFields: ShaderLabFieldDefinitions = [
  { key: 'blurPasses', label: '번짐 패스', type: 'number', defaultValue: 13, min: 1, max: 20, step: 1, group: '잉크 번짐' },
  { key: 'crispPasses', label: '선명 패스', type: 'number', defaultValue: 3, min: 1, max: 6, step: 1, group: '잉크 번짐' },
  { key: 'crispBlend', label: '디테일 블렌드', type: 'number', defaultValue: 0.81, min: 0, max: 1, step: 0.01, group: '잉크 번짐' },
  { key: 'blurStrength', label: '번짐 강도', type: 'number', defaultValue: 0.044, min: 0.001, max: 0.08, step: 0.001, group: '잉크 번짐' },
  { key: 'blurDirection', label: '흐름 방향', type: 'number', defaultValue: 90, min: -180, max: 180, step: 1, group: '잉크 번짐' },
  { key: 'dripLength', label: '흘러내림 길이', type: 'number', defaultValue: 1, min: 1, max: 10, step: 0.1, group: '잉크 번짐' },
  { key: 'dripWeight', label: '흘러내림 두께', type: 'number', defaultValue: 0.4, min: 0.2, max: 2, step: 0.1, group: '잉크 번짐' },
  { key: 'fluidNoise', label: '유체 노이즈', type: 'number', defaultValue: 0.02, min: 0, max: 2, step: 0.01, group: '잉크 번짐' },
  { key: 'noiseScale', label: '노이즈 스케일', type: 'number', defaultValue: 1.2, min: 0.5, max: 8, step: 0.1, group: '잉크 번짐' },
  { key: 'smokeTurbulence', label: '연기 난류', type: 'number', defaultValue: 0, min: 0, max: 1.5, step: 0.01, group: '잉크 번짐' },
  { key: 'blurSpread', label: '번짐 확산', type: 'number', defaultValue: 1.6, min: 0.5, max: 4, step: 0.1, group: '잉크 번짐' },
  {
    key: 'colorMode',
    label: '색상 모드',
    type: 'select',
    defaultValue: 'gradient',
    group: '색상',
    options: [
      { label: '그라디언트', value: 'gradient' },
      { label: '원본 색상', value: 'source' },
    ],
  },
  { key: 'coreColor', label: '중심 색상', type: 'color', defaultValue: '#fffde8', group: '글로우 색상', visibleWhen: { key: 'colorMode', equals: 'gradient' } },
  { key: 'midColor', label: '중간 색상', type: 'color', defaultValue: '#FFA700', group: '글로우 색상', visibleWhen: { key: 'colorMode', equals: 'gradient' } },
  { key: 'edgeColor', label: '가장자리 색상', type: 'color', defaultValue: '#7192F1', group: '글로우 색상', visibleWhen: { key: 'colorMode', equals: 'gradient' } },
  { key: 'backgroundColor', label: '배경', type: 'color', defaultValue: '#000000', group: '색상' },
  { key: 'grainEnabled', label: '그레인 사용', type: 'boolean', defaultValue: false, group: '그레인' },
  { key: 'grainIntensity', label: '그레인 강도', type: 'number', defaultValue: 0.3, min: 0, max: 0.3, step: 0.005, group: '그레인' },
  { key: 'grainScale', label: '그레인 스케일', type: 'number', defaultValue: 1.5, min: 0.5, max: 5, step: 0.1, group: '그레인' },
  { key: 'bloomEnabled', label: '블룸 사용', type: 'boolean', defaultValue: true, group: '블룸' },
  { key: 'bloomIntensity', label: '강도', type: 'number', defaultValue: 2, min: 0, max: 2, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomThreshold', label: '임계값', type: 'number', defaultValue: 0.97, min: 0, max: 1, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomRadius', label: '반경', type: 'number', defaultValue: 0, min: 0, max: 24, step: 0.25, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomSoftness', label: '부드러움', type: 'number', defaultValue: 0.96, min: 0, max: 1, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
]

const patternFields: ShaderLabFieldDefinitions = [
  { key: 'cellSize', label: '셀 크기', type: 'number', defaultValue: 12, min: 4, max: 48, step: 1 },
  {
    key: 'preset',
    label: '프리셋',
    type: 'select',
    defaultValue: 'bars',
    options: [
      { label: '바', value: 'bars' },
      { label: '캔들', value: 'candles' },
      { label: '도형', value: 'shapes' },
    ],
  },
  {
    key: 'colorMode',
    label: '색상 모드',
    type: 'select',
    defaultValue: 'source',
    options: [
      { label: '원본 색상', value: 'source' },
      { label: '양자화', value: 'quantized' },
      { label: '단색', value: 'monochrome' },
      { label: '커스텀', value: 'custom' },
    ],
  },
  { key: 'monoColor', label: '틴트', type: 'color', defaultValue: '#f5f5f0', visibleWhen: { key: 'colorMode', equals: 'monochrome' } },
  { key: 'bgOpacity', label: '배경 불투명도', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01, visibleWhen: { key: 'colorMode', equals: 'source' } },
  { key: 'invert', label: '반전', type: 'boolean', defaultValue: false },
  {
    key: 'customColorCount',
    label: '색상 개수',
    type: 'number',
    defaultValue: 4,
    min: 2,
    max: 4,
    step: 1,
    description: '루미넌스 밴드에 균등하게 팔레트를 배분해요.',
    visibleWhen: { key: 'colorMode', equals: 'custom' },
  },
  {
    key: 'customLuminanceBias',
    label: '루미넌스 편향',
    type: 'number',
    defaultValue: 0,
    min: -1,
    max: 1,
    step: 0.01,
    description: '팔레트 매핑을 어둠 또는 밝음 쪽으로 치우치게 해요.',
    visibleWhen: { key: 'colorMode', equals: 'custom' },
  },
  { key: 'customBgColor', label: '배경', type: 'color', defaultValue: '#F5F5F0', visibleWhen: { key: 'colorMode', equals: 'custom' } },
  { key: 'customColor1', label: '그림자', type: 'color', defaultValue: '#0d1014', visibleWhen: { key: 'colorMode', equals: 'custom' } },
  { key: 'customColor2', label: '중간톤/하이라이트', type: 'color', defaultValue: '#4d5057', visibleWhen: { key: 'colorMode', equals: 'custom' } },
  // 원본 그대로: customColor3/4는 colorMode가 아니라 customColorCount 값만으로 표시 여부가
  // 갈린다(원본에도 colorMode==='custom' 조건이 함께 걸려 있지 않다 — 있는 그대로 옮겼다).
  { key: 'customColor3', label: '밝은 중간톤', type: 'color', defaultValue: '#969aa2', visibleWhen: { key: 'customColorCount', gte: 3 } },
  { key: 'customColor4', label: '하이라이트', type: 'color', defaultValue: '#e1e2de', visibleWhen: { key: 'customColorCount', gte: 4 } },
  { key: 'bloomEnabled', label: '블룸 사용', type: 'boolean', defaultValue: false, group: '블룸' },
  { key: 'bloomIntensity', label: '강도', type: 'number', defaultValue: 1.25, min: 0, max: 2, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomThreshold', label: '임계값', type: 'number', defaultValue: 0.6, min: 0, max: 1, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomRadius', label: '반경', type: 'number', defaultValue: 6, min: 0, max: 24, step: 0.25, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomSoftness', label: '부드러움', type: 'number', defaultValue: 0.35, min: 0, max: 1, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
]

const crtFields: ShaderLabFieldDefinitions = [
  {
    key: 'crtMode',
    label: '모드',
    type: 'select',
    defaultValue: 'slot-mask',
    options: [
      { label: '슬롯마스크 모니터', value: 'slot-mask' },
      { label: '애퍼처그릴 모니터', value: 'aperture-grille' },
      { label: '컴포지트 TV', value: 'composite-tv' },
    ],
  },
  { key: 'cellSize', label: '마스크 스케일', type: 'number', defaultValue: 3, min: 3, max: 32, step: 1 },
  { key: 'scanlineIntensity', label: '스캔라인 강도', type: 'number', defaultValue: 0.17, min: 0, max: 1, step: 0.01 },
  { key: 'maskIntensity', label: '마스크 강도', type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.01 },
  { key: 'barrelDistortion', label: '배럴 왜곡', type: 'number', defaultValue: 0.15, min: 0, max: 0.3, step: 0.001, group: '왜곡' },
  { key: 'chromaticAberration', label: '컨버전스', type: 'number', defaultValue: 2, min: 0, max: 2, step: 0.01, group: '왜곡' },
  { key: 'beamFocus', label: '빔 포커스', type: 'number', defaultValue: 0.58, min: 0, max: 1, step: 0.01, group: '인광체' },
  { key: 'brightness', label: '밝기', type: 'number', defaultValue: 1.2, min: 0.5, max: 100, step: 0.01, group: '인광체' },
  { key: 'highlightDrive', label: '하이라이트 드라이브', type: 'number', defaultValue: 1, min: 1, max: 100, step: 0.01, group: '인광체' },
  { key: 'highlightThreshold', label: '하이라이트 임계값', type: 'number', defaultValue: 0.62, min: 0, max: 1, step: 0.01, group: '인광체' },
  { key: 'shoulder', label: '숄더', type: 'number', defaultValue: 0.25, min: 0, max: 4, step: 0.01, group: '인광체' },
  { key: 'chromaRetention', label: '색 보존', type: 'number', defaultValue: 1.15, min: 0, max: 2, step: 0.01, group: '인광체' },
  { key: 'shadowLift', label: '섀도 리프트', type: 'number', defaultValue: 0.16, min: 0, max: 1, step: 0.01, group: '인광체' },
  { key: 'persistence', label: '잔상', type: 'number', defaultValue: 0.18, min: 0, max: 1, step: 0.01, group: '인광체' },
  { key: 'vignetteIntensity', label: '비네트', type: 'number', defaultValue: 0.45, min: 0, max: 1, step: 0.01, group: '왜곡' },
  { key: 'flickerIntensity', label: '깜빡임', type: 'number', defaultValue: 0.2, min: 0, max: 0.2, step: 0.01, group: '노이즈' },
  { key: 'glitchIntensity', label: '글리치', type: 'number', defaultValue: 0.13, min: 0, max: 1, step: 0.01, group: '노이즈' },
  {
    key: 'glitchSpeed',
    label: '글리치 속도',
    type: 'number',
    defaultValue: 5,
    min: 0.1,
    max: 5,
    step: 0.1,
    group: '노이즈',
    visibleWhen: { key: 'glitchIntensity', gte: 0.01 },
  },
  {
    key: 'signalArtifacts',
    label: '신호 아티팩트',
    type: 'number',
    defaultValue: 0.45,
    min: 0,
    max: 1,
    step: 0.01,
    group: '신호',
    visibleWhen: { key: 'crtMode', equals: 'composite-tv' },
  },
  { key: 'bloomEnabled', label: '블룸 사용', type: 'boolean', defaultValue: true, group: '블룸' },
  { key: 'bloomIntensity', label: '강도', type: 'number', defaultValue: 1.93, min: 0, max: 2, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomThreshold', label: '임계값', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomRadius', label: '반경', type: 'number', defaultValue: 8, min: 0, max: 24, step: 0.25, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomSoftness', label: '부드러움', type: 'number', defaultValue: 0.31, min: 0, max: 1, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
]

const particleGridFields: ShaderLabFieldDefinitions = [
  {
    key: 'gridResolution',
    label: '해상도',
    type: 'select',
    defaultValue: '256',
    options: ['32', '64', '128', '256', '512', '1024', '2048', '4096'].map((value) => ({ label: value, value })),
  },
  { key: 'pointSize', label: '포인트 크기', type: 'number', defaultValue: 4, min: 1, max: 32, step: 1 },
  { key: 'displacement', label: '변위', type: 'number', defaultValue: 0.1, min: -2, max: 2, step: 0.01 },
  { key: 'backgroundColor', label: '배경', type: 'color', defaultValue: '#000000' },
  { key: 'bloomEnabled', label: '블룸 사용', type: 'boolean', defaultValue: false, group: '블룸' },
  { key: 'bloomIntensity', label: '강도', type: 'number', defaultValue: 1.25, min: 0, max: 2, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomThreshold', label: '임계값', type: 'number', defaultValue: 0.6, min: 0, max: 1, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomRadius', label: '반경', type: 'number', defaultValue: 6, min: 0, max: 24, step: 0.25, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
  { key: 'bloomSoftness', label: '부드러움', type: 'number', defaultValue: 0.35, min: 0, max: 1, step: 0.01, group: '블룸', visibleWhen: { key: 'bloomEnabled', equals: true } },
]

const pixelationFields: ShaderLabFieldDefinitions = [
  { key: 'cellSize', label: '셀 크기', type: 'number', defaultValue: 8, min: 2, max: 64, step: 1 },
  { key: 'aspectRatio', label: '가로세로 비율', type: 'number', defaultValue: 1, min: 0.25, max: 4, step: 0.05 },
]

const voxelFields: ShaderLabFieldDefinitions = [
  { key: 'cellSize', label: '셀 크기', type: 'number', defaultValue: 24, min: 4, max: 96, step: 1, unit: 'px' },
  { key: 'depth', label: '깊이', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01 },
  { key: 'maxHeight', label: '최대 높이', type: 'number', defaultValue: 6, min: 1, max: 8, step: 1, visibleWhen: { key: 'depth', gte: 0.01 } },
  { key: 'topShade', label: '윗면 명도', type: 'number', defaultValue: 1, min: 0, max: 1.5, step: 0.01 },
  { key: 'lightShade', label: '밝은 면', type: 'number', defaultValue: 0.78, min: 0, max: 1.5, step: 0.01 },
  { key: 'darkShade', label: '어두운 면', type: 'number', defaultValue: 0.55, min: 0, max: 1.5, step: 0.01 },
  { key: 'flipLight', label: '조명 반전', type: 'boolean', defaultValue: false },
  { key: 'lego', label: '레고 스타일', type: 'boolean', defaultValue: false },
  { key: 'outlineWidth', label: '외곽선', type: 'number', defaultValue: 1.0, min: 0, max: 4, step: 0.1, unit: 'px' },
  { key: 'outlineColor', label: '외곽선 색상', type: 'color', defaultValue: '#0a0a0a' },
]

const posterizeFields: ShaderLabFieldDefinitions = [
  { key: 'levels', label: '단계', type: 'number', defaultValue: 5, min: 2, max: 16, step: 1 },
  { key: 'gamma', label: '감마', type: 'number', defaultValue: 1, min: 0.4, max: 2.5, step: 0.01 },
  {
    key: 'mode',
    label: '모드',
    type: 'select',
    defaultValue: 'rgb',
    options: [
      { label: 'RGB', value: 'rgb' },
      { label: '루마', value: 'luma' },
    ],
  },
]

const thresholdFields: ShaderLabFieldDefinitions = [
  { key: 'threshold', label: '임계값', type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
  { key: 'softness', label: '부드러움', type: 'number', defaultValue: 0.02, min: 0, max: 0.2, step: 0.001 },
  { key: 'noise', label: '노이즈', type: 'number', defaultValue: 0.08, min: 0, max: 0.3, step: 0.001 },
  { key: 'invert', label: '반전', type: 'boolean', defaultValue: false },
]

const plotterFields: ShaderLabFieldDefinitions = [
  {
    key: 'colorMode',
    label: '색상',
    type: 'select',
    defaultValue: 'ink',
    options: [
      { label: '잉크', value: 'ink' },
      { label: '원본 색상', value: 'source' },
    ],
  },
  { key: 'gap', label: '간격', type: 'number', defaultValue: 12, min: 10, max: 120, step: 1 },
  { key: 'weight', label: '선 굵기', type: 'number', defaultValue: 1.5, min: 0.5, max: 5, step: 0.1 },
  { key: 'angle', label: '각도', type: 'number', defaultValue: 90, min: 0, max: 180, step: 1 },
  { key: 'crosshatch', label: '교차 해칭', type: 'boolean', defaultValue: true },
  { key: 'crossAngle', label: '교차 각도', type: 'number', defaultValue: 135, min: 0, max: 180, step: 1, visibleWhen: { key: 'crosshatch', equals: true } },
  { key: 'threshold', label: '임계값', type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
  { key: 'wobble', label: '흔들림', type: 'number', defaultValue: 0.3, min: 0, max: 1, step: 0.01 },
  { key: 'paperColor', label: '종이 색상', type: 'color', defaultValue: '#f5f0e8' },
  { key: 'inkColor', label: '잉크 색상', type: 'color', defaultValue: '#1a1a1a', visibleWhen: { key: 'colorMode', equals: 'ink' } },
]

// ============================================================================
// 2차 2차분(20260912_2157) — 이펙트 Distort 9종
// ============================================================================

/**
 * 블롭 트래킹의 "내부 이펙트"에 얹을 수 있는 이펙트 목록. 원본은 블롭 트래킹 자신을 제외한
 * 모든 이펙트 타입을 자동으로 나열하지만(순환 참조 방지), 우리는 이 값을 그 시점에 이미
 * 전부 등록돼 있는 이펙트 타입으로 고정 나열했다(라벨은 이 파일의 다른 이펙트 정의와 동일).
 */
const SHADER_LAB_BLOB_INNER_EFFECT_OPTIONS: readonly { label: string; value: string }[] = [
  { label: '없음', value: 'none' },
  { label: 'ASCII', value: 'ascii' },
  { label: '블룸', value: 'bloom' },
  { label: '서킷 벤트', value: 'circuit-bent' },
  { label: '방향성 블러', value: 'directional-blur' },
  { label: '색수차', value: 'chromatic-aberration' },
  { label: 'CRT', value: 'crt' },
  { label: '디스플레이스먼트맵', value: 'displacement-map' },
  { label: '디더링', value: 'dithering' },
  { label: '엣지 디텍트', value: 'edge-detect' },
  { label: '플루티드 글래스', value: 'fluted-glass' },
  { label: '하프톤', value: 'halftone' },
  { label: '잉크', value: 'ink' },
  { label: '파티클 그리드', value: 'particle-grid' },
  { label: '패턴', value: 'pattern' },
  { label: '픽셀레이션', value: 'pixelation' },
  { label: '픽셀 소팅', value: 'pixel-sorting' },
  { label: '플로터', value: 'plotter' },
  { label: '포스터라이즈', value: 'posterize' },
  { label: '슬라이스', value: 'slice' },
  { label: '프로그레시브 블러', value: 'smear' },
  { label: '쓰레숄드', value: 'threshold' },
  { label: '복셀', value: 'voxel' },
] satisfies readonly { label: string; value: ShaderLabEffectLayerType | 'none' }[]

const blobTrackingFields: ShaderLabFieldDefinitions = [
  {
    key: 'detectionMode',
    label: '감지 모드',
    type: 'select',
    defaultValue: 'auto',
    group: '감지',
    options: [
      { label: '자동', value: 'auto' },
      { label: '모션', value: 'motion' },
      { label: '밝기', value: 'luminance' },
    ],
  },
  { key: 'sensitivity', label: '민감도', type: 'number', defaultValue: 0.8, min: 0, max: 1, step: 0.01, group: '감지' },
  { key: 'motionThreshold', label: '모션 임계값', type: 'number', defaultValue: 0.12, min: 0, max: 1, step: 0.01, group: '감지' },
  { key: 'motionMaskThreshold', label: '마스크 임계값', type: 'number', defaultValue: 0.08, min: 0, max: 0.5, step: 0.005, group: '감지' },
  { key: 'motionPersistence', label: '모션 지속성', type: 'number', defaultValue: 0.82, min: 0, max: 0.99, step: 0.01, group: '감지' },
  { key: 'blobAmount', label: '블롭 개수', type: 'number', defaultValue: 6, min: 1, max: 32, step: 1, group: '감지' },
  { key: 'minBlobSize', label: '최소 블롭 크기', type: 'number', defaultValue: 3, min: 1, max: 64, step: 1, group: '감지' },
  { key: 'smoothing', label: '스무딩', type: 'number', defaultValue: 0.6, min: 0, max: 1, step: 0.01, group: '감지' },
  { key: 'persistentTracking', label: '지속 추적', type: 'boolean', defaultValue: true, group: '감지' },
  {
    key: 'shapeType',
    label: '모양',
    type: 'select',
    defaultValue: 'square',
    group: '도형',
    options: [
      { label: '사각형', value: 'square' },
      { label: '원', value: 'circle' },
      { label: '다이아몬드', value: 'diamond' },
    ],
  },
  { key: 'shapeScale', label: '모양 크기', type: 'number', defaultValue: 1, min: 0.25, max: 3, step: 0.01, group: '도형' },
  { key: 'invert', label: '반전', type: 'boolean', defaultValue: false, group: '도형' },
  {
    key: 'outputMode',
    label: '출력',
    type: 'select',
    defaultValue: 'decorated',
    group: '도형',
    options: [
      { label: '장식형', value: 'decorated' },
      { label: '블롭 마스크', value: 'mask' },
      { label: '모션 마스크', value: 'motion' },
    ],
  },
  {
    key: 'innerEffectType',
    label: '내부 이펙트',
    type: 'select',
    defaultValue: 'none',
    group: '내부 이펙트',
    options: SHADER_LAB_BLOB_INNER_EFFECT_OPTIONS,
  },
  {
    key: 'innerEffectParams',
    label: '내부 이펙트 파라미터(내부용)',
    type: 'text',
    defaultValue: '',
    group: '내부 이펙트',
    description: '원본 앱도 이 값을 폼에 노출하지 않아요(중첩 이펙트 편집 UI 전용, 이번 범위 밖).',
    // 원본과 동일하게 항상 숨김 — key가 존재하지 않는 값이라 이 조건은 절대 참이 되지 않는다.
    visibleWhen: { key: '__blobTrackingInternal', equals: '__never__' },
  },
  { key: 'showOutline', label: '외곽선', type: 'boolean', defaultValue: true, group: '장식' },
  { key: 'strokeWidth', label: '선 두께', type: 'number', defaultValue: 2, min: 1, max: 8, step: 1, group: '장식' },
  { key: 'strokeColor', label: '선 색상', type: 'color', defaultValue: '#ffffff', group: '장식' },
  { key: 'showLabels', label: '라벨', type: 'boolean', defaultValue: true, group: '장식' },
  {
    key: 'centerShape',
    label: '중심 모양',
    type: 'select',
    defaultValue: 'dot',
    group: '장식',
    options: [
      { label: '점', value: 'dot' },
      { label: '십자', value: 'cross' },
      { label: '없음', value: 'none' },
    ],
  },
  { key: 'connectLines', label: '연결선', type: 'boolean', defaultValue: true, group: '장식' },
  { key: 'curvedLines', label: '곡선', type: 'boolean', defaultValue: false, group: '장식', visibleWhen: { key: 'connectLines', equals: true } },
  { key: 'connectorDashed', label: '점선', type: 'boolean', defaultValue: false, group: '장식', visibleWhen: { key: 'connectLines', equals: true } },
  { key: 'connectorArrows', label: '화살표', type: 'boolean', defaultValue: false, group: '장식', visibleWhen: { key: 'connectLines', equals: true } },
  { key: 'trailDecay', label: '잔상 감쇠', type: 'number', defaultValue: 0.35, min: 0, max: 1, step: 0.01, group: '장식' },
]

const circuitBentFields: ShaderLabFieldDefinitions = [
  {
    key: 'colorMode',
    label: '색상 모드',
    type: 'select',
    defaultValue: 'source',
    options: [
      { label: '원본 색상', value: 'source' },
      { label: '단색', value: 'monochrome' },
    ],
  },
  { key: 'monoColor', label: '틴트', type: 'color', defaultValue: '#ebf5ff', visibleWhen: { key: 'colorMode', equals: 'monochrome' } },
  { key: 'invert', label: '반전', type: 'boolean', defaultValue: false },
  { key: 'signalBlackPoint', label: '블랙 포인트', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01, group: '신호' },
  { key: 'signalWhitePoint', label: '화이트 포인트', type: 'number', defaultValue: 0.22, min: 0, max: 1, step: 0.01, group: '신호' },
  { key: 'signalGamma', label: '감마', type: 'number', defaultValue: 3.07, min: 0.1, max: 5, step: 0.01, group: '신호' },
  { key: 'presenceThreshold', label: '존재 임계값', type: 'number', defaultValue: 0.37, min: 0, max: 1, step: 0.01, group: '신호' },
  { key: 'presenceSoftness', label: '존재 부드러움', type: 'number', defaultValue: 0.64, min: 0, max: 1, step: 0.01, group: '신호' },
  { key: 'linePitch', label: '간격', type: 'number', defaultValue: 6.4, min: 2, max: 48, step: 0.1, group: '라인' },
  { key: 'lineThickness', label: '두께', type: 'number', defaultValue: 0.5, min: 0.5, max: 8, step: 0.1, group: '라인' },
  { key: 'lineAngle', label: '각도', type: 'number', defaultValue: 0, min: 0, max: 180, step: 1, group: '라인' },
  {
    key: 'noiseMode',
    label: '노이즈 종류',
    type: 'select',
    defaultValue: 'turbulence',
    group: '노이즈',
    options: [
      { label: '사인', value: 'sine' },
      { label: '펄린', value: 'perlin' },
      { label: '터뷸런스', value: 'turbulence' },
    ],
  },
  { key: 'noiseAmount', label: '양', type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.01, group: '노이즈' },
]

const directionalBlurFields: ShaderLabFieldDefinitions = [
  {
    key: 'mode',
    label: '모드',
    type: 'select',
    defaultValue: 'linear',
    options: [
      { label: '선형', value: 'linear' },
      { label: '방사형', value: 'radial' },
    ],
  },
  { key: 'strength', label: '강도', type: 'number', defaultValue: 18, min: 0, max: 96, step: 0.5, unit: 'px' },
  { key: 'samples', label: '샘플 수', type: 'number', defaultValue: 8, min: 1, max: 16, step: 1 },
  { key: 'angle', label: '각도', type: 'number', defaultValue: 0, min: 0, max: 360, step: 1, unit: '°', visibleWhen: { key: 'mode', equals: 'linear' } },
  { key: 'center', label: '중심', type: 'vec2', defaultValue: [0.5, 0.5], min: 0, max: 1, step: 0.01, visibleWhen: { key: 'mode', equals: 'radial' } },
]

const pixelSortingFields: ShaderLabFieldDefinitions = [
  { key: 'threshold', label: '임계값', type: 'number', defaultValue: 0.25, min: 0, max: 1, step: 0.01 },
  { key: 'upperThreshold', label: '상한 임계값', type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.01 },
  {
    key: 'direction',
    label: '방향',
    type: 'select',
    defaultValue: 'horizontal',
    options: [
      { label: '가로', value: 'horizontal' },
      { label: '세로', value: 'vertical' },
    ],
  },
  {
    key: 'mode',
    label: '기준',
    type: 'select',
    defaultValue: 'luma',
    options: [
      { label: '루마', value: 'luma' },
      { label: '색상', value: 'hue' },
      { label: '채도', value: 'saturation' },
    ],
  },
  { key: 'reverse', label: '반전 정렬', type: 'boolean', defaultValue: false },
  { key: 'range', label: '범위', type: 'number', defaultValue: 0.3, min: 0, max: 1, step: 0.01 },
]

const sliceFields: ShaderLabFieldDefinitions = [
  { key: 'amount', label: '이동량', type: 'number', defaultValue: 180, min: 0, max: 480, step: 1, unit: 'px' },
  { key: 'sliceHeight', label: '조각 높이', type: 'number', defaultValue: 28, min: 2, max: 240, step: 1, unit: 'px' },
  { key: 'blockWidth', label: '블록 너비', type: 'number', defaultValue: 120, min: 8, max: 640, step: 1, unit: 'px' },
  { key: 'density', label: '밀도', type: 'number', defaultValue: 0.58, min: 0, max: 1, step: 0.01 },
  { key: 'dispersion', label: '분산', type: 'number', defaultValue: 0.18, min: 0, max: 0.5, step: 0.01 },
  {
    key: 'direction',
    label: '방향',
    type: 'select',
    defaultValue: 'right',
    options: [
      { label: '오른쪽', value: 'right' },
      { label: '왼쪽', value: 'left' },
      { label: '양쪽', value: 'both' },
    ],
  },
]

const edgeDetectFields: ShaderLabFieldDefinitions = [
  { key: 'threshold', label: '임계값', type: 'number', defaultValue: 0.1, min: 0, max: 1, step: 0.01 },
  { key: 'strength', label: '강도', type: 'number', defaultValue: 1, min: 0.1, max: 5, step: 0.1 },
  { key: 'invert', label: '반전', type: 'boolean', defaultValue: false },
  {
    key: 'colorMode',
    label: '색상',
    type: 'select',
    defaultValue: 'overlay',
    options: [
      { label: '오버레이', value: 'overlay' },
      { label: '단색', value: 'mono' },
      { label: '원본 색상', value: 'source' },
    ],
  },
  { key: 'lineColor', label: '선 색상', type: 'color', defaultValue: '#ffffff', visibleWhen: { key: 'colorMode', equals: 'mono' } },
  { key: 'bgColor', label: '배경', type: 'color', defaultValue: '#000000', visibleWhen: { key: 'colorMode', equals: 'mono' } },
]

const chromaticAberrationFields: ShaderLabFieldDefinitions = [
  { key: 'intensity', label: '강도', type: 'number', defaultValue: 5, min: 0, max: 50, step: 0.5, unit: 'px' },
  {
    key: 'direction',
    label: '방향',
    type: 'select',
    defaultValue: 'radial',
    options: [
      { label: '방사형', value: 'radial' },
      { label: '가로', value: 'horizontal' },
      { label: '세로', value: 'vertical' },
    ],
  },
  { key: 'center', label: '중심', type: 'vec2', defaultValue: [0.5, 0.5], min: 0, max: 1, step: 0.01, visibleWhen: { key: 'direction', equals: 'radial' } },
  { key: 'angle', label: '각도', type: 'number', defaultValue: 0, min: 0, max: 360, step: 1, unit: '°', visibleWhen: { key: 'direction', equals: 'horizontal' } },
]

/** 프로그레시브 블러(패키지 내부 타입명 `smear`, 원본 라벨은 "Progressive Blur"). */
const smearFields: ShaderLabFieldDefinitions = [
  { key: 'angle', label: '각도', type: 'number', defaultValue: 0, min: 0, max: 360, step: 1 },
  { key: 'start', label: '시작', type: 'number', defaultValue: 0.25, min: 0, max: 1, step: 0.01 },
  { key: 'end', label: '끝', type: 'number', defaultValue: 0.75, min: 0, max: 1, step: 0.01 },
  { key: 'strength', label: '강도', type: 'number', defaultValue: 24, min: 0, max: 64, step: 1 },
  { key: 'samples', label: '샘플 수', type: 'number', defaultValue: 12, min: 4, max: 32, step: 1 },
]

const flutedGlassFields: ShaderLabFieldDefinitions = [
  {
    key: 'preset',
    label: '프리셋',
    type: 'select',
    defaultValue: 'architectural',
    options: [
      { label: '건축적', value: 'architectural' },
      { label: '회화적', value: 'painterly' },
    ],
  },
  { key: 'frequency', label: '빈도', type: 'number', defaultValue: 20, min: 2, max: 100, step: 1 },
  { key: 'amplitude', label: '진폭', type: 'number', defaultValue: 0.02, min: 0, max: 0.1, step: 0.001 },
  { key: 'warp', label: '왜곡', type: 'number', defaultValue: 0.28, min: 0, max: 1, step: 0.01 },
  { key: 'irregularity', label: '불규칙성', type: 'number', defaultValue: 0.35, min: 0, max: 1, step: 0.01 },
  { key: 'angle', label: '각도', type: 'number', defaultValue: 0, min: 0, max: 360, step: 1 },
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
  fluid: {
    kind: 'source',
    label: '플루이드',
    defaultName: '플루이드',
    description: '포인터 움직임에 반응하는 유체 시뮬레이션을 그려요.',
    fields: fluidFields,
  },
  'pixel-trail': {
    kind: 'source',
    label: '픽셀 트레일',
    defaultName: '픽셀 트레일',
    description: '포인터가 지나간 자리에 픽셀 격자 잔상을 남겨요.',
    fields: pixelTrailFields,
  },
  'magnify-lens': {
    kind: 'source',
    label: '매그니파이 렌즈',
    defaultName: '매그니파이 렌즈',
    description: '포인터 주변을 돋보기처럼 확대해요.',
    fields: magnifyLensFields,
  },
  gradient: {
    kind: 'source',
    label: '메시 그라디언트',
    defaultName: '메시 그라디언트',
    description: '여러 색 포인트를 노이즈로 왜곡해 그라디언트를 만들어요.',
    fields: gradientFields,
  },
  'liquid-metal': {
    kind: 'source',
    label: '리퀴드 메탈',
    defaultName: '리퀴드 메탈',
    description: '흐르는 금속 질감의 줄무늬 패턴을 그려요.',
    fields: liquidMetalFields,
  },
  ink: {
    kind: 'effect',
    label: '잉크',
    defaultName: '잉크',
    description: '잉크가 번지고 흘러내리는 듯한 효과를 더해요.',
    fields: inkFields,
  },
  pattern: {
    kind: 'effect',
    label: '패턴',
    defaultName: '패턴',
    description: '바·캔들·도형 프리셋 패턴으로 이미지를 채워요.',
    fields: patternFields,
  },
  crt: {
    kind: 'effect',
    label: 'CRT',
    defaultName: 'CRT',
    description: '옛 브라운관 모니터의 스캔라인·마스크·글리치를 재현해요.',
    fields: crtFields,
  },
  'particle-grid': {
    kind: 'effect',
    label: '파티클 그리드',
    defaultName: '파티클 그리드',
    description: '이미지를 밝기 기반으로 배치된 포인트 격자로 바꿔요.',
    fields: particleGridFields,
  },
  pixelation: {
    kind: 'effect',
    label: '픽셀레이션',
    defaultName: '픽셀레이션',
    description: '이미지를 큰 사각 셀 단위로 뭉개요.',
    fields: pixelationFields,
  },
  voxel: {
    kind: 'effect',
    label: '복셀',
    defaultName: '복셀',
    description: '밝기를 높이로 치환해 입체 블록처럼 그려요.',
    fields: voxelFields,
  },
  posterize: {
    kind: 'effect',
    label: '포스터라이즈',
    defaultName: '포스터라이즈',
    description: '색상 단계를 계단식으로 줄여요.',
    fields: posterizeFields,
  },
  threshold: {
    kind: 'effect',
    label: '쓰레숄드',
    defaultName: '쓰레숄드',
    description: '밝기 기준으로 흑백 이진화해요.',
    fields: thresholdFields,
  },
  plotter: {
    kind: 'effect',
    label: '플로터',
    defaultName: '플로터',
    description: '펜 플로터로 그린 듯한 해칭 선으로 바꿔요.',
    fields: plotterFields,
  },
  'blob-tracking': {
    kind: 'effect',
    label: '블롭 트래킹',
    defaultName: '블롭 트래킹',
    description: '움직임이나 밝기 기준으로 덩어리를 감지해 도형으로 표시해요.',
    fields: blobTrackingFields,
  },
  'circuit-bent': {
    kind: 'effect',
    label: '서킷 벤트',
    defaultName: '서킷 벤트',
    description: '오작동한 회로 기판처럼 신호를 라인·노이즈로 왜곡해요.',
    fields: circuitBentFields,
  },
  'directional-blur': {
    kind: 'effect',
    label: '방향성 블러',
    defaultName: '방향성 블러',
    description: '한 방향(선형) 또는 중심에서(방사형) 블러를 줘요.',
    fields: directionalBlurFields,
  },
  'pixel-sorting': {
    kind: 'effect',
    label: '픽셀 소팅',
    defaultName: '픽셀 소팅',
    description: '밝기·색상·채도 기준으로 픽셀을 줄 단위로 정렬해요.',
    fields: pixelSortingFields,
  },
  slice: {
    kind: 'effect',
    label: '슬라이스',
    defaultName: '슬라이스',
    description: '이미지를 가로 조각으로 잘라 어긋나게 밀어요.',
    fields: sliceFields,
  },
  'edge-detect': {
    kind: 'effect',
    label: '엣지 디텍트',
    defaultName: '엣지 디텍트',
    description: '윤곽선만 남기거나 원본 위에 덧그려요.',
    fields: edgeDetectFields,
  },
  'chromatic-aberration': {
    kind: 'effect',
    label: '색수차',
    defaultName: '색수차',
    description: 'RGB 채널을 어긋나게 분리해 렌즈 색수차를 흉내내요.',
    fields: chromaticAberrationFields,
  },
  smear: {
    kind: 'effect',
    label: '프로그레시브 블러',
    defaultName: '프로그레시브 블러',
    description: '한쪽 구간부터 점점 강해지는 방향성 블러를 줘요.',
    fields: smearFields,
  },
  'fluted-glass': {
    kind: 'effect',
    label: '플루티드 글래스',
    defaultName: '플루티드 글래스',
    description: '골이 진 유리를 통과한 듯 세로 줄무늬로 굴절시켜요.',
    fields: flutedGlassFields,
  },
}

export function getLayerTypeDefinition(type: SupportedShaderLabLayerType): LayerTypeDefinition {
  return SHADER_LAB_LAYER_REGISTRY[type]
}

/**
 * 티켓 20260913_1819 — 재생/정지 기능 제거에 맞춰, 시간에 따라 스스로 움직이던 6개
 * 레이어의 "자동 애니메이션" 파라미터를 UI에서 완전히 없앴다. 필드 자체는 위에서 삭제했지만,
 * 그 필드가 없을 때(params 객체에 undefined) 런타임(`@basementstudio/shader-lab`)이 켜진
 * 상태를 기본값으로 삼는 레이어가 있어(gradient/circuit-bent/ink/particle-grid/slice —
 * 소스 확인, 아래 각 줄 참고) 명시적으로 "꺼짐" 값을 강제한다. 디더링은 런타임이 엄격한
 * `=== true` 비교라 필드 삭제만으로 이미 꺼짐이지만, 다른 레이어와 같은 원리를 명시적으로
 * 남겨 나중에 런타임 버전이 바뀌어도 안전하게 해뒀다.
 */
const SHADER_LAB_FORCED_STATIC_PARAMS: Partial<Record<SupportedShaderLabLayerType, Record<string, ShaderLabParameterValue>>> = {
  dithering: { animateDither: false }, // dithering-pass.js: `params.animateDither === true`(엄격 비교) — undefined도 이미 꺼짐
  gradient: { animate: false }, // gradient-pass.js: `params.animate !== false` — undefined면 켜짐이라 명시 필요
  'circuit-bent': { scrollSpeed: 0 }, // circuit-bent-pass.js: 미지정 시 기본값 4(최대 속도)
  ink: { smokeSpeed: 0 }, // ink-pass.js: 미지정 시 기본값 0.2
  'particle-grid': { noiseAmount: 0 }, // particle-grid-pass.js: `isAnimated = noiseAmount > 0` — amount가 실제 스위치
  slice: { speed: 0 }, // slice-pass.js: 미지정 시 기본값 0.2
}

export function getDefaultParamsForType(type: SupportedShaderLabLayerType): Record<string, ShaderLabParameterValue> {
  const base = buildDefaultParams(SHADER_LAB_LAYER_REGISTRY[type].fields) as Record<string, ShaderLabParameterValue>
  const forced = SHADER_LAB_FORCED_STATIC_PARAMS[type]
  return forced ? { ...base, ...forced } : base
}

export function isSupportedLayerType(type: string): type is SupportedShaderLabLayerType {
  return (SHADER_LAB_LAYER_TYPES as readonly string[]).includes(type)
}
