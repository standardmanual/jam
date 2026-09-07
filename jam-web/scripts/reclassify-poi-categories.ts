#!/usr/bin/env npx tsx
/**
 * 기존 자동수집(T2) POI 재분류 러너 (티켓 20260907_1243)
 *
 * 카테고리 체계 재정리(마이그레이션 144)로 기존 599건(2026-09-07 기준, 산·기차/지하철
 * 제외)의 자동수집 POI가 새 카테고리 표 어디에도 정확히 대응하지 않을 수 있다. 원본 검색
 * 키워드가 DB에 없어(마이그레이션 143 이전 수집분) 이름만으로는 원래 무엇으로 수집됐는지
 * 판정할 수 없다 — 이름+좌표로 네이버 지역검색에 재조회해 원본 분류를 다시 받아 매핑한다.
 * 매핑 규칙·안전장치는 src/lib/poi/reclassify.ts 상단 주석 참고.
 *
 * ## 실행
 * ```
 * cd jam-web
 * npx tsx scripts/reclassify-poi-categories.ts                # 미리보기 — 쓰지 않는다
 * npx tsx scripts/reclassify-poi-categories.ts --apply         # 실제 반영
 * npx tsx scripts/reclassify-poi-categories.ts --limit 20      # 일부만 미리보기(속도 확인용)
 * ```
 * 옵션: `--concurrency <n>` 동시 네이버 조회 수(기본 5)
 *
 * 필요 환경변수(`.env.local`): `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` ·
 * `NAVER_LOCAL_SEARCH_CLIENT_ID` · `NAVER_LOCAL_SEARCH_CLIENT_SECRET`
 *
 * 선행 조건: 마이그레이션 144(카테고리 구조 재정리) 적용 후 실행할 것 — 그 전에는
 * poi_categories에 새 카테고리 표(stadium/school/route 등)가 없어 매핑 결과가 실제
 * 카테고리 목록과 어긋난다.
 *
 * 599콜은 네이버 일일 한도(25,000) 대비 여유 있다 — 동시 처리량(concurrency)만 제한한다.
 *
 * ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라 **작성만 하고
 * 실행하지 않았다.** 실행(미리보기 포함)은 사용자 승인 후 오케스트레이터가 처리한다 — 이
 * 역할에는 DB 조회 도구 자체가 없어 작성 시점에 실측 dry-run 결과를 내지 못했다(완료 보고
 * alerts 참고).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** `.env.local`을 process.env로 올린다 (다른 1회성 스크립트와 같은 방식) */
function loadEnv(): void {
  const envPath = path.join(HERE, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local을 찾을 수 없습니다: ${envPath}`)
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)="?([^"]*)"?$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NAVER_LOCAL_SEARCH_CLIENT_ID',
  'NAVER_LOCAL_SEARCH_CLIENT_SECRET',
] as const

interface Args {
  apply: boolean
  limit?: number
  concurrency?: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--apply') args.apply = true
    else if (token === '--limit') args.limit = Number(argv[++i])
    else if (token === '--concurrency') args.concurrency = Number(argv[++i])
    else throw new Error(`알 수 없는 옵션: ${token}`)
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  loadEnv()

  const missing = REQUIRED_ENV.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`환경변수 누락: ${missing.join(', ')}`)
  }

  // 동적 import — `.env.local` 로딩보다 먼저 모듈이 평가되면 환경변수를 못 읽는다
  const { reclassifyAutoCollectedPois } = await import('../src/lib/poi/reclassify')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  if (!args.apply) {
    console.info('[reclassify] 미리보기 모드입니다 — DB에 쓰지 않습니다. 반영하려면 --apply')
  }

  const summary = await reclassifyAutoCollectedPois(supabase, {
    apply: args.apply,
    limit: args.limit,
    concurrency: args.concurrency,
  })

  console.info(`\n=== 재분류 결과 (대상 ${summary.totalTargets}건) ===`)
  for (const [category, count] of Object.entries(summary.byNewCategory).sort((a, b) => b[1] - a[1])) {
    console.info(`- ${category}: ${count}건`)
  }
  console.info(`지오매칭 실패(동명이인 등, unassigned로 배정): ${summary.unresolvedCount}건`)
  if (summary.errors.length > 0) {
    console.info(`\n오류 ${summary.errors.length}건:`)
    for (const e of summary.errors) console.info(`- ${e.name} (${e.id}): ${e.message}`)
  }
  if (args.apply) {
    console.info(`\n반영 완료: ${summary.updatedCount}건 UPDATE`)
  } else {
    console.info('\n미리보기였습니다 — 실제 반영은 --apply를 붙여 다시 실행하세요.')
  }
}

main().catch((err) => {
  console.error('[reclassify] 실패:', err)
  process.exit(1)
})
