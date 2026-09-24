/**
 * asset-generator 서버 캔버스 — 실제 렌더링 검증 (@napi-rs/canvas, 티켓 20260924_2201)
 *
 * 격리 워크트리에는 DB가 없어 프리셋 조회를 통한 전체 CLI 실행은 여기서 확인하지 않는다
 * (카리나 실렌더, 머지 뒤). 대신 render.mjs가 쓰는 리본 렌더링 파이프라인(마스터 시드 →
 * deriveRibbonFromSeed → buildStamp·buildPath·drawRibbonLayer)을 실제 @napi-rs/canvas로
 * 그려, 같은 시드면 PNG 바이트가 완전히 같고 시드가 다르면 달라지는지 확인한다(PRD §11).
 */
import type { Canvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { deriveRibbonFromSeed } from '../../../src/lib/asset-generator/random';
import { buildPath } from '../../../src/lib/asset-generator/curve';
import { buildStamp, drawRibbonLayer, fillBackground, type CanvasLike } from '../../../src/lib/asset-generator/render';
import { brandLetterSvgMarkup } from '../brandLetters.mjs';
import { cropToAlphaBounds, getServerContext, loadImageAsCanvas, serverCanvasFactory } from '../serverCanvas';

/** render.ts의 CanvasLike는 napi-rs의 실제 Canvas와 구조적으로 완전히 같지 않다(serverCanvas.ts
 *  상단 주석 참고) — 테스트에서도 같은 경계 캐스트를 쓴다. */
function toCanvasLike(canvas: Canvas): CanvasLike {
  return canvas as unknown as CanvasLike;
}

const STAGE_SIZE = 64; // 테스트 속도를 위해 실제 배지 규격(1280)보다 작게 그린다

async function renderRibbonOnly(seed: number, bg: string, end: string): Promise<Buffer> {
  const random = deriveRibbonFromSeed(seed);
  const rawBase = await loadImageAsCanvas(Buffer.from(brandLetterSvgMarkup('J')));
  const base = cropToAlphaBounds(rawBase);
  if (!base) throw new Error('base가 비어 있어요(테스트 실패)');

  const stamp = buildStamp(serverCanvasFactory, {
    base: toCanvasLike(base),
    blurPct: random.blurPct,
    direction: random.direction,
    startColor: bg,
    endColor: end,
  });
  const path = buildPath(random.seed, random.irregularityPct, STAGE_SIZE, STAGE_SIZE);

  const canvas = serverCanvasFactory(STAGE_SIZE, STAGE_SIZE);
  const ctx = getServerContext(canvas);
  fillBackground(ctx, STAGE_SIZE, STAGE_SIZE, bg);
  drawRibbonLayer(ctx, {
    stamp,
    baseWidth: base.width,
    baseHeight: base.height,
    sizePct: random.sizePct,
    rotationDeg: random.rotationDeg,
    followPath: random.followPath,
    path,
    head: 0,
    gap: random.gap,
    count: random.count,
    stageWidth: STAGE_SIZE,
    stageHeight: STAGE_SIZE,
  });
  return (canvas as unknown as Canvas).toBuffer('image/png');
}

describe('serverCanvasFactory + render.ts 파이프라인 (실제 @napi-rs/canvas)', () => {
  it('PNG 버퍼를 만든다(PNG 시그니처로 시작)', async () => {
    const buf = await renderRibbonOnly(1, '#ff1a00', '#ff4dff');
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('같은 시드로 두 번 그리면 바이트가 완전히 같다', async () => {
    const a = await renderRibbonOnly(42, '#ff1a00', '#ff4dff');
    const b = await renderRibbonOnly(42, '#ff1a00', '#ff4dff');
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it('시드가 다르면 바이트가 달라진다', async () => {
    const a = await renderRibbonOnly(42, '#ff1a00', '#ff4dff');
    const b = await renderRibbonOnly(43, '#ff1a00', '#ff4dff');
    expect(Buffer.compare(a, b)).not.toBe(0);
  });
});
