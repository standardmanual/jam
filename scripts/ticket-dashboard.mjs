#!/usr/bin/env node
// 현황판 생성 — docs/tickets/의 frontmatter를 훑어 진행 중·대기 티켓 목록을 만든다.
// (티켓 20260918_0421, 근거: JAM-WORK/05_자동화목록.md A3)
// 이어서 docs/agents/orchestrator.md의 "카리나 카드" 절(CARD:START~END 마커 사이)을 그대로
// 잘라 출력한다 — 원본은 orchestrator.md 한 곳에 유지 (티켓 20260918_1146).
//
// 사용법: node scripts/ticket-dashboard.mjs
//   (.claude/settings.json의 SessionStart hook이 세션 시작 시 자동 호출한다)
//
// 예약 작업 리포트 누락 감지 (티켓 20260918_1153): 예약 시각·켜짐 여부는
// .claude/skills/jam-work/references/scheduled-jobs.md의 주간·월간 표 '상태' 행에서 읽는다.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const TARGET_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'WAITING'])
const SCHEDULED_JOBS_DOC = ['.claude', 'skills', 'jam-work', 'references', 'scheduled-jobs.md']
const KOREAN_WEEKDAY_TO_ISO_DOW = {
  월요일: 1,
  화요일: 2,
  수요일: 3,
  목요일: 4,
  금요일: 5,
  토요일: 6,
  일요일: 7,
}

function findRepoRoot() {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
}

function walkMarkdownFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'Archive') continue // 보관함은 폐기된 기록 — 현황판 대상 아님
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
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) fm[kv[1]] = kv[2].trim()
  }
  return fm
}

function printKarinaCard(repoRoot) {
  const orchestratorPath = join(repoRoot, 'docs', 'agents', 'orchestrator.md')
  let text
  try {
    text = readFileSync(orchestratorPath, 'utf8')
  } catch {
    console.log()
    console.log('[경고] docs/agents/orchestrator.md를 찾을 수 없어 카리나 카드를 건너뜁니다.')
    return
  }
  const m = text.match(/<!-- CARD:START -->\n([\s\S]*?)\n<!-- CARD:END -->/)
  if (!m) {
    console.log()
    console.log(
      '[경고] docs/agents/orchestrator.md에서 카리나 카드 마커(CARD:START/END)를 찾지 못했습니다.'
    )
    return
  }
  console.log()
  console.log(m[1].trim())
}

// -- 예약 작업 리포트 누락 감지 (티켓 20260918_1153) --------------------------------

function parseStatusEnabled(cellText) {
  // 상태 표기 규칙(scheduled-jobs.md에 문서화): 값이 정확히 "켜짐"이어야 켜진 것으로 본다.
  const clean = cellText.replace(/\*\*/g, '').trim()
  const label = clean.split('—')[0].trim()
  return label === '켜짐'
}

function extractStatusCell(section) {
  const m = section.match(/\|\s*상태\s*\|\s*(.+?)\s*\|\s*$/m)
  return m ? m[1] : null
}

export function parseWeeklySchedule(scheduleText) {
  const start = scheduleText.indexOf('## 주간')
  const end = scheduleText.indexOf('## 월간')
  if (start === -1) return null
  const section = end === -1 ? scheduleText.slice(start) : scheduleText.slice(start, end)
  const heading = section.match(/^## 주간 — (\S+요일) (\d{2}):(\d{2}) KST/m)
  const statusCell = extractStatusCell(section)
  if (!heading || statusCell === null) return null
  const isoDow = KOREAN_WEEKDAY_TO_ISO_DOW[heading[1]]
  if (!isoDow) return null
  return {
    isoDow,
    hour: Number(heading[2]),
    minute: Number(heading[3]),
    enabled: parseStatusEnabled(statusCell),
  }
}

export function parseMonthlySchedule(scheduleText) {
  const start = scheduleText.indexOf('## 월간')
  if (start === -1) return null
  const nextHeadingIdx = scheduleText.indexOf('\n## ', start + 1)
  const section =
    nextHeadingIdx === -1 ? scheduleText.slice(start) : scheduleText.slice(start, nextHeadingIdx)
  const heading = section.match(/^## 월간 — 매월\s*(\d+)일 (\d{2}):(\d{2}) KST/m)
  const statusCell = extractStatusCell(section)
  if (!heading || statusCell === null) return null
  return {
    dayOfMonth: Number(heading[1]),
    hour: Number(heading[2]),
    minute: Number(heading[3]),
    enabled: parseStatusEnabled(statusCell),
  }
}

// KST(UTC+9)로 계산한다. 반환된 Date는 UTC getter(getUTCFullYear 등)로 KST 벽시계 값을
// 그대로 읽을 수 있도록 실제 시각에 9시간을 더해 둔 값이다 — 실행 서버의 로컬 타임존과 무관하다.
export function nowKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

function isoDowOf(kstDate) {
  const w = kstDate.getUTCDay()
  return w === 0 ? 7 : w
}

export function isoWeekLabel(kstDate) {
  const d = new Date(Date.UTC(kstDate.getUTCFullYear(), kstDate.getUTCMonth(), kstDate.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export function monthLabel(kstDate) {
  return `${kstDate.getUTCFullYear()}-${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}`
}

export function weeklyDeadlinePassed(kstDate, schedule) {
  const nowIsoDow = isoDowOf(kstDate)
  const nowMinutes = kstDate.getUTCHours() * 60 + kstDate.getUTCMinutes()
  const targetMinutes = schedule.hour * 60 + schedule.minute
  if (nowIsoDow > schedule.isoDow) return true
  if (nowIsoDow < schedule.isoDow) return false
  return nowMinutes >= targetMinutes
}

export function monthlyDeadlinePassed(kstDate, schedule) {
  const day = kstDate.getUTCDate()
  const nowMinutes = kstDate.getUTCHours() * 60 + kstDate.getUTCMinutes()
  const targetMinutes = schedule.hour * 60 + schedule.minute
  if (day > schedule.dayOfMonth) return true
  if (day < schedule.dayOfMonth) return false
  return nowMinutes >= targetMinutes
}

// repoRoot·kstDate를 주입받아 테스트 가능하게 만든다.
export function checkMissingReports(repoRoot, kstDate = nowKST()) {
  const warnings = []
  let scheduleText
  try {
    scheduleText = readFileSync(join(repoRoot, ...SCHEDULED_JOBS_DOC), 'utf8')
  } catch {
    return warnings // 문서가 없으면 조용히 건너뛴다 (이 hook 자체의 부가 기능이라 필수 아님)
  }

  // 리포트는 중첩 저장소 jam-doc에 있다. 복제 전이면 "리포트 없음" 오경보 대신 복제 안내만 낸다.
  const reportsDir = join(repoRoot, 'jam-doc', 'operations', 'reports')
  if (!existsSync(join(repoRoot, 'jam-doc'))) {
    warnings.push('[경고] jam-doc 저장소가 복제되어 있지 않아 리포트 누락 점검을 건너뜁니다. /jam-sync로 복제하세요.')
    return warnings
  }

  const weekly = parseWeeklySchedule(scheduleText)
  if (weekly?.enabled && weeklyDeadlinePassed(kstDate, weekly)) {
    const label = isoWeekLabel(kstDate)
    const reportPath = join(reportsDir, 'weekly', `${label}.md`)
    if (!existsSync(reportPath)) {
      warnings.push(
        `[경고] 이번 주 예약 시각이 지났는데 주간 리포트(jam-doc/operations/reports/weekly/${label}.md)가 없습니다.`
      )
    }
  }

  const monthly = parseMonthlySchedule(scheduleText)
  if (monthly?.enabled && monthlyDeadlinePassed(kstDate, monthly)) {
    const label = monthLabel(kstDate)
    const reportPath = join(reportsDir, 'monthly', `${label}.md`)
    if (!existsSync(reportPath)) {
      warnings.push(
        `[경고] 이번 달 예약 시각이 지났는데 월간 리포트(jam-doc/operations/reports/monthly/${label}.md)가 없습니다.`
      )
    }
  }

  return warnings
}

function main() {
  const repoRoot = findRepoRoot()

  for (const warning of checkMissingReports(repoRoot)) {
    console.log(warning)
  }

  const ticketsDir = join(repoRoot, 'docs', 'tickets')
  const files = walkMarkdownFiles(ticketsDir)

  const rows = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const fm = parseFrontmatter(text)
    if (!fm || !TARGET_STATUSES.has(fm.status)) continue

    const titleMatch = text.match(/^#\s+(.+)$/m)
    rows.push({
      id: fm.id ?? '?',
      status: fm.status,
      priority: fm.priority ?? '?',
      title: titleMatch ? titleMatch[1].trim() : file.replace(repoRoot + '/', ''),
    })
  }

  rows.sort(
    (a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id)
  )

  if (rows.length === 0) {
    console.log('## 티켓 현황판\n진행 중·대기 티켓 없음')
    printKarinaCard(repoRoot)
    return
  }

  console.log(`## 티켓 현황판 (${rows.length}건)`)
  for (const r of rows) {
    console.log(`- [${r.status}] ${r.priority} ${r.id} — ${r.title}`)
  }
  printKarinaCard(repoRoot)
}

// 테스트에서 이 모듈을 import할 때는 실행하지 않는다. 한글 경로는 URL에서 퍼센트 인코딩되므로
// 문자열이 아니라 파일 경로로 바꿔 비교한다.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
