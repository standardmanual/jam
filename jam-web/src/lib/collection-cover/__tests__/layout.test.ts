// @vitest-environment node
import path from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';
import { layoutBottom, layoutTitle, placeBadge, type MeasureFn } from '../layout';

const FONT_PATH = path.resolve(process.cwd(), 'public/fonts/sour-gummy/SourGummy-ExtraBold.ttf');
let measure: MeasureFn;

beforeAll(() => {
  if (!GlobalFonts.registerFromPath(FONT_PATH, 'Sour Gummy')) throw new Error(`글꼴을 등록하지 못했어요: ${FONT_PATH}`);
  const ctx = createCanvas(10, 10).getContext('2d');
  measure = (text, px) => {
    ctx.font = `${px}px "Sour Gummy"`;
    ctx.textAlign = 'left';
    const m = ctx.measureText(text);
    return {
      left: m.actualBoundingBoxLeft,
      right: m.actualBoundingBoxRight,
      ascent: m.actualBoundingBoxAscent,
      descent: m.actualBoundingBoxDescent,
    };
  };
});

describe('layoutTitle', () => {
  const cases: Array<[string, string[]]> = [
    ['Alley Film Snaps', ['ALLEY FILM', 'SNAPS']],
    ['Midnight Snack Chasers', ['MIDNIGHT', 'SNACK', 'CHASERS']],
    ['Analog Mixtape', ['ANALOG', 'MIXTAPE']],
    ['Lonely Socks', ['LONELY', 'SOCKS']],
    ['The Stationery Box', ['THE', 'STATIONERY', 'BOX']],
  ];
  it.each(cases)('%s의 줄 나눔과 가장 긴 줄 폭', (title, expected) => {
    const l = layoutTitle(measure, title);
    expect(l.lines.map((x) => x.text)).toEqual(expected);
    expect(l.inkWidthRatio).toBeGreaterThanOrEqual(0.895);
    expect(l.inkWidthRatio).toBeLessThanOrEqual(0.905);
  });

  it('단어가 많은 긴 제목도 3줄 상한 가지치기로 빠르게 계산한다', () => {
    const words = Array.from({ length: 14 }, (_, i) => `W${i + 1}`).join(' ');
    const l = layoutTitle(measure, words);
    expect(l.lines.length).toBeLessThanOrEqual(3);
    expect(l.lines.map((x) => x.text).join(' ')).toBe(words);
  });
});

describe('layoutBottom·placeBadge', () => {
  it('트라이브 이름은 가로 90%를 넘지 않고 JOIN 기준선은 H−64', () => {
    const b = layoutBottom(measure, 'PINE TREE GENERAL STORE');
    expect(b.joinY).toBe(1024 - 64);
    const m = measure('PINE TREE GENERAL STORE', b.tribePx);
    expect((m.left + m.right) / 1024).toBeLessThanOrEqual(0.9005);
    expect(b.tribeY).toBeLessThan(b.joinY);
  });

  it('배지는 긴 변 450, 공간이 모자라면 하단 글씨 위에 붙어 제목을 가린다', () => {
    const roomy = placeBadge(200, 100, 300, 900);
    expect(Math.max(roomy.width, roomy.height)).toBe(450);
    expect(roomy.overlapsTitle).toBe(false);
    const tight = placeBadge(100, 100, 500, 800);
    expect(tight.y).toBe(800 - 36 - tight.height);
    expect(tight.overlapsTitle).toBe(true);
  });
});
