/**
 * asset-generator CLI — 텍스트 레이어 채우기 순서 규칙·오류 처리 검증 (티켓 20260926_1208)
 */
import { describe, expect, it } from 'vitest';
import { fillTextLayers } from '../fillTextLayers.mjs';

const image = { type: 'image', assetUrl: 'https://x.test/a.png' };
const textLayer = (yPct: number) => ({ type: 'text', font: 'Noto Sans KR', yPct, content: '' });

describe('fillTextLayers', () => {
  it('텍스트 레이어 2개는 배열 순서대로 1번째 ← text, 2번째 ← subtext로 채운다(이미지 레이어는 그대로)', () => {
    const layers = [textLayer(31), image, textLayer(41)];
    const filled = fillTextLayers(layers, { text: '제목', subtext: '설명' });
    expect(filled.map((l: { content?: string }) => l.content)).toEqual(['제목', undefined, '설명']);
    expect(filled[1]).toBe(layers[1]);
    // 원본 레이어는 바꾸지 않는다
    expect(layers[0]).toHaveProperty('content', '');
  });

  it('프리셋에 저장된 content가 있어도 text·subtext로 덮어쓴다', () => {
    const stored = (yPct: number, content: string) => ({ ...textLayer(yPct), content });
    const layers = [stored(31, '저장된 제목'), stored(41, '저장된 설명')];
    const filled = fillTextLayers(layers, { text: '제목', subtext: '설명' });
    expect(filled.map((l: { content?: string }) => l.content)).toEqual(['제목', '설명']);
    expect(layers[0].content).toBe('저장된 제목');
  });

  it('텍스트 레이어 1개(배지·미션)는 지금처럼 text만 쓴다', () => {
    const filled = fillTextLayers([image, textLayer(50)], { text: '배지 이름', subtext: undefined });
    expect(filled.map((l: { content?: string }) => l.content)).toEqual([undefined, '배지 이름']);
  });

  it('텍스트 레이어 2개인데 subtext가 없으면 조용히 채우지 않고 오류를 던진다', () => {
    expect(() => fillTextLayers([textLayer(31), textLayer(41)], { text: '제목', subtext: undefined })).toThrow(
      '텍스트 레이어가 2개예요. --subtext로 두 번째 문구도 넣어 주세요'
    );
  });

  it('텍스트 레이어 1개인데 subtext가 있으면 값이 버려지지 않게 오류를 던진다', () => {
    expect(() => fillTextLayers([textLayer(50)], { text: '제목', subtext: '설명' })).toThrow('--subtext');
  });

  it('텍스트 레이어 3개는 1번째 ← text, 2번째 ← subtext로 채우고 3번째는 저장된 글자를 그대로 둔다', () => {
    const stored = (yPct: number, content: string) => ({ ...textLayer(yPct), content });
    const layers = [stored(10, '저장1'), image, stored(20, '저장2'), stored(30, 'MISSION')];
    const filled = fillTextLayers(layers, { text: '조건', subtext: '미션 이름' });
    expect(filled.map((l: { content?: string }) => l.content)).toEqual(['조건', undefined, '미션 이름', 'MISSION']);
    expect(filled[3]).toBe(layers[3]);
  });

  it('텍스트 레이어 3개 이상인데 subtext가 없으면 오류를 던진다', () => {
    expect(() => fillTextLayers([textLayer(10), textLayer(20), textLayer(30)], { text: 'a', subtext: undefined })).toThrow(
      '텍스트 레이어가 3개예요. --subtext로 두 번째 문구도 넣어 주세요'
    );
  });

  it('텍스트 레이어가 없는 프리셋에 text만 오면 값을 무시한다(기존 동작)', () => {
    const layers = [image];
    expect(fillTextLayers(layers, { text: '무시', subtext: undefined })).toEqual(layers);
  });

  it('텍스트 레이어가 없는 프리셋에 subtext가 오면 오류를 던진다', () => {
    expect(() => fillTextLayers([image], { text: 'a', subtext: 'b' })).toThrow('--subtext');
  });
});
