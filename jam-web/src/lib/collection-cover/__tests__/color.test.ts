import { describe, expect, it } from 'vitest';
import {
  C_MIN,
  INK_HEX,
  contrastRatio,
  coverSeed,
  defaultTextColors,
  generateBackground,
  hexToRgb,
  hueDist,
  peakChroma,
  srgbToOklab,
  maxChroma,
} from '../color';

const badge = { okHue: 200, lineArt: false };

describe('generateBackground', () => {
  it('같은 시드면 같은 배경색, 다시 뽑기 횟수가 다르면 다른 색', () => {
    const a = generateBackground({ seed: coverSeed('c1', 0), badge, usedColors: [] });
    const b = generateBackground({ seed: coverSeed('c1', 0), badge, usedColors: [] });
    const c = generateBackground({ seed: coverSeed('c1', 1), badge, usedColors: [] });
    expect(b.hex).toBe(a.hex);
    expect(c.hex).not.toBe(a.hex);
  });

  it('생성 색은 채도·대비·배지 색상 간격 조건을 지킨다', () => {
    for (let i = 0; i < 60; i++) {
      const okHue = (i * 37) % 360;
      const lineArt = i % 5 === 0;
      const bg = generateBackground({ seed: coverSeed(`col-${i}`, i % 3), badge: { okHue: lineArt ? null : okHue, lineArt }, usedColors: [] });
      expect(bg.oklch.C).toBeGreaterThanOrEqual(Math.min(C_MIN, 0.85 * peakChroma(bg.oklch.h)) - 1e-9);
      const title = hexToRgb(defaultTextColors(bg.rgb).title);
      expect(contrastRatio(bg.rgb, title)).toBeGreaterThanOrEqual(lineArt ? 4.5 : 4);
      if (!lineArt && bg.relaxStep === 0) expect(hueDist(bg.oklch.h, okHue)).toBeGreaterThanOrEqual(70);
    }
  });

  const sample = (lineArt: boolean) =>
    Array.from({ length: 200 }, (_, i) => generateBackground({ seed: coverSeed(`s-${i}`, i % 4), badge: { okHue: lineArt ? null : (i * 29) % 360, lineArt }, usedColors: [] }));

  it('표본 200개에 어두운 배경·흰 제목, 넓은 밝기·채도 범위가 나온다', () => {
    const bgs = sample(false);
    expect(bgs.some((b) => defaultTextColors(b.rgb).title === '#ffffff' && b.oklch.L < 0.5)).toBe(true);
    expect(bgs.some((b) => b.oklch.L < 0.5)).toBe(true);
    expect(bgs.some((b) => b.oklch.L > 0.8)).toBe(true);
    expect(bgs.some((b) => b.oklch.C < maxChroma(b.oklch.L, b.oklch.h) * 0.9)).toBe(true);
  });

  it('선화 배지는 모두 검정 제목·대비 4.5 이상', () => {
    for (const b of sample(true)) {
      expect(defaultTextColors(b.rgb).title).toBe(INK_HEX);
      expect(contrastRatio(b.rgb, hexToRgb(INK_HEX))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('시드 120개에서 색상 여섯 구간이 모두 나온다', () => {
    const bins = new Set<number>();
    for (let i = 0; i < 120; i++) {
      const bg = generateBackground({ seed: coverSeed(`hue-${i}`, 0), badge: { okHue: null, lineArt: false }, usedColors: [] });
      bins.add(Math.min(5, Math.floor(bg.oklch.h / 60)));
    }
    expect(bins.size).toBe(6);
  });

  const used14 = ['#e38502', '#de7416', '#daa3ff', '#d2df25', '#409c63', '#c6fb65', '#8195a2', '#8a5314', '#f31cb5', '#fdc17c', '#7d1b98', '#f5c222', '#e41111', '#99fff3'];

  it('적용한 14색을 피하고(색 거리 0.08 이상), 배지 주황일 때 색상 구간이 세 곳 이상 나온다', () => {
    const usedLabs = used14.map((c) => srgbToOklab(hexToRgb(c)));
    const bins = new Set<number>();
    for (let i = 0; i < 24; i++) {
      const bg = generateBackground({ seed: coverSeed('snap', i), badge: { okHue: 60, lineArt: false }, usedColors: used14 });
      bins.add(Math.floor(bg.oklch.h / 60));
      if (bg.relaxStep === 0) {
        const lab = srgbToOklab(bg.rgb);
        for (const u of usedLabs) expect(Math.hypot(lab[0] - u[0], lab[1] - u[1], lab[2] - u[2])).toBeGreaterThanOrEqual(0.08);
      }
    }
    expect(bins.size).toBeGreaterThanOrEqual(3);
  });

  it('피할 색이 있어도 같은 시드는 같은 색', () => {
    const args = { seed: 'y#3', badge, usedColors: used14 };
    expect(generateBackground(args).hex).toBe(generateBackground(args).hex);
  });
});

describe('defaultTextColors', () => {
  it('제목: 어두운 남색은 흰색, 밝은 노랑은 검정', () => {
    expect(defaultTextColors(hexToRgb('#1a2a6c')).title).toBe('#ffffff');
    expect(defaultTextColors(hexToRgb('#ffe36a')).title).toBe(INK_HEX);
  });

  it('하단 흰 글씨는 대비 3 이상일 때만', () => {
    for (const hex of ['#f0281e', '#2a62ff', '#ffc21a', '#f7f2e7', '#b9bbc6']) {
      const rgb = hexToRgb(hex);
      const t = defaultTextColors(rgb);
      if (t.tribe === '#ffffff') expect(contrastRatio([255, 255, 255], rgb)).toBeGreaterThanOrEqual(3);
      else expect(contrastRatio([255, 255, 255], rgb)).toBeLessThan(3);
      expect(t.join).toBe(t.tribe);
    }
  });
});

describe('maxChroma·peakChroma', () => {
  it('최대 채도는 양수, 최고 채도는 어느 밝기의 최대 채도보다 작지 않다', () => {
    expect(maxChroma(0.6, 30)).toBeGreaterThan(0.15);
    expect(peakChroma(30)).toBeGreaterThanOrEqual(maxChroma(0.6, 30));
  });
});
