#!/usr/bin/env npx tsx
/**
 * JAM! 에셋 제너레이터 에이전트 CLI (티켓 20260924_2201, PRD §8·§11)
 *
 * 브라우저 없이 배지 대표 이미지를 만든다. 입력은 프리셋 ID·배경색·그라데이션 끝색·레이어 번호별 값·(선택) 시드다.
 * 그라데이션 시작색은 배경색과 같고, 나머지 리본 속성은 전체 랜덤 규칙
 * (`deriveRibbonFromSeed`, 어드민 "전체 무작위"와 같은 값 범위)으로 채운다. 출력은 원본 PNG
 * 파일과 마스터 시드다. 같은 프리셋·색·값·시드면 항상 같은 이미지가 나온다.
 *
 * ## 실행
 * ```
 * cd jam-web
 * npx tsx scripts/asset-generator/render.mjs \
 *   --preset <프리셋 id> --bg "#ff1a00" --end "#ff4dff" --text01 "배지 이름" [--text02 "짧은 설명"] [--img01 /절대/경로.png] \
 *   --out /absolute/path/out.png [--seed 123]
 * ```
 * 프리셋의 텍스트·이미지 레이어는 어드민 화면과 같은 번호(`text01`, `img01`, …, 목록 위에서 아래로 종류별 01부터)로 지정한다.
 * 지정하지 않은 번호는 프리셋에 저장된 값을 그대로 쓴다. 번호 규칙과 오류 처리는 applyLayerValues.mjs 상단 주석,
 * 글자 수 가이드는 PRD §8에 있다. 옛 인자 `--text`·`--subtext`는 없어졌다.
 * 성공하면 표준 출력에 `{ out, seed, preset, stage: { w, h }, presetSource, layers: { applied, saved } }` JSON 한 줄을 찍는다
 * (`presetSource`는 프리셋을 받은 경로: `admin-api` | `service-role`, `layers.applied`는 값을 지정한 번호,
 * `layers.saved`는 프리셋에 저장된 값을 쓴 번호 — 빠뜨린 값이 없는지 이 목록으로 확인한다).
 * 인자 누락·프리셋 없음·글꼴 다운로드 실패 등 어떤 오류든 한국어 메시지를 stderr에 찍고
 * 종료 코드 1로 끝난다(기본 글꼴로 조용히 대체하지 않는다 — PRD §8 완료 조건).
 *
 * 필요 환경변수 — `.env.local`과 `process.env`를 합쳐 읽고 `process.env`가 우선한다.
 * 프리셋 조회 경로는 아래 둘 중 하나가 갖춰지면 된다(둘 다 있으면 어드민 읽기 API 우선):
 * - 어드민 읽기 API(예약 실행 환경): `ADMIN_API_BASE_URL` · `ADMIN_API_READ_TOKEN`
 * - 서비스 롤 키(로컬 세션, 기존 `jam-web/scripts/recraft/*.js`와 같은 이름):
 *   `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY`
 *
 * ## 실행 방식(tsx vs 사전 번들) — 사용자 지시(2026-09-25)로 둘 중 하나를 정함
 * `jam-web/scripts/asset-generator/build-prototype.mjs`는 esbuild로 브라우저용 번들 파일을
 * 커밋해 두고 프로토타입이 그 결과물을 불러와 쓴다(브라우저는 TS를 직접 실행할 수 없어
 * 번들이 필수). 이 CLI는 Node 환경이라 `tsx`(devDependency에 이미 있음)로 직접 실행하는
 * 쪽을 택했다 — 이유:
 * 1) 실행할 때마다 esbuild로 새로 번들하는 것도, 커밋된 번들 파일을 유지하는 것도 필요 없다
 *    (커밋된 번들은 `.core.js`처럼 "고쳤으면 재생성" 규율이 하나 더 늘고, 재생성을 잊으면
 *    구현과 번들이 어긋난다 — 이 티켓에서는 그 위험을 만들지 않는다).
 * 2) `tsx`는 동적 임포트마다 그때그때 변환하지만 esbuild 기반이라 매우 빠르고(자체 캐시),
 *    이미 `test:node`(package.json)가 같은 방식으로 여러 .ts 파일을 직접 실행하고 있어
 *    레포 관례와도 맞는다.
 *
 * ## 배럴 임포트를 쓰지 않는 이유(2026-09-25 실측)
 * `src/lib/asset-generator/index.ts`(배럴, `export * from './xxx'` 체인)를 tsx로 동적
 * import하면 이름 있는 export가 전부 `모듈.default` 아래로 숨어버린다(Node의
 * cjs-module-lexer가 `export *` 체인의 재수출을 정적으로 추론하지 못해 생기는 상호운용
 * 문제로 보인다 — `mod.mulberry32`는 undefined, `mod.default.mulberry32`에는 값이 있었다).
 * 개별 파일(`random.ts`·`curve.ts`·`render.ts`·`presetSerialize.ts`)을 직접 import하면
 * 이름 있는 export가 정상적으로 보인다 — 그래서 렌더 본문(`renderCard.mjs`)은 배럴이 아니라 각 파일을
 * 상대 경로로 직접 가져온다. `@/*` tsconfig 별칭도 이 스크립트 위치(레포 밖 `scripts/` 트리)
 * 기준으로는 쓰지 않는다(레포의 다른 `scripts/*.ts`도 전부 상대 경로를 쓴다) — 상대 경로로
 * 단일 파일을 가져오면 별칭 없이도 정상 동작을 실측했다.
 *
 * ## 리본 원천 그래픽 기본값
 * CLI 인자에는 원천 그래픽(브랜드 글자/업로드 이미지) 선택지가 없다 — brandLetters.mjs 상단
 * 주석 참고. 어드민 기본값과 같은 letter 'J'로 고정한다.
 *
 * ## 정지 프레임 위치
 * 애니메이션 진행 위치(head)는 항상 0으로 고정한다 — 어드민 화면의 초기 상태(머리 위치
 * 슬라이더 0%)와 같다. 실렌더 비교 시 어드민에서 머리 위치를 옮기지 않은 상태로 PNG를
 * 저장해야 CLI 결과와 같은 그림이 나온다.
 *
 * ## 렌더 본문의 위치
 * 실제 그리기는 `renderCard.mjs`의 `renderCardPng`에 있다(홈피드 카드 원샷 `make-home-feed-card.mjs`와
 * 공유, 티켓 20260926_1544). 이 파일은 인자 파싱·파일 쓰기·결과 출력만 맡는다.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseRenderArgs } from './renderArgs.mjs'
import { renderCardPng } from './renderCard.mjs'

async function main() {
  const args = parseRenderArgs(process.argv.slice(2))

  const rendered = await renderCardPng(args)

  fs.mkdirSync(path.dirname(args.out), { recursive: true })
  fs.writeFileSync(args.out, rendered.buffer)

  console.log(JSON.stringify({ out: args.out, seed: rendered.seed, preset: args.preset, stage: rendered.stage, presetSource: rendered.presetSource, layers: rendered.layers }))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
