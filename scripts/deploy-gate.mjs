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
//
// 단일 파일이어야 한다: 무인 배포 루틴은 `git show origin/staging:scripts/deploy-gate.mjs > /tmp/deploy-gate.mjs`로
// 이 파일 하나만 /tmp로 꺼내 실행한다. 다른 스크립트를 상대 경로로 불러오면 그곳에서 ERR_MODULE_NOT_FOUND로 죽고
// 게이트 실행 오류는 배포 차단이 된다(티켓 20260924_1614). check-contract.mjs가 상대 경로 import를 위반으로 잡는다.
// 라이브러리 사용: check-contract.mjs처럼 함수만 가져다 쓰려면 불러오기 전에
// globalThis.__JAM_DEPLOY_GATE_AS_LIBRARY__ = true 를 설정한다. 이 값이 정확히 true일 때만 main을 건너뛴다 —
// 직접 실행이 기본이다(실행 경로를 비교해 판정하면 /tmp → /private/tmp 같은 심볼릭 링크에서 어긋나 게이트가
// 아무것도 검사하지 않고 종료 코드 0으로 끝날 수 있다).
// 저장소·DB·Vercel에 아무것도 쓰지 않는다. 점검은 모두 배포를 막는 방향이거나 읽기 전용이라 무인
// 권한을 늘리지 않는다.
//
// 선언: 번호 기준선·공개 라우트 목록·인증 래퍼 목록은 점검 대상(head)의 docs/agents/contract.json →
// deploy_gate에 있다(check-contract.mjs가 선언과 실제를 대조한다). 인증 래퍼는 라우트가 인증을 공용 함수에
// 맡기는 경우의 선언이며, 게이트가 래퍼 파일이 실제로 인증하는지까지 확인한다(판정 함수는 이 파일 안에 있다).
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

// ── 인증 래퍼 판정 (티켓 20260924_1555, 단일 파일화 20260924_1614) ────────────────────
// 순수 함수만 둔다(파일·git 접근 없음). 규칙의 뜻과 등록 절차는 docs/agents/contract.json의 deploy_gate._why가
// 단일 원천이고, scripts/check-contract.mjs가 이 함수들을 가져다 선언과 실제를 대조한다(같은 규칙을 두 파일에
// 적으면 어느 쪽이 낡았는지 구분할 수 없다). 판정은 모두 실패하면 막는 쪽이다: 소스를 잘못 해석해서 생기는
// 오류는 "일치를 놓쳐 차단"이 되도록 짰다. 주석은 공백으로, 문자열 안쪽은 비워서 판정하므로 주석·문자열에
// 적어 넣은 함수 이름으로 검사를 속일 수 없다. 정규식 리터럴 안의 따옴표 같은 드문 문법은 완벽하게 파싱하지
// 않는다 — 소스 전체를 파서로 읽는 검사가 아니라 실수 방지용 게이트다.

/** 래퍼 파일이 부를 수 있는 인증 함수. 이 중 하나를 auth 모듈에서 가져와 호출해야 인증하는 래퍼로 본다. */
export const WRAPPER_AUTH_CALLS = ['getAdminUser', 'requireAdmin', 'requireAdminRead']

const IDENT = '[A-Za-z_$][\\w$]*'
const NOT_IDENT_AFTER = '(?![\\w$])'
const NOT_IDENT_BEFORE = '(?<![\\w$.])'

/**
 * 주석을 공백으로 바꾸고, keepStrings가 false면 문자열·템플릿 리터럴의 안쪽을 비운다(따옴표는 남긴다).
 * 닫히지 않은 주석·문자열은 끝까지 지운 것으로 본다(놓쳐서 차단되는 쪽).
 */
export function stripSource(src, { keepStrings }) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const ch = src[i]
    const next = src[i + 1]
    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      out += ' '
      i = end === -1 ? n : end + 2
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1
      let body = ''
      while (j < n && src[j] !== ch) {
        if (src[j] === '\\') {
          body += src.slice(j, j + 2)
          j += 2
          continue
        }
        if (src[j] === '\n' && ch !== '`') break // 닫히지 않은 한 줄 문자열은 줄 끝에서 멈춘다
        body += src[j]
        j++
      }
      out += keepStrings ? ch + body + ch : ch + ch
      i = src[j] === ch ? j + 1 : j
      continue
    }
    out += ch
    i++
  }
  return out
}

/** `jam-web/src/lib/admin/bulk/server.ts` → `@/lib/admin/bulk/server`. jam-web/src 아래 .ts/.tsx가 아니면 null. */
export function moduleSpecifierFor(file) {
  const m = /^jam-web\/src\/(.+)\.tsx?$/.exec(file)
  return m ? `@/${m[1]}` : null
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `import { a, b as c } from '<모듈>'`에서 가져온 이름들의 {imported, local} 목록.
 * isModule(경로)가 참인 import 문만 본다. `import type {…}`와 `{ type x }`는 값이 아니므로 뺀다.
 * 기본 가져오기·네임스페이스 가져오기(`import * as x`)는 지원하지 않는다 — 인식 못 하면 차단된다.
 */
function namedImports(codeWithStrings, isModule) {
  const found = []
  const re = /(?<![\w$.])import\s*\{([^}]*)\}\s*from\s*(['"])([^'"\n]*)\2/g
  for (const m of codeWithStrings.matchAll(re)) {
    if (!isModule(m[3])) continue
    for (const raw of m[1].split(',')) {
      const spec = raw.trim()
      if (!spec || /^type\s/.test(spec)) continue
      const parts = spec.split(/\s+as\s+/)
      const imported = parts[0].trim()
      const local = (parts[1] ?? parts[0]).trim()
      if (new RegExp(`^${IDENT}$`).test(imported) && new RegExp(`^${IDENT}$`).test(local)) found.push({ imported, local })
    }
  }
  return found
}

/** 본문에 같은 이름을 새로 선언하는 문장(지역 함수·변수로 가져온 이름을 가리는 것)이 있는가. */
function redeclares(code, local) {
  const l = escapeRegExp(local)
  return new RegExp(`(?<![\\w$.])(?:function\\s*\\*?|const|let|var|class)\\s+${l}${NOT_IDENT_AFTER}`).test(code)
}

function callsLocal(code, local) {
  return new RegExp(`${NOT_IDENT_BEFORE}${escapeRegExp(local)}\\s*\\(`).test(code)
}

const isAuthModule = (spec) => spec === '@/lib/admin/auth' || /^(?:\.\.?\/)+(?:[\w.-]+\/)*auth$/.test(spec)

/**
 * 래퍼 파일 소스가 (1) 선언된 함수를 내보내고 (2) auth 모듈에서 가져온 인증 함수를 실제로 부르는지.
 * 문제가 있으면 코드 배열을 돌려준다(빈 배열이면 무결). 코드: 'no_export' · 'no_auth_call'.
 */
export function checkWrapperSource(source, call) {
  const code = stripSource(source, { keepStrings: false })
  const withStrings = stripSource(source, { keepStrings: true })
  const problems = []

  const c = escapeRegExp(call)
  let exported =
    new RegExp(`(?<![\\w$.])export\\s+(?:default\\s+)?(?:async\\s+)?function\\s*\\*?\\s*${c}${NOT_IDENT_AFTER}`).test(code) ||
    new RegExp(`(?<![\\w$.])export\\s+const\\s+${c}${NOT_IDENT_AFTER}`).test(code)
  if (!exported) {
    // 재내보내기(export { x } from '…')는 이 파일 안에서 인증하는 것이 아니므로 인정하지 않는다.
    for (const m of code.matchAll(/(?<![\w$.])export\s*\{([^}]*)\}(?!\s*from(?![\w$]))/g)) {
      for (const raw of m[1].split(',')) {
        const parts = raw.trim().split(/\s+as\s+/)
        if ((parts[1] ?? parts[0]).trim() === call) exported = true
      }
    }
  }
  if (!exported) problems.push('no_export')

  const authImports = namedImports(withStrings, isAuthModule).filter((x) => WRAPPER_AUTH_CALLS.includes(x.imported))
  const authenticates = authImports.some((x) => !redeclares(code, x.local) && callsLocal(code, x.local))
  if (!authenticates) problems.push('no_auth_call')
  return problems
}

/**
 * 라우트가 선언된 래퍼를 실제로 쓰는가: (a) 래퍼 모듈에서 선언된 함수를 가져오고(별칭 허용)
 * (b) 그 이름을 호출하며 (c) 같은 이름을 지역에서 다시 선언하지 않는다.
 * 가져오기만 하거나, 같은 이름의 지역 함수를 부르거나, 다른 경로에서 가져오면 false.
 */
export function routeUsesWrapper(routeSource, wrapperFile, call) {
  const spec = moduleSpecifierFor(wrapperFile)
  if (!spec) return false
  const code = stripSource(routeSource, { keepStrings: false })
  const withStrings = stripSource(routeSource, { keepStrings: true })
  return namedImports(withStrings, (s) => s === spec)
    .filter((x) => x.imported === call)
    .some((x) => !redeclares(code, x.local) && callsLocal(code, x.local))
}

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
const SECRET_NAMES = '(?:SUPABASE_SERVICE_ROLE_KEY|STRAVA_CLIENT_SECRET|ENCRYPTION_KEY|ADMIN_SECRET|CRON_SECRET)'
const SECRET_RULES = [
  { kind: 'sb_secret', re: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { kind: 'jwt', re: /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/ },
  // 모든 파일: 따옴표 또는 백틱 문자열 대입. 백틱 값은 ${…} 보간을 제외한다(값을 읽기만 하는 코드를 잡지 않으려는 이유가 같다).
  { kind: 'env_assign', re: new RegExp(`${SECRET_NAMES}\\s*[:=]\\s*(?:["'][^"'\\s]{16,}["']|\`[^\`\\s$]{16,}\`)`) },
  // .env 계열 파일만: 따옴표 없는 NAME=값. 줄 첫머리(선택적 export)에서 시작해야 하므로 주석 처리된 줄과 ${…} 참조 값은 걸리지 않는다.
  { kind: 'env_assign', envFilesOnly: true, re: new RegExp(`^\\s*(?:export\\s+)?${SECRET_NAMES}\\s*=\\s*[^\\s"'\`$#][^\\s"'\`#]{15,}\\s*(?:#.*)?$`) },
]
// .env 계열 파일. 자리 표시 값을 적는 예시 파일(.example·.sample·.template)은 제외한다.
export function isEnvFile(file) {
  const base = String(file ?? '').split('/').pop()
  return /^\.env(?:\..+)?$/.test(base) && !/\.(?:example|sample|template)$/.test(base)
}
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
  // auth_wrappers는 선택 항목이다(없으면 래퍼 없이 기존 판정만). 있는데 모양이 틀리면 실행 오류로 끝낸다.
  const rawWrappers = g.auth_wrappers ?? []
  const wrappersOk =
    Array.isArray(rawWrappers) &&
    rawWrappers.every(
      (w) =>
        w &&
        typeof w === 'object' &&
        typeof w.file === 'string' &&
        moduleSpecifierFor(w.file) !== null &&
        typeof w.call === 'string' &&
        /^[A-Za-z_$][\w$]*$/.test(w.call),
    )
  if (!wrappersOk) {
    throw new GateError(
      `${head}의 ${CONTRACT_REL} deploy_gate.auth_wrappers 형식이 잘못됐습니다({ "file": "jam-web/src/ 아래 .ts 경로", "call": "함수 이름" } 배열이어야 합니다).`,
    )
  }
  return {
    rollbackFrom: g.rollback_sql_required_from,
    publicRoutes: new Set(g.public_routes.map(trimSlashes)),
    authWrappers: rawWrappers.map((w) => ({ file: w.file, call: w.call })),
  }
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
          if (rule.envFilesOnly && !isEnvFile(file)) continue
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

// 선언된 인증 래퍼가 head에서 실제로 인증하는지 본다(무결성). 파일이 없거나(git show 실패), 선언된 함수를 내보내지
// 않거나, 인증 함수를 부르지 않으면 problems에 사유가 담기고 그 래퍼에 기대는 라우트는 통과하지 못한다.
function verifyWrappers(repo, head, config) {
  return config.authWrappers.map(({ file, call }) => {
    let source = null
    try {
      source = readAtHead(repo, head, file)
    } catch {
      source = null
    }
    const problems = source === null ? ['no_file'] : checkWrapperSource(source, call)
    return { file, call, ok: problems.length === 0, problems }
  })
}

function gatherRoutes(repo, head, added, config, wrappers) {
  const routes = []
  for (const file of added) {
    const m = file.match(ROUTE_FILE)
    if (!m) continue
    const route = m[1] ?? ''
    const source = readAtHead(repo, head, file)
    const entry = { file, route, status: 'missing' }
    // 래퍼를 쓰는 라우트(가져오기 + 호출)를 찾는다. 무결성이 깨진 래퍼면 인증으로 치지 않는다.
    const used = wrappers.filter((w) => routeUsesWrapper(source, w.file, w.call))
    const intact = used.find((w) => w.ok)
    if (ROUTE_AUTH.test(source)) {
      entry.status = 'auth'
    } else if (intact) {
      entry.status = 'auth'
      entry.via = intact.call
    } else if (config.publicRoutes.has(route)) {
      entry.status = 'public'
    } else if (used.length > 0) {
      entry.brokenWrappers = used.map((w) => w.call)
    }
    routes.push(entry)
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
  const authWrappers = verifyWrappers(repo, head, config)
  const routes = gatherRoutes(repo, head, added, config, authWrappers)

  const missingRollback = migrations.numbered.filter((x) => x.required && !x.rollback)
  const missingAuth = routes.filter((r) => r.status === 'missing')
  const brokenWrappers = authWrappers.filter((w) => !w.ok)
  const blockers = []
  if (secrets.findings.length > 0) blockers.push(`비밀값 ${secrets.findings.length}건`)
  if (missingRollback.length > 0) blockers.push(`되돌림 SQL 없는 마이그레이션 ${missingRollback.length}건`)
  if (missingAuth.length > 0) blockers.push(`인증 확인 없는 새 API 라우트 ${missingAuth.length}건`)
  // 선언된 래퍼가 무결하지 않으면 그 래퍼를 쓰는 기존 라우트도 인증이 빠진 것일 수 있어, 새 라우트가 없어도 막는다.
  if (brokenWrappers.length > 0) blockers.push(`무결성이 깨진 인증 래퍼 ${brokenWrappers.length}건`)

  return {
    ok: blockers.length === 0,
    base,
    head,
    blockers,
    jamWebChangedFiles: changes.length,
    secrets: { scannedAddedLines: secrets.scanned, findings: secrets.findings },
    migrations,
    authWrappers,
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
  // 규칙 밖 이름의 .sql은 번호 기준·되돌림 SQL 점검을 받지 못한다. 건수를 요약 줄에 드러낸다(티켓 20260922_0653).
  const odd = m.others.length > 0 ? `, 규칙 밖 이름 ${m.others.length}건(되돌림 SQL 점검 못 함)` : ''
  return `번호 ${n}건${middle}, seed ${m.seedCount}건${odd}`
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
    lines.push(`- 경고: 번호·seed 이름 규칙 밖의 마이그레이션 파일 ${r.migrations.others.length}건은 되돌림 SQL 점검을 받지 못했습니다: ${r.migrations.others.map((f) => path.basename(f)).join(', ')} (번호 규칙에 맞게 이름을 고치거나 직접 확인)`)
  }

  const wrapperProblemText = {
    no_file: '파일이 점검 대상에 없음',
    no_export: '선언된 함수를 내보내지 않음',
    no_auth_call: `auth 모듈의 인증 함수(${WRAPPER_AUTH_CALLS.join('·')})를 가져와 호출하는 코드가 없음`,
  }
  for (const w of r.authWrappers) {
    if (w.ok) continue
    lines.push(`- 인증 래퍼: 차단 — ${w.file}의 ${w.call}: ${w.problems.map((p) => wrapperProblemText[p] ?? p).join(', ')}`)
  }

  const missingAuth = r.routes.filter((x) => x.status === 'missing')
  if (missingAuth.length === 0) {
    const auth = r.routes.filter((x) => x.status === 'auth').length
    const pub = r.routes.filter((x) => x.status === 'public').length
    const via = r.routes.filter((x) => x.via).length
    const viaText = via > 0 ? `, 이 중 인증 래퍼 경유 ${via}건` : ''
    lines.push(`- API 라우트: 통과 — 새 라우트 ${r.routes.length}건(인증 확인 ${auth}건${viaText}, 공개 라우트 등록 ${pub}건)`)
  } else {
    for (const x of missingAuth) {
      const hint = x.brokenWrappers
        ? `인증 래퍼 ${x.brokenWrappers.join(', ')}의 무결성 검증에 실패해 인증 확인으로 인정하지 않음(위 인증 래퍼 항목 참고)`
        : `인증 확인 호출이 없고 공개 라우트로 등록돼 있지 않음 (의도한 공개 라우트면 ${CONTRACT_REL}의 deploy_gate.public_routes에 "${x.route}" 등록, 공용 인증 래퍼를 쓰는 라우트라면 deploy_gate.auth_wrappers에 선언)`
      lines.push(`- API 라우트: 차단 — ${x.file} ${hint}`)
    }
  }
  if (r.authWrappers.length > 0 && r.authWrappers.every((w) => w.ok)) {
    lines.push(`- 인증 래퍼: 통과 — 선언 ${r.authWrappers.length}건 모두 인증 호출 확인`)
  }

  if (!r.ok) lines.push('조치: 차단 사유를 고쳐 staging에 커밋한 뒤 다시 실행합니다. 이 상태로는 main에 승격하지 않습니다.')
  return lines.join('\n')
}

// ── served ───────────────────────────────────────────────────────────────────
function describeFetchError(e) {
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return '시간 초과'
  if (e?.message?.startsWith('리다이렉트 ')) return e.message
  return `네트워크 오류(${e?.cause?.code ?? e?.cause?.message ?? e?.code ?? e?.message ?? '원인 불명'})`
}

const MAX_REDIRECTS = 10

// 리다이렉트를 직접 따라가며 쿠키를 저장한다. 자동 로그인 리다이렉트가 걸린 스테이징(stage.j-a-m.app)은
// 쿠키를 받아 들고 원래 주소로 돌아와야 끝나는데, fetch의 자동 추적은 쿠키를 저장하지 않아 순환한다(티켓 20260922_0653).
// 쿠키는 받은 출처(origin)로만 다시 보낸다 — 다른 출처로 넘어가는 리다이렉트에 실어 보내지 않는다.
async function fetchFollowingRedirects(url, signal) {
  const jar = new Map() // origin → Map(name → value)
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const origin = new URL(current).origin
    const headers = { 'user-agent': 'jam-deploy-gate', accept: 'text/html,*/*' }
    const cookies = jar.get(origin)
    if (cookies && cookies.size > 0) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await fetch(current, { redirect: 'manual', signal, headers })
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = line.split(';')
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      const maxAge = attrs.map((a) => a.trim().match(/^max-age=(-?\d+)$/i)).find(Boolean)
      const store = jar.get(origin) ?? jar.set(origin, new Map()).get(origin)
      // Max-Age가 있으면 Expires보다 우선한다(RFC 6265 5.3). Max-Age가 없을 때만 Expires가 현재 이전인지 본다.
      // 날짜로 읽을 수 없는 Expires는 삭제로 보지 않는다(티켓 20260926_1535).
      const expires = attrs.map((a) => a.trim().match(/^expires=(.+)$/i)).find(Boolean)
      const expiredByDate = !maxAge && expires && Date.parse(expires[1]) <= Date.now()
      if (value === '' || (maxAge && Number(maxAge[1]) <= 0) || expiredByDate) store.delete(name)
      else store.set(name, value)
    }
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel()
      current = new URL(location, current).href
      continue
    }
    return res
  }
  throw new Error(`리다이렉트 ${MAX_REDIRECTS}회를 넘었습니다`)
}

async function probe(url, timeoutMs) {
  try {
    const res = await fetchFollowingRedirects(url, AbortSignal.timeout(timeoutMs))
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

if (globalThis.__JAM_DEPLOY_GATE_AS_LIBRARY__ !== true) {
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
}
