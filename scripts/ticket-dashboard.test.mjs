// ticket-dashboard.mjs 테스트 — 예약 작업 리포트 누락 감지 (티켓 20260918_1153)
//
// jam-web의 npm test는 루트 scripts/를 보지 않아 이 파일이 루트 scripts/의 순수 로직을 검증한다.
// scripts/verify.sh의 scripts-test 단계가 이 파일을 돌린다(티켓 20260919_1306). 직접 실행도 된다.
// 실행: node scripts/ticket-dashboard.test.mjs
//
// 파일시스템·git에 의존하지 않는 순수 함수(파싱·시각 계산)만 검증한다.

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseWeeklySchedule,
  parseMonthlySchedule,
  weeklyDeadlinePassed,
  monthlyDeadlinePassed,
  isoWeekLabel,
  monthLabel,
  checkMissingReports,
  partitionRows,
} from './ticket-dashboard.mjs'

const SAMPLE_ENABLED = `
## 주간 — 월요일 09:00 KST

| 항목 | 내용 |
| --- | --- |
| 상태 | **켜짐** |

## 월간 — 매월 1일 09:00 KST

| 항목 | 내용 |
| --- | --- |
| 상태 | **켜짐** |
`

const SAMPLE_DISABLED = `
## 주간 — 월요일 09:00 KST

| 항목 | 내용 |
| --- | --- |
| 상태 | **미등록** — 등록은 티켓 20260918_1156 |

## 월간 — 매월 1일 09:00 KST

| 항목 | 내용 |
| --- | --- |
| 상태 | **등록됨(꺼짐)** — 켜는 시점은 사용자가 정한다 |
`

function testParseWeeklyScheduleReadsHeadingAndStatus() {
  const enabled = parseWeeklySchedule(SAMPLE_ENABLED)
  assert.deepEqual(enabled, { isoDow: 1, hour: 9, minute: 0, enabled: true })

  const disabled = parseWeeklySchedule(SAMPLE_DISABLED)
  assert.equal(disabled.enabled, false, '미등록은 꺼짐으로 읽어야 한다')
}

function testParseMonthlyScheduleReadsHeadingAndStatus() {
  const enabled = parseMonthlySchedule(SAMPLE_ENABLED)
  assert.deepEqual(enabled, { dayOfMonth: 1, hour: 9, minute: 0, enabled: true })

  const disabled = parseMonthlySchedule(SAMPLE_DISABLED)
  assert.equal(disabled.enabled, false, '등록됨(꺼짐)은 꺼짐으로 읽어야 한다')
}

function testWeeklyDeadlinePassed() {
  const schedule = { isoDow: 1, hour: 9, minute: 0 } // 월요일 09:00
  // 화요일(isoDow 2)이면 이미 지났다.
  const tuesday = new Date(Date.UTC(2026, 8, 22, 3, 0)) // 2026-09-22는 화요일
  assert.equal(weeklyDeadlinePassed(tuesday, schedule), true)

  // 월요일 08:59면 아직 지나지 않았다.
  const mondayBefore = new Date(Date.UTC(2026, 8, 21, 8, 59))
  assert.equal(weeklyDeadlinePassed(mondayBefore, schedule), false)

  // 월요일 09:00 정각이면 지났다.
  const mondayAt = new Date(Date.UTC(2026, 8, 21, 9, 0))
  assert.equal(weeklyDeadlinePassed(mondayAt, schedule), true)
}

function testMonthlyDeadlinePassed() {
  const schedule = { dayOfMonth: 1, hour: 9, minute: 0 }
  const secondDay = new Date(Date.UTC(2026, 8, 2, 0, 0))
  assert.equal(monthlyDeadlinePassed(secondDay, schedule), true)

  const firstDayBefore = new Date(Date.UTC(2026, 8, 1, 8, 59))
  assert.equal(monthlyDeadlinePassed(firstDayBefore, schedule), false)

  const firstDayAt = new Date(Date.UTC(2026, 8, 1, 9, 0))
  assert.equal(monthlyDeadlinePassed(firstDayAt, schedule), true)
}

function testIsoWeekLabelAndMonthLabel() {
  // 2026-09-21은 화요일, ISO 주차로는 2026-W39다.
  assert.equal(isoWeekLabel(new Date(Date.UTC(2026, 8, 21))), '2026-W39')
  assert.equal(monthLabel(new Date(Date.UTC(2026, 8, 21))), '2026-09')
}

function makeFakeRepo(scheduleMarkdown) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ticket-dashboard-test-'))
  mkdirSync(join(repoRoot, '.claude', 'skills', 'jam-work', 'references'), { recursive: true })
  writeFileSync(
    join(repoRoot, '.claude', 'skills', 'jam-work', 'references', 'scheduled-jobs.md'),
    scheduleMarkdown
  )
  mkdirSync(join(repoRoot, 'docs', 'operations'), { recursive: true })
  return repoRoot
}

function testCheckMissingReportsWarnsWhenReportAbsentAndDeadlinePassed() {
  const repoRoot = makeFakeRepo(SAMPLE_ENABLED)
  try {
    // 화요일 — 월요일 09:00 예약 시각이 이미 지난 시점, 주간 리포트 없음.
    const tuesday = new Date(Date.UTC(2026, 8, 22, 3, 0))
    const warnings = checkMissingReports(repoRoot, tuesday)
    assert.equal(warnings.length, 2, '주간·월간 모두 경고가 나와야 한다')
    assert.match(warnings[0], /주간 리포트/)
    assert.match(warnings[1], /월간 리포트/)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}

function testCheckMissingReportsSilentWhenReportExists() {
  const repoRoot = makeFakeRepo(SAMPLE_ENABLED)
  try {
    const tuesday = new Date(Date.UTC(2026, 8, 22, 3, 0))
    const weeklyDir = join(repoRoot, 'docs', 'operations', 'reports', 'weekly')
    const monthlyDir = join(repoRoot, 'docs', 'operations', 'reports', 'monthly')
    mkdirSync(weeklyDir, { recursive: true })
    mkdirSync(monthlyDir, { recursive: true })
    writeFileSync(join(weeklyDir, `${isoWeekLabel(tuesday)}.md`), '# 리포트')
    writeFileSync(join(monthlyDir, `${monthLabel(tuesday)}.md`), '# 리포트')

    const warnings = checkMissingReports(repoRoot, tuesday)
    assert.equal(warnings.length, 0, '리포트가 있으면 경고가 없어야 한다')
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}

function testCheckMissingReportsSilentWhenDisabled() {
  const repoRoot = makeFakeRepo(SAMPLE_DISABLED)
  try {
    const tuesday = new Date(Date.UTC(2026, 8, 22, 3, 0))
    const warnings = checkMissingReports(repoRoot, tuesday)
    assert.equal(warnings.length, 0, '예약 작업이 꺼져 있으면 경고가 없어야 한다')
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}

function testCheckMissingReportsOnlyAsksFolderWhenOperationsAbsent() {
  const repoRoot = makeFakeRepo(SAMPLE_ENABLED)
  try {
    rmSync(join(repoRoot, 'docs', 'operations'), { recursive: true, force: true })
    const tuesday = new Date(Date.UTC(2026, 8, 22, 3, 0))
    const warnings = checkMissingReports(repoRoot, tuesday)
    assert.equal(warnings.length, 1, 'docs/operations가 없으면 리포트 누락 대신 폴더 안내 한 줄만 나와야 한다')
    assert.match(warnings[0], /docs\/operations 폴더가 없어/)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}

// P2·P3 OPEN만 접고, P0·P1과 IN_PROGRESS·WAITING은 우선순위와 무관하게 남긴다(티켓 20260922_1800).
function testPartitionRowsCollapsesLowPriorityOpenOnly() {
  const rows = [
    { id: 'a', status: 'OPEN', priority: 'P1', title: '' },
    { id: 'b', status: 'OPEN', priority: 'P2', title: '' },
    { id: 'c', status: 'WAITING', priority: 'P2', title: '' },
    { id: 'd', status: 'OPEN', priority: 'P3', title: '' },
    { id: 'e', status: 'IN_PROGRESS', priority: 'P3', title: '' },
    { id: 'f', status: 'OPEN', priority: 'P3', title: '' },
  ]
  const { shown, collapsed } = partitionRows(rows)
  assert.deepEqual(shown.map((r) => r.id), ['a', 'c', 'e'], 'P1과 WAITING·IN_PROGRESS는 남아야 한다')
  assert.deepEqual(collapsed, { P2: 1, P3: 2 }, 'P2·P3 OPEN은 건수로 접혀야 한다')

  const all = partitionRows(rows, true)
  assert.equal(all.shown.length, rows.length, '--all이면 접지 않는다')
  assert.deepEqual(all.collapsed, {})
}

function main() {
  testPartitionRowsCollapsesLowPriorityOpenOnly()
  testParseWeeklyScheduleReadsHeadingAndStatus()
  testParseMonthlyScheduleReadsHeadingAndStatus()
  testWeeklyDeadlinePassed()
  testMonthlyDeadlinePassed()
  testIsoWeekLabelAndMonthLabel()
  testCheckMissingReportsWarnsWhenReportAbsentAndDeadlinePassed()
  testCheckMissingReportsSilentWhenReportExists()
  testCheckMissingReportsSilentWhenDisabled()
  testCheckMissingReportsOnlyAsksFolderWhenOperationsAbsent()
  console.log('ticket-dashboard.test.mjs 통과')
}

main()
