/**
 * 쉐이더 랩 — 컴포지션(레이어 스택) 기본값·직렬화 헬퍼 (티켓 20260912_1951)
 *
 * 1차 출력 규격은 1:1 고정, 기존 도구(`/admin/shader-text`) 관례상 1280×1280을 그대로
 * 따른다(티켓 명시).
 */
import type { ShaderLabConfig, ShaderLabLayerConfig } from '@basementstudio/shader-lab'

export const SHADER_LAB_OUTPUT_SIZE = 1280

/** 키프레임이 없는 1차 범위라 duration/loop는 화면에 노출하지 않는다(2차: 타임라인 UI). */
const DEFAULT_TIMELINE = { duration: 6, loop: true, tracks: [] } as const

export function createEmptyComposition(): ShaderLabConfig {
  return {
    composition: { width: SHADER_LAB_OUTPUT_SIZE, height: SHADER_LAB_OUTPUT_SIZE },
    layers: [],
    timeline: { ...DEFAULT_TIMELINE, tracks: [] },
  }
}

export function buildComposition(layers: ShaderLabLayerConfig[]): ShaderLabConfig {
  return {
    composition: { width: SHADER_LAB_OUTPUT_SIZE, height: SHADER_LAB_OUTPUT_SIZE },
    layers,
    timeline: { ...DEFAULT_TIMELINE, tracks: [] },
  }
}

/**
 * DB(`shader_lab_compositions.scene_json`)에서 불러온 값을 방어적으로 검증한다. 스키마가
 * 안 맞으면(예: 2차 이후 필드 확장 전 데이터, 수동 편집 등) 레이어 배열만 최대한 살리고
 * 나머지는 기본값으로 채운다.
 */
export function parseStoredComposition(raw: unknown): ShaderLabLayerConfig[] {
  if (!raw || typeof raw !== 'object') return []
  const layers = (raw as { layers?: unknown }).layers
  if (!Array.isArray(layers)) return []

  return layers.filter((layer): layer is ShaderLabLayerConfig => {
    if (!layer || typeof layer !== 'object') return false
    const candidate = layer as Partial<ShaderLabLayerConfig>
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.type === 'string' &&
      typeof candidate.kind === 'string' &&
      typeof candidate.name === 'string' &&
      typeof candidate.params === 'object'
    )
  })
}
