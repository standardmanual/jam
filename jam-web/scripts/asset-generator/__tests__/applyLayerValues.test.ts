/**
 * asset-generator CLI — 레이어 번호로 값 지정 검증 (티켓 20260927_0100)
 */
import { describe, expect, it } from 'vitest';
import { applyLayerValues, buildLayerValues, isImageSourceFormat } from '../applyLayerValues.mjs';

const text = (id: string, content: string) => ({ id, type: 'text', font: 'Noto Sans KR', content });
const image = (id: string) => ({ id, type: 'image', assetUrl: 'https://x.test/saved.png', xPct: 10, yPct: 20, widthPct: 30, rotationDeg: 5, opacityPct: 80 });

// 목록 순서: text01, img01, text02, text03
const layers = [text('a', '저장1'), image('b'), text('c', '저장2'), text('d', 'MISSION')];
const content = (l: { content?: string }) => l.content;

describe('applyLayerValues', () => {
  it('지정한 텍스트 번호는 글자를 바꾸고 나머지는 저장된 값을 유지한다', () => {
    const result = applyLayerValues(layers, { text01: '제목', text02: '설명' });
    expect(result.layers.map(content)).toEqual(['제목', undefined, '설명', 'MISSION']);
    expect(result.layers[1]).toBe(layers[1]);
    expect(result.layers[3]).toBe(layers[3]);
    expect(result.applied).toEqual(['text01', 'text02']);
    expect(result.saved).toEqual(['img01', 'text03']);
    // 원본은 바꾸지 않는다
    expect(layers[0]).toHaveProperty('content', '저장1');
  });

  it('이미지 번호는 원본만 바꾸고 위치·크기·회전·불투명도는 프리셋 값을 유지한다', () => {
    const result = applyLayerValues(layers, { img01: '/abs/new.png' });
    expect(result.layers[1]).toEqual({ ...layers[1], assetUrl: '/abs/new.png' });
    expect(result.applied).toEqual(['img01']);
    expect(result.saved).toEqual(['text01', 'text02', 'text03']);
    expect(layers[1]).toHaveProperty('assetUrl', 'https://x.test/saved.png');
  });

  it('http(s) URL도 이미지 값으로 받는다', () => {
    const result = applyLayerValues(layers, { img01: 'https://cdn.test/a.svg' });
    expect(result.layers[1]).toHaveProperty('assetUrl', 'https://cdn.test/a.svg');
  });

  it('값을 하나도 지정하지 않으면 전부 저장된 값이다', () => {
    const result = applyLayerValues(layers, {});
    expect(result.layers).toEqual(layers);
    expect(result.applied).toEqual([]);
    expect(result.saved).toEqual(['text01', 'img01', 'text02', 'text03']);
  });

  it('같은 종류 안에서 목록 순서가 번호를 정한다(이미지 사이에 낀 텍스트도 종류별로 센다)', () => {
    const mixed = [image('i1'), text('t1', 'a'), image('i2'), text('t2', 'b')];
    const result = applyLayerValues(mixed, { img02: '/abs/2.png', text02: '둘째' });
    expect(result.layers[2]).toHaveProperty('assetUrl', '/abs/2.png');
    expect(result.layers[3]).toHaveProperty('content', '둘째');
    expect(result.layers[0]).toBe(mixed[0]);
  });

  it('프리셋에 없는 번호는 있는 번호 목록을 담은 오류다', () => {
    expect(() => applyLayerValues(layers, { text05: 'x' })).toThrow(
      '이 프리셋에 없는 번호예요: text05. 있는 번호: img01, text01, text02, text03'
    );
    expect(() => applyLayerValues(layers, { img02: '/abs/a.png', text04: 'x' })).toThrow('없는 번호예요: img02, text04');
  });

  it.each(['text1', 'text001', 'Text01', 'img00', 'text00', 'image01', 'text'])('형식이 틀린 번호(%s)는 형식 오류다', (key) => {
    expect(() => applyLayerValues(layers, { [key]: 'x' })).toThrow('번호 형식이 올바르지 않아요(예: text01)');
  });

  it.each(['text0', 'text00', 'text-1', 'text1.5', 'text01.5', 'img-01', 'img0', 'text 01', ' text01', 'text01 '])(
    '번호 경계: %s는 형식 오류다(0·음수·소수·공백)',
    (key) => {
      expect(() => applyLayerValues(layers, { [key]: 'x' })).toThrow('번호 형식이 올바르지 않아요(예: text01)');
    }
  );

  it('번호 경계: 형식은 맞아도 프리셋 범위를 넘으면(text04·text99·text100·img02) 없는 번호 오류다', () => {
    for (const key of ['text04', 'text99', 'text100']) {
      expect(() => applyLayerValues(layers, { [key]: 'x' })).toThrow(`이 프리셋에 없는 번호예요: ${key}`);
    }
    expect(() => applyLayerValues(layers, { img02: '/abs/a.png' })).toThrow('이 프리셋에 없는 번호예요: img02');
  });

  it('번호 경계: 마지막 번호(text03)와 첫 번호(text01)는 범위 안이다', () => {
    const result = applyLayerValues(layers, { text01: 'a', text03: 'c' });
    expect(result.applied).toEqual(['text01', 'text03']);
  });

  it('값이 문자열이 아니면 오류다', () => {
    expect(() => applyLayerValues(layers, { text01: 5 as unknown as string })).toThrow('text01의 값은 문자열이어야 해요');
  });

  it('이미지 값이 절대 경로도 URL도 아니면 오류다', () => {
    expect(() => applyLayerValues(layers, { img01: 'relative/a.png' })).toThrow('절대 경로 또는 http(s) URL');
    expect(() => applyLayerValues(layers, { img01: 'ftp://x.test/a.png' })).toThrow('절대 경로 또는 http(s) URL');
  });

  it('레이어가 없는 프리셋에 번호를 주면 있는 번호가 없다고 알린다', () => {
    expect(() => applyLayerValues([], { text01: 'x' })).toThrow('있는 번호: (없음)');
  });
});

describe('buildLayerValues', () => {
  it('텍스트 번호의 리터럴 \\n을 개행으로 바꾸고 이미지 값은 그대로 둔다', () => {
    expect(buildLayerValues([['text01', '1줄\\n2줄'], ['img01', '/abs/a.png']])).toEqual({ text01: '1줄\n2줄', img01: '/abs/a.png' });
  });

  it('같은 번호를 두 번 지정하면 오류다', () => {
    expect(() => buildLayerValues([['text01', 'a'], ['text01', 'b']])).toThrow('같은 번호를 두 번 지정했어요: text01');
  });

  it('형식이 틀린 번호는 형식 오류다', () => {
    expect(() => buildLayerValues([['text1', 'a']])).toThrow('번호 형식이 올바르지 않아요(예: text01): text1');
    expect(() => buildLayerValues([['Text01', 'a']])).toThrow('번호 형식이 올바르지 않아요');
    expect(() => buildLayerValues([['img00', '/a.png']])).toThrow('번호 형식이 올바르지 않아요');
  });
});

describe('isImageSourceFormat', () => {
  it('절대 경로와 http(s) URL만 참이다', () => {
    expect(isImageSourceFormat('/a/b.png')).toBe(true);
    expect(isImageSourceFormat('https://x.test/a.png')).toBe(true);
    expect(isImageSourceFormat('http://x.test/a.png')).toBe(true);
    expect(isImageSourceFormat('a.png')).toBe(false);
    expect(isImageSourceFormat('file:///a.png')).toBe(false);
  });
});
