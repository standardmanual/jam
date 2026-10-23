#!/usr/bin/env node
// check-client-server-imports — 'use client' 파일이 값 import(동적 import() 포함)를 따라가다 서버 전용 모듈에
// 닿으면 실패한다(티켓 20260924_1639, 동적 import() 추적은 20261017_1638). UsersFilterBar(클라이언트) →
// user-list → auth(서버 전용) 체인이 lint·타입 검사·단위 테스트·CI를 모두 통과하고 실렌더에서만 500으로 드러난
// 사고의 재발 방지다.
//
// 규칙
//   - 시작점: jam-web/src 하위에서 첫 문장이 'use client' 지시문인 파일
//   - 따라가는 간선: 값 import·export ... from·부수효과 import, 그리고 동적 import('...'). `import type`,
//     `export type ... from`, `{ type X }`만 있는 import는 런타임에 지워지므로 간선이 아니다.
//     타입 위치의 import 타입(`import('x').Type`, `typeof import('x')`)도 지워지므로 간선이 아니다
//   - 서버 전용 모듈: SERVER_ONLY_MODULES 목록의 파일, 그리고 next/headers 또는 server-only를 import하는 파일
//   - 동적 import()도 따라간다. 이전에는 «동적 import()는 따라가지 않는다(정적 도달만 본다)»였으나 티켓
//     20261017_1638에서 뒤집었다: 클라이언트 → connection-state.ts → `(await import('@/lib/supabase/server'))`
//     모양을 Turbopack이 정적 import처럼 추적해 브라우저 번들에 next/headers가 들어갔고 /profile/edit이 500이
//     됐는데, 이 검사는 통과했다. 지정자가 변수·보간 템플릿이라 해석할 수 없는 import()는 볼 수 없다
//
// 사용법: node scripts/check-client-server-imports.mjs
//   종료 코드 0 = 통과, 1 = 위반 발견(도달 경로 출력)

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 서버 전용 모듈 목록 — 이 검사가 쓰는 유일한 원천이다. 저장소 루트 기준 경로.
// next/headers·server-only를 직접 import하는 파일은 목록에 없어도 자동으로 서버 전용이다.
export const SERVER_ONLY_MODULES = ['jam-web/src/lib/supabase/server.ts', 'jam-web/src/lib/admin/auth.ts']

const SERVER_ONLY_PACKAGES = new Set(['next/headers', 'server-only'])
const ALIASES = [
  ['@/', 'jam-web/src/'],
  ['@ds/', 'jam-web/design-system/'],
]
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs']

/** 주석을 지운다. 문자열 안의 // (예: 'https://')는 건드리지 않도록 앞 글자를 본다. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

export function isClientFile(src) {
  // 파일 첫 문장이 'use client'여야 지시문이다. 앞의 주석·빈 줄은 허용한다.
  return /^\s*['"]use client['"]/.test(stripComments(src))
}

// 동적 import(): `(await import('x')).y`·`dynamic(() => import('x'))`처럼 줄 중간에도 나오므로 줄 첫머리로 묶지 않는다.
// 앞에 [\w$.]가 오면 `loader.import(...)`·`reimport(...)`이므로 제외한다. 지정자가 문자열 또는 보간 없는 템플릿 리터럴일 때만
// 읽는다(변수·보간은 해석할 수 없다). 두 번째 인자(import attributes)는 건너뛴다.
// 뒤따르는 `.이름`은 group 4 — Promise 메서드(then·catch·finally)가 아니면 `import('x').Type` 형태의 타입 위치 참조다.
const DYNAMIC_IMPORT_RE = /(?<![\w$.])import\s*\(\s*(?:'([^'\n]+)'|"([^"\n]+)"|`([^`$\n]+)`)(?:\s*,[^)]*)?\s*\)(?:\s*\.\s*([\w$]+))?/g
const PROMISE_METHODS = new Set(['then', 'catch', 'finally'])

/**
 * import 구문에서 모듈 지정자를 뽑는다. 런타임에 남는 것만 돌려준다 — 정적 값 import·`export ... from`·부수효과 import,
 * 그리고 동적 `import()`(티켓 20261017_1638). 번들러는 동적 import도 정적처럼 따라가 같은 번들에 싣는다.
 */
export function parseValueImports(src) {
  const code = stripComments(src)
  const specs = []
  // import/export ... from '...' (여러 줄 포함), 줄 첫머리에서만 시작한다.
  const fromRe = /^[ \t]*(import|export)\s+([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gm
  let m
  while ((m = fromRe.exec(code))) {
    const [, kind, clause, spec] = m
    if (isTypeOnlyClause(clause)) continue
    specs.push(spec)
  }
  // 부수효과 import: import './x'
  const sideRe = /^[ \t]*import\s*['"]([^'"]+)['"]/gm
  while ((m = sideRe.exec(code))) specs.push(m[1])
  // 동적 import()
  DYNAMIC_IMPORT_RE.lastIndex = 0
  while ((m = DYNAMIC_IMPORT_RE.exec(code))) {
    const [, single, double, template, member] = m
    if (member && !PROMISE_METHODS.has(member)) continue // import('x').Type — 타입 위치, 런타임에 지워진다
    if (/\btypeof\s*$/.test(code.slice(0, m.index))) continue // typeof import('x') — 타입 위치
    specs.push(single ?? double ?? template)
  }
  return specs
}

function isTypeOnlyClause(clause) {
  const c = clause.trim()
  if (/^type\s/.test(c) || /^type\{/.test(c)) return true // import type X / export type { X }
  const named = c.match(/^(?:([\w$]+)\s*,\s*)?\{([\s\S]*)\}$/)
  if (named) {
    if (named[1]) return false // 기본 import가 값이다
    const items = named[2].split(',').map((s) => s.trim()).filter(Boolean)
    return items.length > 0 && items.every((s) => /^type\s/.test(s))
  }
  return false
}

function resolveSpec(spec, fromFile, fileSet) {
  let base = null
  for (const [prefix, dir] of ALIASES) {
    if (spec.startsWith(prefix)) base = dir + spec.slice(prefix.length)
  }
  if (base === null && (spec.startsWith('./') || spec.startsWith('../'))) {
    base = path.posix.join(path.posix.dirname(fromFile), spec)
  }
  if (base === null) return null // 외부 패키지
  const candidates = [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => `${base}/index${e}`)]
  return candidates.find((c) => fileSet.has(c)) ?? null
}

/**
 * files: Map<저장소 루트 기준 경로, 소스 문자열>. 위반마다 도달 경로 배열(시작 클라이언트 파일 → … → 서버 전용 모듈)을 돌려준다.
 * serverOnly: 서버 전용 모듈 목록(기본은 SERVER_ONLY_MODULES) — 테스트에서 바꿔 끼운다.
 */
export function findViolations(files, serverOnly = SERVER_ONLY_MODULES) {
  const fileSet = new Set(files.keys())
  const listed = new Set(serverOnly)
  const imports = new Map() // 파일 → { deps: 해석된 값 import 파일들, hitsPackage: 서버 전용 패키지 import 여부 }
  const info = (file) => {
    if (!imports.has(file)) {
      const deps = []
      let hitsPackage = false
      for (const spec of parseValueImports(files.get(file))) {
        if (SERVER_ONLY_PACKAGES.has(spec)) hitsPackage = true
        else {
          const r = resolveSpec(spec, file, fileSet)
          if (r) deps.push(r)
        }
      }
      imports.set(file, { deps, hitsPackage })
    }
    return imports.get(file)
  }
  const isServerOnly = (file) => listed.has(file) || info(file).hitsPackage

  const violations = []
  for (const [start, src] of files) {
    if (!isClientFile(src)) continue
    // 너비 우선 탐색 — 가장 짧은 도달 경로를 남긴다. 서버 전용 모듈에 닿으면 그 너머는 따라가지 않는다.
    const parent = new Map([[start, null]])
    const queue = [start]
    const hits = []
    while (queue.length) {
      const cur = queue.shift()
      if (isServerOnly(cur)) {
        hits.push(cur)
        continue
      }
      for (const dep of info(cur).deps) {
        if (!parent.has(dep)) {
          parent.set(dep, cur)
          queue.push(dep)
        }
      }
    }
    for (const hit of hits) {
      const route = []
      for (let f = hit; f !== null; f = parent.get(f)) route.unshift(f)
      violations.push(route)
    }
  }
  return violations
}

function collectFiles(root, rel, out) {
  for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const child = `${rel}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      collectFiles(root, child, out)
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      out.set(child, readFileSync(path.join(root, child), 'utf8'))
    }
  }
}

function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const files = new Map()
  collectFiles(root, 'jam-web/src', files)
  // design-system은 @ds/ 별칭으로 클라이언트에서 가져오므로 그래프에 함께 싣는다.
  try {
    collectFiles(root, 'jam-web/design-system', files)
  } catch {
    // design-system 폴더가 없으면 건너뛴다.
  }
  const violations = findViolations(files)
  if (violations.length === 0) {
    console.log('check-client-server-imports 통과: 클라이언트 파일이 서버 전용 모듈에 닿지 않습니다.')
    return 0
  }
  console.error(`check-client-server-imports 실패: 클라이언트 파일이 서버 전용 모듈에 닿습니다 (${violations.length}건)`)
  for (const route of violations) console.error(`  ${route.join(' → ')}`)
  console.error('  값 import를 `import type`으로 바꾸거나, 서버 전용 코드와 공유 상수를 다른 파일로 나눕니다.')
  console.error('  동적 import()도 번들러가 정적 import처럼 따라가므로 같은 방식으로 풉니다(서버 쪽 호출부로 옮기기).')
  return 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
