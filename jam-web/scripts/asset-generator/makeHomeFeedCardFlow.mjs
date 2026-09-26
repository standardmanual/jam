/**
 * 홈피드 카드 원샷(`make-home-feed-card.mjs`) — 렌더 → bundle.json 작성 → dry-run 검증 흐름 (티켓 20260926_1544)
 *
 * 렌더러와 dry-run 실행기를 인자(`deps`)로 받아 네트워크·DB 없이 시험할 수 있게 했다. 실제 연결은
 * `make-home-feed-card.mjs`가 한다. 이 흐름은 DB·저장소에 쓰지 않는다 — 묶음 폴더에 `image.png`와
 * `bundle.json`만 쓴다. 등록은 여전히 메인 세션이 컨펌 뒤 `register-home-feed-card.mjs`로 한다.
 */
import fs from 'node:fs'
import path from 'node:path'

import { BUNDLE_FILE_NAME, DEFAULT_AUTHOR, IMAGE_FILE_NAME, seedFromBundleId, toKstIsoString } from './makeHomeFeedCardArgs.mjs'
import { RECORD_FILE_NAME } from './registerRecord.mjs'

/**
 * `--dry-run` 요약 텍스트(`formatHomeFeedDryRunSummary` 출력)에서 컨펌에 필요한 값만 뽑는다.
 * 반환: `{ result('통과' 등 «결과:» 줄), errors: string[], skipped: string[](건너뛴 DB 읽기 검사 이름), webp }`.
 * 요약 형식이 바뀌면 `makeHomeFeedCardFlow.test.ts`가 실제 요약으로 실패해 알려 준다.
 */
export function extractDryRunFacts(logText, errorText = '') {
  const lines = logText.split('\n')
  const errors = []
  const skipped = []
  let result = null
  let webp = null
  let section = ''

  for (const line of lines) {
    if (line === '') {
      // «고쳐야 할 점»은 빈 줄에서 끝난다.
      if (section === '[고쳐야 할 점]') section = ''
    } else if (line.startsWith('결과: ')) {
      result = line.slice('결과: '.length)
    } else if (/^\[.+\]$/.test(line)) {
      section = line
    } else if (section === '[고쳐야 할 점]' && line.startsWith('- ')) {
      errors.push(line.slice(2))
    } else if (section === '[DB 읽기 검사]') {
      const m = line.match(/^- (.+?): 건너뜀/)
      if (m) skipped.push(m[1])
    } else if (line.startsWith('- WebP 변환 미리 확인: ')) {
      webp = line.slice('- WebP 변환 미리 확인: '.length)
    }
  }

  // 묶음 파일을 읽지 못한 경우처럼 요약 없이 오류 문장만 나온 경우.
  if (result === null && errorText.trim() !== '') errors.push(...errorText.trim().split('\n'))
  return { result, errors, skipped, webp }
}

/**
 * 묶음 폴더에 `image.png`와 `bundle.json`을 만들고 dry-run 검증 결과를 돌려준다.
 *
 * 인자:
 * - `args`: `parseMakeCardArgs` 결과.
 * - `deps.renderPng(renderArgs)`: `{ buffer, seed, stage, presetSource }`를 돌려주는 렌더러(`renderCardPng`와 같은 계약).
 * - `deps.runDryRun(bundleFile)`: 등록 흐름의 `--dry-run`을 실행해 `{ exitCode, log, error }`를 돌려준다.
 * - `deps.now()`: 현재 시각(ms). `created_at` 기본값에 쓴다.
 * 반환: `{ exitCode, output }` — `output`은 표준 출력에 한 줄 JSON으로 찍을 객체다. 렌더가 실패하면 그 Error를 그대로 던진다.
 * 이미 등록한 묶음 폴더(`registration-record.json`이 있음)는 이미지를 덮어쓰지 않도록 렌더 전에 거절한다.
 */
export async function makeHomeFeedCard({ args, deps }) {
  const { outDir } = args
  if (fs.existsSync(path.join(outDir, RECORD_FILE_NAME))) {
    throw new Error(`이미 등록한 묶음 폴더예요(${RECORD_FILE_NAME}이 있어요): ${outDir}. 새 폴더를 지정해 주세요.`)
  }

  const bundleId = args.meta.bundle_id ?? path.basename(outDir)
  const seed = args.seed ?? seedFromBundleId(bundleId)

  const rendered = await deps.renderPng({ preset: args.preset, bg: args.bg, end: args.end, values: args.values, seed })

  const image = {
    path: IMAGE_FILE_NAME,
    seed: rendered.seed,
    preset_id: args.preset,
    bg_color: args.bg,
    end_color: args.end,
    // 기록 필드 이름은 예전 그대로다: `text` = --text01 값, `subtext` = --text02 값(등록 묶음 형식은 바꾸지 않는다).
    ...(args.values.text01 === undefined ? {} : { text: args.values.text01 }),
    ...(args.values.text02 === undefined ? {} : { subtext: args.values.text02 }),
  }
  const bundle = {
    bundle_id: bundleId,
    author: args.meta.author ?? DEFAULT_AUTHOR,
    created_at: args.meta.created_at ?? toKstIsoString(deps.now()),
    color_rationale_link: args.meta.color_rationale_link,
    world_review: args.meta.world_review,
    card: args.card,
    image,
  }

  const imagePath = path.join(outDir, IMAGE_FILE_NAME)
  const bundlePath = path.join(outDir, BUNDLE_FILE_NAME)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(imagePath, rendered.buffer)
  fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`)

  const dryRun = await deps.runDryRun(bundlePath)
  const facts = extractDryRunFacts(dryRun.log, dryRun.error)
  const ok = dryRun.exitCode === 0

  return {
    exitCode: ok ? 0 : 1,
    output: {
      ok,
      imagePath,
      imageBytes: rendered.buffer.length,
      bundlePath,
      seed: rendered.seed,
      preset: args.preset,
      presetSource: rendered.presetSource,
      stage: rendered.stage,
      layers: rendered.layers,
      dryRun: {
        exitCode: dryRun.exitCode,
        result: facts.result,
        errors: facts.errors,
        skipped: facts.skipped,
        webp: facts.webp,
        note: facts.skipped.length > 0 ? 'DB 읽기 검사는 건너뜀 — 형식만 검증했어요. 컨펌 근거로 쓰지 말고 서비스 키가 있는 환경에서 다시 돌려요.' : null,
      },
    },
  }
}
