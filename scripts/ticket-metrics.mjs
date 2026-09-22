#!/usr/bin/env node
// 실행 지표 집계기 — CLOSED 티켓 완료 기록에 있는 고정 표(20260921_0841 표준)를 훑어
// 주간 브리핑 「워크플로 수치」 절에 붙일 마크다운 표를 만든다. (티켓 20260921_2308)
//
// 표 양식(완료 기록에 그대로 쓰는 고정 헤더, 글자 단위로 일치해야 스크립트가 읽는다):
//   | 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
//   마지막 행은 반드시 `| 합계 | ... |`. 재작업이 있으면 실행 행이 둘 이상이 된다.
//
// 표 없는 옛 티켓은 파싱하지 않고 "미기록"으로만 센다 — 정규식으로 문장을 긁지 않는다.
//
// 사용법: node scripts/ticket-metrics.mjs [--since YYYY-MM-DD]
//   --since 없으면 CLOSED 티켓 전체를 센다.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

export const TABLE_HEADER =
  '| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |'

function findRepoRoot() {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
}

function walkMarkdownFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'Archive') continue // 보관함은 폐기된 기록 — 집계 대상 아님
    if (entry === '_TEMPLATE.md') continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...walkMarkdownFiles(full))
    } else if (entry.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const fm = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*"?([^"\n]*?)"?\s*$/)
    if (kv) fm[kv[1]] = kv[2].trim()
  }
  return fm
}

function parseDurationToSeconds(text) {
  if (!text) return null
  let seconds = 0
  let found = false
  const h = text.match(/(\d+)\s*시간/)
  const m = text.match(/(\d+)\s*분/)
  const s = text.match(/(\d+)\s*초/)
  if (h) {
    seconds += Number(h[1]) * 3600
    found = true
  }
  if (m) {
    seconds += Number(m[1]) * 60
    found = true
  }
  if (s) {
    seconds += Number(s[1])
    found = true
  }
  return found ? seconds : null
}

export function formatSecondsAsDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.round(totalSeconds % 60)
  const parts = []
  if (h > 0) parts.push(`${h}시간`)
  if (h > 0 || m > 0) parts.push(`${m}분`)
  parts.push(`${s}초`)
  return parts.join(' ')
}

function parseTokenNumber(text) {
  if (!text) return null
  const cleaned = text.replace(/,/g, '').trim()
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function formatNumber(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 완료 기록 안에서 고정 헤더로 시작하는 표 하나를 파싱한다. 글자 단위로 일치하는 헤더가
// 없으면 표가 없는 것으로 보고 null을 돌려준다(정규식으로 문장을 긁지 않는다).
export function parseTicketTable(text) {
  const lines = text.split('\n')
  const headerIdx = lines.findIndex((l) => l.trim() === TABLE_HEADER)
  if (headerIdx === -1) return null

  const rows = []
  // headerIdx+1은 구분선(|---|...|), 데이터 행은 그 다음 줄부터 표가 끝날 때까지.
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim().startsWith('|')) break
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 6) break
    rows.push(cells)
  }
  if (rows.length === 0) return null

  const totalRow = rows.find((r) => r[0] === '합계') ?? null
  const runRows = rows.filter((r) => r[0] !== '합계')

  const totalTokens = totalRow ? parseTokenNumber(totalRow[2]) : null
  const totalSeconds = totalRow ? parseDurationToSeconds(totalRow[4]) : null

  return {
    runCount: runRows.length,
    isRework: runRows.length >= 2,
    totalTokens,
    totalSeconds,
  }
}

function median(numbers) {
  if (numbers.length === 0) return null
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// repoRoot·sinceDate(YYYY-MM-DD 문자열 또는 null)를 주입받아 테스트 가능하게 만든다.
export function collectTicketMetrics(repoRoot, sinceDate = null) {
  const ticketsDir = join(repoRoot, 'docs', 'tickets')
  const files = walkMarkdownFiles(ticketsDir)

  let closedCount = 0
  let tableCount = 0
  let unrecordedCount = 0
  let reworkCount = 0
  let skipFlagCount = 0
  const tokenTotals = []
  const durationTotals = []

  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const fm = parseFrontmatter(text)
    if (!fm || fm.status !== 'CLOSED') continue
    if (sinceDate && (!fm.closed || fm.closed < sinceDate)) continue

    closedCount++
    if (text.includes('JAM_SKIP_')) skipFlagCount++

    const table = parseTicketTable(text)
    if (!table) {
      unrecordedCount++
      continue
    }
    tableCount++
    if (table.isRework) reworkCount++
    if (table.totalTokens != null) tokenTotals.push(table.totalTokens)
    if (table.totalSeconds != null) durationTotals.push(table.totalSeconds)
  }

  return {
    closedCount,
    tableCount,
    unrecordedCount,
    reworkCount,
    skipFlagCount,
    tokenSum: tokenTotals.reduce((a, b) => a + b, 0),
    tokenMedian: median(tokenTotals),
    durationSum: durationTotals.reduce((a, b) => a + b, 0),
    durationMedian: median(durationTotals),
    // 루프 장부(작성자가 루틴인 브랜치의 머지·반려 수)는 2단계 도입 전까지 0으로 둔다
    // (20260921_2234 §5의 2단계, 이 티켓 완료 조건).
    loopMerged: 0,
    loopRejected: 0,
  }
}

export function formatMetricsTable(metrics, sinceDate) {
  const lines = []
  lines.push(`## 워크플로 수치${sinceDate ? ` (${sinceDate} 이후 CLOSED)` : ' (CLOSED 전체)'}`)
  lines.push('')
  lines.push('| 항목 | 값 |')
  lines.push('|---|---|')
  lines.push(`| 티켓 수 (CLOSED) | ${metrics.closedCount} |`)
  lines.push(`| 표 있는 티켓 수 | ${metrics.tableCount} |`)
  lines.push(`| 표 없음(미기록) | ${metrics.unrecordedCount} |`)
  lines.push(`| 전체 토큰 합계 | ${formatNumber(metrics.tokenSum)} |`)
  lines.push(
    `| 전체 토큰 중앙값 | ${metrics.tokenMedian != null ? formatNumber(metrics.tokenMedian) : '미기록'} |`
  )
  lines.push(`| 소요 합계 | ${formatSecondsAsDuration(metrics.durationSum)} |`)
  lines.push(
    `| 소요 중앙값 | ${metrics.durationMedian != null ? formatSecondsAsDuration(metrics.durationMedian) : '미기록'} |`
  )
  lines.push(`| 재작업 티켓 수 | ${metrics.reworkCount} |`)
  lines.push(`| 우회 플래그(JAM_SKIP_) 언급 티켓 수 | ${metrics.skipFlagCount} |`)
  lines.push(`| 루프 장부 — 머지 | ${metrics.loopMerged} (2단계 도입 전) |`)
  lines.push(`| 루프 장부 — 반려 | ${metrics.loopRejected} (2단계 도입 전) |`)
  return lines.join('\n')
}

function parseArgs(argv) {
  const sinceIdx = argv.indexOf('--since')
  const sinceDate = sinceIdx !== -1 ? argv[sinceIdx + 1] : null
  return { sinceDate }
}

function main() {
  const { sinceDate } = parseArgs(process.argv.slice(2))
  const repoRoot = findRepoRoot()
  const metrics = collectTicketMetrics(repoRoot, sinceDate)
  console.log(formatMetricsTable(metrics, sinceDate))
}

// 테스트에서 이 모듈을 import할 때는 실행하지 않는다. 한글 경로는 URL에서 퍼센트 인코딩되므로
// 문자열이 아니라 파일 경로로 바꿔 비교한다.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
