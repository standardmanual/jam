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
    expect(result.values).toEqual({ text01: '1번째줄\n2번째줄', img01: '/abs/a\\nb.png' });
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

  it('값 자리에 다른 인자가 오면 다음 인자를 삼키지 않고 오류로 멈춘다', () => {
    expect(() => parseRenderArgs([...BASE, '--text01', '--text02', '설명'])).toThrow('--text01 값이 필요해요');
    expect(() => parseRenderArgs([...BASE, '--img01', '--text01', '제목'])).toThrow('--img01 값이 필요해요');
    expect(() => parseRenderArgs(['--preset', '--bg', '#ff0000', '--end', '#00ff00', '--out', OUT])).toThrow('--preset 값이 필요해요');
    expect(() => parseRenderArgs([...BASE, '--seed', '--text01'])).toThrow('--seed 값이 필요해요');
  });

  it('마지막 인자의 값이 없으면 오류다(필수 인자 포함)', () => {
    expect(() => parseRenderArgs([...BASE, '--seed'])).toThrow('--seed 값이 필요해요');
    expect(() => parseRenderArgs(['--preset', 'p1', '--bg', '#ff0000', '--end', '#00ff00', '--out'])).toThrow('--out 값이 필요해요');
  });

  it('알 수 없는 인자(오타)는 오류로 멈춘다', () => {
    expect(() => parseRenderArgs([...BASE, '--image01', '/abs/a.png'])).toThrow('알 수 없는 인자예요: --image01');
    expect(() => parseRenderArgs([...BASE, '--txt01', '제목'])).toThrow('알 수 없는 인자예요: --txt01');
    expect(() => parseRenderArgs([...BASE, '--dry-run', 'x'])).toThrow('알 수 없는 인자예요: --dry-run');
  });

  it('빈 문자열 값은 레이어·일반 인자 모두 거절한다', () => {
    expect(() => parseRenderArgs([...BASE, '--text01', ''])).toThrow('--text01 값이 필요해요');
    expect(() => parseRenderArgs([...BASE, '--img01', ''])).toThrow('--img01 값이 필요해요');
    expect(() => parseRenderArgs(['--preset', '', '--bg', '#ff0000', '--end', '#00ff00', '--out', OUT])).toThrow('--preset 값이 필요해요');
    expect(() => parseRenderArgs([...BASE, '--seed', ''])).toThrow('--seed 값이 필요해요');
  });

  it('윤진 루틴이 쓰는 인자 조합(jam-marketer.md 3단계)은 그대로 동작한다', () => {
    const preset = '51aa4673-f723-4929-ac20-a302202b7aa7';
    const out = '/abs/jam-doc/assets/home-feed-bundles/2026-10-07-w1/image.png';
    // 제목만, 순서가 달라도, 설명 추가, 시드 추가
    expect(parseRenderArgs(['--preset', preset, '--bg', '#1a2b3c', '--end', '#ffcc00', '--text01', '이번 주 미션', '--out', out])).toEqual({
      preset, bg: '#1a2b3c', end: '#ffcc00', values: { text01: '이번 주 미션' }, out, seed: undefined,
    });
    expect(
      parseRenderArgs(['--preset', preset, '--bg', '#1a2b3c', '--end', '#ffcc00', '--text01', '이번 주 미션', '--text02', '지금 도전해 보세요', '--out', out, '--seed', '42'])
    ).toEqual({ preset, bg: '#1a2b3c', end: '#ffcc00', values: { text01: '이번 주 미션', text02: '지금 도전해 보세요' }, out, seed: 42 });
    // 공백·쉼표·# 시작·대시로 시작하는 한 글자 값(단일 대시)·숫자 값
    expect(parseRenderArgs([...BASE, '--text01', '- 핵심 요약', '--text02', '3']).values).toEqual({ text01: '- 핵심 요약', text02: '3' });
  });
});
