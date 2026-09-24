#!/usr/bin/env node
// deploy-gate — 프로덕션 승격 전 점검(check)과 배포 뒤 서빙 배포 확인(served) (티켓 20260922_0001).
//
// 배경: /jam-ship의 「배포 전 점검표」는 사람이 세션에서 배포할 때만 돌았고, 목요일 23:59 KST 무인
// 배포는 fetch → ff 머지 → push → curl 200 확인만 했다. 그런데 Vercel은 롤백을 실행한 뒤 프로덕션
// 도메인 자동 할당을 끈다. 그 상태에서 main에 push하면 새 배포가 만들어져도 공개되지 않는데, 옛 배포가
// 계속 200으로 응답하므로 curl 확인은 그대로 통과한다. 이 스크립트는
//   ① git만으로 되는 점검(비밀값·마이그레이션 되돌림 SQL·새 API 라우트 인증)을 사람 경로와 무인
//      경로가 같은 코드로 돌리게 하고,
//   ② 프로덕션 도메인이 지금 어느 배포를 서빙하는지를 Vercel 인증 없이 읽는다(공개 페이지 HTML의
//      정적 자원 주소에 붙는 ?dpl=dpl_… 또는 <html data-dpl-id="dpl_…"> 배포 식별자).
//
// 성격: 의존성 없음(Node 내장 모듈과 전역 fetch만 쓴다 — 클라우드 세션에서 npm install 없이 돈다).
// 저장소·DB·Vercel에 아무것도 쓰지 않는다. 점검은 모두 배포를 막는 방향이거나 읽기 전용이라 무인
// 권한을 늘리지 않는다.
//
// 선언: 번호 기준선과 공개 라우트 목록은 점검 대상(head)의 docs/agents/contract.json → deploy_gate에 있다
// (check-contract.mjs가 선언과 실제를 대조한다).
//
// 사용법:
//   node scripts/deploy-gate.mjs check [--base <ref>] [--head <ref>] [--json]
//     기본 범위는 origin/main → origin/staging. `git diff <base> <head>`(두 팁의 트리 비교)만 쓰고
//     git log·merge-base는 쓰지 않는다 — 클라우드 세션의 얕은 복제에서도 돈다.
//     종료 코드: 0 통과 · 1 차단 · 2 게이트 실행 오류(배포하지 않는다)
//   node scripts/deploy-gate.mjs served [--url <url>] [--wait-change <이전 id>] [--timeout <초>] [--interval <초>]
//     기본 주소는 https://j-a-m.app. 응답 HTML에서 첫 dpl=dpl_… 또는 data-dpl-id 값을 출력한다(없으면 none).
//     종료 코드: 0 찾음 · 3 응답은 왔으나 식별자 없음 · 2 네트워크 오류·시간 초과 ·
//               4 --wait-change 시간 안에 id가 바뀌지 않음
//   공통: 64 인자 오류

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const DEFAULT_BASE = 'origin/main'
const DEFAULT_HEAD = 'origin/staging'
const DEFAULT_URL = 'https://j-a-m.app'
const DEFAULT_TIMEOUT_SEC = 360
const DEFAULT_INTERVAL_SEC = 30
const REQUEST_TIMEOUT_MS = 20_000
const MIN_LAST_REQUEST_MS = 3_000 // 마감 직전 마지막 시도에도 이 정도는 기다린다
const CONTRACT_REL = 'docs/agents/contract.json'

const MIGRATIONS_DIR = 'jam-web/supabase/migrations/'

// 비밀값: 추가된 줄에서 실제 비밀의 형태만 잡는다. process.env.X처럼 값을 읽기만 하는 코드는 걸리지 않는다.
const SECRET_RULES = [
  { kind: 'sb_secret', re: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { kind: 'jwt', re: /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/ },
  {
    kind: 'env_assign',
    re: /(SUPABASE_SERVICE_ROLE_KEY|STRAVA_CLIENT_SECRET|ENCRYPTION_KEY|ADMIN_SECRET|CRON_SECRET)\s*[:=]\s*["'][^"'\s]{16,}["']/,
  },
]
// 출력에는 값이 아니라 종류만 적는다(비밀값을 로그·Slack에 다시 흘리지 않는다).
const SECRET_LABELS = {
  sb_secret: 'sb_secret_ 형태의 키',
  jwt: 'JWT 형태의 토큰',
  env_assign: '비밀 환경변수 이름에 값을 직접 대입',
}

// 되돌림 표식: 주석 줄의 첫머리. \b는 JS에서 ASCII 단어 문자 기준이라 한글 뒤에서는 경계가 되지 않으므로
// 한글 표식에는 붙이지 않는다(되돌림 SQL·되돌림: 모두 통과). ROLLBACK·DOWN은 downtime 같은 단어를 거르려고 붙인다.
const ROLLBACK_MARKER = /^\s*--\s*(?:되돌림|ROLLBACK\b|DOWN\b)/i

const ROUTE_FILE = /^jam-web\/src\/app\/api\/(?:(.+)\/)?route\.ts$/
const ROUTE_AUTH = /auth\.getUser|@\/lib\/admin\/auth|CRON_SECRET|ADMIN_SECRET/

// 프로덕션 /login은 정적 자원의 ?dpl= 대신 <html data-dpl-id="…">로만 식별자를 내보낸다(티켓 20260924_0812)
const DPL_ID = /(?:dpl=|data-dpl-id=")(dpl_[A-Za-z0-9]+)/

const USAGE = `사용법:
  node scripts/deploy-gate.mjs check [--base <ref>] [--head <ref>] [--json]
  node scripts/deploy-gate.mjs served [--url <url>] [--wait-change <이전 id>] [--timeout <초>] [--interval <초>]

종료 코드
  check   0 통과 · 1 차단 · 2 게이트 실행 오류(배포하지 않는다)
  served  0 찾음 · 2 네트워크 오류·시간 초과 · 3 응답은 왔으나 배포 식별자 없음 · 4 --wait-change 시간 안에 바뀌지 않음
  공통    64 인자 오류`

class GateError extends Error {}
class UsageError extends Error {}

// ── 인자 ─────────────────────────────────────────────────────────────────────
function parseFlags(argv, spec) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) throw new UsageError(`알 수 없는 인자입니다: ${arg}`)
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
    const kind = spec[name]
    if (!kind) throw new UsageError(`알 수 없는 옵션입니다: --${name}`)
    if (kind === 'boolean') {
      if (eq !== -1) throw new UsageError(`--${name}은 값을 받지 않습니다`)
      flags[name] = true
      continue
    }
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1)
    if (value === undefined || (eq === -1 && value.startsWith('--'))) throw new UsageError(`--${name}에 값이 필요합니다`)
    flags[name] = value
  }
  return flags
}

function positiveNumber(name, raw, fallback) {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`--${name}은 0보다 큰 숫자(초)여야 합니다: ${raw}`)
  return n
}

// ── git ──────────────────────────────────────────────────────────────────────
function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    throw new GateError('git 저장소 안에서 실행해야 합니다.')
  }
}

function runGit(repo, args) {
  try {
    return execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 1 << 29,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    const detail = String(e.stderr || e.message).trim().split('\n')[0]
    const sub = args[0] === '-c' ? args[2] : args[0]
    throw new GateError(`git ${sub} 실행에 실패했습니다 — ${detail}`)
  }
}

function verifyRef(repo, ref, flag) {
  if (ref.startsWith('-')) throw new UsageError(`${flag} 값이 올바르지 않습니다: ${ref}`)
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    throw new GateError(`${flag} 기준 "${ref}"를 찾을 수 없습니다. git fetch origin main staging 뒤에 다시 실행하세요.`)
  }
}

// 선언은 점검 대상(head)의 트리에서 읽는다 — 점검하는 코드와 그 기준이 같은 커밋에서 오므로, 작업 트리가
// 어느 브랜치에 있든(낡은 로컬 staging이든 세션 시작 브랜치든) 기준이 어긋나지 않는다.
function loadGateConfig(repo, head) {
  let contract
  try {
    contract = JSON.parse(readAtHead(repo, head, CONTRACT_REL))
  } catch (e) {
    throw new GateError(`${head}의 ${CONTRACT_REL}를 읽지 못했습니다 — ${e.message}`)
  }
  const g = contract.deploy_gate
  if (!g || !Number.isInteger(g.rollback_sql_required_from) || !Array.isArray(g.public_routes)) {
    throw new GateError(`${head}의 ${CONTRACT_REL}에 deploy_gate 선언(rollback_sql_required_from·public_routes)이 없습니다.`)
  }
  const trimSlashes = (r) => String(r).replace(/^\/+|\/+$/g, '')
  return { rollbackFrom: g.rollback_sql_required_from, publicRoutes: new Set(g.public_routes.map(trimSlashes)) }
}

// jam-web 아래 변경 파일 전체(--no-renames라 이름만 바뀐 파일도 삭제+추가로 잡힌다 — 새 파일로 보는 쪽이 막는 방향이다).
function listJamWebChanges(repo, base, head) {
  const out = runGit(repo, [
    '-c', 'core.quotePath=false', 'diff', '--name-status', '--no-renames', '--no-ext-diff', '-z', base, head, '--', 'jam-web',
  ])
  const parts = out.split('\0')
  const changes = []
  for (let i = 0; i + 1 < parts.length; i += 2) changes.push({ status: parts[i], file: parts[i + 1] })
  return changes
}

// 추가된 줄만 훑는다. -U0 패치를 헝크 헤더의 줄 수로 읽으므로, 내용이 '+++'로 시작하는 줄을 파일 헤더로 오인하지 않는다.
function scanAddedLines(repo, base, head) {
  const patch = runGit(repo, [
    '-c', 'core.quotePath=false', 'diff', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames',
    '--src-prefix=a/', '--dst-prefix=b/', base, head, '--', 'jam-web',
  ])
  const findings = []
  let scanned = 0
  let file = null
  let oldLeft = 0
  let newLeft = 0
  let lineNo = 0
  for (const line of patch.split('\n')) {
    if (oldLeft > 0 || newLeft > 0) {
      if (line.startsWith('+')) {
        newLeft--
        scanned++
        const text = line.slice(1)
        for (const rule of SECRET_RULES) {
          if (rule.re.test(text)) findings.push({ file, line: lineNo, kind: rule.kind })
        }
        lineNo++
      } else if (line.startsWith('-')) {
        oldLeft--
      } else if (!line.startsWith('\\')) {
        oldLeft--
        newLeft--
        lineNo++
      }
      continue
    }
    if (line.startsWith('diff --git ')) {
      file = null
    } else if (line.startsWith('+++ ')) {
      const raw = line.slice(4).replace(/\t.*$/, '')
      const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw
      file = unquoted === '/dev/null' ? null : unquoted.replace(/^b\//, '')
    } else {
      const m = line.match(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (m) {
        oldLeft = m[1] === undefined ? 1 : Number(m[1])
        newLeft = m[3] === undefined ? 1 : Number(m[3])
        lineNo = Number(m[2])
      }
    }
  }
  return { findings, scanned }
}

function readAtHead(repo, head, file) {
  return runGit(repo, ['show', `${head}:${file}`])
}

// ── check ────────────────────────────────────────────────────────────────────
// head에 있는 마이그레이션 파일 이름 전체(짝이 되는 _down.sql인지 가리는 데 쓴다).
function listHeadMigrationNames(repo, head) {
  const out = runGit(repo, ['ls-tree', '--name-only', '-z', head, MIGRATIONS_DIR])
  return new Set(out.split('\0').filter(Boolean).map((f) => f.slice(MIGRATIONS_DIR.length)))
}

function gatherMigrations(repo, head, added, config) {
  const names = added.filter((f) => f.startsWith(MIGRATIONS_DIR)).map((f) => f.slice(MIGRATIONS_DIR.length))
  const addedSet = new Set(names)
  const headNames = listHeadMigrationNames(repo, head)
  const numbered = []
  const seeds = []
  const others = []
  for (const name of names) {
    if (name.includes('/') || !name.endsWith('.sql')) continue
    // 짝이 되는 되돌림 파일은 마이그레이션으로 세지 않는다. 이름이 _down.sql로 끝난다고 다 짝은 아니다 —
    // 181_scale_down.sql 같은 진짜 마이그레이션이 통째로 점검을 빠져나가지 않도록, 원본(181_scale.sql)이
    // head에 실제로 있을 때만 짝으로 본다.
    if (name.endsWith('_down.sql') && headNames.has(name.replace(/_down\.sql$/, '.sql'))) continue
    const m = name.match(/^(\d+)_.+\.sql$/)
    if (m) {
      const number = Number.parseInt(m[1], 10)
      const required = number >= config.rollbackFrom
      let rollback = null
      const downName = name.replace(/\.sql$/, '_down.sql')
      if (required) {
        const body = readAtHead(repo, head, MIGRATIONS_DIR + name)
        if (body.split('\n').some((l) => ROLLBACK_MARKER.test(l))) rollback = 'marker'
        else if (addedSet.has(downName)) rollback = 'down_file'
      }
      numbered.push({ file: MIGRATIONS_DIR + name, number, required, rollback, downFile: MIGRATIONS_DIR + downName })
    } else if (/^seed_.+\.sql$/.test(name)) {
      seeds.push(MIGRATIONS_DIR + name)
    } else {
      others.push(MIGRATIONS_DIR + name)
    }
  }
  numbered.sort((a, b) => a.number - b.number || a.file.localeCompare(b.file))
  return { rollbackRequiredFrom: config.rollbackFrom, numbered, seedCount: seeds.length, others }
}

function gatherRoutes(repo, head, added, config) {
  const routes = []
  for (const file of added) {
    const m = file.match(ROUTE_FILE)
    if (!m) continue
    const route = m[1] ?? ''
    let status = 'missing'
    if (ROUTE_AUTH.test(readAtHead(repo, head, file))) status = 'auth'
    else if (config.publicRoutes.has(route)) status = 'public'
    routes.push({ file, route, status })
  }
  return routes
}

function runCheck(flags) {
  const repo = repoRoot()
  const base = flags.base ?? DEFAULT_BASE
  const head = flags.head ?? DEFAULT_HEAD
  verifyRef(repo, base, '--base')
  verifyRef(repo, head, '--head')
  const config = loadGateConfig(repo, head)

  const changes = listJamWebChanges(repo, base, head)
  const added = changes.filter((c) => c.status === 'A').map((c) => c.file)
  const secrets = scanAddedLines(repo, base, head)
  const migrations = gatherMigrations(repo, head, added, config)
  const routes = gatherRoutes(repo, head, added, config)

  const missingRollback = migrations.numbered.filter((x) => x.required && !x.rollback)
  const missingAuth = routes.filter((r) => r.status === 'missing')
  const blockers = []
  if (secrets.findings.length > 0) blockers.push(`비밀값 ${secrets.findings.length}건`)
  if (missingRollback.length > 0) blockers.push(`되돌림 SQL 없는 마이그레이션 ${missingRollback.length}건`)
  if (missingAuth.length > 0) blockers.push(`인증 확인 없는 새 API 라우트 ${missingAuth.length}건`)

  return {
    ok: blockers.length === 0,
    base,
    head,
    blockers,
    jamWebChangedFiles: changes.length,
    secrets: { scannedAddedLines: secrets.scanned, findings: secrets.findings },
    migrations,
    routes,
  }
}

function migrationSummary(m) {
  const n = m.numbered.length
  let middle = ''
  if (n > 0) {
    const missing = m.numbered.filter((x) => x.required && !x.rollback)
    if (missing.length > 0) middle = `(되돌림 SQL 없음: ${missing.map((x) => path.basename(x.file)).join(', ')})`
    else if (m.numbered.some((x) => x.required)) middle = '(되돌림 SQL 있음)'
    else middle = `(${m.rollbackRequiredFrom}번 미만이라 되돌림 SQL 확인 대상 아님)`
  }
  return `번호 ${n}건${middle}, seed ${m.seedCount}건`
}

function renderText(r) {
  const lines = []
  lines.push(`배포 게이트: ${r.ok ? '통과' : `차단(${r.blockers.join(', ')})`}`)
  lines.push(`신규 마이그레이션: ${migrationSummary(r.migrations)}`)
  lines.push(`점검 범위: ${r.base} → ${r.head}, jam-web 변경 ${r.jamWebChangedFiles}개 파일`)

  if (r.secrets.findings.length === 0) {
    lines.push(`- 비밀값: 통과 (jam-web에서 추가된 ${r.secrets.scannedAddedLines}줄 점검)`)
  } else {
    for (const f of r.secrets.findings) lines.push(`- 비밀값: 차단 — ${f.file}:${f.line} ${SECRET_LABELS[f.kind]}`)
  }

  const missing = r.migrations.numbered.filter((x) => x.required && !x.rollback)
  if (missing.length === 0) {
    lines.push(`- 마이그레이션: 통과 — ${migrationSummary(r.migrations)}`)
  } else {
    for (const x of missing) {
      lines.push(
        `- 마이그레이션: 차단 — ${x.file} 되돌림 SQL 없음 (파일 안에 "-- 되돌림 SQL" 또는 "-- ROLLBACK"으로 시작하는 줄이 없고, 짝이 되는 ${path.basename(x.downFile)}도 이 범위에 없음)`,
      )
    }
  }
  if (r.migrations.others.length > 0) {
    lines.push(`- 참고: 번호·seed 이름 규칙 밖의 마이그레이션 파일 ${r.migrations.others.length}건은 점검하지 못했습니다: ${r.migrations.others.map((f) => path.basename(f)).join(', ')}`)
  }

  const missingAuth = r.routes.filter((x) => x.status === 'missing')
  if (missingAuth.length === 0) {
    const auth = r.routes.filter((x) => x.status === 'auth').length
    const pub = r.routes.filter((x) => x.status === 'public').length
    lines.push(`- API 라우트: 통과 — 새 라우트 ${r.routes.length}건(인증 확인 ${auth}건, 공개 라우트 등록 ${pub}건)`)
  } else {
    for (const x of missingAuth) {
      lines.push(
        `- API 라우트: 차단 — ${x.file} 인증 확인 호출이 없고 공개 라우트로 등록돼 있지 않음 (의도한 공개 라우트면 ${CONTRACT_REL}의 deploy_gate.public_routes에 "${x.route}" 등록)`,
      )
    }
  }

  if (!r.ok) lines.push('조치: 차단 사유를 고쳐 staging에 커밋한 뒤 다시 실행합니다. 이 상태로는 main에 승격하지 않습니다.')
  return lines.join('\n')
}

// ── served ───────────────────────────────────────────────────────────────────
function describeFetchError(e) {
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return '시간 초과'
  return `네트워크 오류(${e?.cause?.code ?? e?.cause?.message ?? e?.code ?? e?.message ?? '원인 불명'})`
}

async function probe(url, timeoutMs) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'jam-deploy-gate', accept: 'text/html,*/*' },
    })
    const html = await res.text()
    const m = html.match(DPL_ID)
    return m ? { kind: 'found', id: m[1], status: res.status } : { kind: 'none', status: res.status }
  } catch (e) {
    return { kind: 'error', message: describeFetchError(e) }
  }
}

async function runServed(flags) {
  if (typeof fetch !== 'function') throw new GateError('전역 fetch가 없습니다. Node 18 이상에서 실행하세요.')
  const url = flags.url ?? DEFAULT_URL
  if (!/^https?:\/\//i.test(url)) throw new UsageError(`--url은 http:// 또는 https:// 주소여야 합니다: ${url}`)
  const timeoutSec = positiveNumber('timeout', flags.timeout, DEFAULT_TIMEOUT_SEC)
  const intervalSec = positiveNumber('interval', flags.interval, DEFAULT_INTERVAL_SEC)
  const previous = flags['wait-change']
  if (previous !== undefined && !/^dpl_[A-Za-z0-9]+$/.test(previous)) {
    throw new UsageError(`--wait-change에는 dpl_ 로 시작하는 배포 id를 넣어야 합니다: ${previous}`)
  }

  if (previous === undefined) {
    const r = await probe(url, Math.min(REQUEST_TIMEOUT_MS, timeoutSec * 1000))
    if (r.kind === 'found') {
      console.log(r.id)
      return 0
    }
    if (r.kind === 'none') {
      console.log('none')
      console.error(`응답은 왔으나(HTTP ${r.status}) 배포 식별자(dpl=dpl_… 또는 data-dpl-id)를 찾지 못했습니다: ${url}`)
      return 3
    }
    console.error(`서빙 배포를 확인하지 못했습니다 — ${r.message}: ${url}`)
    return 2
  }

  const deadline = Date.now() + timeoutSec * 1000
  let lastResponse = null
  let lastError = null
  for (;;) {
    const remaining = deadline - Date.now()
    const r = await probe(url, Math.min(REQUEST_TIMEOUT_MS, Math.max(remaining, MIN_LAST_REQUEST_MS)))
    if (r.kind === 'found' && r.id !== previous) {
      console.log(r.id)
      return 0
    }
    if (r.kind === 'error') lastError = r
    else lastResponse = r
    if (Date.now() >= deadline) break
    await sleep(Math.min(intervalSec * 1000, Math.max(deadline - Date.now(), 0)))
  }

  if (!lastResponse) {
    console.error(`${timeoutSec}초 동안 응답을 받지 못했습니다 — ${lastError?.message ?? '원인 불명'}: ${url}`)
    return 2
  }
  const last = lastResponse.kind === 'found' ? lastResponse.id : 'none'
  console.log(last)
  console.error(`${timeoutSec}초 안에 서빙 배포 id가 바뀌지 않았습니다(이전 ${previous}, 마지막 확인 ${last}): ${url}`)
  return 4
}

// ── 실행 ─────────────────────────────────────────────────────────────────────
async function main(argv) {
  const [command, ...rest] = argv
  if (command === 'check') {
    const flags = parseFlags(rest, { base: 'string', head: 'string', json: 'boolean' })
    const result = runCheck(flags)
    console.log(flags.json ? JSON.stringify(result, null, 2) : renderText(result))
    return result.ok ? 0 : 1
  }
  if (command === 'served') {
    const flags = parseFlags(rest, { url: 'string', 'wait-change': 'string', timeout: 'string', interval: 'string' })
    return runServed(flags)
  }
  throw new UsageError(command ? `알 수 없는 명령입니다: ${command}` : '명령이 필요합니다(check 또는 served)')
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((e) => {
    if (e instanceof UsageError) {
      console.error(`${e.message}\n\n${USAGE}`)
      process.exitCode = 64
    } else {
      console.error(`deploy-gate 실행 오류: ${e instanceof GateError ? e.message : (e?.stack ?? e)}`)
      process.exitCode = 2
    }
  })
