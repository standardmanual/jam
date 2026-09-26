/**
 * 홈피드 카드 색 대비 계산 검증 (티켓 20260926_1544)
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio, judgeWhiteText, parseContrastArgs, parseHexColor } from '../contrastMath.mjs';

describe('judgeWhiteText', () => {
  it('지난 시험 실행의 값을 소수 둘째 자리까지 재현한다', () => {
    expect(judgeWhiteText('#8a5a2e')).toEqual({ color: '#8a5a2e', ratio: 5.86, large: true, normal: true });
    expect(judgeWhiteText('#3d2812')).toEqual({ color: '#3d2812', ratio: 13.9, large: true, normal: true });
  });

  it('검정은 21:1, 흰색은 1:1이다', () => {
    expect(judgeWhiteText('#000000').ratio).toBe(21);
    expect(judgeWhiteText('#ffffff')).toEqual({ color: '#ffffff', ratio: 1, large: false, normal: false });
  });

  it('큰 글자만 통과하는 구간(3 이상 4.5 미만)을 구분한다', () => {
    // #949494 위 흰 글자는 약 3.03:1이다.
    const result = judgeWhiteText('#949494');
    expect(result.ratio).toBeGreaterThanOrEqual(3);
    expect(result.ratio).toBeLessThan(4.5);
    expect(result).toMatchObject({ large: true, normal: false });
  });

  it('기준 미달 색은 둘 다 실패한다', () => {
    expect(judgeWhiteText('#ffe08a')).toMatchObject({ large: false, normal: false });
  });
});

describe('contrastRatio', () => {
  it('두 색의 순서와 무관하다', () => {
    expect(contrastRatio('#8a5a2e', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#8a5a2e'), 10);
  });
});

describe('parseHexColor', () => {
  it('대소문자 6자리 hex를 파싱한다', () => {
    expect(parseHexColor('#FF1a00')).toEqual([255, 26, 0]);
  });

  it.each(['ff1a00', '#fff', '#ff1a0', '#gg1a00', '', undefined, 123])('형식이 다르면 던진다: %s', (value) => {
    expect(() => parseHexColor(value as string)).toThrow('#rrggbb 형식');
  });
});

describe('parseContrastArgs', () => {
  it('--bg·--end를 파싱한다', () => {
    expect(parseContrastArgs(['--bg', '#8a5a2e', '--end', '#3d2812'])).toEqual({ bg: '#8a5a2e', end: '#3d2812' });
  });

  it('필수 인자가 빠지면 어떤 인자인지 알려 준다', () => {
    expect(() => parseContrastArgs(['--bg', '#8a5a2e'])).toThrow('다음 인자가 필요해요: --end');
    expect(() => parseContrastArgs([])).toThrow('다음 인자가 필요해요: --bg, --end');
  });

  it('색 형식이 틀리면 던진다', () => {
    expect(() => parseContrastArgs(['--bg', 'red', '--end', '#3d2812'])).toThrow('#rrggbb 형식');
  });

  it('알 수 없는 인자와 값 없는 토큰을 거절한다', () => {
    expect(() => parseContrastArgs(['--bg', '#8a5a2e', '--end', '#3d2812', '--foo', '1'])).toThrow('알 수 없는 인자예요: --foo');
    expect(() => parseContrastArgs(['#8a5a2e'])).toThrow('인자 형식이 올바르지 않아요');
  });
});
