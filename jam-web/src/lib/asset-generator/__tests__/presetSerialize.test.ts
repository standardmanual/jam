/**
 * presetSerialize — 프리셋 레이어 직렬화·역직렬화 라운드트립 (티켓 20260924_2159)
 * 실행: cd jam-web && npx vitest run src/lib/asset-generator/__tests__/presetSerialize.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  deserializePresetLayers,
  isPresetTargetType,
  serializePresetLayers,
  toAssetPreset,
  toAssetPresetSummary,
  type AssetPresetRow,
} from '../presetSerialize';
import type { ImageLayerConfig, OverlayLayerConfig, TextLayerConfig } from '../types';

function makeImageLayer(id: string, assetUrl: string): ImageLayerConfig {
  return {
    type: 'image',
    id,
    assetUrl,
    xPct: 50,
    yPct: 50,
    widthPct: 30,
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

describe('deserializePresetLayers 하위 호환 (티켓 20260926_1741)', () => {
  it('예전 프리셋의 heightPct는 버리고 overlayEnabled를 꺼짐으로 채운다', () => {
    const legacy = { ...makeImageLayer('i1', 'https://cdn.example.com/i1.png'), heightPct: 30 } as unknown as OverlayLayerConfig;
    const [result] = deserializePresetLayers([legacy]) as ImageLayerConfig[];
    expect('heightPct' in result).toBe(false);
    expect(result.widthPct).toBe(30);
    expect(result.overlayEnabled).toBe(false);
  });

  it('저장된 오버레이 설정은 그대로 유지한다', () => {
    const layer: ImageLayerConfig = { ...makeImageLayer('i1', 'https://cdn.example.com/i1.png'), overlayEnabled: true, overlayColor: '#ff0000' };
    const [result] = deserializePresetLayers([layer]) as ImageLayerConfig[];
    expect(result.overlayEnabled).toBe(true);
    expect(result.overlayColor).toBe('#ff0000');
  });

  it('직렬화 뒤 다시 읽어도 오버레이 설정이 유지된다', () => {
    const layer: ImageLayerConfig = { ...makeImageLayer('i1', 'blob:x'), overlayEnabled: true, overlayColor: '#00ff00' };
    const restored = deserializePresetLayers(serializePresetLayers([layer], { i1: 'https://cdn.example.com/i1.png' }));
    expect(restored[0]).toMatchObject({ overlayEnabled: true, overlayColor: '#00ff00' });
  });
});

describe('isPresetTargetType', () => {
  it.each(['badge', 'mission', 'collection', 'home_feed'])('%s는 유효한 대상 유형이다', (value) => {
    expect(isPresetTargetType(value)).toBe(true);
  });

  it('허용되지 않은 문자열은 유효하지 않다', () => {
    expect(isPresetTargetType('item_book')).toBe(false);
  });

  it('문자열이 아니면 유효하지 않다', () => {
    expect(isPresetTargetType(null)).toBe(false);
    expect(isPresetTargetType(undefined)).toBe(false);
    expect(isPresetTargetType(123)).toBe(false);
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

describe('DB 행 → AssetPreset 변환 (티켓 20260925_0239)', () => {
  const row: AssetPresetRow = {
    id: 'p1',
    name: '프리셋 A',
    target_type: 'mission',
    stage_ratio: '4:5',
    layers: [makeTextLayer('t1', 'x'), makeImageLayer('i1', 'https://cdn.example.com/i1.png')] as unknown as AssetPresetRow['layers'],
    created_by: 'admin-1',
    created_at: '2026-09-25T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
  };

  it('snake_case 컬럼을 camelCase 필드로 옮기고 텍스트 content를 비운 채 순서를 유지한다', () => {
    const preset = toAssetPreset(row);
    expect(preset).toMatchObject({
      id: 'p1',
      name: '프리셋 A',
      targetType: 'mission',
      stageRatio: '4:5',
      createdBy: 'admin-1',
      createdAt: '2026-09-25T00:00:00Z',
      updatedAt: '2026-09-26T00:00:00Z',
    });
    expect(preset.layers.map((l) => l.id)).toEqual(['t1', 'i1']);
    expect((preset.layers[0] as TextLayerConfig).content).toBe('');
  });

  it('layers가 null이면 빈 배열이다', () => {
    expect(toAssetPreset({ ...row, layers: null as unknown as AssetPresetRow['layers'] }).layers).toEqual([]);
  });

  it('요약은 id·name·stageRatio·createdAt·updatedAt만 담는다', () => {
    expect(toAssetPresetSummary(row)).toEqual({
      id: 'p1',
      name: '프리셋 A',
      stageRatio: '4:5',
      createdAt: '2026-09-25T00:00:00Z',
      updatedAt: '2026-09-26T00:00:00Z',
    });
  });
});
