#!/usr/bin/env node
// check-routine-reports — 예약 루틴이 남겼어야 할 리포트가 실제로 있는지 본다 (티켓 20260920_1907).
//
// 배경: scheduled-jobs.md는 "세션 시작 hook이 예정 시각이 지났는데 리포트가 없으면 감지한다"고
// 적어 두었으나(티켓 20260918_1153), 실제로는 그런 훅도 스크립트도 없었다. 무인 루틴이 통째로
// 실패해도 Slack 알림 말고는 아무 신호가 없어, 실패가 조용히 누적될 수 있었다.
//
// 이 스크립트가 그 서술을 실제로 만든다. 세션을 열 때마다 돌며, 문제가 있을 때만 말한다.
//
// 판정 기준 (scheduled-jobs.md):
//   주간 — 화요일 09:00 KST · docs/operations/reports/weekly/YYYY-Www.md
//   월간 — 매월 1일 09:00 KST · docs/operations/reports/monthly/YYYY-MM.md
//
// 켜진 루틴만 본다 (티켓 20261007_1956). scheduled-jobs.md 주간·월간 절의 「상태」 칸이 `켜짐`이 아니면
// 그 리포트는 점검에서 뺀다 — 의도적으로 끈 루틴의 리포트가 없다고 매 세션 경고하지 않기 위해서다.
// 상태 칸을 읽는 파서는 ticket-dashboard.mjs의 것을 그대로 쓴다.
//
// 종료 코드는 항상 0이다. 세션 시작을 막지 않고 알리기만 한다.

import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMonthlySchedule, parseWeeklySchedule } from './ticket-dashboard.mjs'

const SCHEDULED_JOBS_DOC = ['.claude', 'skills', 'jam-work', 'references', 'scheduled-jobs.md']
const pad = (n) => String(n).padStart(2, '0')

// ISO 주 번호 (scheduled-jobs.md의 YYYY-Www 표기)
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7)
  return { year: t.getUTCFullYear(), week }
}

/**
 * 누락된 리포트 경고 목록을 만든다. now는 UTC getter로 KST 벽시계를 읽는 Date(실제 시각 + 9시간),
 * scheduleText는 scheduled-jobs.md 전문(없으면 null), exists(상대 경로)는 리포트 존재 여부다.
 * 주간·월간 절의 「상태」 칸이 켜짐이 아니면(꺼짐·절 없음 포함) 그 리포트는 점검하지 않는다.
 */
export function routineReportWarnings(now, scheduleText, exists) {
  const warnings = []
  if (scheduleText == null) return warnings

  const Y = now.getUTCFullYear()
  const M = now.getUTCMonth() + 1
  const D = now.getUTCDate()
  const H = now.getUTCHours()
  const DOW = now.getUTCDay() // 0=일 1=월

  // ── 주간: 이번 주 화요일 09:00이 지났는가 ───────────────────────────────────
  // 화요일이면 09시 이후여야 한다(2026-09-24 월요일에서 변경, 티켓 20260924_0806).
  const weekly = parseWeeklySchedule(scheduleText)
  const weeklyDue = DOW === 0 ? true : DOW > 2 || (DOW === 2 && H >= 9)
  if (weekly?.enabled && weeklyDue) {
    const { year, week } = isoWeek(now)
    const file = `docs/operations/reports/weekly/${year}-W${pad(week)}.md`
    if (!exists(file)) warnings.push(`주간 리포트가 없습니다 — ${file}`)
  }

  // ── 월간: 이번 달 1일 09:00이 지났는가 ──────────────────────────────────────
  const monthly = parseMonthlySchedule(scheduleText)
  const monthlyDue = D > 1 || (D === 1 && H >= 9)
  if (monthly?.enabled && monthlyDue) {
    const file = `docs/operations/reports/monthly/${Y}-${pad(M)}.md`
    if (!exists(file)) warnings.push(`월간 리포트가 없습니다 — ${file}`)
  }

  return warnings
}

// ── 진입점 ───────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const REPO = (() => {
    try {
      return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    } catch {
      return process.cwd()
    }
  })()

  let scheduleText = null
  try {
    scheduleText = readFileSync(path.join(REPO, ...SCHEDULED_JOBS_DOC), 'utf8')
  } catch {
    // 문서가 없으면 조용히 건너뛴다 (세션 시작 부가 점검이라 필수 아님)
  }

  const now = new Date(Date.now() + 9 * 60 * 60 * 1000) // KST
  const warnings = routineReportWarnings(now, scheduleText, (file) => existsSync(path.join(REPO, file)))

  if (warnings.length === 0) process.exit(0)

  console.log('')
  console.log('예약 루틴 점검 — 예정 시각이 지났는데 리포트가 없습니다')
  for (const w of warnings) console.log(`  · ${w}`)
  console.log('')
  console.log('  루틴이 실패했을 수 있습니다. claude.ai/code/routines에서 마지막 실행을 확인하세요.')
  console.log('  루틴을 의도적으로 껐다면 scheduled-jobs.md의 「상태」 칸을 `꺼짐`으로 고칩니다.')
  console.log('')
  process.exit(0)
}
