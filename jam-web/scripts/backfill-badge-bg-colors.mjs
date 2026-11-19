#!/usr/bin/env node
/**
 * 기존 배지의 이미지 대표색(`badges.bg_colors`)을 일괄 계산해 저장한다 (티켓 20261119_1651, 상위 20261119_1650).
 *
 * 대상: `bg_colors IS NULL` 이고 `image_url IS NOT NULL` 인 배지(소프트 삭제된 배지 포함).
 * 알고리즘은 `src/lib/badgeColorExtract.core.mjs`(서버 함수와 공유)를 쓴다 — 여기에 다시 적지 않는다.
 * 재실행 안전: 이미 값이 있으면(`[]` 포함) 읽지 않는다. 저장은 «아직 NULL이고 이미지 주소가 읽을 때와 같은 행»에만
 * 걸어, 계산하는 사이 이미지가 바뀐 행에 낡은 색이 들어가지 않는다. 색 추출에 실패한 배지는 저장하지 않고(NULL로 남고)
 * 마지막에 목록으로 출력한다.
 *
 * 실행(메인 세션이 마이그레이션 347 적용 뒤에 실행한다):
 *   node scripts/backfill-badge-bg-colors.mjs --dry-run [--limit 200] [--concurrency 6]
 *   node scripts/backfill-badge-bg-colors.mjs [--limit 200] [--concurrency 6]
 * 필요 환경변수(`.env.local`): NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY — 값은 출력하지 않는다.
 * 정적 주소(`/badges/...`)는 `jam-web/public/`에서 읽으므로 jam-web 폴더에서 실행한다.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { extractBadgeColorsFromUrl } from '../src/lib/badgeColorExtract.core.mjs'
import { loadEnv } from './lib/loadEnv.mjs'

const PAGE_SIZE = 500
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_PUBLIC_DIR = path.join(scriptDir, '..', 'public')

function parseArgs(argv) {
  const out = { dryRun: false, limit: Infinity, concurrency: 6 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--limit') out.limit = Number(argv[++i])
    else if (a === '--concurrency') out.concurrency = Number(argv[++i])
  }
  return out
}

/** 색 개수별 분포 표에 쓰는 키 */
function bucketOf(colors) {
  if (colors === null) return 'failed'
  if (colors.length === 0) return 'empty'
  return `c${colors.length}`
}

/** 작업 목록을 동시에 `concurrency`개씩만 돌린다 */
async function mapLimited(items, concurrency, fn) {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
}

/**
 * @param {{
 *   client: { from: (table: string) => any }, // supabase-js 클라이언트(시험에서는 메모리 표 대역)
 *   dryRun?: boolean, limit?: number, concurrency?: number,
 *   extract?: (imageUrl: string) => Promise<string[] | null>,
 *   log?: (line: string) => void,
 * }} options
 */
export async function runBackfill({
  client,
  dryRun = false,
  limit = Infinity,
  concurrency = 6,
  extract = (url) => extractBadgeColorsFromUrl(url, { publicDir: DEFAULT_PUBLIC_DIR }),
  log = console.log,
}) {
  const stats = { read: 0, saved: 0, skippedStale: 0, c3: 0, c2: 0, c1: 0, empty: 0, failed: 0 }
  const failures = []
  let lastId = null

  while (stats.read < limit) {
    let query = client
      .from('badges')
      .select('id, image_url')
      .is('bg_colors', null)
      .not('image_url', 'is', null)
      .order('id', { ascending: true })
      .limit(Math.min(PAGE_SIZE, limit - stats.read))
    if (lastId !== null) query = query.gt('id', lastId)
    const { data, error } = await query
    if (error) throw new Error(`배지 목록을 읽지 못했습니다: ${error.message}`)
    if (!data || data.length === 0) break
    lastId = data[data.length - 1].id
    stats.read += data.length

    await mapLimited(data, concurrency, async (badge) => {
      const colors = await extract(badge.image_url)
      stats[bucketOf(colors)] += 1
      if (colors === null) {
        failures.push({ id: badge.id, image_url: badge.image_url })
        return
      }
      if (!dryRun) {
        const { data: updated, error: updateError } = await client
          .from('badges')
          .update({ bg_colors: colors })
          .eq('id', badge.id)
          .eq('image_url', badge.image_url)
          .is('bg_colors', null)
          .select('id')
        if (updateError) {
          stats.failed += 1
          stats[bucketOf(colors)] -= 1
          failures.push({ id: badge.id, image_url: badge.image_url, reason: `저장 실패: ${updateError.message}` })
          return
        }
        if (updated && updated.length > 0) stats.saved += 1
        else stats.skippedStale += 1
      }
    })
    log(`진행: 읽음 ${stats.read}건, 저장 ${stats.saved}건, 실패 ${stats.failed}건`)
  }

  log(dryRun ? '--dry-run: 저장하지 않았습니다.' : '저장을 마쳤습니다.')
  log(
    `분포: 색 3개 ${stats.c3} · 2개 ${stats.c2} · 1개 ${stats.c1} · 색 없음([]) ${stats.empty} · 실패 ${stats.failed}`,
  )
  log(`읽은 배지 ${stats.read}건, 저장 ${stats.saved}건, 읽은 뒤 이미지·색이 바뀌어 건너뜀 ${stats.skippedStale}건`)
  if (failures.length > 0) {
    log(`실패 목록(${failures.length}건, bg_colors는 NULL로 남음):`)
    for (const f of failures) log(`  ${f.id}\t${f.image_url}${f.reason ? `\t${f.reason}` : ''}`)
  }
  return { stats, failures }
}

async function main() {
  const { dryRun, limit, concurrency } = parseArgs(process.argv.slice(2))
  if (!(limit > 0) || !Number.isInteger(concurrency) || concurrency < 1) {
    console.error('사용법: node scripts/backfill-badge-bg-colors.mjs [--dry-run] [--limit N] [--concurrency N]')
    process.exit(1)
  }
  const env = { ...loadEnv(), ...process.env }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 필요합니다(jam-web/.env.local).')
    process.exit(1)
  }
  const client = createClient(url, key, { auth: { persistSession: false } })
  await runBackfill({ client, dryRun, limit, concurrency })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
