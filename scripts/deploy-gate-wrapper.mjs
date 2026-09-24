// deploy-gate 인증 래퍼 판정 (티켓 20260924_1555).
//
// scripts/deploy-gate.mjs(check)와 scripts/check-contract.mjs가 같은 판정을 쓰도록 한 곳에 둔다 —
// 같은 규칙을 두 파일에 적으면 어느 쪽이 낡았는지 구분할 수 없다(CLAUDE.md 규칙 5). 규칙의 뜻과 등록
// 절차는 docs/agents/contract.json의 deploy_gate._why가 단일 원천이다.
//
// 순수 함수만 둔다(파일·git 접근 없음, Node 내장 모듈도 쓰지 않는다). 판정은 모두 실패하면 막는 쪽이다:
// 소스를 잘못 해석해서 생기는 오류는 "일치를 놓쳐 차단"이 되도록 짰다. 주석은 공백으로, 문자열 안쪽은
// 비워서 판정하므로 주석·문자열에 적어 넣은 함수 이름으로 검사를 속일 수 없다. 정규식 리터럴 안의 따옴표
// 같은 드문 문법은 완벽하게 파싱하지 않는다 — 소스 전체를 파서로 읽는 검사가 아니라 실수 방지용 게이트다.

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
