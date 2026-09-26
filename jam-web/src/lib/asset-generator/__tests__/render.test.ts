/**
 * asset-generator/render — drawImageLayer·drawTextLayer 합성 검증
 * (티켓 20260924_2157·20260924_2158)
 *
 * 격리 워크트리에서는 실렌더(실제 픽셀 확인·실제 글꼴 적용 확인)가 불가하므로, 목
 * Canvas2DContextLike에 호출 인자를 기록해 변환(위치·크기·회전·불투명도·정렬·자간·행간)이
 * 올바른지, 스테이지 비율이 바뀌어도 상대 위치·크기가 유지되는지를 검증한다. 실제 픽셀·글꼴
 * 확인은 병합 후 실렌더로 넘긴다.
 */
import { describe, expect, it } from 'vitest';
import {
  drawImageLayer,
  drawTextLayer,
  type Canvas2DContextLike,
  type CanvasFactory,
  type ImageSourceLike,
} from '../render';

interface RecordedCall {
  setTransform: [number, number, number, number, number, number][];
  drawImage: unknown[][];
  globalAlphaHistory: number[];
}

function createMockContext(): { ctx: Canvas2DContextLike; calls: RecordedCall } {
  const calls: RecordedCall = { setTransform: [], drawImage: [], globalAlphaHistory: [] };
  let alpha = 1;
  const ctx = {
    drawImage: (...args: unknown[]) => {
      calls.drawImage.push(args);
    },
    fillRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
      calls.setTransform.push([a, b, c, d, e, f]);
    },
    fillStyle: '#000000',
    globalCompositeOperation: 'source-over',
    filter: 'none',
    get globalAlpha() {
      return alpha;
    },
    set globalAlpha(v: number) {
      alpha = v;
      calls.globalAlphaHistory.push(v);
    },
  } as unknown as Canvas2DContextLike;
  return { ctx, calls };
}

const image: ImageSourceLike = { width: 200, height: 100 };

describe('drawImageLayer (PRD §4.2)', () => {
  it('위치(%)를 스테이지 크기 기준 좌표로, 크기(%)를 짧은 변 기준 픽셀로 변환해 drawImage를 호출한다', () => {
    const { ctx, calls } = createMockContext();
    drawImageLayer(ctx, {
      image,
      xPct: 50,
      yPct: 25,
      widthPct: 40,
      rotationDeg: 0,
      opacityPct: 100,
      stageWidth: 1000,
      stageHeight: 800,
    });

    // stageWidth 1000, stageHeight 800 → 짧은 변 800. dw=40%*800=320, dh=20%*800=160
    // 중심 좌표: cx=50%*1000=500, cy=25%*800=200. 회전 0도이므로 setTransform은 (1,0,0,1,cx,cy)
    // (b·c는 -Math.sin(0)의 부호 있는 0이라 -0으로 나온다 — 캔버스 변환상 0과 동등하다).
    const [a, b, c, d, cx, cy] = calls.setTransform[0];
    expect([a, b, c, d]).toEqual([1, 0, -0, 1]);
    expect([cx, cy]).toEqual([500, 200]);
    expect(calls.drawImage[0]).toEqual([image, -160, -80, 320, 160]);
    // 그린 뒤에는 항등 변환으로 되돌린다
    expect(calls.setTransform[1]).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('회전(°)을 코사인·사인 변환 행렬로 넘긴다', () => {
    const { ctx, calls } = createMockContext();
    drawImageLayer(ctx, {
      image,
      xPct: 0,
      yPct: 0,
      widthPct: 10,
      rotationDeg: 90,
      opacityPct: 100,
      stageWidth: 1000,
      stageHeight: 1000,
    });
    const [a, b, c, d] = calls.setTransform[0];
    expect(a).toBeCloseTo(0, 10);
    expect(b).toBeCloseTo(1, 10);
    expect(c).toBeCloseTo(-1, 10);
    expect(d).toBeCloseTo(0, 10);
  });

  it('불투명도(%)를 0~1 globalAlpha로 바꿔 그리는 동안만 적용하고 원래 값으로 되돌린다', () => {
    const { ctx, calls } = createMockContext();
    ctx.globalAlpha = 0.6; // 호출 전 다른 레이어가 남겨둔 값
    drawImageLayer(ctx, {
      image,
      xPct: 50,
      yPct: 50,
      widthPct: 10,
      rotationDeg: 0,
      opacityPct: 40,
      stageWidth: 500,
      stageHeight: 500,
    });
    expect(calls.globalAlphaHistory).toEqual([0.6, 0.4, 0.6]);
  });

  it('0~100 범위를 벗어난 불투명도는 0~1로 잘라낸다', () => {
    const { ctx, calls } = createMockContext();
    drawImageLayer(ctx, {
      image,
      xPct: 50,
      yPct: 50,
      widthPct: 10,
      rotationDeg: 0,
      opacityPct: 150,
      stageWidth: 500,
      stageHeight: 500,
    });
    expect(calls.globalAlphaHistory[0]).toBe(1);
  });

  it('스테이지 비율이 바뀌어도 같은 %값이면 상대 위치·크기 비율이 유지된다', () => {
    const input = { xPct: 30, yPct: 70, widthPct: 25, rotationDeg: 0, opacityPct: 100 };

    const first = createMockContext();
    drawImageLayer(first.ctx, { image, ...input, stageWidth: 1000, stageHeight: 1000 });
    const [, , , , cx1, cy1] = first.calls.setTransform[0];
    const [, dx1, dy1, dw1, dh1] = first.calls.drawImage[0] as [ImageSourceLike, number, number, number, number];

    const second = createMockContext();
    // 스테이지를 2배로 키워도(1:1 유지) 중심 좌표·크기가 정확히 2배가 되어야 상대 위치·크기가
    // 유지된 것이다(짧은 변 기준 %이므로 종횡비를 유지한 채 키우면 비례해야 한다).
    drawImageLayer(second.ctx, { image, ...input, stageWidth: 2000, stageHeight: 2000 });
    const [, , , , cx2, cy2] = second.calls.setTransform[0];
    const [, dx2, dy2, dw2, dh2] = second.calls.drawImage[0] as [ImageSourceLike, number, number, number, number];

    expect(cx2).toBe(cx1 * 2);
    expect(cy2).toBe(cy1 * 2);
    expect(dw2).toBe(dw1 * 2);
    expect(dh2).toBe(dh1 * 2);
    expect(dx2).toBe(dx1 * 2);
    expect(dy2).toBe(dy1 * 2);
  });
  it('세로가 긴 원본도 원본 비율을 유지해 dh를 계산한다(찌그러지지 않는다)', () => {
    const { ctx, calls } = createMockContext();
    const tall: ImageSourceLike = { width: 100, height: 300 };
    drawImageLayer(ctx, {
      image: tall,
      xPct: 50,
      yPct: 50,
      widthPct: 10,
      rotationDeg: 0,
      opacityPct: 100,
      stageWidth: 1000,
      stageHeight: 1000,
    });
    // dw=10%*1000=100, dh=100*300/100=300
    expect(calls.drawImage[0]).toEqual([tall, -50, -150, 100, 300]);
  });

  it('원본 크기가 0이면 그리지 않는다', () => {
    const { ctx, calls } = createMockContext();
    drawImageLayer(ctx, {
      image: { width: 0, height: 0 },
      xPct: 50,
      yPct: 50,
      widthPct: 10,
      rotationDeg: 0,
      opacityPct: 100,
      stageWidth: 500,
      stageHeight: 500,
    });
    expect(calls.drawImage).toHaveLength(0);
  });

  describe('컬러 오버레이', () => {
    function createTintFactory() {
      const log: string[] = [];
      const created: { width: number; height: number }[] = [];
      const factory: CanvasFactory = (width, height) => {
        created.push({ width, height });
        const tctx = {
          drawImage: (img: ImageSourceLike, x: number, y: number) => {
            log.push(`drawImage:${img.width}x${img.height}@${x},${y}`);
          },
          fillRect: (x: number, y: number, w: number, h: number) => {
            log.push(`fillRect:${x},${y},${w},${h}`);
          },
          set fillStyle(v: string) {
            log.push(`fillStyle:${v}`);
          },
          set globalCompositeOperation(v: string) {
            log.push(`composite:${v}`);
          },
        } as unknown as Canvas2DContextLike;
        return { width, height, getContext: () => tctx };
      };
      return { factory, log, created };
    }

    const base = {
      image,
      xPct: 50,
      yPct: 50,
      widthPct: 40,
      rotationDeg: 0,
      opacityPct: 60,
      stageWidth: 1000,
      stageHeight: 800,
    };

    it('overlayColor가 있으면 원본 크기 임시 캔버스에 이미지를 그리고 source-in으로 색을 채운 뒤 그 캔버스를 그린다', () => {
      const { ctx, calls } = createMockContext();
      const { factory, log, created } = createTintFactory();
      drawImageLayer(ctx, { ...base, overlayColor: '#ff0000' }, factory);

      expect(created).toEqual([{ width: 200, height: 100 }]);
      expect(log).toEqual(['drawImage:200x100@0,0', 'composite:source-in', 'fillStyle:#ff0000', 'fillRect:0,0,200,100']);
      const [drawn, dx, dy, dw, dh] = calls.drawImage[0] as [ImageSourceLike, number, number, number, number];
      expect(drawn).not.toBe(image);
      expect([dx, dy, dw, dh]).toEqual([-160, -80, 320, 160]);
      // 불투명도는 색을 입힌 결과를 그릴 때 적용된다
      expect(calls.globalAlphaHistory).toContain(0.6);
    });

    it('overlayColor가 없으면 임시 캔버스를 만들지 않고 원본 이미지를 그린다', () => {
      const { ctx, calls } = createMockContext();
      const { factory, created } = createTintFactory();
      drawImageLayer(ctx, base, factory);
      expect(created).toHaveLength(0);
      expect(calls.drawImage[0][0]).toBe(image);
    });

    it('캔버스 생성 함수가 없으면 색을 입히지 않고 원본 이미지를 그린다', () => {
      const { ctx, calls } = createMockContext();
      drawImageLayer(ctx, { ...base, overlayColor: '#ff0000' });
      expect(calls.drawImage[0][0]).toBe(image);
    });
  });
});

interface RecordedFillText {
  text: string;
  x: number;
  y: number;
  font: string;
  align: string;
  baseline: string;
}

interface TextRecordedCall {
  setTransform: [number, number, number, number, number, number][];
  fillText: RecordedFillText[];
  measureTextCalls: string[];
  globalAlphaHistory: number[];
}

/** 글자 하나당 항상 10px 너비를 돌려주는 목 measureText — 자간·정렬 계산을 예측 가능하게 한다. */
const MOCK_CHAR_WIDTH = 10;

function createTextMockContext(): { ctx: Canvas2DContextLike; calls: TextRecordedCall } {
  const calls: TextRecordedCall = { setTransform: [], fillText: [], measureTextCalls: [], globalAlphaHistory: [] };
  let font = '';
  let textAlign = '';
  let textBaseline = '';
  let fillStyle: string | { addColorStop: (offset: number, color: string) => void } = '#000000';
  let alpha = 1;
  const ctx = {
    drawImage: () => {},
    fillRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
      calls.setTransform.push([a, b, c, d, e, f]);
    },
    get font() {
      return font;
    },
    set font(v: string) {
      font = v;
    },
    get textAlign() {
      return textAlign;
    },
    set textAlign(v: string) {
      textAlign = v;
    },
    get textBaseline() {
      return textBaseline;
    },
    set textBaseline(v: string) {
      textBaseline = v;
    },
    fillText: (text: string, x: number, y: number) => {
      calls.fillText.push({ text, x, y, font, align: textAlign, baseline: textBaseline });
    },
    measureText: (text: string) => {
      calls.measureTextCalls.push(text);
      return { width: MOCK_CHAR_WIDTH };
    },
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v) {
      fillStyle = v;
    },
    globalCompositeOperation: 'source-over',
    filter: 'none',
    get globalAlpha() {
      return alpha;
    },
    set globalAlpha(v: number) {
      alpha = v;
      calls.globalAlphaHistory.push(v);
    },
  } as unknown as Canvas2DContextLike;
  return { ctx, calls };
}

describe('drawTextLayer (PRD §4.3)', () => {
  it('위치(%)를 스테이지 크기 기준 좌표로 옮기고, 크기(%)를 짧은 변 기준 글자 크기(px)로 변환한다', () => {
    const { ctx, calls } = createTextMockContext();
    drawTextLayer(ctx, {
      content: 'A',
      font: { family: 'system-ui', weight: 400 },
      sizePct: 10,
      letterSpacing: 0,
      lineHeight: 1.2,
      align: 'center',
      color: '#111111',
      xPct: 50,
      yPct: 25,
      rotationDeg: 0,
      opacityPct: 100,
      stageWidth: 1000,
      stageHeight: 800,
    });

    // 짧은 변 800, sizePct 10% → 글자 크기 80px. 중심 좌표: cx=500, cy=200.
    const [a, b, c, d, cx, cy] = calls.setTransform[0];
    expect([a, b, c, d]).toEqual([1, 0, -0, 1]);
    expect([cx, cy]).toEqual([500, 200]);
    expect(calls.fillText[0].font).toContain('80px');
    expect(calls.fillText[0].font).toContain('"system-ui"');
    // 그린 뒤에는 항등 변환으로 되돌린다
    expect(calls.setTransform[1]).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('글자 단위로 fillText를 호출한다(자간을 measureText 기반으로 직접 배치)', () => {
    const { ctx, calls } = createTextMockContext();
    drawTextLayer(ctx, {
      content: 'AB',
      font: { family: 'system-ui', weight: 400 },
      sizePct: 100,
      letterSpacing: 0.5,
      lineHeight: 1.2,
      align: 'center',
      color: '#111111',
      xPct: 50,
      yPct: 50,
      rotationDeg: 0,
      opacityPct: 100,
      stageWidth: 100,
      stageHeight: 100,
    });

    // fontSizePx=100, letterSpacingPx=50. 글자폭(목) 10 → 줄 폭 = 10+50+10 = 70. center 정렬이므로
    // 시작 x = -35. 'A'는 -35, 'B'는 -35+10+50=25.
    expect(calls.fillText.map((c) => c.text)).toEqual(['A', 'B']);
    expect(calls.fillText[0].x).toBeCloseTo(-35, 10);
    expect(calls.fillText[1].x).toBeCloseTo(25, 10);
    // 글자 단위 배치이므로 textAlign은 항상 'left'로 그린다(정렬은 이 모듈이 시작 x로 구현)
    expect(calls.fillText[0].align).toBe('left');
    expect(calls.fillText[0].baseline).toBe('middle');
  });

  it('한 줄 텍스트에서 정렬이 가로 앵커 기준 위치를 바꾼다(왼쪽=0, 가운데=-폭/2, 오른쪽=-폭)', () => {
    // "ABC"(글자폭 10, 자간 0) → 줄 폭 30. 앵커(x)는 xPct 위치이고 회전 좌표계 원점이다.
    const input = {
      content: 'ABC',
      font: { family: 'system-ui', weight: 400 },
      sizePct: 100,
      letterSpacing: 0,
      lineHeight: 1.2,
      color: '#111111',
      xPct: 50,
      yPct: 50,
      rotationDeg: 0,
      opacityPct: 100,
      stageWidth: 100,
      stageHeight: 100,
    };

    const left = createTextMockContext();
    drawTextLayer(left.ctx, { ...input, align: 'left' });
    expect(left.calls.fillText[0].x).toBeCloseTo(0, 10);

    const center = createTextMockContext();
    drawTextLayer(center.ctx, { ...input, align: 'center' });
    expect(center.calls.fillText[0].x).toBeCloseTo(-15, 10);

    const right = createTextMockContext();
    drawTextLayer(right.ctx, { ...input, align: 'right' });
    expect(right.calls.fillText[0].x).toBeCloseTo(-30, 10);
  });

  it('정렬(왼쪽/가운데/오른쪽)이 여러 줄일 때 각 줄을 같은 앵커에 맞춘다', () => {
    // 첫 줄 "AB"(폭 20) · 둘째 줄 "A"(폭 10). 두 줄 모두 같은 앵커(x=0)를 기준으로 줄별 폭에 따라
    // 시작 x가 정해진다. fillText 호출 순서: A(0), B(1), A(2).
    const input = {
      content: 'AB\nA',
      font: { family: 'system-ui', weight: 400 },
      sizePct: 100,
      letterSpacing: 0,
      lineHeight: 1.2,
      color: '#111111',
      xPct: 50,
      yPct: 50,
      rotationDeg: 0,
      opacityPct: 100,
      stageWidth: 100,
      stageHeight: 100,
    };

    const left = createTextMockContext();
    drawTextLayer(left.ctx, { ...input, align: 'left' });
    expect(left.calls.fillText[0].x).toBeCloseTo(0, 10);
    expect(left.calls.fillText[2].x).toBeCloseTo(0, 10);

    const center = createTextMockContext();
    drawTextLayer(center.ctx, { ...input, align: 'center' });
    expect(center.calls.fillText[0].x).toBeCloseTo(-10, 10);
    expect(center.calls.fillText[2].x).toBeCloseTo(-5, 10);

    const right = createTextMockContext();
    drawTextLayer(right.ctx, { ...input, align: 'right' });
    expect(right.calls.fillText[0].x).toBeCloseTo(-20, 10);
    expect(right.calls.fillText[2].x).toBeCloseTo(-10, 10);
  });

  it('여러 줄을 행간(글자 크기 대비 배수)만큼 세로로 띄워 배치한다', () => {
    const { ctx, calls } = createTextMockContext();
    drawTextLayer(ctx, {
      content: 'A\nB',
      font: { family: 'system-ui', weight: 400 },
      sizePct: 100,
      letterSpacing: 0,
      lineHeight: 1.5,
      align: 'center',
      color: '#111111',
      xPct: 50,
      yPct: 50,
      rotationDeg: 0,
      opacityPct: 100,
      stageWidth: 100,
      stageHeight: 100,
    });

    // fontSizePx=100, lineHeightPx=150. 블록 높이=300. 첫 줄 y=0.5*150-150=-75, 둘째 줄 y=1.5*150-150=75.
    expect(calls.fillText[0].y).toBeCloseTo(-75, 10);
    expect(calls.fillText[1].y).toBeCloseTo(75, 10);
  });

  it('회전(°)을 코사인·사인 변환 행렬로 넘긴다', () => {
    const { ctx, calls } = createTextMockContext();
    drawTextLayer(ctx, {
      content: 'A',
      font: { family: 'system-ui', weight: 400 },
      sizePct: 10,
      letterSpacing: 0,
      lineHeight: 1.2,
      align: 'center',
      color: '#111111',
      xPct: 0,
      yPct: 0,
      rotationDeg: 90,
      opacityPct: 100,
      stageWidth: 1000,
      stageHeight: 1000,
    });
    const [a, b, c, d] = calls.setTransform[0];
    expect(a).toBeCloseTo(0, 10);
    expect(b).toBeCloseTo(1, 10);
    expect(c).toBeCloseTo(-1, 10);
    expect(d).toBeCloseTo(0, 10);
  });

  it('불투명도(%)를 0~1 globalAlpha로 바꿔 그리는 동안만 적용하고 원래 값으로 되돌린다', () => {
    const { ctx, calls } = createTextMockContext();
    ctx.globalAlpha = 0.6; // 호출 전 다른 레이어가 남겨둔 값
    drawTextLayer(ctx, {
      content: 'A',
      font: { family: 'system-ui', weight: 400 },
      sizePct: 10,
      letterSpacing: 0,
      lineHeight: 1.2,
      align: 'center',
      color: '#111111',
      xPct: 50,
      yPct: 50,
      rotationDeg: 0,
      opacityPct: 40,
      stageWidth: 500,
      stageHeight: 500,
    });
    expect(calls.globalAlphaHistory).toEqual([0.6, 0.4, 0.6]);
  });

  it('스테이지 비율이 바뀌어도 같은 %값이면 상대 위치·크기가 유지된다', () => {
    const input = {
      content: 'A',
      font: { family: 'system-ui', weight: 400 },
      sizePct: 10,
      letterSpacing: 0,
      lineHeight: 1.2,
      align: 'center' as const,
      color: '#111111',
      xPct: 30,
      yPct: 70,
      rotationDeg: 0,
      opacityPct: 100,
    };

    const first = createTextMockContext();
    drawTextLayer(first.ctx, { ...input, stageWidth: 1000, stageHeight: 1000 });
    const [, , , , cx1, cy1] = first.calls.setTransform[0];
    const fontSize1 = Number(first.calls.fillText[0].font.match(/(\d+(?:\.\d+)?)px/)?.[1]);

    const second = createTextMockContext();
    drawTextLayer(second.ctx, { ...input, stageWidth: 2000, stageHeight: 2000 });
    const [, , , , cx2, cy2] = second.calls.setTransform[0];
    const fontSize2 = Number(second.calls.fillText[0].font.match(/(\d+(?:\.\d+)?)px/)?.[1]);

    expect(cx2).toBe(cx1 * 2);
    expect(cy2).toBe(cy1 * 2);
    expect(fontSize2).toBe(fontSize1 * 2);
  });
});
