/**
 * asset-generator/render — drawImageLayer 합성 검증 (티켓 20260924_2157)
 *
 * 격리 워크트리에서는 실렌더(실제 픽셀 확인)가 불가하므로, 목 Canvas2DContextLike에 호출
 * 인자를 기록해 변환(위치·크기·회전·불투명도)이 올바른지, 스테이지 비율이 바뀌어도 상대
 * 위치·크기가 유지되는지를 검증한다. 실제 픽셀 확인은 병합 후 실렌더로 넘긴다.
 */
import { describe, expect, it } from 'vitest';
import { drawImageLayer, type Canvas2DContextLike, type ImageSourceLike } from '../render';

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
      heightPct: 20,
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
      heightPct: 10,
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
      heightPct: 10,
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
      heightPct: 10,
      rotationDeg: 0,
      opacityPct: 150,
      stageWidth: 500,
      stageHeight: 500,
    });
    expect(calls.globalAlphaHistory[0]).toBe(1);
  });

  it('스테이지 비율이 바뀌어도 같은 %값이면 상대 위치·크기 비율이 유지된다', () => {
    const input = { xPct: 30, yPct: 70, widthPct: 25, heightPct: 25, rotationDeg: 0, opacityPct: 100 };

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
});
