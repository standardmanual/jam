/**
 * JAM! 에셋 제너레이터 — 이미지 한 장 렌더 함수 (티켓 20260926_1544)
 *
 * `render.mjs`(배지·미션판 CLI)와 `make-home-feed-card.mjs`(홈피드 카드 원샷)가 같은 그림을 그리도록
 * 렌더 본문을 한 곳으로 모았다. 동작은 예전 `render.mjs`의 `main()` 본문과 같다 — 프리셋 조회 → 레이어 값
 * 적용 → 리본·배경·텍스트 그리기 → PNG 버퍼. 파일을 쓰거나 출력하는 일은 호출부가 한다.
 *
 * 실행 방식(tsx)·배럴 대신 개별 파일을 상대 경로로 직접 import하는 이유·리본 원천 그래픽 기본값(letter 'J')·
 * 정지 프레임 위치(head 0)는 `render.mjs` 상단 주석이 정본이다.
 *
 * 필요 환경변수는 `render.mjs` 상단 주석과 같다(어드민 읽기 API 또는 서비스 롤 키).
 */
import { createClient } from '@supabase/supabase-js'

import { deriveRibbonFromSeed } from '../../src/lib/asset-generator/random'
import { buildPath } from '../../src/lib/asset-generator/curve'
import { getLayerKeys } from '../../src/lib/asset-generator/layerKeys'
import { buildStamp, drawRibbonLayer, drawImageLayer, drawTextLayer, fillBackground } from '../../src/lib/asset-generator/render'
import { resolveStageSize, generateRandomSeed, isSystemDefaultFont } from '../../src/app/admin/asset-generator/assetGeneratorHelpers'

import { serverCanvasFactory, getServerContext, loadImageAsCanvas, cropToAlphaBounds, serverImageLoader } from './serverCanvas'
import { brandLetterSvgMarkup } from './brandLetters.mjs'
import { createServerFontLoader } from './fonts.mjs'
import { applyLayerValues } from './applyLayerValues.mjs'
import { loadLayerImage } from './loadLayerImage.mjs'
import { loadEnv } from '../lib/loadEnv.mjs'
import { fetchPresetFromAdminApi, normalizePreset, pickPresetSource, resolveEnv } from './presetSource.mjs'

/**
 * 프리셋·색·텍스트·시드로 PNG 한 장을 그려 돌려준다.
 * 인자: `{ preset(프리셋 id), bg, end, values?, seed? }` — 의미는 `renderArgs.mjs`의 `parseRenderArgs` 결과와 같다(`values`는 레이어 번호 값 맵).
 * 반환: `{ buffer(PNG), seed(마스터 시드), stage: { w, h }, presetSource('admin-api' | 'service-role'), layers: { applied, saved } }`
 * — `layers`는 값을 지정한 번호와 프리셋에 저장된 값을 쓴 번호 목록이다.
 * 어떤 오류든 한국어 메시지의 Error를 던진다(기본 글꼴로 조용히 대체하지 않는다).
 */
export async function renderCardPng(args) {
  // `.env.local`과 `process.env`를 합친다(process.env 우선) — 예약 환경은 process.env로만 값을 준다.
  const env = resolveEnv(loadEnv(), process.env)
  const picked = pickPresetSource(env)

  let preset
  if (picked.source === 'admin-api') {
    preset = await fetchPresetFromAdminApi({
      baseUrl: picked.baseUrl,
      token: picked.token,
      presetId: args.preset,
    })
  } else {
    const supabase = createClient(picked.supabaseUrl, picked.serviceKey)
    const { data, error } = await supabase
      .from('asset_presets')
      .select('id, name, target_type, stage_ratio, layers, created_by, created_at, updated_at')
      .eq('id', args.preset)
      .maybeSingle()
    if (error) throw new Error(`프리셋 조회에 실패했어요: ${error.message}`)
    if (!data) throw new Error(`프리셋을 찾을 수 없어요: ${args.preset}`)
    preset = normalizePreset(data)
  }

  const { width: stageWidth, height: stageHeight } = resolveStageSize(preset.stageRatio)

  // 레이어 값 적용: `--text01`·`--img01`처럼 어드민 화면과 같은 번호로 지정한 값을 넣는다. 지정하지 않은 번호는
  // 프리셋에 저장된 값을 그대로 쓴다. 규칙·오류 처리는 applyLayerValues.mjs 상단 주석 참고.
  const { layers: overlayLayers, applied, saved } = applyLayerValues(preset.layers, args.values ?? {})
  const layerKeys = getLayerKeys(overlayLayers).map((entry) => entry.key)

  const masterSeed = args.seed ?? generateRandomSeed()
  const random = deriveRibbonFromSeed(masterSeed)

  // 리본 원천 그래픽: 고정 letter 'J'(brandLetters.mjs 상단 주석). 알파 바운딩 박스로 잘라
  // buildStamp에 넘긴다(브라우저의 setBaseFromCanvas와 같은 단계).
  const rawBase = await loadImageAsCanvas(Buffer.from(brandLetterSvgMarkup('J')))
  const base = cropToAlphaBounds(rawBase)
  if (!base) throw new Error('원천 그래픽(브랜드 글자)에 불투명 픽셀이 없어요.')

  const stamp = buildStamp(serverCanvasFactory, {
    base,
    blurPct: random.blurPct,
    direction: random.direction,
    startColor: args.bg, // 그라데이션 시작색 = 배경색(PRD §8, §6의 linkStartToBackground와 동일)
    endColor: args.end,
  })

  const curvePath = buildPath(random.seed, random.irregularityPct, stageWidth, stageHeight)

  const canvas = serverCanvasFactory(stageWidth, stageHeight)
  const ctx = getServerContext(canvas)

  fillBackground(ctx, stageWidth, stageHeight, args.bg)
  drawRibbonLayer(ctx, {
    stamp,
    baseWidth: base.width,
    baseHeight: base.height,
    sizePct: random.sizePct,
    rotationDeg: random.rotationDeg,
    followPath: random.followPath,
    path: curvePath,
    head: 0, // 정지 프레임 — render.mjs 헤더 주석 "정지 프레임 위치" 참고
    gap: random.gap,
    count: random.count,
    stageWidth,
    stageHeight,
  })

  // 텍스트 레이어에 쓰인 글꼴을 먼저 전부 등록한다(그려야 폴백 글꼴로 새지 않는다).
  const loadFont = createServerFontLoader()
  for (const layer of overlayLayers) {
    if (layer.type === 'text' && !isSystemDefaultFont(layer.font)) {
      await loadFont(layer.font)
    }
  }

  // 이미지 레이어 원본을 assetUrl별로 한 번씩 불러온다(브라우저 imageAssets 캐시와 같은 정책).
  // `--img01`로 값을 지정한 레이어는 절대 경로 파일 또는 URL을 검증해 읽고(loadLayerImage), 나머지는 저장된 URL을 그대로 쓴다.
  const imageAssets = {}
  for (const [index, layer] of overlayLayers.entries()) {
    if (layer.type === 'image' && !imageAssets[layer.assetUrl]) {
      imageAssets[layer.assetUrl] = applied.includes(layerKeys[index])
        ? await serverImageLoader(await loadLayerImage(layer.assetUrl))
        : await serverImageLoader({ url: layer.assetUrl })
    }
  }

  // 리본 다음, 배열 역순으로 그려 인덱스 0이 가장 위에 오게 한다(drawOverlayLayersOnto와 동일 순서).
  for (let i = overlayLayers.length - 1; i >= 0; i--) {
    const layer = overlayLayers[i]
    if (layer.type === 'image') {
      drawImageLayer(ctx, {
        image: imageAssets[layer.assetUrl],
        xPct: layer.xPct,
        yPct: layer.yPct,
        widthPct: layer.widthPct,
        rotationDeg: layer.rotationDeg,
        opacityPct: layer.opacityPct,
        stageWidth,
        stageHeight,
        // 컬러 오버레이(티켓 20260926_1741): 브라우저와 같은 drawImageLayer가 임시 캔버스로 색을 입힌다
        overlayColor: layer.overlayEnabled ? layer.overlayColor : undefined,
      }, serverCanvasFactory)
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
      })
    }
  }

  return {
    buffer: canvas.toBuffer('image/png'),
    seed: masterSeed,
    stage: { w: stageWidth, h: stageHeight },
    presetSource: picked.source,
    layers: { applied, saved },
  }
}
