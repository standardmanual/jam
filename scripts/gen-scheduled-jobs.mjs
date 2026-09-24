#!/usr/bin/env node
// gen-scheduled-jobs — scheduled-jobs.md의 루틴 정의를 어드민이 읽는 TS 파일로 만든다
// (티켓 20260924_0905).
//
// 배경: Vercel에 배포된 어드민은 저장소의 `.claude/` 문서를 런타임에 읽을 수 있다는 보장이
// 없다. 그래서 원천은 md에 두고, 이 스크립트가 만든 생성 파일을 어드민 화면이 import한다
// (기획 대안 B, 2026-09-24 사용자 승인).
//
// md의 `## ` 절 가운데 `| 상태 |` 행이 있는 절만 루틴으로 읽는다 — `## 공통 원칙`처럼
// `| 상태 |` 행이 없는 절은 루틴이 아니다. 절 제목은 `<이름> — <일정 표기>` 형식(구분자는
// 스페이스+EM DASH(U+2014)+스페이스)이며, 일정 표기는 4종류만 해석한다.
//   1. 매일 HH:MM KST
//   2. <요일>요일 HH:MM KST
//   3. 매주 <요일>요일, <라벨>(HH:MM) → <라벨>(HH:MM) KST  (화살표는 U+2192, 하루 2회)
//   4. 매월 N일 HH:MM KST
// 루틴 절인데(= `| 상태 |` 행이 있는데) 위 4종류 중 어느 것으로도 해석할 수 없으면 표기가
// 바뀐 것이므로 종료 코드 1로 실패한다 — 생성기가 조용히 낡은 값을 만들지 않기 위해서다.
// 상태는 `| 상태 |` 칸 내용의 첫 단어가 정확히 "켜짐"이면 켜진 것으로 본다(그 밖은 꺼짐).
//
// 사용법:
//   node scripts/gen-scheduled-jobs.mjs          생성 파일을 갱신한다
//   node scripts/gen-scheduled-jobs.mjs --check  최신인지만 판정한다 (다르면 종료 코드 1)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SRC = '.claude/skills/jam-work/references/scheduled-jobs.md'
export const OUTPUT = 'jam-web/src/lib/admin/scheduledJobs.generated.ts'

const EM_DASH = '—'
const ARROW = '→'
const WEEKDAY_NAMES = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }
const WEEKDAY_CLASS = '[일월화수목금토]'

/** 작은따옴표 문자열 리터럴로 안전하게 감싼다(생성 파일이 프로젝트의 no-semicolon·홑따옴표 스타일을 따르도록). */
function q(str) {
  return `'${String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/**
 * 제목의 ' — ' 뒤쪽(일정 표기)을 스케줄 객체로 바꾼다. 4종류 중 어느 것과도 맞지 않으면 null.
 */
export function parseSchedule(text) {
  let m

  m = text.match(/^매월 (\d{1,2})일 (\d{2}):(\d{2}) KST$/)
  if (m) return { type: 'monthly', day: Number(m[1]), hour: Number(m[2]), minute: Number(m[3]) }

  m = text.match(new RegExp(`^매주 (${WEEKDAY_CLASS})요일, (.+?)\\((\\d{2}):(\\d{2})\\) ${ARROW} (.+?)\\((\\d{2}):(\\d{2})\\) KST$`))
  if (m) {
    return {
      type: 'weekly-labeled',
      weekday: WEEKDAY_NAMES[m[1]],
      labels: [
        { label: m[2], hour: Number(m[3]), minute: Number(m[4]) },
        { label: m[5], hour: Number(m[6]), minute: Number(m[7]) },
      ],
    }
  }

  m = text.match(new RegExp(`^(${WEEKDAY_CLASS})요일 (\\d{2}):(\\d{2}) KST$`))
  if (m) return { type: 'weekly', weekday: WEEKDAY_NAMES[m[1]], hour: Number(m[2]), minute: Number(m[3]) }

  m = text.match(/^매일 (\d{2}):(\d{2}) KST$/)
  if (m) return { type: 'daily', hour: Number(m[1]), minute: Number(m[2]) }

  return null
}

/** 절 제목(`## ` 다음 텍스트)을 이름과 스케줄로 나눈다. 구분자가 없거나 스케줄 해석에 실패하면 null. */
export function parseTitle(title) {
  const marker = ` ${EM_DASH} `
  const idx = title.indexOf(marker)
  if (idx === -1) return null
  const name = title.slice(0, idx).trim()
  const schedule = parseSchedule(title.slice(idx + marker.length).trim())
  if (!schedule) return null
  return { name, schedule }
}

/**
 * scheduled-jobs.md 전문을 받아 루틴 목록과 파싱 오류 목록을 반환한다.
 * `## ` 절 중 `| 상태 |` 행이 있는 절만 루틴으로 본다(공통 원칙 등은 건너뛴다).
 */
export function parseScheduledJobsMd(src) {
  const lines = src.split('\n')
  const sectionStarts = []
  lines.forEach((line, i) => {
    if (line.startsWith('## ')) sectionStarts.push(i)
  })
  sectionStarts.push(lines.length)

  const jobs = []
  const errors = []

  for (let s = 0; s < sectionStarts.length - 1; s++) {
    const startIdx = sectionStarts[s]
    const endIdx = sectionStarts[s + 1]
    const heading = lines[startIdx]
    const title = heading.slice(3).trim()
    const body = lines.slice(startIdx + 1, endIdx)

    const statusLine = body.find((l) => /^\|\s*상태\s*\|/.test(l))
    if (!statusLine) continue // '| 상태 |' 행이 없으면 루틴 절이 아니다 (예: '## 공통 원칙')

    const parsed = parseTitle(title)
    if (!parsed) {
      errors.push(`"${heading}" — 일정 표기를 해석할 수 없습니다.`)
      continue
    }

    const statusMatch = statusLine.match(/^\|\s*상태\s*\|\s*(.+?)\s*\|\s*$/)
    const firstWord = (statusMatch ? statusMatch[1] : '').trim().split(/\s+/)[0] ?? ''
    jobs.push({ name: parsed.name, enabled: firstWord === '켜짐', schedule: parsed.schedule })
  }

  return { jobs, errors }
}

function renderSchedule(schedule) {
  switch (schedule.type) {
    case 'daily':
      return `{ type: 'daily', hour: ${schedule.hour}, minute: ${schedule.minute} }`
    case 'weekly':
      return `{ type: 'weekly', weekday: ${schedule.weekday}, hour: ${schedule.hour}, minute: ${schedule.minute} }`
    case 'monthly':
      return `{ type: 'monthly', day: ${schedule.day}, hour: ${schedule.hour}, minute: ${schedule.minute} }`
    case 'weekly-labeled':
      return `{ type: 'weekly-labeled', weekday: ${schedule.weekday}, labels: [${schedule.labels
        .map((l) => `{ label: ${q(l.label)}, hour: ${l.hour}, minute: ${l.minute} }`)
        .join(', ')}] }`
    default:
      throw new Error(`알 수 없는 schedule.type: ${schedule.type}`)
  }
}

/** 루틴 목록으로 scheduledJobs.generated.ts 전문을 만든다. */
export function renderGenerated(jobs) {
  const jobLines = jobs
    .map((job) => `  { name: ${q(job.name)}, enabled: ${job.enabled}, schedule: ${renderSchedule(job.schedule)} },`)
    .join('\n')

  return `// 자동 생성 파일 — 손으로 고치지 않는다.
// 원천: .claude/skills/jam-work/references/scheduled-jobs.md
// 생성: node scripts/gen-scheduled-jobs.mjs   (검사만: --check)
// (티켓 20260924_0905)

/** 요일은 cron 표준과 동일하게 0=일 1=월 ... 6=토 */
export type ScheduledJobSchedule =
  | { type: 'daily'; hour: number; minute: number }
  | { type: 'weekly'; weekday: number; hour: number; minute: number }
  | { type: 'weekly-labeled'; weekday: number; labels: { label: string; hour: number; minute: number }[] }
  | { type: 'monthly'; day: number; hour: number; minute: number }

export interface ScheduledJobDef {
  name: string
  enabled: boolean
  schedule: ScheduledJobSchedule
}

export const SCHEDULED_JOBS: ScheduledJobDef[] = [
${jobLines}
]
`
}

// ── 진입점 ───────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const CHECK_ONLY = process.argv.includes('--check')
  const srcPath = path.join(REPO, SRC)
  const outPath = path.join(REPO, OUTPUT)

  const { jobs, errors } = parseScheduledJobsMd(readFileSync(srcPath, 'utf8'))

  if (errors.length > 0) {
    console.error('gen-scheduled-jobs: 루틴 절의 일정 표기를 해석하지 못했습니다.')
    for (const e of errors) console.error(`  - ${e}`)
    console.error('')
    console.error('  scheduled-jobs.md 제목은 "<이름> — <일정 표기>" 형식이고, 일정 표기는 4종류만')
    console.error('  지원합니다: 매일 HH:MM / <요일>요일 HH:MM / 매주 <요일>요일, <라벨>(HH:MM) → <라벨>(HH:MM) / 매월 N일 HH:MM (모두 뒤에 "KST").')
    process.exit(1)
  }

  const generated = renderGenerated(jobs)
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null

  if (CHECK_ONLY) {
    if (current === generated) {
      console.log('scheduledJobs.generated.ts가 최신입니다.')
      process.exit(0)
    }
    console.error('')
    console.error('scheduledJobs.generated.ts가 scheduled-jobs.md와 다릅니다.')
    console.error('  생성 파일을 손으로 고치지 말고 아래를 실행하세요:')
    console.error('')
    console.error('    node scripts/gen-scheduled-jobs.mjs')
    console.error('')
    process.exit(1)
  }

  if (current === generated) {
    console.log('scheduledJobs.generated.ts가 이미 최신입니다.')
  } else {
    mkdirSync(path.dirname(outPath), { recursive: true })
    writeFileSync(outPath, generated)
    console.log('scheduledJobs.generated.ts를 갱신했습니다.')
  }
}
