#!/usr/bin/env node
// 주간 수집 통합 — 카즈하의 주간 브리핑 수집(도구 호출 17회)을 명령 한 번으로 끝낸다.
// (티켓 20260926_1545, 상위 20260926_1541 토큰 절감)
//
// 기존 수집 명령을 병렬로 실행해 출처별 절(`### 출처: …`)로 이어 붙여 출력한다.
// 출처 목록은 .claude/skills/jam-work/references/forms/weekly-briefing-format.md 「지표 출처」와 같다.
//
// - 한 출처가 실패하면 그 출처만 1회 재시도하고, 그래도 실패하면 그 절에 사유를 적고 전체는 계속한다.
// - 출력에서 이메일 형태와 토큰·쿠키 값을 가린다(집계 수치만 남긴다).
//
// 사용법: node scripts/weekly-collect.mjs --since YYYY-MM-DD
//   --since 는 지난 리포트 날짜. 없으면 7일 전.
//   필요한 환경변수는 각 출처 스크립트와 같다(GA4_PROPERTY_ID, GA4_SERVICE_ACCOUNT_KEY,
//   ADMIN_API_BASE_URL, ADMIN_API_READ_TOKEN 또는 ADMIN_API_COOKIE).

import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const SOURCE_TIMEOUT_MS = 90_000
const MAX_REASON_LENGTH = 200
const MAX_GIT_LINES = 30
const SECRET_ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_API_COOKIE', 'GA4_SERVICE_ACCOUNT_KEY']

export function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export function defaultSince(now = new Date()) {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function parseArgs(argv, now = new Date()) {
  const idx = argv.indexOf('--since')
  const since = idx === -1 ? defaultSince(now) : argv[idx + 1]
  if (!isValidDate(since)) {
    throw new Error('--since 값은 YYYY-MM-DD 형식이어야 합니다.')
  }
  return { since }
}

// 이메일 형태, 환경변수 비밀 값, 인증 헤더·쿠키 형태를 가린다.
export function sanitize(text, env = process.env) {
  let out = String(text ?? '')
  for (const key of SECRET_ENV_KEYS) {
    const value = env[key]
    if (value && value.length >= 8) out = out.split(value).join('[토큰 생략]')
  }
  out = out
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [토큰 생략]')
    .replace(/(sb-[\w-]+-auth-token(?:\.\d+)?=)[^;\s]+/g, '$1[토큰 생략]')
    .replace(/x-admin-read-token[:=]\s*\S+/gi, 'x-admin-read-token: [토큰 생략]')
    .replace(/[^\s@()<>,;'"]+@[^\s@()<>,;'"]+/g, '[이메일 생략]')
  return out
}

function firstLine(text) {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
}

function shortReason(error, env) {
  const line = firstLine(error?.message ?? error) ?? '알 수 없는 오류'
  return sanitize(line, env).slice(0, MAX_REASON_LENGTH)
}

// 한 출처를 실행한다. 실패하면 1회만 재시도하고, 끝내 실패하면 사유를 돌려준다.
export async function runSource(source, env = process.env) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const body = await source.run()
      return { name: source.name, ok: true, body: sanitize(body, env).trimEnd() }
    } catch (e) {
      lastError = e
    }
  }
  return { name: source.name, ok: false, reason: shortReason(lastError, env) }
}

export function formatOutput(results) {
  const failed = results.filter((r) => !r.ok)
  const lines = []
  if (failed.length > 0) {
    lines.push(`수집 실패: ${failed.map((r) => `${r.name} (${r.reason})`).join(', ')}`)
    lines.push('')
  }
  for (const r of results) {
    lines.push(`### 출처: ${r.name}`)
    lines.push(r.ok ? r.body || '(출력 없음)' : `수집 실패: ${r.reason}`)
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

export async function collectWeekly({ sources, env = process.env }) {
  const results = await Promise.all(sources.map((s) => runSource(s, env)))
  return { results, output: formatOutput(results) }
}

// ── 출처 구현 ──────────────────────────────────────────────

function runNode(args, { cwd = REPO_ROOT, env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile(
      process.execPath,
      args,
      { cwd, env, timeout: SOURCE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(firstLine(stderr) ?? firstLine(error.message) ?? '실행 실패'))
          return
        }
        resolvePromise(stdout)
      }
    )
  })
}

function runGit(args, { cwd = REPO_ROOT } = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile('git', args, { cwd, timeout: SOURCE_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(firstLine(stderr) ?? firstLine(error.message) ?? 'git 실행 실패'))
        return
      }
      resolvePromise(stdout)
    })
  })
}

// JSON 응답을 `- 경로: 값` 줄로 편다. 배열은 건수와 짧은 미리보기만 남긴다.
export function flattenJson(value, prefix = '', depth = 0) {
  const lines = []
  if (value === null || typeof value !== 'object') {
    lines.push(`- ${prefix || 'value'}: ${value}`)
  } else if (Array.isArray(value)) {
    const preview = JSON.stringify(value).slice(0, 200)
    lines.push(`- ${prefix || 'items'}: ${value.length}건 ${preview}`)
  } else if (depth >= 4) {
    lines.push(`- ${prefix}: ${JSON.stringify(value).slice(0, 200)}`)
  } else {
    for (const [k, v] of Object.entries(value)) {
      lines.push(...flattenJson(v, prefix ? `${prefix}.${k}` : k, depth + 1))
    }
  }
  return lines
}

export async function fetchKpiWeekly({ env = process.env, fetchImpl = fetch } = {}) {
  const token = env.ADMIN_API_READ_TOKEN
  const cookie = env.ADMIN_API_COOKIE
  if (!token && !cookie) {
    throw new Error('ADMIN_API_READ_TOKEN 또는 ADMIN_API_COOKIE가 필요합니다')
  }
  const base = env.ADMIN_API_BASE_URL || 'http://localhost:3000'
  const headers = token ? { 'x-admin-read-token': token } : { Cookie: cookie }
  const res = await fetchImpl(`${base}/api/admin/kpi/weekly`, { headers })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const json = await res.json()
  return flattenJson(json).join('\n')
}

// 현황판 출력 뒤에 붙는 카리나 카드는 주간 수집에 필요 없다 — 목록(빈 줄 앞)까지만 남긴다.
export function trimDashboardCard(stdout) {
  const text = String(stdout ?? '')
  const start = text.indexOf('## 티켓 현황판')
  if (start === -1) return text
  const blank = text.indexOf('\n\n', start)
  return blank === -1 ? text : text.slice(0, blank)
}

export function summarizeGitLog(stdout) {
  const lines = String(stdout ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const shown = lines.slice(0, MAX_GIT_LINES).map((l) => `- ${l}`)
  const out = [`- 커밋 ${lines.length}건`, ...shown]
  if (lines.length > MAX_GIT_LINES) out.push(`- 외 ${lines.length - MAX_GIT_LINES}건 생략`)
  return out.join('\n')
}

// 선별 리포트(YYYY-MM-DD.md) 중 since 이후 파일의 체크 줄 수와 판정 건수를 센다.
export function summarizeTriage(repoRoot, since) {
  const dir = join(repoRoot, 'docs', 'operations', 'reports', 'triage')
  if (!existsSync(dir)) return '- 대상 없음 (선별 리포트 폴더 없음)'
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && f.slice(0, 10) >= since)
    .sort()
  if (files.length === 0) return '- 대상 없음'

  let total = 0
  let checked = 0
  let eligible = 0
  let human = 0
  for (const f of files) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      const m = line.match(/^\s*-\s*\[([ xX])\]\s*(.*)$/)
      if (!m) continue
      total++
      const isChecked = m[1].toLowerCase() === 'x'
      if (isChecked) checked++
      if (/·\s*적격\s*·/.test(m[2])) eligible++
      else if (/·\s*사람 필요\s*·/.test(m[2])) human++
    }
  }
  if (total === 0) return `- 파일 ${files.length}개, 대상 없음`
  const rate = Math.round((checked / total) * 100)
  return [
    `- 파일 ${files.length}개`,
    `- 체크된 줄 / 전체 줄: ${checked} / ${total} (동의율 ${rate}%)`,
    `- 적격 ${eligible}건 · 사람 필요 ${human}건`,
  ].join('\n')
}

export function buildDefaultSources({ since, env = process.env, repoRoot = REPO_ROOT }) {
  const script = (name) => join(repoRoot, 'scripts', name)
  return [
    { name: 'GA4 주간 지표', run: () => runNode([script('ga4-weekly-metrics.mjs')], { env }) },
    { name: '어드민 KPI 주간 집계', run: () => fetchKpiWeekly({ env }) },
    { name: '어드민 읽기 API', run: () => runNode([script('admin-api-read.mjs')], { env }) },
    {
      name: '티켓 현황판',
      run: async () => trimDashboardCard(await runNode([script('ticket-dashboard.mjs')], { env })),
    },
    {
      name: '워크플로 수치',
      run: () => runNode([script('ticket-metrics.mjs'), '--since', since], { env }),
    },
    {
      name: 'main 커밋',
      run: async () =>
        summarizeGitLog(
          await runGit(['log', 'origin/main', `--since=${since}`, '--format=%h %s'], {
            cwd: repoRoot,
          })
        ),
    },
    { name: '선별 동의율', run: async () => summarizeTriage(repoRoot, since) },
  ]
}

async function main() {
  let since
  try {
    ;({ since } = parseArgs(process.argv.slice(2)))
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  const { output } = await collectWeekly({ sources: buildDefaultSources({ since }) })
  console.log(output)
}

// 테스트에서 이 모듈을 import할 때는 실행하지 않는다. 한글 경로는 URL에서 퍼센트 인코딩되므로
// 문자열이 아니라 파일 경로로 바꿔 비교한다.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
