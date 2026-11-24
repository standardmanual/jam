// @vitest-environment node
import path from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createCoverRenderer,
  prepareCoverBadge,
  renderCollectionCover,
  type CoverCanvasFactory,
  type CoverCanvasLike,
} from '../render';
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
        usedColors: [],
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
        usedColors: [],
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

describe('prepareCoverBadge · createCoverRenderer (캐시 재사용)', () => {
  it('투명 픽셀뿐인 배지는 예외를 낸다', () => {
    const empty = createCanvas(32, 32) as unknown as CoverCanvasLike;
    expect(() => prepareCoverBadge(empty, factory)).toThrow('대표 배지에 보이는 픽셀이 없어요');
  });

  it('색을 여러 번 바꿔 그려도 grain: skip 동안 새 캔버스 할당과 getImageData가 발생하지 않는다', () => {
    const preparedBadge = prepareCoverBadge(makeBadge() as unknown as CoverCanvasLike, factory);
    let createdCount = 0;
    let getImageDataCount = 0;
    const trackedFactory: CoverCanvasFactory = (w, h) => {
      createdCount++;
      const real = createCanvas(w, h);
      const ctx = real.getContext('2d');
      const origGetImageData = ctx.getImageData.bind(ctx);
      vi.spyOn(ctx, 'getImageData').mockImplementation((...args) => {
        getImageDataCount++;
        return origGetImageData(...args);
      });
      return real as unknown as CoverCanvasLike;
    };

    const renderer = createCoverRenderer({ createCanvas: trackedFactory });
    const target = createCanvas(1024, 1024);
    const targetCtx = target.getContext('2d');
    const targetGetImageData = vi.spyOn(targetCtx, 'getImageData');
    const base = {
      titleEn: 'ALLEY FILM SNAPS',
      tribeEn: 'CLICK CREW',
      preparedBadge,
      bgHex: '#224466',
      bgSource: 'override' as const,
      relaxStep: null,
      textColors: { title: '#ffffff', tribe: '#ffffff', join: '#ffffff' },
    };

    // 첫 경량 프레임: 내부 버퍼(mottle, shade, bgSnap, haloScratch) 4개만 생성, getImageData 0회
    renderer.render(target as unknown as CoverCanvasLike, { ...base, grain: 'skip' });
    const afterFirstCreated = createdCount;
    expect(afterFirstCreated).toBe(4);
    expect(getImageDataCount).toBe(0);
    expect(targetGetImageData).not.toHaveBeenCalled();

    // 배경색·글자색 연속 변경(드래그 모사): 캔버스 추가 할당 0회, getImageData 0회
    for (const bgHex of ['#335577', '#446688', '#557799', '#557799']) {
      renderer.render(target as unknown as CoverCanvasLike, {
        ...base,
        bgHex,
        textColors: { title: '#161412', tribe: '#ffffff', join: '#ffdd00' },
        grain: 'skip',
      });
    }
    expect(createdCount).toBe(afterFirstCreated);
    expect(getImageDataCount).toBe(0);
    expect(targetGetImageData).not.toHaveBeenCalled();

    targetGetImageData.mockRestore();
    const beforeGrain = Uint8Array.from(targetCtx.getImageData(0, 0, 1024, 1024).data);

    // 정밀 그레인 적용: 오프스크린 grainWorkCanvas 1개만 추가 생성(화면 캔버스 readback 없음), 픽셀에 그레인 반영
    const targetGetImageData2 = vi.spyOn(targetCtx, 'getImageData');
    const res = renderer.render(target as unknown as CoverCanvasLike, {
      ...base,
      bgHex: '#557799',
      textColors: { title: '#161412', tribe: '#ffffff', join: '#ffdd00' },
      grain: 'exact',
    });
    expect(createdCount).toBe(afterFirstCreated + 1);
    expect(getImageDataCount).toBe(1);
    expect(targetGetImageData2).not.toHaveBeenCalled();
    expect(res.bgHex).toBe('#557799');

    targetGetImageData2.mockRestore();
    const afterGrain = targetCtx.getImageData(0, 0, 1024, 1024).data;
    let diffPixels = 0;
    for (let i = 0; i < beforeGrain.length; i += 4) {
      if (beforeGrain[i] !== afterGrain[i]) diffPixels++;
    }
    expect(diffPixels).toBeGreaterThan(10000);
    expect(target.toBuffer('image/png').length).toBeGreaterThan(1000);
  });
});
