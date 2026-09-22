// ticket-metrics.mjs 테스트 (티켓 20260921_2308)
//
// jam-web의 npm test는 루트 scripts/를 보지 않아 이 파일이 루트 scripts/의 순수 로직을
// 검증한다. scripts/verify.sh의 scripts-test 단계가 이 파일을 돌린다. 직접 실행도 된다.
// 실행: node scripts/ticket-metrics.test.mjs
//
// 픽스처 티켓 3종: 표 있음(재작업 없음) · 재작업(실행 행 2개) · 표 없음(옛 티켓, 정규식으로
// 긁지 않고 "미기록"으로만 센다).

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  TABLE_HEADER,
  parseTicketTable,
  collectTicketMetrics,
  formatMetricsTable,
  formatSecondsAsDuration,
} from './ticket-metrics.mjs'

function ticketText({ id, status, closed, body }) {
  return `---
id: "${id}"
category: Infra
priority: P2
status: ${status}
created: 2026-09-01
${closed ? `closed: ${closed}` : ''}
---

# [Infra] 픽스처 티켓 ${id}

## 완료 기록

${body}
`
}

const TABLE_NO_REWORK = `${TABLE_HEADER}
|---|---|---|---|---|---|
| 실행 | 1 | 100,000 | 20,000 / 10,000 | 5분 0초 | 30 |
| 합계 | 1 | 100,000 | 20,000 / 10,000 | 5분 0초 | 30 |`

const TABLE_REWORK = `${TABLE_HEADER}
|---|---|---|---|---|---|
| 첫 구현 | 2 | 166,921 | 35,851 / 22,637 | 11분 18초 | 85 |
| 재작업 | 2 | 191,061 | 45,082 / 23,749 | 14분 24초 | 78 |
| 합계 | 4 | 357,982 | 80,933 / 46,386 | 25분 42초 | 163 |`

function testParseTicketTableReturnsNullWhenNoHeader() {
  const text = ticketText({
    id: '20260901_0001',
    status: 'CLOSED',
    closed: '2026-09-01',
    body: '표 없이 문장으로만 적은 옛 완료 기록입니다. 전체 토큰 100,000, 소요 5분.',
  })
  assert.equal(parseTicketTable(text), null, '고정 헤더가 없으면 문장을 긁지 않고 null이어야 한다')
}

function testParseTicketTableNoRework() {
  const text = ticketText({
    id: '20260901_0002',
    status: 'CLOSED',
    closed: '2026-09-02',
    body: TABLE_NO_REWORK,
  })
  const table = parseTicketTable(text)
  assert.deepEqual(table, {
    runCount: 1,
    isRework: false,
    totalTokens: 100000,
    totalSeconds: 300,
  })
}

function testParseTicketTableRework() {
  const text = ticketText({
    id: '20260901_0003',
    status: 'CLOSED',
    closed: '2026-09-03',
    body: TABLE_REWORK,
  })
  const table = parseTicketTable(text)
  assert.equal(table.runCount, 2, '실행 행이 2개면 재작업으로 세야 한다')
  assert.equal(table.isRework, true)
  assert.equal(table.totalTokens, 357982, '합계 행의 전체 토큰을 읽어야 한다')
  assert.equal(table.totalSeconds, 25 * 60 + 42, '합계 행의 소요를 초로 환산해야 한다')
}

function testFormatSecondsAsDuration() {
  assert.equal(formatSecondsAsDuration(300), '5분 0초')
  assert.equal(formatSecondsAsDuration(1542), '25분 42초')
  assert.equal(formatSecondsAsDuration(3661), '1시간 1분 1초')
}

function makeFakeRepo(tickets) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ticket-metrics-test-'))
  const ticketsDir = join(repoRoot, 'docs', 'tickets', 'p2-normal')
  mkdirSync(ticketsDir, { recursive: true })
  for (const t of tickets) {
    writeFileSync(join(ticketsDir, `${t.id}.md`), ticketText(t))
  }
  return repoRoot
}

function testCollectTicketMetricsCountsThreeFixtureTypes() {
  const repoRoot = makeFakeRepo([
    { id: '20260901_0001', status: 'CLOSED', closed: '2026-09-01', body: '표 없는 옛 완료 기록.' },
    { id: '20260901_0002', status: 'CLOSED', closed: '2026-09-02', body: TABLE_NO_REWORK },
    { id: '20260901_0003', status: 'CLOSED', closed: '2026-09-03', body: TABLE_REWORK },
    // OPEN 티켓은 집계 대상이 아니다.
    { id: '20260901_0004', status: 'OPEN', closed: null, body: TABLE_NO_REWORK },
  ])
  try {
    const metrics = collectTicketMetrics(repoRoot, null)
    assert.equal(metrics.closedCount, 3, 'CLOSED 3건만 세야 한다(OPEN 제외)')
    assert.equal(metrics.tableCount, 2)
    assert.equal(metrics.unrecordedCount, 1)
    assert.equal(metrics.reworkCount, 1)
    assert.equal(metrics.tokenSum, 100000 + 357982)
    assert.equal(metrics.durationSum, 300 + 1542)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}

function testCollectTicketMetricsFiltersBySince() {
  const repoRoot = makeFakeRepo([
    { id: '20260901_0001', status: 'CLOSED', closed: '2026-09-01', body: TABLE_NO_REWORK },
    { id: '20260910_0001', status: 'CLOSED', closed: '2026-09-10', body: TABLE_REWORK },
  ])
  try {
    const metrics = collectTicketMetrics(repoRoot, '2026-09-05')
    assert.equal(metrics.closedCount, 1, '기준일 이전 closed 티켓은 제외해야 한다')
    assert.equal(metrics.tableCount, 1)
    assert.equal(metrics.reworkCount, 1)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}

function testCollectTicketMetricsCountsSkipFlag() {
  const bodyWithSkip = `${TABLE_NO_REWORK}\n\n재작업 사유: 우회 \`JAM_SKIP_DOCLINT=1\` 사용.`
  const repoRoot = makeFakeRepo([
    { id: '20260901_0001', status: 'CLOSED', closed: '2026-09-01', body: bodyWithSkip },
    { id: '20260901_0002', status: 'CLOSED', closed: '2026-09-02', body: TABLE_NO_REWORK },
  ])
  try {
    const metrics = collectTicketMetrics(repoRoot, null)
    assert.equal(metrics.skipFlagCount, 1, 'JAM_SKIP_ 언급 티켓만 세야 한다')
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}

function testFormatMetricsTableProducesMarkdownTable() {
  const metrics = collectTicketMetrics(
    makeFakeRepoAndKeep([
      { id: '20260901_0002', status: 'CLOSED', closed: '2026-09-02', body: TABLE_NO_REWORK },
    ]),
    null
  )
  const out = formatMetricsTable(metrics, '2026-09-01')
  assert.match(out, /^## 워크플로 수치 \(2026-09-01 이후 CLOSED\)/)
  assert.match(out, /\| 티켓 수 \(CLOSED\) \| 1 \|/)
  assert.match(out, /\| 표 있는 티켓 수 \| 1 \|/)
  assert.match(out, /\| 루프 장부 — 머지 \| 0 \(2단계 도입 전\) \|/)
}

let _keepRepos = []
function makeFakeRepoAndKeep(tickets) {
  const repoRoot = makeFakeRepo(tickets)
  _keepRepos.push(repoRoot)
  return repoRoot
}

function cleanupKeptRepos() {
  for (const r of _keepRepos) rmSync(r, { recursive: true, force: true })
  _keepRepos = []
}

function main() {
  testParseTicketTableReturnsNullWhenNoHeader()
  testParseTicketTableNoRework()
  testParseTicketTableRework()
  testFormatSecondsAsDuration()
  testCollectTicketMetricsCountsThreeFixtureTypes()
  testCollectTicketMetricsFiltersBySince()
  testCollectTicketMetricsCountsSkipFlag()
  testFormatMetricsTableProducesMarkdownTable()
  cleanupKeptRepos()
  console.log('ticket-metrics.test.mjs 통과')
}

main()
