/**
 * 에셋 제너레이터 — 프리셋 한 장 조립 (티켓 20261007_0945)
 *
 * 서버 CLI(`scripts/asset-generator/renderCard.mjs`의 `renderCardPng`)와 같은 순서·같은 값으로 그린다.
 * 캔버스·이미지·글꼴·리본 원천 그래픽(알파로 자른 것)은 호출부가 의존 주입으로 넘기므로 이 파일은 서버·브라우저 어디에도 묶이지 않는다.
 * 서버 전용 모듈(`serverCanvas.ts`·`*.mjs`·`opsInbox/image.ts`)은 가져오지 않는다.
 *
 * 레이어 값 적용 규칙은 `scripts/asset-generator/applyLayerValues.mjs`와 같다(.mjs는 고치지 않고 TS로 옮겼다. 같은 입력에 같은 결과가 나오는지 `renderPreset.test.ts`가 대조한다).
 * 어떤 오류든 한국어 메시지의 Error를 던진다(글꼴·이미지를 못 불러오면 폴백으로 조용히 그리지 않는다).
 */
import { buildPath } from './curve';
import { formatLayerKey, getLayerKeys, parseLayerKey } from './layerKeys';
import { deriveRibbonFromSeed } from './random';
import {
  buildStamp,
  drawImageLayer,
  drawRibbonLayer,
  drawTextLayer,
  fillBackground,
  type CanvasFactory,
  type CanvasLike,
  type FontLoader,
  type ImageLoader,
  type ImageSourceLike,
} from './render';
import type { AssetPreset, OverlayLayerConfig } from './types';
import { isSystemDefaultFont, resolveStageSize } from '@/app/admin/asset-generator/assetGeneratorHelpers';

export interface RenderPresetDeps {
  canvasFactory: CanvasFactory;
  imageLoader: ImageLoader;
  fontLoader: FontLoader;
  /** 리본 원천 그래픽(브랜드 글자 'J'를 그린 뒤 알파 바운딩 박스로 자른 캔버스). 불투명 픽셀이 없으면 null. */
  loadBase: () => Promise<CanvasLike | null>;
}

export interface RenderPresetInput {
  preset: Pick<AssetPreset, 'stageRatio' | 'layers'>;
  /** 배경색이자 리본 그라데이션 시작색 */
  bg: string;
  /** 리본 그라데이션 끝색 */
  end: string;
  /** 레이어 번호(`text01`·`img01`) → 값 */
  values?: Record<string, string>;
  /** 마스터 시드 — 호출부가 정해 넘긴다 */
  seed: number;
}

export interface RenderPresetResult {
  canvas: CanvasLike;
  seed: number;
  stage: { w: number; h: number };
  layers: { applied: string[]; saved: string[] };
}

const INVALID_KEY_MESSAGE = '번호 형식이 올바르지 않아요(예: text01)';

function assertCanonicalLayerKey(key: string) {
  const parsed = parseLayerKey(key);
  if (!parsed || formatLayerKey(parsed.type, parsed.n) !== key) {
    throw new Error(`${INVALID_KEY_MESSAGE}: ${key}`);
  }
  return parsed;
}

function isImageSourceFormat(value: string): boolean {
  return value.startsWith('/') || /^https?:\/\/\S+$/i.test(value);
}

/** 프리셋 `layers`에 값 맵을 적용한다(`applyLayerValues.mjs`와 같은 규칙). 원본 배열은 바꾸지 않는다. */
export function applyLayerValues(
  layers: readonly OverlayLayerConfig[],
  values: Record<string, string>,
): { layers: OverlayLayerConfig[]; applied: string[]; saved: string[] } {
  const keyByIndex = getLayerKeys(layers).map((entry) => entry.key);

  const requested = Object.keys(values);
  for (const key of requested) assertCanonicalLayerKey(key);

  const missing = requested.filter((key) => !keyByIndex.includes(key));
  if (missing.length > 0) {
    const available = [...keyByIndex].sort().join(', ');
    throw new Error(`이 프리셋에 없는 번호예요: ${missing.join(', ')}. 있는 번호: ${available === '' ? '(없음)' : available}`);
  }

  for (const key of requested) {
    const value: unknown = values[key];
    const parsed = parseLayerKey(key);
    if (typeof value !== 'string') throw new Error(`${key}의 값은 문자열이어야 해요.`);
    if (parsed?.type === 'image' && !isImageSourceFormat(value)) {
      throw new Error(`${key}의 값은 이미지 파일의 절대 경로 또는 http(s) URL이어야 해요(받은 값: ${value}).`);
    }
  }

  const applied: string[] = [];
  const saved: string[] = [];
  const nextLayers = layers.map((layer, index): OverlayLayerConfig => {
    const key = keyByIndex[index];
    if (!Object.hasOwn(values, key)) {
      saved.push(key);
      return layer;
    }
    applied.push(key);
    return layer.type === 'text' ? { ...layer, content: values[key] } : { ...layer, assetUrl: values[key] };
  });

  return { layers: nextLayers, applied, saved };
}

/** 프리셋·색·값·시드로 스테이지 캔버스 한 장을 그린다(`renderCardPng`와 같은 순서). */
export async function renderPresetToCanvas(input: RenderPresetInput, deps: RenderPresetDeps): Promise<RenderPresetResult> {
  const { canvasFactory } = deps;
  const { width: stageWidth, height: stageHeight } = resolveStageSize(input.preset.stageRatio);

  const { layers: overlayLayers, applied, saved } = applyLayerValues(input.preset.layers, input.values ?? {});

  const masterSeed = input.seed;
  const random = deriveRibbonFromSeed(masterSeed);

  const base = await deps.loadBase();
  if (!base) throw new Error('원천 그래픽(브랜드 글자)에 불투명 픽셀이 없어요.');

  const stamp = buildStamp(canvasFactory, {
    base,
    blurPct: random.blurPct,
    direction: random.direction,
    startColor: input.bg,
    endColor: input.end,
  });

  const curvePath = buildPath(random.seed, random.irregularityPct, stageWidth, stageHeight);

  const canvas = canvasFactory(stageWidth, stageHeight);
  const ctx = canvas.getContext('2d');

  fillBackground(ctx, stageWidth, stageHeight, input.bg);
  drawRibbonLayer(ctx, {
    stamp,
    baseWidth: base.width,
    baseHeight: base.height,
    sizePct: random.sizePct,
    rotationDeg: random.rotationDeg,
    followPath: random.followPath,
    path: curvePath,
    head: 0,
    gap: random.gap,
    count: random.count,
    stageWidth,
    stageHeight,
  });

  // 텍스트 레이어에 쓰인 글꼴을 먼저 전부 등록한다(그려야 폴백 글꼴로 새지 않는다).
  for (const layer of overlayLayers) {
    if (layer.type === 'text' && !isSystemDefaultFont(layer.font)) {
      await deps.fontLoader(layer.font);
    }
  }

  // 이미지 레이어 원본을 assetUrl별로 한 번씩 불러온다.
  const imageAssets: Record<string, ImageSourceLike> = {};
  for (const layer of overlayLayers) {
    if (layer.type === 'image' && !imageAssets[layer.assetUrl]) {
      try {
        imageAssets[layer.assetUrl] = await deps.imageLoader({ url: layer.assetUrl });
      } catch (e) {
        throw new Error(`이미지 레이어 원본을 불러오지 못했어요(${e instanceof Error ? e.message : String(e)}): ${layer.assetUrl}`);
      }
    }
  }

  // 리본 다음, 배열 역순으로 그려 인덱스 0이 가장 위에 오게 한다.
  for (let i = overlayLayers.length - 1; i >= 0; i--) {
    const layer = overlayLayers[i];
    if (layer.type === 'image') {
      drawImageLayer(
        ctx,
        {
          image: imageAssets[layer.assetUrl],
          xPct: layer.xPct,
          yPct: layer.yPct,
          widthPct: layer.widthPct,
          rotationDeg: layer.rotationDeg,
          opacityPct: layer.opacityPct,
          stageWidth,
          stageHeight,
          overlayColor: layer.overlayEnabled ? layer.overlayColor : undefined,
        },
        canvasFactory,
      );
    } else {
      drawTextLayer(ctx, {
        content: layer.content,
        font: layer.font,
        sizePct: layer.sizePct,
        letterSpacing: layer.letterSpacing,
        lineHeight: layer.lineHeight,
        align: layer.align,
        color: layer.color,
        xPct: layer.xPct,
        yPct: layer.yPct,
        rotationDeg: layer.rotationDeg,
        opacityPct: layer.opacityPct,
        stageWidth,
        stageHeight,
      });
    }
  }

  return { canvas, seed: masterSeed, stage: { w: stageWidth, h: stageHeight }, layers: { applied, saved } };
}
