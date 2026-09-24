/**
 * presetSerialize — 프리셋 레이어 직렬화·역직렬화 라운드트립 (티켓 20260924_2159)
 * 실행: cd jam-web && npx vitest run src/lib/asset-generator/__tests__/presetSerialize.test.ts
 */
import { describe, it, expect } from 'vitest';
import { deserializePresetLayers, serializePresetLayers } from '../presetSerialize';
import type { ImageLayerConfig, OverlayLayerConfig, TextLayerConfig } from '../types';

function makeImageLayer(id: string, assetUrl: string): ImageLayerConfig {
  return {
    type: 'image',
    id,
    assetUrl,
    xPct: 50,
    yPct: 50,
    widthPct: 30,
    heightPct: 30,
    rotationDeg: 0,
    opacityPct: 100,
  };
}

function makeTextLayer(id: string, content: string): TextLayerConfig {
  return {
    type: 'text',
    id,
    content,
    font: { family: 'system-ui', weight: 400 },
    sizePct: 10,
    letterSpacing: 0,
    lineHeight: 1.2,
    align: 'center',
    color: '#111111',
    xPct: 50,
    yPct: 50,
    rotationDeg: 0,
    opacityPct: 100,
  };
}

describe('serializePresetLayers', () => {
  it('텍스트 레이어의 content를 빈 문자열로 비운다', () => {
    const layers: OverlayLayerConfig[] = [makeTextLayer('t1', '안녕하세요')];
    const [serialized] = serializePresetLayers(layers);
    expect(serialized.type).toBe('text');
    expect((serialized as TextLayerConfig).content).toBe('');
  });

  it('assetUrlByLayerId에 있는 이미지 레이어의 assetUrl을 저장소 경로로 바꾼다', () => {
    const layers: OverlayLayerConfig[] = [makeImageLayer('i1', 'blob:http://localhost/abc')];
    const [serialized] = serializePresetLayers(layers, { i1: 'https://cdn.example.com/asset-generator/presets/p1/i1.png' });
    expect((serialized as ImageLayerConfig).assetUrl).toBe('https://cdn.example.com/asset-generator/presets/p1/i1.png');
  });

  it('assetUrlByLayerId에 없는 이미지 레이어는 원래 assetUrl을 그대로 둔다', () => {
    const layers: OverlayLayerConfig[] = [makeImageLayer('i1', 'https://cdn.example.com/existing.png')];
    const [serialized] = serializePresetLayers(layers, {});
    expect((serialized as ImageLayerConfig).assetUrl).toBe('https://cdn.example.com/existing.png');
  });

  it('배열 순서를 그대로 유지한다', () => {
    const layers: OverlayLayerConfig[] = [makeTextLayer('t1', 'A'), makeImageLayer('i1', 'blob:x'), makeTextLayer('t2', 'B')];
    const serialized = serializePresetLayers(layers, { i1: 'https://cdn.example.com/i1.png' });
    expect(serialized.map((l) => l.id)).toEqual(['t1', 'i1', 't2']);
  });

  it('원본 배열을 변형하지 않는다', () => {
    const original = makeTextLayer('t1', '원본유지');
    serializePresetLayers([original]);
    expect(original.content).toBe('원본유지');
  });
});

describe('deserializePresetLayers', () => {
  it('저장된 레이어를 순서를 유지한 채 그대로 복원한다(텍스트 content는 빈 문자열)', () => {
    const stored: OverlayLayerConfig[] = [makeImageLayer('i1', 'https://cdn.example.com/i1.png'), makeTextLayer('t1', '')];
    const result = deserializePresetLayers(stored);
    expect(result.map((l) => l.id)).toEqual(['i1', 't1']);
    expect((result[1] as TextLayerConfig).content).toBe('');
    expect((result[0] as ImageLayerConfig).assetUrl).toBe('https://cdn.example.com/i1.png');
  });
});

describe('직렬화 → 역직렬화 라운드트립', () => {
  it('텍스트 content가 비워지고 이미지 assetUrl이 저장소 경로가 된 상태로 순서가 유지된다', () => {
    const layers: OverlayLayerConfig[] = [
      makeTextLayer('t1', '배지 이름'),
      makeImageLayer('i1', 'blob:http://localhost/abc'),
    ];
    const serialized = serializePresetLayers(layers, { i1: 'https://cdn.example.com/asset-generator/presets/p1/i1.png' });
    const restored = deserializePresetLayers(serialized);

    expect(restored.map((l) => l.id)).toEqual(['t1', 'i1']);
    expect((restored[0] as TextLayerConfig).content).toBe('');
    expect((restored[1] as ImageLayerConfig).assetUrl).toBe('https://cdn.example.com/asset-generator/presets/p1/i1.png');
  });
});
