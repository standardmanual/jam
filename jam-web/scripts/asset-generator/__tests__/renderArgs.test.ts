/**
 * asset-generator CLI — 인자 파싱 검증 (티켓 20260924_2201, 레이어 번호 값 지정 20260927_0100)
 */
import { describe, expect, it } from 'vitest';
import { parseRenderArgs } from '../renderArgs.mjs';

const OUT = '/tmp/out.png';
const BASE = ['--preset', 'p1', '--bg', '#ff0000', '--end', '#00ff00', '--out', OUT];

describe('parseRenderArgs', () => {
  it('필수 인자만 주면 값 맵이 빈 객체로 파싱된다(텍스트 값은 필수가 아니다)', () => {
    expect(parseRenderArgs(BASE)).toEqual({ preset: 'p1', bg: '#ff0000', end: '#00ff00', values: {}, out: OUT, seed: undefined });
  });

  it('--text01·--text02·--img01을 값 맵으로 파싱한다', () => {
    const result = parseRenderArgs([...BASE, '--text01', '제목', '--img01', '/abs/a.png', '--text02', '설명']);
    expect(result.values).toEqual({ text01: '제목', text02: '설명', img01: '/abs/a.png' });
  });

  it('두 자리 이상 번호(--text12)도 받는다', () => {
    expect(parseRenderArgs([...BASE, '--text12', '열두째']).values).toEqual({ text12: '열두째' });
  });

  it('--seed를 정수로 파싱한다', () => {
    expect(parseRenderArgs([...BASE, '--seed', '123']).seed).toBe(123);
  });

  it('음수 시드도 정수로 허용한다', () => {
    expect(parseRenderArgs([...BASE, '--seed', '-7']).seed).toBe(-7);
  });

  it('텍스트 번호의 리터럴 \\n을 개행으로 바꾸고 이미지 값은 그대로 둔다', () => {
    const result = parseRenderArgs([...BASE, '--text01', '1번째줄\\n2번째줄', '--img01', '/abs/a\\nb.png']);
    expect(result.values.text01).toBe('1번째줄\n2번째줄');
    expect(result.values.img01).toBe('/abs/a\\nb.png');
  });

  it('필수 인자가 없으면 누락된 것만 이름으로 안내한다(--text는 필수 목록에 없다)', () => {
    expect(() => parseRenderArgs(['--preset', 'p1'])).toThrow('--bg, --end, --out');
  });

  it('아무 인자도 없으면 전체 목록을 안내한다', () => {
    expect(() => parseRenderArgs([])).toThrow('다음 인자가 필요해요: --preset, --bg, --end, --out');
  });

  it('옛 인자 --text·--subtext는 새 인자 이름을 안내하는 오류다', () => {
    expect(() => parseRenderArgs([...BASE, '--text', '배지'])).toThrow('--text·--subtext는 없어졌어요. 레이어 번호로 지정해 주세요: --text01, --text02');
    expect(() => parseRenderArgs([...BASE, '--text01', '제목', '--subtext', '설명'])).toThrow('없어졌어요');
    // 필수 인자가 빠져도 옛 인자 안내가 먼저 나온다
    expect(() => parseRenderArgs(['--text', '배지'])).toThrow('없어졌어요');
  });

  it('형식이 틀린 번호(text1·text001·Text01·img00)는 형식 오류다', () => {
    for (const flag of ['--text1', '--text001', '--Text01', '--img00', '--IMG01']) {
      expect(() => parseRenderArgs([...BASE, flag, '값'])).toThrow('번호 형식이 올바르지 않아요(예: text01)');
    }
  });

  it('같은 번호를 두 번 주면 오류다', () => {
    expect(() => parseRenderArgs([...BASE, '--text01', 'a', '--text01', 'b'])).toThrow('같은 번호를 두 번 지정했어요: text01');
  });

  it('번호 인자에 값이 없으면 오류다', () => {
    expect(() => parseRenderArgs([...BASE, '--img01'])).toThrow('--img01 값이 필요해요');
  });

  it('--out이 절대 경로가 아니면 오류를 던진다', () => {
    expect(() => parseRenderArgs(['--preset', 'p1', '--bg', '#ff0000', '--end', '#00ff00', '--out', 'relative.png'])).toThrow('절대 경로');
  });

  it('--seed가 정수가 아니면 오류를 던진다', () => {
    expect(() => parseRenderArgs([...BASE, '--seed', 'abc'])).toThrow('정수');
  });
});
