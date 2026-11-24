// @vitest-environment node
import path from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderCollectionCover, type CoverCanvasFactory, type CoverCanvasLike } from '../render';
import { defaultTextColors, hexToRgb } from '../color';

const FONT_PATH = path.resolve(process.cwd(), 'public/fonts/sour-gummy/SourGummy-ExtraBold.ttf');
const factory = ((w: number, h: number) => createCanvas(w, h)) as unknown as CoverCanvasFactory;

beforeAll(() => {
  if (!GlobalFonts.registerFromPath(FONT_PATH, 'Sour Gummy')) throw new Error(`글꼴을 등록하지 못했어요: ${FONT_PATH}`);
});

/** 고리 모양 파란 배지(투명 여백 포함) */
function makeBadge() {
  const c = createCanvas(300, 300);
  const x = c.getContext('2d');
  x.strokeStyle = '#1e5af0';
  x.lineWidth = 30;
  x.beginPath();
  x.arc(150, 150, 100, 0, Math.PI * 2);
  x.stroke();
  return c;
}

describe('renderCollectionCover', () => {
  it('1024×1024 한 장을 예외 없이 그리고 반환값 모양이 맞다', () => {
    const canvas = createCanvas(1024, 1024);
    const r = renderCollectionCover(
      canvas as unknown as CoverCanvasLike,
      {
        titleEn: 'Alley Film Snaps',
        tribeEn: 'CLICK CREW',
        badgeImage: makeBadge() as unknown as CoverCanvasLike,
        seed: 'col-1',
        rerolls: 0,
        usedHues: [],
      },
      { createCanvas: factory }
    );
    expect(r.bgHex).toMatch(/^#[0-9a-f]{6}$/);
    expect(r.bgSource).toBe('generated');
    expect(r.relaxStep).toBe(0);
    expect(r.lineArt).toBe(false);
    expect(r.textColors.title).toBe(defaultTextColors(hexToRgb(r.bgHex)).title);
    expect(r.layout.title.lines.map((l) => l.text)).toEqual(['ALLEY FILM', 'SNAPS']);
    expect(Math.max(r.layout.badge.width, r.layout.badge.height)).toBe(450);
    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(1000);
  });

  it('배경색·글자색 지정은 생성 대신 그대로 쓴다', () => {
    const r = renderCollectionCover(
      createCanvas(1024, 1024) as unknown as CoverCanvasLike,
      {
        titleEn: 'Lonely Socks',
        tribeEn: 'THE LONERS',
        badgeImage: makeBadge() as unknown as CoverCanvasLike,
        seed: 'col-2',
        rerolls: 3,
        usedHues: [],
        bgOverride: '#112233',
        textColorOverrides: { title: '#ffffff' },
      },
      { createCanvas: factory }
    );
    expect(r.bgHex).toBe('#112233');
    expect(r.bgSource).toBe('override');
    expect(r.textColors.title).toBe('#ffffff');
    expect(r.relaxStep).toBeNull();
  });
});
