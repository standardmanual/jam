/**
 * 쉐이더 랩 — 레이어 속성 패널 필드 스키마 (티켓 20260912_1951, `text` 필드 타입 추가
 * 20260912_2157)
 *
 * `@basementstudio/shader-lab`(npm, Apache 2.0) 런타임의 `ShaderLabLayerConfig.params`는
 * `Record<string, ShaderLabParameterValue>`로만 타입돼 있어 "이 레이어 종류엔 어떤 파라미터가
 * 있고 각각 슬라이더/컬러/셀렉트 중 무엇으로 그려야 하는지"는 런타임 패키지가 알려주지 않는다.
 * 원본 저장소(github.com/basementstudio/shader-lab)의 에디터 앱에는 이 스키마가
 * `src/lib/editor/config/layer-registry.ts`(비공개 앱 소스, npm 미배포)에 있었다 — 그 구조를
 * 참고해 JAM! 스타일로 재작성한 것이 이 파일과 `effectRegistry.ts`다. 원본 코드를 복붙하지
 * 않았고, 필드 목록도 대표적인 것만 추려 단순화했다(완료 기록 참고).
 *
 * 출처: https://github.com/basementstudio/shader-lab (Apache License 2.0)
 * 이식 시점: 2026-09-12, npm `@basementstudio/shader-lab@3.0.2`
 */

export type ShaderLabFieldVisibility =
  | { key: string; equals: boolean | number | string }
  | { key: string; notEquals: boolean | number | string }
  | { key: string; gte: number }

interface FieldBase<TType extends string, TValue> {
  key: string
  label: string
  type: TType
  defaultValue: TValue
  group?: string
  description?: string
  visibleWhen?: ShaderLabFieldVisibility
}

export type NumberFieldDefinition = FieldBase<'number', number> & {
  min?: number
  max?: number
  step?: number
  unit?: string
}

export type BooleanFieldDefinition = FieldBase<'boolean', boolean>

export type SelectFieldDefinition = FieldBase<'select', string> & {
  options: readonly { label: string; value: string }[]
}

export type ColorFieldDefinition = FieldBase<'color', string>

export type Vec2FieldDefinition = FieldBase<'vec2', [number, number]> & {
  min?: number
  max?: number
  step?: number
}

/**
 * 자유 입력 텍스트. ASCII의 커스텀 문자 세트, 텍스트 레이어의 본문 등에 쓴다.
 * `multiline`이 true면(텍스트 레이어 전용, 티켓 20260913_1901) 줄바꿈을 입력할 수 있는
 * textarea로 렌더링한다 — 기본은 false(한 줄 input)라 ASCII의 커스텀 문자 세트 등
 * 기존 필드는 영향받지 않는다.
 */
export type TextFieldDefinition = FieldBase<'text', string> & {
  maxLength?: number
  multiline?: boolean
}

export type ShaderLabFieldDefinition =
  | NumberFieldDefinition
  | BooleanFieldDefinition
  | SelectFieldDefinition
  | ColorFieldDefinition
  | Vec2FieldDefinition
  | TextFieldDefinition

export type ShaderLabFieldDefinitions = readonly ShaderLabFieldDefinition[]

/** 현재 파라미터 값들을 참고해 `visibleWhen` 조건을 평가한다. */
export function isFieldVisible(
  field: ShaderLabFieldDefinition,
  values: Record<string, unknown>
): boolean {
  const condition = field.visibleWhen
  if (!condition) return true
  const current = values[condition.key]
  if ('equals' in condition) return current === condition.equals
  if ('notEquals' in condition) return current !== condition.notEquals
  if ('gte' in condition) return typeof current === 'number' && current >= condition.gte
  return true
}

/** 필드 정의 배열에서 기본값 맵을 만든다(신규 레이어 생성 시 사용). */
export function buildDefaultParams(fields: ShaderLabFieldDefinitions): Record<string, ShaderLabFieldDefinition['defaultValue']> {
  const result: Record<string, ShaderLabFieldDefinition['defaultValue']> = {}
  for (const field of fields) {
    result[field.key] = field.defaultValue
  }
  return result
}
