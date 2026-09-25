#!/usr/bin/env npx tsx
/**
 * JAM! 에셋 제너레이터 배지 등록 스크립트 (티켓 20260924_2202, PRD asset-generator §8)
 *
 * 윤진이 준비한 등록 묶음(`bundle.json` + 이미지)을 읽어 배지 행과 이미지를 함께 등록한다.
 * **실행 주체는 메인 세션(카리나)이고, 사용자가 `--dry-run` 요약을 컨펌한 뒤에만 `--dry-run` 없이
 * 실행한다**(CLAUDE.md 규칙 6 — Supabase는 staging·프로덕션 공용 단일 DB라 즉시 프로덕션에 반영된다).
 * 묶음 형식·검증 규칙·절차의 정본: `docs/specs/prd/asset-generator/REGISTRATION_BUNDLE.md`.
 *
 * ## 실행 (cwd는 반드시 jam-web — 아래 «별칭» 참고)
 * ```
 * cd jam-web
 * # 1) 검증만: DB·저장소·파일에 아무것도 쓰지 않는다(서비스 키가 있으면 DB를 읽기 전용으로만 조회)
 * npx tsx scripts/asset-generator/register-badge.mjs --bundle /절대경로/bundle.json --dry-run
 * # 2) 등록(컨펌 뒤): 이미지 업로드 → 배지 행 insert → registration-record.json·registration.sql 기록
 * npx tsx scripts/asset-generator/register-badge.mjs --bundle /절대경로/bundle.json [--record-dir <폴더>]
 * # 3) 되돌림: 배지 행과 저장소 파일 2개를 지운다(사용자 데이터나 다른 항목의 연결이 붙었으면 중단)
 * npx tsx scripts/asset-generator/register-badge.mjs --undo /절대경로/registration-record.json [--dry-run]
 * ```
 * 성공하면 종료 코드 0, 검증 실패·등록 실패·되돌림 중단은 한국어 사유를 찍고 종료 코드 1이다.
 * `--record-dir`을 주지 않으면 등록 기록은 bundle.json이 있는 폴더에 쓴다.
 *
 * 필요 환경변수(`.env.local`, 기존 `jam-web/scripts/recraft/*.js`·`render.mjs`와 같은 이름):
 * `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY`. 등록·되돌림에는 필수이고, `--dry-run`에서는
 * 없으면 DB 읽기 검사만 «건너뜀»으로 표시한다.
 *
 * ## 별칭(`@/`)과 실행 위치
 * 어드민 배지 API와 같은 검증 함수를 재사용하는데(`registerBundle.mjs` 머리말) 그 함수들이 내부에서
 * `@/` 별칭을 쓴다. tsx는 **cwd의 `tsconfig.json`**에서 별칭을 읽으므로 `jam-web`에서 실행해야 한다
 * (저장소 루트에서 실행하면 `Cannot find module '@/lib/...'`로 실패 — 2026-09-25 실측). 같은 이유로
 * 이 파일의 `registerFlow.mjs`·`badgeImageWebp`는 정적 import가 아니라 동적 import로 불러 실패 시
 * 안내 문구를 찍는다. `render.mjs`가 `src/lib/asset-generator/index.ts` 배럴 대신 개별 파일을 직접
 * import하는 것과 같은 이유로(tsx가 `export *` 체인의 이름을 숨긴다) 여기서도 배럴을 쓰지 않는다.
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

import { parseRegisterArgs } from './registerArgs.mjs'
import { loadEnv } from '../lib/loadEnv.mjs'

/** `@/` 별칭이 안 풀리면(cwd가 jam-web이 아니면) 원인을 알려 주는 Error로 바꾼다. */
async function importWithAliasHint(load) {
  try {
    return await load()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes("'@/")) {
      throw new Error(
        `@/ 별칭을 찾지 못했어요(${message.split('\n')[0]}). jam-web 폴더에서 실행해 주세요: cd jam-web && npx tsx scripts/asset-generator/register-badge.mjs ...`
      )
    }
    throw e
  }
}

async function main() {
  const args = parseRegisterArgs(process.argv.slice(2))

  const { runRegister, runUndo } = await importWithAliasHint(() => import('./registerFlow.mjs'))
  const { convertBadgeImageToWebp } = await importWithAliasHint(() => import('../../src/lib/admin/badgeImageWebp'))

  const env = loadEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null

  const out = { log: (text) => console.log(text), error: (text) => console.error(text) }
  const exitCode =
    args.mode === 'undo'
      ? await runUndo({ args, supabase, out })
      : await runRegister({ args, supabase, convertToWebp: convertBadgeImageToWebp, randomUUID, now: () => Date.now(), out })
  // process.exit()으로 끊지 않고 종료 코드만 남긴다 — 파이프로 이어진 표준 출력이 잘리지 않게 하려는 것이다.
  process.exitCode = exitCode
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
