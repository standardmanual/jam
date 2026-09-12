/**
 * 쉐이더 랩 — 1차 대표 레이어 6종 정의 (티켓 20260912_1951)
 *
 * `@basementstudio/shader-lab` 런타임은 25종 이상의 레이어 타입을 지원하지만(패키지 README
 * 참고), 1차는 속성 패널 UI를 새로 이식해야 하는 작업량을 고려해 다음 6종만 노출한다:
 * 미디어(이미지), 디스플레이스먼트맵, 블룸, 디더링, ASCII, 하프톤. 나머지는 2차에서 UI만
 * 추가한다(런타임 자체는 이미 지원).
 *
 * 각 필드 목록은 원본 저장소(Apache 2.0) 에디터 앱의 `layer-registry.ts`가 정의한 파라미터
 * 세트를 참고해 다시 정리했다. 하프톤은 원본이 CMYK 인쇄 각도·프리셋까지 세분화하지만, 1차는
 * 핵심 파라미터(색상 모드·모양·간격·대비 등)만 노출하도록 축소했다 — 완료 기록의 "주요
 * 의사결정" 참고.
 *
 * 출처: https://github.com/basementstudio/shader-lab (Apache License 2.0)
 * 이식 시점: 2026-09-12, npm `@basementstudio/shader-lab@3.0.2`
 */
import type { ShaderLabLayerType, ShaderLabLayerKind, ShaderLabParameterValue } from '@basementstudio/shader-lab'
import { buildDefaultParams, type ShaderLabFieldDefinitions } from './paramFields'

/** 1차에서 노출하는 레이어 타입. 2차에서 여기에 항목을 추가하면 UI가 늘어난다. */
export const SHADER_LAB_LAYER_TYPES = [
  'image',
  'displacement-map',
  'bloom',
  'dithering',
  'ascii',
  'halftone',
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
    ],
  },
  { key: 'boldness', label: '굵기', type: 'number', defaultValue: 0, min: -1, max: 1, step: 0.01, group: '글리프' },
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
  { key: 'invert', label: '반전', type: 'boolean', defaultValue: false, group: '신호' },
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
