/**
 * 쉐이더 랩 — 레이어 생성/복제 헬퍼 (티켓 20260912_1951)
 *
 * `ShaderLabLayerConfig`는 `@basementstudio/shader-lab`(npm, Apache 2.0)가 export하는
 * 공개 타입이다. 이 파일은 그 타입에 맞는 기본값 채운 레이어를 만드는 JAM! 전용 유틸이다.
 */
import type { ShaderLabLayerConfig } from '@basementstudio/shader-lab'
import { getDefaultParamsForType, getLayerTypeDefinition, type SupportedShaderLabLayerType } from './effectRegistry'

function generateLayerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `layer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createLayer(type: SupportedShaderLabLayerType): ShaderLabLayerConfig {
  const definition = getLayerTypeDefinition(type)
  return {
    id: generateLayerId(),
    kind: definition.kind,
    type,
    name: definition.defaultName,
    visible: true,
    opacity: 1,
    hue: 0,
    saturation: 1,
    blendMode: 'normal',
    compositeMode: 'filter',
    params: getDefaultParamsForType(type),
  }
}

export function cloneLayer(layer: ShaderLabLayerConfig): ShaderLabLayerConfig {
  return {
    ...layer,
    id: generateLayerId(),
    name: `${layer.name} 사본`,
    params: { ...layer.params },
    maskConfig: layer.maskConfig ? { ...layer.maskConfig } : undefined,
  }
}
