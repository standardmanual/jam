#!/usr/bin/env node
// poi 지역 칸(sido·gu) 채움 스크립트 (티켓 20261102_2254, 상위 20260930_1503).
//
// 좌표를 NCP 역지오코딩(`jam-web/src/lib/poi/reverse-geocode.ts`의 `reverseGeocodeToRegions`)으로 바꿔 `poi.sido`·`poi.gu`를 채운다.
// 마이그레이션 313이 먼저 적용돼 있어야 한다. **기본은 드라이런**이다 — NCP는 부르지만 DB에는 쓰지 않는다. `--apply`가 있을 때만 쓴다.
//
// 사용:
//   node scripts/backfill-poi-region.mjs                 드라이런: 채울 행 수·실패 예상 수를 출력한다(쓰기 없음).
//   node scripts/backfill-poi-region.mjs --limit 20      앞에서 20행만 시험한다(드라이런).
//   node scripts/backfill-poi-region.mjs --apply         채울 행을 실제로 쓴다. --limit와 함께 쓸 수 있다.
//
// 환경변수(값은 출력하지 않는다):
//   NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY   DB 읽기·쓰기 (REST)
//   NEXT_PUBLIC_NAVER_MAP_CLIENT_ID · NCP_MAP_CLIENT_SECRET   NCP 역지오코딩
//
// 동작:
//   - `sido`가 이미 채워진 행은 건너뛴다(시·군·구가 없는 지역, 예: 세종특별자치시는 gu가 NULL로 남아도 채워진 것으로 본다).
//   - 호출은 한 번에 하나씩, 호출 사이 200ms 이상 띄운다(초당 5건 이하).
//   - 실패(역지오코딩 null 또는 시·도 없음)한 행은 NULL로 두고, 개수와 id 목록(최대 20개)만 출력한다.
//   - 쓰기는 `sido IS NULL`인 행에만 건다(동시에 다른 곳에서 채운 값을 덮어쓰지 않는다).

import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const REVERSE_GEOCODE_MODULE = 'jam-web/src/lib/poi/reverse-geocode.ts'
/** 호출 사이 최소 간격(ms). 200ms = 초당 5건 */
export const MIN_INTERVAL_MS = 200
export const MAX_LISTED_FAILURES = 20
const PAGE_SIZE = 1000

export function parseArgs(argv) {
  const args = { apply: false, limit: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') args.apply = true
    else if (arg === '--limit') {
      const raw = argv[i + 1]
      if (!/^[1-9]\d*$/.test(raw ?? '')) throw new Error('--limit 뒤에는 1 이상의 정수를 적어 주세요.')
      args.limit = Number(raw)
      i += 1
    } else throw new Error(`알 수 없는 옵션이에요: ${arg}`)
  }
  return args
}

/** 아직 채우지 않은 행(sido가 NULL)만 고른다 */
export function selectTargets(rows) {
  return rows.filter((row) => row.sido === null || row.sido === undefined)
}

const sleepReal = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 채움 본체. 외부 의존은 모두 주입한다(시험은 가짜로 바꾼다).
 * @param {object} deps
 * @param {() => Promise<Array<{id:string, latitude:number, longitude:number, sido:string|null, gu:string|null}>>} deps.fetchRows
 * @param {(lat:number, lng:number) => Promise<{sido:string|null, gu:string|null}|null>} deps.geocode
 * @param {(id:string, sido:string, gu:string|null) => Promise<void>} deps.writeRow
 * @param {boolean} deps.apply
 * @param {number|null} [deps.limit]
 * @param {(ms:number) => Promise<void>} [deps.sleep]
 */
export async function runBackfill({ fetchRows, geocode, writeRow, apply, limit = null, sleep = sleepReal }) {
  const rows = await fetchRows()
  const pending = selectTargets(rows)
  const targets = limit === null ? pending : pending.slice(0, limit)
  const report = {
    totalRows: rows.length,
    alreadyFilled: rows.length - pending.length,
    targets: targets.length,
    resolved: 0,
    failed: 0,
    failedIds: [],
    written: 0,
    apply,
  }

  for (let i = 0; i < targets.length; i += 1) {
    if (i > 0) await sleep(MIN_INTERVAL_MS)
    const row = targets[i]
    let regions = null
    try {
      regions = await geocode(row.latitude, row.longitude)
    } catch {
      regions = null
    }
    if (!regions || !regions.sido) {
      report.failed += 1
      if (report.failedIds.length < MAX_LISTED_FAILURES) report.failedIds.push(row.id)
      continue
    }
    report.resolved += 1
    if (apply) {
      await writeRow(row.id, regions.sido, regions.gu ?? null)
      report.written += 1
    }
  }
  return report
}

export function formatReport(report) {
  const lines = [
    `모드: ${report.apply ? '적용(--apply)' : '드라이런(쓰기 없음)'}`,
    `poi 전체 ${report.totalRows}행 · 이미 채워진 ${report.alreadyFilled}행 · 이번 대상 ${report.targets}행`,
    `역지오코딩 성공 ${report.resolved}행 · 실패 ${report.failed}행`,
    report.apply ? `DB에 쓴 행 ${report.written}행` : `쓸 예정 ${report.resolved}행 (--apply로 쓴다)`,
  ]
  if (report.failed > 0) {
    const more = report.failed > report.failedIds.length ? ` 외 ${report.failed - report.failedIds.length}개` : ''
    lines.push(`실패 id(최대 ${MAX_LISTED_FAILURES}개): ${report.failedIds.join(', ')}${more}`)
  }
  return lines.join('\n')
}

/** Supabase REST(PostgREST)를 fetch로 부르는 읽기·쓰기. 키는 헤더에만 쓰고 출력하지 않는다 */
export function createRestClient({ url, serviceKey, fetchImpl = fetch }) {
  const base = `${url.replace(/\/$/, '')}/rest/v1/poi`
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  async function fetchRows() {
    const rows = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const res = await fetchImpl(`${base}?select=id,latitude,longitude,sido,gu&order=id.asc`, {
        headers: { ...headers, Range: `${from}-${from + PAGE_SIZE - 1}`, 'Range-Unit': 'items' },
      })
      if (!res.ok) throw new Error(`poi를 읽지 못했어요 (HTTP ${res.status}). 마이그레이션 313을 적용했는지 확인해 주세요.`)
      const page = await res.json()
      rows.push(...page)
      if (page.length < PAGE_SIZE) return rows
    }
  }

  async function writeRow(id, sido, gu) {
    const res = await fetchImpl(`${base}?id=eq.${encodeURIComponent(id)}&sido=is.null`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ sido, gu }),
    })
    if (!res.ok) throw new Error(`poi ${id}를 쓰지 못했어요 (HTTP ${res.status}).`)
  }

  return { fetchRows, writeRow }
}

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_NAVER_MAP_CLIENT_ID',
  'NCP_MAP_CLIENT_SECRET',
]

async function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
  const missing = REQUIRED_ENV.filter((key) => !process.env[key])
  if (missing.length > 0) {
    console.error(`환경변수가 없어요: ${missing.join(', ')}`)
    process.exit(1)
  }

  const { reverseGeocodeToRegions } = await import(pathToFileURL(join(ROOT, REVERSE_GEOCODE_MODULE)).href)
  const client = createRestClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  const report = await runBackfill({
    fetchRows: client.fetchRows,
    geocode: reverseGeocodeToRegions,
    writeRow: client.writeRow,
    apply: args.apply,
    limit: args.limit,
  })
  console.log(formatReport(report))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
