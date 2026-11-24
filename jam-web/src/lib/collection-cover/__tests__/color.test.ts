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
  hueOfHex,
  maxChroma,
} from '../color';

const badge = { okHue: 200, lineArt: false };

describe('generateBackground', () => {
  it('같은 시드면 같은 배경색, 다시 뽑기 횟수가 다르면 다른 색', () => {
    const a = generateBackground({ seed: coverSeed('c1', 0), badge, usedHues: [] });
    const b = generateBackground({ seed: coverSeed('c1', 0), badge, usedHues: [] });
    const c = generateBackground({ seed: coverSeed('c1', 1), badge, usedHues: [] });
    expect(b.hex).toBe(a.hex);
    expect(c.hex).not.toBe(a.hex);
  });

  it('생성 색은 채도·대비·배지 색상 간격 조건을 지킨다', () => {
    for (let i = 0; i < 60; i++) {
      const okHue = (i * 37) % 360;
      const lineArt = i % 5 === 0;
      const bg = generateBackground({ seed: coverSeed(`col-${i}`, i % 3), badge: { okHue: lineArt ? null : okHue, lineArt }, usedHues: [(i * 53) % 360] });
      expect(bg.oklch.C).toBeGreaterThanOrEqual(C_MIN);
      expect(contrastRatio(bg.rgb, hexToRgb(INK_HEX))).toBeGreaterThanOrEqual(lineArt ? 4.5 : 4);
      if (!lineArt && bg.relaxStep === 0) expect(hueDist(bg.oklch.h, okHue)).toBeGreaterThanOrEqual(70);
    }
  });

  it('다른 컬렉션 색상과 30° 이상 떨어진다(완화 없이 찾은 경우)', () => {
    const bg = generateBackground({ seed: 'x#0', badge, usedHues: [10, 120, 250] });
    if (bg.relaxStep === 0) for (const u of [10, 120, 250]) expect(hueDist(bg.oklch.h, u)).toBeGreaterThanOrEqual(30);
  });
});

describe('defaultTextColors', () => {
  it('제목은 항상 잉크색, 하단 흰 글씨는 대비 3 이상일 때만', () => {
    for (const hex of ['#f0281e', '#2a62ff', '#ffc21a', '#f7f2e7', '#b9bbc6']) {
      const rgb = hexToRgb(hex);
      const t = defaultTextColors(rgb);
      expect(t.title).toBe(INK_HEX);
      if (t.tribe === '#ffffff') expect(contrastRatio([255, 255, 255], rgb)).toBeGreaterThanOrEqual(3);
      else expect(contrastRatio([255, 255, 255], rgb)).toBeLessThan(3);
      expect(t.join).toBe(t.tribe);
    }
  });
});

describe('hueOfHex·maxChroma', () => {
  it('붉은색은 OKLCH 색상각 약 29°, 최대 채도는 양수', () => {
    expect(hueOfHex('#ff0000')).toBeGreaterThan(25);
    expect(hueOfHex('#ff0000')).toBeLessThan(35);
    expect(maxChroma(0.6, 30)).toBeGreaterThan(0.15);
  });
});
