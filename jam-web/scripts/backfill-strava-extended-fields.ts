#!/usr/bin/env npx tsx
/**
 * 기존 `strava_activities.normalized`에 v5 확장 6필드를 채우는 백필 러너 (티켓 20260905_0029)
 *
 * 심박·파워·케이던스·최고속도·최고도달고도·경과시간은 Strava **목록 응답**에 이미 오던
 * 값인데 `normalizeActivity`가 읽지 않아 버려졌다. 코드는 고쳐졌지만 기존 873행(실측
 * 2026-09-05)은 이미 처리됨으로 표시돼 있어 일반 싱크로는 채워지지 않는다.
 *
 * ## 하는 일 / 하지 않는 일
 * - 하는 일: 목록 엔드포인트 재조회 → `normalized`에 확장 6필드만 병합 → 그 행만 UPDATE
 * - 하지 않는 일: **배지 평가·아이템 드랍·미션 판정·소식·피드 없음.**
 *   `last_synced_at`도 건드리지 않는다. 기존 `normalized` 키를 지우거나 덮어쓰지 않는다
 *
 * ## 실행
 * ```
 * cd jam-web
 * npx tsx scripts/backfill-strava-extended-fields.ts            # 미리보기(기본) — 쓰지 않는다
 * npx tsx scripts/backfill-strava-extended-fields.ts --apply    # 실제 반영
 * npx tsx scripts/backfill-strava-extended-fields.ts --apply --user <uuid> [--user <uuid> ...]
 * ```
 * 옵션: `--budget <n>` Strava 요청 총량(기본 90) · `--delay <ms>` 요청 간격(기본 1500)
 *
 * 필요 환경변수(`.env.local`에서 읽는다):
 * `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `ENCRYPTION_KEY` ·
 * `STRAVA_CLIENT_ID` · `STRAVA_CLIENT_SECRET`
 *
 * 멱등이다 — 중단하고 그대로 다시 돌리면 이어진다.
 *
 * ⚠️ 미리보기 모드에서도 **만료된 access_token은 갱신·저장된다.** Strava를 호출하려면
 * 유효한 토큰이 있어야 하고, Strava가 refresh_token을 회전시키므로 갱신분을 저장하지 않으면
 * 그 유저의 연동이 다음 싱크에서 끊긴다. `strava_activities`는 `--apply` 없이는 쓰지 않는다.
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
  'ENCRYPTION_KEY',
  'STRAVA_CLIENT_ID',
  'STRAVA_CLIENT_SECRET',
] as const

interface Args {
  apply: boolean
  userIds: string[]
  budget?: number
  delayMs?: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, userIds: [] }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--apply') args.apply = true
    else if (token === '--user') args.userIds.push(argv[++i])
    else if (token === '--budget') args.budget = Number(argv[++i])
    else if (token === '--delay') args.delayMs = Number(argv[++i])
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
  const { backfillExtendedFields } = await import('../src/lib/strava/backfill')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  if (!args.apply) {
    console.info('[backfill] 미리보기 모드입니다 — DB에 쓰지 않습니다. 반영하려면 --apply')
  }

  const summary = await backfillExtendedFields(supabase, {
    apply: args.apply,
    userIds: args.userIds,
    requestBudget: args.budget,
    requestDelayMs: args.delayMs,
  })

  console.info('\n=== 백필 결과 ===')
  for (const user of summary.users) {
    console.info(
      `- ${user.userId}: Strava ${user.fetched}건 · 대조 ${user.matched}건 · ` +
        `갱신대상 ${user.changed}건 · 반영 ${user.updated}건 · 요청 ${user.requests}회` +
        (user.truncated ? ' (예산 소진으로 중단)' : '') +
        (user.error ? ` · 오류: ${user.error}` : '')
    )
  }
  console.info(
    `합계: 대조 ${summary.totals.matched}건 · 갱신대상 ${summary.totals.changed}건 · ` +
      `반영 ${summary.totals.updated}건 · Strava 요청 ${summary.totals.requests}회`
  )
  if (summary.truncated) {
    console.info('요청 예산이 소진돼 일부가 남았습니다. 15분 뒤 같은 명령을 다시 실행하세요.')
  }
  if (!summary.apply) {
    console.info('미리보기였습니다 — 실제 반영은 --apply를 붙여 다시 실행하세요.')
  }
}

main().catch((err) => {
  console.error('[backfill] 실패:', err)
  process.exit(1)
})
