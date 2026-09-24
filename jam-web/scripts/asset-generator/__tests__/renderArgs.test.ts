/**
 * asset-generator CLI — 인자 파싱 검증 (티켓 20260924_2201)
 */
import { describe, expect, it } from 'vitest';
import { parseRenderArgs } from '../renderArgs.mjs';

const OUT = '/tmp/out.png';

describe('parseRenderArgs', () => {
  it('필수 인자를 전부 주면 정상 파싱한다', () => {
    const result = parseRenderArgs(['--preset', 'p1', '--bg', '#ff0000', '--end', '#00ff00', '--text', '배지', '--out', OUT]);
    expect(result).toEqual({ preset: 'p1', bg: '#ff0000', end: '#00ff00', text: '배지', out: OUT, seed: undefined });
  });

  it('--seed를 정수로 파싱한다', () => {
    const result = parseRenderArgs([
      '--preset', 'p1', '--bg', '#ff0000', '--end', '#00ff00', '--text', '배지', '--out', OUT, '--seed', '123',
    ]);
    expect(result.seed).toBe(123);
  });

  it('--text의 리터럴 \\n을 실제 개행 문자로 바꾼다', () => {
    const result = parseRenderArgs(['--preset', 'p1', '--bg', '#ff0000', '--end', '#00ff00', '--text', '1번째줄\\n2번째줄', '--out', OUT]);
    expect(result.text).toBe('1번째줄\n2번째줄');
  });

  it('필수 인자가 없으면 누락된 것만 이름으로 안내하는 오류를 던진다', () => {
    expect(() => parseRenderArgs(['--preset', 'p1'])).toThrow('--bg, --end, --text, --out');
  });

  it('아무 인자도 없으면 전체 목록을 안내한다', () => {
    expect(() => parseRenderArgs([])).toThrow('--preset, --bg, --end, --text, --out');
  });

  it('--out이 절대 경로가 아니면 오류를 던진다', () => {
    expect(() =>
      parseRenderArgs(['--preset', 'p1', '--bg', '#ff0000', '--end', '#00ff00', '--text', '배지', '--out', 'relative.png'])
    ).toThrow('절대 경로');
  });

  it('--seed가 정수가 아니면 오류를 던진다', () => {
    expect(() =>
      parseRenderArgs(['--preset', 'p1', '--bg', '#ff0000', '--end', '#00ff00', '--text', '배지', '--out', OUT, '--seed', 'abc'])
    ).toThrow('정수');
  });

  it('음수 시드도 정수로 허용한다', () => {
    const result = parseRenderArgs([
      '--preset', 'p1', '--bg', '#ff0000', '--end', '#00ff00', '--text', '배지', '--out', OUT, '--seed', '-7',
    ]);
    expect(result.seed).toBe(-7);
  });
});
