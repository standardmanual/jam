#!/usr/bin/env npx tsx
/**
 * JAM! 홈피드 카드 원샷 스크립트 (티켓 20260926_1544)
 *
 * 카드 한 장을 만드는 「렌더 → bundle.json 작성 → --dry-run 검증」을 명령 하나로 한다. 지금까지는 `render.mjs`로
 * 이미지를 만들고, bundle.json을 손으로 쓰고, `register-home-feed-card.mjs --dry-run`을 따로 돌렸다.
 * 묶음 형식·검증 규칙의 정본은 `docs/specs/prd/asset-generator/HOME_FEED_REGISTRATION_BUNDLE.md`다.
 *
 * ## 실행 (cwd는 반드시 jam-web — `register-home-feed-card.mjs`와 같은 `@/` 별칭 이유)
 * ```
 * cd jam-web
 * npx tsx scripts/asset-generator/make-home-feed-card.mjs \
 *   --preset <프리셋 id> --bg "#8a5a2e" --end "#3d2812" --text01 "제목" [--text02 "짧은 설명"] \
 *   --card '{"title":"…","template_type":"…","exposure_tags":["all"],"starts_at":"…","ends_at":"…"}' \
 *   --meta '{"color_rationale_link":"jam-doc/…","world_review":{"world_related":false,"winter_reviewed":false,"reason":"…"}}' \
 *   --out-dir /절대경로/<묶음 ID> [--seed 123]
 * ```
 * 프리셋 레이어는 `--text01`·`--text02`처럼 어드민 화면과 같은 번호로 지정한다(안 준 번호는 프리셋에 저장된 값). 옛 `--text`·`--subtext`는 없어졌다.
 * 인자 규칙(`--card`·`--meta`는 인라인 JSON 또는 JSON 파일 경로, 묶음 기본값)은 `makeHomeFeedCardArgs.mjs` 상단 주석이 정본이다.
 * 흰 글자 대비는 `contrast.mjs`로 미리 확인한다.
 *
 * ## 출력과 종료 코드
 * 표준 출력에 한 줄 JSON을 찍는다: `{ ok, imagePath, imageBytes, bundlePath, seed, preset, presetSource, stage,
 * layers: { applied, saved }(값을 지정한 번호·프리셋에 저장된 값을 쓴 번호), dryRun: { exitCode, result, errors, skipped, webp, note } }`. 검증에 실패하면 `ok: false`이고 종료 코드가 1이다
 * (이미지·bundle.json은 고쳐 다시 돌릴 수 있게 남긴다). 인자 오류·렌더 실패는 한국어 메시지를 stderr에 찍고 종료 코드 1이다.
 *
 * ## dry-run은 형식 검증까지다
 * 이 스크립트는 서비스 롤 키 없이 동작한다 — 프리셋은 `render.mjs`와 같은 경로(어드민 읽기 API 또는 서비스 롤 키,
 * `presetSource.mjs`)로 받되, 등록 흐름의 `--dry-run`에는 DB 클라이언트를 넘기지 않는다. 그래서 제목·시작 일시 중복과
 * 미션·컬렉션·배지·랭킹 모드 존재 검사는 항상 «건너뜀»이고 출력의 `dryRun.skipped`·`dryRun.note`에 밝힌다.
 * 그 검사는 등록 직전에 서비스 키가 있는 환경에서 `register-home-feed-card.mjs --dry-run`으로 다시 한다.
 * 이 스크립트는 DB·저장소에 쓰지 않는다(묶음 폴더에 파일 2개만 쓴다).
 */
import { randomUUID } from 'node:crypto'

import { parseMakeCardArgs } from './makeHomeFeedCardArgs.mjs'
import { makeHomeFeedCard } from './makeHomeFeedCardFlow.mjs'
import { parseRegisterArgs } from './registerArgs.mjs'
import { renderCardPng } from './renderCard.mjs'

/** `@/` 별칭이 안 풀리면(cwd가 jam-web이 아니면) 원인을 알려 주는 Error로 바꾼다. */
async function importWithAliasHint(load) {
  try {
    return await load()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes("'@/")) {
      throw new Error(
        `@/ 별칭을 찾지 못했어요(${message.split('\n')[0]}). jam-web 폴더에서 실행해 주세요: cd jam-web && npx tsx scripts/asset-generator/make-home-feed-card.mjs ...`
      )
    }
    throw e
  }
}

async function main() {
  const args = parseMakeCardArgs(process.argv.slice(2))

  const { runHomeFeedRegister } = await importWithAliasHint(() => import('./registerHomeFeedFlow.mjs'))
  const { convertBadgeImageToWebp } = await importWithAliasHint(() => import('../../src/lib/admin/badgeImageWebp'))

  const deps = {
    renderPng: renderCardPng,
    now: () => Date.now(),
    // 등록 흐름의 --dry-run을 그대로 실행하되 supabase를 넘기지 않는다(DB 읽기 검사는 «건너뜀»).
    runDryRun: async (bundleFile) => {
      const log = []
      const error = []
      const exitCode = await runHomeFeedRegister({
        args: parseRegisterArgs(['--bundle', bundleFile, '--dry-run']),
        supabase: null,
        convertToWebp: convertBadgeImageToWebp,
        randomUUID,
        now: () => Date.now(),
        out: { log: (text) => log.push(text), error: (text) => error.push(text) },
      })
      return { exitCode, log: log.join('\n'), error: error.join('\n') }
    },
  }

  const { exitCode, output } = await makeHomeFeedCard({ args, deps })
  console.log(JSON.stringify(output))
  // process.exit()으로 끊지 않고 종료 코드만 남긴다 — 파이프로 이어진 표준 출력이 잘리지 않게 하려는 것이다.
  process.exitCode = exitCode
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
