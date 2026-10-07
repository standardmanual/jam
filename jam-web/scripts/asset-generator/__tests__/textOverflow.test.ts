/**
 * asset-generator 텍스트 오른쪽 여백 넘침 검사 — 실제 캔버스 경계 검증 (티켓 20260926_2346, 경계 보강 20261007_1600)
 */
import { describe, expect, it } from 'vitest';
import { createTextOverflowDetector } from '../textOverflow.mjs';

const textLayer = (extra: Record<string, unknown> = {}) => ({
  type: 'text', id: 't1', content: '기본', font: { family: 'system-ui', weight: 400 }, sizePct: 10, letterSpacing: 0, lineHeight: 1.2,
  align: 'left', color: '#000000', xPct: 5, yPct: 50, rotationDeg: 0, opacityPct: 100, ...extra,
});
const imageLayer = { type: 'image', id: 'i1', assetUrl: 'https://x.test/a.png', xPct: 50, yPct: 50, widthPct: 50, rotationDeg: 0, opacityPct: 100 };

const preset = (layers: unknown[]) => ({ id: 'p1', stageRatio: '1:1', layers });
const run = (layers: unknown[], values: Record<string, string> = {}) =>
  createTextOverflowDetector(async () => preset(layers))({ presetId: 'p1', values });

describe('createTextOverflowDetector', () => {
  it('왼쪽에서 시작하는 짧은 글자는 여백에 닿지 않는다', async () => {
    expect(await run([textLayer()])).toBe(false);
  });

  it('값으로 긴 글자를 넣으면 오른쪽 여백(가로 3%)에 닿아 넘침으로 본다', async () => {
    expect(await run([textLayer()], { text01: '아주아주아주아주아주아주아주아주아주 긴 문구가 이어집니다 아주아주' })).toBe(true);
  });

  it('가운데 정렬이어도 너무 길면 여백을 넘는다', async () => {
    expect(await run([textLayer({ align: 'center', xPct: 50 })], { text01: '아주아주아주아주아주아주아주아주아주아주아주아주아주아주 긴 문구' })).toBe(true);
  });

  it('글자 시작 위치가 오른쪽 끝(xPct 98)이면 짧은 글자도 여백에 닿는다', async () => {
    expect(await run([textLayer({ xPct: 98 })], { text01: '가나다' })).toBe(true);
  });

  it('빈 문자열 값은 그릴 글자가 없어 넘치지 않는다', async () => {
    expect(await run([textLayer()], { text01: '' })).toBe(false);
  });

  it('이미지 레이어는 그리지 않아 검사에 영향이 없다', async () => {
    expect(await run([imageLayer, textLayer()])).toBe(false);
    expect(await run([imageLayer])).toBe(false);
  });

  it('프리셋에 없는 번호를 주면 오류다', async () => {
    await expect(run([textLayer()], { text05: 'x' })).rejects.toThrow('이 프리셋에 없는 번호예요');
  });
});
