/**
 * layerKeys — 레이어 번호 규칙 (티켓 20260927_0013)
 * 실행: cd jam-web && npx vitest run src/lib/asset-generator/__tests__/layerKeys.test.ts
 */
import { describe, it, expect } from 'vitest';
import { formatLayerKey, getLayerKeys, parseLayerKey, type OverlayLayerConfig } from '..';

/** 번호 계산은 type·id만 본다 — 나머지 필드는 테스트에서 의미가 없어 최소로만 채운다. */
function layer(type: 'image' | 'text', id: string): OverlayLayerConfig {
  return { type, id } as OverlayLayerConfig;
}

describe('getLayerKeys', () => {
  it('이미지·텍스트가 섞인 배열에서 종류별로 01부터 배열 순서대로 번호를 붙인다', () => {
    const keys = getLayerKeys([layer('image', 'a'), layer('text', 'b'), layer('text', 'c'), layer('text', 'd'), layer('image', 'e')]);
    expect(keys.map((k) => k.key)).toEqual(['img01', 'text01', 'text02', 'text03', 'img02']);
    expect(keys.map((k) => k.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(keys.map((k) => k.type)).toEqual(['image', 'text', 'text', 'text', 'image']);
  });

  it('순서를 바꾸면 번호가 다시 매겨진다', () => {
    const keys = getLayerKeys([layer('text', 'b'), layer('image', 'a'), layer('text', 'c')]);
    expect(keys.find((k) => k.id === 'c')?.key).toBe('text02');
    const swapped = getLayerKeys([layer('text', 'c'), layer('image', 'a'), layer('text', 'b')]);
    expect(swapped.find((k) => k.id === 'c')?.key).toBe('text01');
    expect(swapped.find((k) => k.id === 'b')?.key).toBe('text02');
  });

  it('레이어가 없으면 빈 결과다', () => {
    expect(getLayerKeys([])).toEqual([]);
  });
});

describe('formatLayerKey', () => {
  it('두 자리로 채우고 두 자리 이상은 그대로 쓴다', () => {
    expect(formatLayerKey('text', 1)).toBe('text01');
    expect(formatLayerKey('image', 12)).toBe('img12');
    expect(formatLayerKey('text', 100)).toBe('text100');
  });
});

describe('parseLayerKey', () => {
  it('정상값을 종류와 번호로 해석한다', () => {
    expect(parseLayerKey('text01')).toEqual({ type: 'text', n: 1 });
    expect(parseLayerKey('img12')).toEqual({ type: 'image', n: 12 });
  });

  it('형식이 맞지 않으면 null이다', () => {
    expect(parseLayerKey('text1')).toBeNull();
    expect(parseLayerKey('Text01')).toBeNull();
    expect(parseLayerKey('img00')).toBeNull();
    expect(parseLayerKey('foo')).toBeNull();
    expect(parseLayerKey('')).toBeNull();
  });
});
