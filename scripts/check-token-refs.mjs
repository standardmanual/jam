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
// 사용법: node scripts/check-token-refs.mjs   (0 = 통과, 1 = 미정의 참조 발견)
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WEB_ROOT = path.join(REPO_ROOT, 'jam-web')
const TOKEN_DIR = path.join(WEB_ROOT, 'design-system/tokens')
const GLOBALS = path.join(WEB_ROOT, 'src/app/globals.css')

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
    if (localVars.has(m[1])) continue
    if (!tokenNames.has(m[1]) && !globalsSrc.includes(`${m[1]}:`)) missing.add(m[1])
  }
  return [...missing]
}

function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc
  for (const n of readdirSync(dir)) {
    const full = path.join(dir, n)
    if (statSync(full).isDirectory()) walk(full, pred, acc)
    else if (pred(full)) acc.push(full)
  }
  return acc
}

function main() {
  const tokenNames = loadTokenNames()
  const globalsSrc = existsSync(GLOBALS) ? readFileSync(GLOBALS, 'utf8') : ''
  const targets = [
    ...walk(path.join(WEB_ROOT, 'design-system/foundations'), (f) => f.endsWith('.tsx')),
    ...walk(path.join(WEB_ROOT, 'src/components/ui'), (f) => f.endsWith('.tsx')),
  ]
  let bad = 0
  for (const f of targets) {
    const missing = findUndefinedTokens(readFileSync(f, 'utf8'), tokenNames, globalsSrc)
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
