/**
 * renderPresetToCanvas — 서버 CLI(`renderCard.mjs`)와 같은 순서·같은 값으로 그리는지 검증 (티켓 20261007_0945)
 * 실행: cd jam-web && npx vitest run src/lib/asset-generator/__tests__/renderPreset.test.ts
 *
 * 격리 워크트리에서는 실제 픽셀을 볼 수 없어, 가짜 캔버스가 호출을 한 줄 기록에 남기고
 * (1) 이 조립 함수와 (2) CLI의 흐름을 그대로 옮겨 쓴 기준 순서가 같은 기록을 남기는지 대조한다.
 * 레이어 값 적용은 `applyLayerValues.mjs`와 같은 입력에 같은 결과·같은 오류가 나오는지 대조한다.
 */
import { describe, expect, it } from 'vitest';
import { buildPath } from '../curve';
import { getLayerKeys } from '../layerKeys';
import { deriveRibbonFromSeed } from '../random';
import {
  buildStamp,
  drawImageLayer,
  drawRibbonLayer,
  drawTextLayer,
  fillBackground,
  type Canvas2DContextLike,
  type CanvasFactory,
  type CanvasLike,
  type FontLoader,
  type ImageLoader,
} from '../render';
import { applyLayerValues, renderPresetToCanvas, type RenderPresetDeps } from '../renderPreset';
import type { ImageLayerConfig, OverlayLayerConfig, TextLayerConfig } from '../types';
import { resolveStageSize } from '@/app/admin/asset-generator/assetGeneratorHelpers';
import { applyLayerValues as applyLayerValuesMjs } from '../../../../scripts/asset-generator/applyLayerValues.mjs';

type Log = string[];

function makeEnv() {
  const log: Log = [];
  let canvasNo = 0;
  const factory: CanvasFactory = (w, h) => {
    const no = ++canvasNo;
    log.push(`canvas#${no} ${w}x${h}`);
    const record =
      (name: string) =>
      (...args: unknown[]) => {
        log.push(
          `c${no}.${name}(${args.map((a) => (typeof a === 'object' && a !== null ? ((a as { __id?: string }).__id ?? 'obj') : String(a))).join(',')})`,
        );
      };
    const ctx = new Proxy(
      { fillStyle: '', filter: 'none', globalAlpha: 1, globalCompositeOperation: 'source-over' } as Record<string, unknown>,
      {
        get(target, prop: string) {
          if (prop in target) return target[prop];
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
          if (prop === 'measureText') return () => ({ width: 10 });
          return record(prop);
        },
        set(target, prop: string, value) {
          target[prop] = value;
          if (prop === 'fillStyle' && typeof value === 'string') log.push(`c${no}.fillStyle=${value}`);
          return true;
        },
      },
    ) as unknown as Canvas2DContextLike;
    return { width: w, height: h, __id: `canvas#${no}`, getContext: () => ctx } as unknown as CanvasLike;
  };
  const imageLoader: ImageLoader = async (input) => {
    const url = 'url' in input ? input.url : 'data';
    log.push(`image ${url}`);
    return { width: 200, height: 100, __id: `img:${url}` } as never;
  };
  const fontLoader: FontLoader = async (font) => {
    log.push(`font ${font.family}/${font.weight}`);
  };
  const base = { width: 136, height: 205, __id: 'base', getContext: () => ({}) } as unknown as CanvasLike;
  const deps: RenderPresetDeps = { canvasFactory: factory, imageLoader, fontLoader, loadBase: async () => base };
  return { log, deps, base };
}

const text = (id: string, content: string, family = 'Noto Sans KR'): TextLayerConfig => ({
  type: 'text',
  id,
  content,
  font: { family, weight: 700 },
  sizePct: 10,
  letterSpacing: 0,
  lineHeight: 1.2,
  align: 'center',
  color: '#ffffff',
  xPct: 50,
  yPct: 40,
  rotationDeg: 0,
  opacityPct: 100,
});
const image = (id: string, assetUrl = 'https://x.test/saved.png'): ImageLayerConfig => ({
  type: 'image',
  id,
  assetUrl,
  xPct: 10,
  yPct: 20,
  widthPct: 30,
  rotationDeg: 5,
  opacityPct: 80,
  overlayEnabled: true,
  overlayColor: '#ff0000',
});
// 목록 순서: text01, img01, text02(시스템 글꼴)
const layers: OverlayLayerConfig[] = [text('a', '저장1'), image('b'), text('c', '저장2', 'system-ui')];

/** `renderCard.mjs`의 흐름을 같은 순서로 옮겨 쓴 기준(서버 전용 부분 제외). */
async function referenceFlow(input: {
  stageRatio: '1:1';
  layers: OverlayLayerConfig[];
  bg: string;
  end: string;
  values: Record<string, string>;
  seed: number;
}) {
  const { log, deps, base } = makeEnv();
  const { width, height } = resolveStageSize(input.stageRatio);
  const { layers: overlay } = applyLayerValuesMjs(input.layers, input.values) as { layers: OverlayLayerConfig[] };
  const random = deriveRibbonFromSeed(input.seed);
  const stamp = buildStamp(deps.canvasFactory, {
    base,
    blurPct: random.blurPct,
    direction: random.direction,
    startColor: input.bg,
    endColor: input.end,
  });
  const path = buildPath(random.seed, random.irregularityPct, width, height);
  const canvas = deps.canvasFactory(width, height);
  const ctx = canvas.getContext('2d');
  fillBackground(ctx, width, height, input.bg);
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
    stageWidth: width,
    stageHeight: height,
  });
  for (const l of overlay) if (l.type === 'text' && l.font.family !== 'system-ui') await deps.fontLoader(l.font);
  const assets: Record<string, never> = {};
  for (const l of overlay)
    if (l.type === 'image' && !assets[l.assetUrl]) assets[l.assetUrl] = (await deps.imageLoader({ url: l.assetUrl })) as never;
  for (let i = overlay.length - 1; i >= 0; i--) {
    const l = overlay[i];
    if (l.type === 'image') {
      drawImageLayer(
        ctx,
        {
          image: assets[l.assetUrl],
          xPct: l.xPct,
          yPct: l.yPct,
          widthPct: l.widthPct,
          rotationDeg: l.rotationDeg,
          opacityPct: l.opacityPct,
          stageWidth: width,
          stageHeight: height,
          overlayColor: l.overlayEnabled ? l.overlayColor : undefined,
        },
        deps.canvasFactory,
      );
    } else {
      drawTextLayer(ctx, {
        content: l.content,
        font: l.font,
        sizePct: l.sizePct,
        letterSpacing: l.letterSpacing,
        lineHeight: l.lineHeight,
        align: l.align,
        color: l.color,
        xPct: l.xPct,
        yPct: l.yPct,
        rotationDeg: l.rotationDeg,
        opacityPct: l.opacityPct,
        stageWidth: width,
        stageHeight: height,
      });
    }
  }
  return log;
}

describe('renderPresetToCanvas — CLI와 같은 호출 기록', () => {
  const values = { text01: '새 문안', img01: 'https://x.test/new.png' };

  it('같은 프리셋·색·값·시드면 가짜 캔버스 호출 기록이 기준 흐름과 같다', async () => {
    const expected = await referenceFlow({ stageRatio: '1:1', layers, bg: '#112233', end: '#aabbcc', values, seed: 12345 });
    const { log, deps } = makeEnv();
    const result = await renderPresetToCanvas(
      { preset: { stageRatio: '1:1', layers }, bg: '#112233', end: '#aabbcc', values, seed: 12345 },
      deps,
    );
    expect(log).toEqual(expected);
    expect(log.length).toBeGreaterThan(10);
    expect(result.seed).toBe(12345);
    expect(result.layers).toEqual({ applied: ['text01', 'img01'], saved: ['text02'] });
  });

  it('시드가 다르면 기록도 다르다(시드가 그림에 반영된다)', async () => {
    const a = makeEnv();
    const b = makeEnv();
    await renderPresetToCanvas({ preset: { stageRatio: '1:1', layers }, bg: '#112233', end: '#aabbcc', seed: 1 }, a.deps);
    await renderPresetToCanvas({ preset: { stageRatio: '1:1', layers }, bg: '#112233', end: '#aabbcc', seed: 2 }, b.deps);
    expect(a.log).not.toEqual(b.log);
  });

  it('글꼴은 시스템 기본이 아닌 텍스트 레이어만, 이미지는 같은 주소를 한 번만 불러온다', async () => {
    const { log, deps } = makeEnv();
    await renderPresetToCanvas(
      { preset: { stageRatio: '1:1', layers: [...layers, image('d')] }, bg: '#000000', end: '#ffffff', seed: 7 },
      deps,
    );
    expect(log.filter((l) => l.startsWith('font '))).toEqual(['font Noto Sans KR/700']);
    expect(log.filter((l) => l.startsWith('image '))).toEqual(['image https://x.test/saved.png']);
  });
});

describe('renderPresetToCanvas — 실패는 던진다', () => {
  const input = { preset: { stageRatio: '1:1' as const, layers }, bg: '#000000', end: '#ffffff', seed: 1 };

  it('글꼴 로드가 실패하면 그리지 않고 던진다', async () => {
    const { deps } = makeEnv();
    deps.fontLoader = async () => {
      throw new Error('폰트 실패');
    };
    await expect(renderPresetToCanvas(input, deps)).rejects.toThrow('폰트 실패');
  });

  it('이미지 로드가 실패하면 한국어 메시지로 던진다', async () => {
    const { deps } = makeEnv();
    deps.imageLoader = async () => {
      throw new Error('시간 초과');
    };
    await expect(renderPresetToCanvas(input, deps)).rejects.toThrow(/이미지 레이어 원본을 불러오지 못했어요\(시간 초과\)/);
  });

  it('원천 그래픽이 비면 던진다', async () => {
    const { deps } = makeEnv();
    deps.loadBase = async () => null;
    await expect(renderPresetToCanvas(input, deps)).rejects.toThrow('불투명 픽셀이 없어요');
  });
});

describe('applyLayerValues — applyLayerValues.mjs와 같은 결과', () => {
  const cases: Record<string, string>[] = [
    {},
    { text01: '바뀜' },
    { text02: 'x', img01: '/abs/path.png' },
    { img01: 'https://x.test/a.png', text01: 'y' },
  ];
  it.each(cases)('같은 입력에 같은 결과: %j', (values) => {
    expect(applyLayerValues(layers, values)).toEqual(applyLayerValuesMjs(layers, values));
  });

  const errorCases: Record<string, string>[] = [{ text1: 'x' }, { text09: 'x' }, { img01: 'relative.png' }, { Text01: 'x' }];
  it.each(errorCases)('같은 입력에 같은 오류: %j', (values) => {
    let expected = '';
    try {
      applyLayerValuesMjs(layers, values);
    } catch (e) {
      expected = (e as Error).message;
    }
    expect(expected).not.toBe('');
    expect(() => applyLayerValues(layers, values)).toThrow(expected);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const before = JSON.stringify(layers);
    applyLayerValues(layers, { text01: '바뀜' });
    expect(JSON.stringify(layers)).toBe(before);
    expect(getLayerKeys(layers).map((k) => k.key)).toEqual(['text01', 'img01', 'text02']);
  });
});
