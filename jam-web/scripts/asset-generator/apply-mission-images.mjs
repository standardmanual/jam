#!/usr/bin/env npx tsx
/**
 * JAM! 에셋 제너레이터 — 기존 미션 대표 이미지 일괄 생성·적용 CLI (티켓 20260926_2346, PRD asset-generator §8)
 *
 * 등록된 미션마다 「미션」 프리셋 이미지를 만들고(미리보기), 검토한 이미지를 그대로 적용하고(적용), 되돌린다(롤백).
 * 흐름의 정본은 `applyMissionImagesFlow.mjs` 머리말이다. 이 파일은 실제 Supabase 클라이언트·렌더러·변환기를
 * 흐름에 잇고, 미리보기 전용 보조(문구 넘침 검사·모아보기 이미지)를 담는다.
 * **적용·롤백은 프로덕션 DB·저장소에 쓴다(Supabase는 staging·프로덕션 공용). 실행 주체는 메인 세션(카리나)이고,
 * 사용자가 미리보기(이미지 전체와 경고 목록)를 확인·승인한 뒤에만 `--apply`를 실행한다(CLAUDE.md 규칙 6).**
 *
 * ## 실행 (cwd는 반드시 jam-web — `register-mission.mjs` 머리말의 «별칭» 참고)
 * ```
 * cd jam-web
 * # 1) 미리보기: 이미지·resolved.json·contact-sheet.png만 폴더에 쓴다. DB·저장소에는 쓰지 않는다.
 * npx tsx scripts/asset-generator/apply-mission-images.mjs --plan /절대경로/plan.json --out-dir /절대경로/out
 * # 2) 적용(승인 뒤): 같은 폴더의 미리보기 결과를 그대로 올린다.
 * npx tsx scripts/asset-generator/apply-mission-images.mjs --out-dir /절대경로/out --apply
 * # 3) 롤백: 적용 전 image_url·image_source와 백업한 저장소 파일을 되돌린다.
 * npx tsx scripts/asset-generator/apply-mission-images.mjs --rollback /절대경로/out/applied.json
 * ```
 * 성공하면 종료 코드 0, 검증 실패·적용 실패는 한국어 사유를 찍고 종료 코드 1이다.
 *
 * 필요 환경변수(`.env.local`): `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY`(`render.mjs` 상단 주석과 같다).
 * 프리셋도 이 서비스 롤 키로 읽는다(미션 목록을 읽으려면 어차피 필요하다).
 */
import { createClient } from '@supabase/supabase-js'

import { drawTextLayer } from '../../src/lib/asset-generator/render'
import { generateRandomSeed, isSystemDefaultFont, resolveStageSize } from '../../src/app/admin/asset-generator/assetGeneratorHelpers'

import { createServerFontLoader } from './fonts.mjs'
import { applyLayerValues } from './applyLayerValues.mjs'
import { loadEnv } from '../lib/loadEnv.mjs'
import { normalizePreset } from './presetSource.mjs'
import { serverCanvasFactory, getServerContext, loadImageAsCanvas } from './serverCanvas'

/** `@/` 별칭이 안 풀리면(cwd가 jam-web이 아니면) 원인을 알려 주는 Error로 바꾼다. */
async function importWithAliasHint(load) {
  try {
    return await load()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes("'@/")) {
      throw new Error(
        `@/ 별칭을 찾지 못했어요(${message.split('\n')[0]}). jam-web 폴더에서 실행해 주세요: cd jam-web && npx tsx scripts/asset-generator/apply-mission-images.mjs ...`
      )
    }
    throw e
  }
}

/** 텍스트 오른쪽 여백 검사 폭(가로 비율) — 이 안에 글자가 닿으면 넘친 것으로 본다(티켓 20260926_2346). */
const RIGHT_MARGIN_RATIO = 0.03

/** 서비스 롤 클라이언트로 프리셋을 읽는다. */
function createPresetLoader(supabase) {
  return async (presetId) => {
    const { data, error } = await supabase
      .from('asset_presets')
      .select('id, name, target_type, stage_ratio, layers, created_by, created_at, updated_at')
      .eq('id', presetId)
      .maybeSingle()
    if (error) throw new Error(`프리셋 조회에 실패했어요: ${error.message}`)
    if (!data) throw new Error(`프리셋을 찾을 수 없어요: ${presetId}`)
    return normalizePreset(data)
  }
}

/**
 * 텍스트 레이어만 빈 캔버스에 그려 오른쪽 여백(가로 3%)에 불투명 픽셀이 닿는지 본다.
 * 리본·이미지 레이어는 그리지 않아 글자 위치만 알파로 남는다.
 */
function createTextOverflowDetector(loadPreset) {
  const loadFont = createServerFontLoader()
  return async ({ presetId, values }) => {
    const preset = await loadPreset(presetId)
    const { width, height } = resolveStageSize(preset.stageRatio)
    const canvas = serverCanvasFactory(width, height)
    const ctx = getServerContext(canvas)
    const layers = applyLayerValues(preset.layers, values).layers.filter((layer) => layer.type === 'text')
    for (const layer of layers) {
      if (!isSystemDefaultFont(layer.font)) await loadFont(layer.font)
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i]
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
        stageWidth: width,
        stageHeight: height,
      })
    }
    const marginStart = Math.floor(width * (1 - RIGHT_MARGIN_RATIO))
    const data = ctx.getImageData(marginStart, 0, width - marginStart, height).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 8) return true
    }
    return false
  }
}

/** 모든 이미지를 한 장에 모은다: 왼쪽 위부터 가로로 채우고 칸마다 번호(`resolved.json`의 index)를 쓴다. */
async function makeContactSheet(images) {
  const columns = 8
  const cell = 240
  const gap = 8
  const rows = Math.ceil(images.length / columns)
  const canvas = serverCanvasFactory(columns * cell + (columns + 1) * gap, rows * cell + (rows + 1) * gap)
  const ctx = getServerContext(canvas)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (const [position, { index, buffer }] of images.entries()) {
    const source = await loadImageAsCanvas(buffer)
    const scale = Math.min(cell / source.width, cell / source.height)
    const w = source.width * scale
    const h = source.height * scale
    const x = gap + (position % columns) * (cell + gap)
    const y = gap + Math.floor(position / columns) * (cell + gap)
    ctx.drawImage(source, x, y, w, h)
    ctx.fillStyle = '#000000'
    ctx.fillRect(x, y, 34, 22)
    ctx.fillStyle = '#ffffff'
    ctx.font = '16px sans-serif'
    ctx.fillText(String(index), x + 4, y + 17)
  }
  return canvas.toBuffer('image/png')
}

async function main() {
  // 흐름 파일이 `@/` 별칭을 쓰는 모듈을 불러오므로 정적 import가 아니라 동적 import로 불러 실패 시 안내 문구를 찍는다.
  const flow = await importWithAliasHint(() => import('./applyMissionImagesFlow.mjs'))
  const args = flow.parseApplyMissionImagesArgs(process.argv.slice(2))

  const env = loadEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null
  const out = { log: (text) => console.log(text), error: (text) => console.error(text) }

  let exitCode
  if (args.mode === 'rollback') {
    exitCode = await flow.runRollback({ args, supabase, out })
  } else if (args.mode === 'apply') {
    const { convertBadgeImageToWebp } = await importWithAliasHint(() => import('../../src/lib/admin/badgeImageWebp'))
    exitCode = await flow.runApply({ args, supabase, out, deps: { convertToWebp: convertBadgeImageToWebp, now: () => Date.now() } })
  } else {
    const { renderCardPng } = await importWithAliasHint(() => import('./renderCard.mjs'))
    const loadPreset = supabase ? createPresetLoader(supabase) : async () => { throw new Error('서비스 키(.env.local)가 없어서 프리셋을 읽을 수 없어요.') }
    exitCode = await flow.runPreview({
      args,
      supabase,
      out,
      deps: {
        loadPreset,
        renderPng: renderCardPng,
        randomSeed: () => generateRandomSeed(),
        detectTextOverflow: createTextOverflowDetector(loadPreset),
        makeContactSheet,
        now: () => Date.now(),
      },
    })
  }
  // process.exit()으로 끊지 않고 종료 코드만 남긴다 — 파이프로 이어진 표준 출력이 잘리지 않게 하려는 것이다.
  process.exitCode = exitCode
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
