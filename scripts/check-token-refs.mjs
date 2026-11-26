#!/usr/bin/env node
// check-token-refs — 코드가 참조하는 var(--x)가 토큰 파일·globals.css 어디에도 정의되지 않으면 실패한다.
//
// 정의 안 된 토큰을 쓰면 값이 비어 렌더가 깨진다. 예전에 radius 토큰(--radius-md·--radius-button)을 폐기했을 때
// 그 토큰을 아직 쓰던 Story와 반경 스케일 카드가 각진 사각형으로 렌더된 일이 있어 둔 검사다.
// 옛 DS 동기화 검사(jam-web 쪽 ds 스크립트)의 TOKEN_UNDEFINED 검사를 판정 규칙·대상 그대로 옮겼다 (티켓 20261126_0750).
//
// 판정 규칙: 지역 변수 선언(`'--eye-color': …`, 템플릿 문자열 안 `--x:`)·`var(--x, fallback)`·`var(--weight-*)` 설명 표기는 넘어가고,
// 토큰 파일(jam-web/design-system/tokens/*.css)이나 jam-web/src/app/globals.css에 정의된 이름은 인정한다.
//
// 대상(티켓 20261126_2115, 9-4회차): jam-web/src/**와 jam-web/design-system/**의 .ts·.tsx·.css(시험·스토리 포함, node_modules 제외).
// 정의로 인정하는 이름: 토큰 파일 + jam-theme.css·admin-theme.css·globals.css + 대상 파일 어디서든 선언한 이름(CSS `--x:`·style 객체 `'--x':`·
// `setProperty('--x'`·`@property --x`). 서버가 인라인으로 넣는 실행 값(`--ticket` 등) 때문이다. Tailwind 내부 변수 `--tw-*`는 넘어간다.
//
// 사용법: node scripts/check-token-refs.mjs [폴더…]   (0 = 통과, 1 = 미정의 참조 발견)
//         폴더 인자를 주면 그 폴더만 본다(시험용). 정의 이름은 저장소 토큰 파일과 그 폴더 안 선언에서 읽는다.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WEB_ROOT = path.join(REPO_ROOT, 'jam-web')
const TOKEN_DIR = path.join(WEB_ROOT, 'design-system/tokens')
const GLOBALS = path.join(WEB_ROOT, 'src/app/globals.css')
const THEME_FILES = ['jam-theme.css', 'admin-theme.css', 'globals.css'].map((n) => path.join(WEB_ROOT, 'src/app', n))
const SCAN_ROOTS = [path.join(WEB_ROOT, 'src'), path.join(WEB_ROOT, 'design-system')]
const SCAN_EXT = /\.(?:tsx?|css)$/

/** tokens/*.css의 `--x: 값` 이름을 모은다. 주석 안의 ':'·'--토큰'이 매칭을 밀어내므로 주석을 먼저 걷는다. */
export function loadTokenNames(dir = TOKEN_DIR) {
  const names = new Set()
  if (!existsSync(dir)) return names
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
    const src = readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of src.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) names.add(m[1])
  }
  return names
}

/** 소스 한 파일에서 정의 안 된 var(--x) 이름 목록을 돌려준다. */
export function findUndefinedTokens(src, tokenNames, globalsSrc = '') {
  const missing = new Set()
  // 컴포넌트가 자기 style로 주입하는 지역 변수(`'--eye-color': eyeColor`)와 템플릿 문자열 안 CSS 선언(`--x: value`)은 토큰이 아니다.
  // `var(--x)` 참조는 이름 뒤에 `,`나 `)`가 오지 `:`가 오지 않으므로 이 패턴에 걸리지 않는다.
  const localVars = new Set([...src.matchAll(/['"]?(--[\w-]+)['"]?\s*:/g)].map((m) => m[1]))
  for (const m of src.matchAll(/var\((--[\w-]+)(\*?)\s*(,?)/g)) {
    if (m[2] === '*') continue // var(--weight-*)는 설명문 속 와일드카드 표기
    if (m[3] === ',') continue // fallback이 있으면 비어도 렌더가 살아 있다
    if (m[1].startsWith('--tw-')) continue // Tailwind 내부 변수
    if (localVars.has(m[1])) continue
    if (!tokenNames.has(m[1]) && !globalsSrc.includes(`${m[1]}:`)) missing.add(m[1])
  }
  return [...missing]
}

export function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules') continue
    const full = path.join(dir, n)
    if (statSync(full).isDirectory()) walk(full, pred, acc)
    else if (pred(full)) acc.push(full)
  }
  return acc
}

/** 파일 안에서 선언한 이름: CSS `--x:`, style 객체 `'--x':`, `setProperty('--x'`, `@property --x`. `--tw-*`는 제외한다. */
export function declaredNames(src) {
  const out = new Set()
  for (const m of src.matchAll(/['"]?(--[\w-]+)['"]?\s*:/g)) out.add(m[1])
  for (const m of src.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) out.add(m[1])
  for (const m of src.matchAll(/@property\s+(--[\w-]+)/g)) out.add(m[1])
  for (const n of out) if (n.startsWith('--tw-')) out.delete(n)
  return out
}

function main() {
  const argDirs = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((a) => path.resolve(a))
  const tokenNames = loadTokenNames()
  for (const f of THEME_FILES) {
    if (existsSync(f)) for (const n of declaredNames(readFileSync(f, 'utf8'))) tokenNames.add(n)
  }
  const globalsSrc = existsSync(GLOBALS) ? readFileSync(GLOBALS, 'utf8') : ''
  const targets = (argDirs.length > 0 ? argDirs : SCAN_ROOTS).flatMap((d) => walk(d, (f) => SCAN_EXT.test(f)))
  const sources = new Map(targets.map((f) => [f, readFileSync(f, 'utf8')]))
  for (const src of sources.values()) for (const n of declaredNames(src)) tokenNames.add(n)
  let bad = 0
  for (const [f, src] of sources) {
    const missing = findUndefinedTokens(src, tokenNames, globalsSrc)
    if (missing.length) {
      bad += 1
      console.error(`정의되지 않은 토큰을 참조합니다 (${missing.length}개): ${path.relative(REPO_ROOT, f)}\n  ${missing.join(', ')}`)
    }
  }
  if (bad) {
    console.error(`token-refs 실패: ${bad}개 파일`)
    return 1
  }
  console.log(`token-refs 통과: ${targets.length}개 파일`)
  return 0
}

const canon = (p) => { try { return realpathSync(p).normalize('NFC') } catch { return path.resolve(p).normalize('NFC') } }
if (process.argv[1] && canon(process.argv[1]) === canon(fileURLToPath(import.meta.url))) {
  process.exit(main())
}
