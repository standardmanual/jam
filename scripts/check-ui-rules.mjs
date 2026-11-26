#!/usr/bin/env node
// check-ui-rules — 서비스 화면 소스에서 DS 밖 값을 찾는 규칙 엔진 (티켓 20261125_2012, UI 소스 정리 2-1회차, 상위 20261125_1923).
//
// 규칙 일곱 가지(규칙 키는 출력에 그대로 쓴다):
//   arbitrary      Tailwind 임의값 클래스 `접두-[값]`. 토큰만으로 이뤄진 값은 위반이 아니다: `var(--이름)` 하나, 형식 힌트가 붙은
//                  `color:var(--이름)`, 그리고 calc(·min(·max(·clamp( 식에서 var(--이름)·100%·100dvh 같은 화면 단위·단위 없는 숫자·
//                  연산자·괄호·쉼표·`_`만 남는 것. `var(--x,1rem)`처럼 대체값이 있거나 `calc(100%+8px)`처럼 리터럴 길이가 섞이면 위반이다.
//                  `data-[…]:` 같은 임의 변형(뒤에 `:`)과 check-spacing.mjs가 이미 세는 간격 접두의 `[Npx]`는 세지 않는다.
//   color-literal  `#rgb`~`#rrggbbaa`, rgb(·rgba(·hsl(·hsla(·oklch(.
//   inline-visual  style={{ … }} 안에서 시각 속성에 리터럴 값(숫자 또는 var( 없는 문자열)을 준 것. 변수·식은 세지 않는다.
//   raw-element    JSX <button·<input·<select·<textarea. 정본 컴포넌트 폴더(jam-web/src/components/ui/) 안은 세지 않는다.
//   primitive-ref 기본값(primitive.css·jam-theme.css @theme에 정의된 이름)을 `var(--이름)`으로 직접 참조(`var(--이름, 대체값)` 포함). 이름은 실행할 때 파일에서 읽는다.
//   palette-class 기본 팔레트·어드민 층·강조색 클래스(`bg-red-500`·`text-primary`·`bg-jam-red`·`shadow-sm` 등, 변형 접두·`/50` 접미 포함).
//                  이름은 실행할 때 admin-theme.css의 --color-*·--shadow-*, globals.css의 «shadcn 이름 — 어드민 전용» 묶음·--color-jam-*에서 읽는다.
//   card-padding  `<Card`의 `className`에 여백 클래스(`p-*`·`px-*`·`py-*`·`pt-*`·`pr-*`·`pb-*`·`pl-*`·`ps-*`·`pe-*`, 변형 접두 포함). 정본 Card는 여백을
//                  인라인 style(`var(--card-padding)`)로 넣어 `className`의 여백 클래스가 조용히 무시된다(티켓 20261126_2224). `<CardHeader` 같은 이름이 이어진 태그는 아니다.
// 두 새 규칙(primitive-ref·palette-class)은 정본 폴더(jam-web/src/components/ui/)와 jam-web/src/components/transitions.css 안은 세지 않고,
// `ui-allow` 줄 예외도 받지 않는다(예외 없는 규칙, 티켓 20261126_2115, UI 소스 정리 9-4회차).
// 네 규칙 모두 주석(`//`·`/* */`·JSDoc·JSX `{/* */}`) 안의 글자는 세지 않는다(scripts/strip-code-comments.mjs로 지운 본문에서 센다).
// 같은 줄에 `ui-allow: <사유>` 주석이 있으면 세지 않는다(사유가 비면 예외가 아니다. 위 두 새 규칙은 제외). 예외 주석은 원래 줄에서 읽는다.
// 파일 이름이 StoryFixtures.ts·StoryFixtures.tsx로 끝나는 스토리 전용 견본 파일은 검사하지 않는다.
//
// 위반은 예외 없이 실패한다(종료 코드 1). 줄 단위 예외는 같은 줄의 `ui-allow: <사유>` 주석뿐이다.
//
// 사용법: node scripts/check-ui-rules.mjs                      대상 전체 검사
//         --files <경로…>                                       주어진 파일만 검사(pre-commit용)
//         --stdin-file <경로>                                   표준 입력 내용을 그 경로의 새 내용으로 보고 검사(클로드 코드 훅용, 디스크를 읽지 않음)
//         --json                                                결과를 JSON으로 낸다
//         --root <dir>                                          시험용
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments } from './strip-code-comments.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

export const TARGET_DIRS = [
  'jam-web/src/app/(main)',
  'jam-web/src/app/(auth)',
  'jam-web/src/app/(onboarding)',
  'jam-web/src/app/(legal)',
  'jam-web/src/components',
]
const EXT = /\.(tsx|ts|css)$/
const SKIP_FILE = /\.(test|stories)\.|StoryFixtures\.tsx?$/
const SKIP_DIRS = new Set(['admin', '__tests__', 'dev-sample', 'spike', 'node_modules'])
const CANONICAL_UI_DIR = 'jam-web/src/components/ui/'
const TRANSITIONS_CSS = 'jam-web/src/components/transitions.css'
const PRIMITIVE_CSS = 'jam-web/design-system/tokens/primitive.css'
const JAM_THEME_CSS = 'jam-web/src/app/jam-theme.css'
const ADMIN_THEME_CSS = 'jam-web/src/app/admin-theme.css'
const GLOBALS_CSS = 'jam-web/src/app/globals.css'

function readOr(root, rel) {
  const f = path.join(root, rel)
  return existsSync(f) ? readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')) : ''
}

// 층 규칙이 쓰는 이름을 실행할 때 파일에서 읽는다(하드코딩하지 않는다). root 아래 파일이 없으면 빈 집합이라 그 규칙은 아무것도 잡지 않는다.
//   primitives: primitive.css의 모든 `--이름:` 선언 + jam-theme.css `@theme { }` 안 선언
//   palette:    클래스 이름 조각(`red-500`, `primary` …) — admin-theme.css `--color-*`, globals.css 어드민 shadcn 묶음·`--color-jam-*`
//   shadows:    admin-theme.css `--shadow-*`의 크기 이름
export function loadLayerNames(root) {
  const primitives = new Set()
  for (const m of readOr(root, PRIMITIVE_CSS).matchAll(/(--[\w-]+)\s*:/g)) primitives.add(m[1])
  const theme = readOr(root, JAM_THEME_CSS)
  for (const b of theme.matchAll(/@theme\b[^{]*\{([^}]*)\}/g)) {
    for (const m of b[1].matchAll(/(--[\w-]+)\s*:/g)) primitives.add(m[1])
  }
  const palette = new Set()
  const shadows = new Set()
  for (const m of readOr(root, ADMIN_THEME_CSS).matchAll(/--(color|shadow)-([\w-]+)\s*:/g)) {
    ;(m[1] === 'color' ? palette : shadows).add(m[2])
  }
  const globalsRaw = existsSync(path.join(root, GLOBALS_CSS)) ? readFileSync(path.join(root, GLOBALS_CSS), 'utf8') : ''
  const marker = globalsRaw.indexOf('shadcn 이름 — 어드민 전용')
  if (marker >= 0) {
    const end = globalsRaw.indexOf('}', marker)
    for (const m of globalsRaw.slice(marker, end).matchAll(/--color-([\w-]+)\s*:/g)) palette.add(m[1])
  }
  for (const m of globalsRaw.matchAll(/--color-(jam-[\w-]+)\s*:/g)) palette.add(m[1])
  return { primitives, palette, shadows }
}

const COLOR_PREFIX = '(?:bg|text|border(?:-[xytblrse])?|fill|stroke|from|via|to|ring-offset|ring|outline|decoration|accent|caret|divide|placeholder)'
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// 클래스 정규식은 이름 목록이 바뀔 때만 다시 만든다.
const classRegexCache = new WeakMap()
function paletteRegex(names) {
  let re = classRegexCache.get(names)
  if (re === undefined) {
    const parts = []
    if (names.palette.size > 0) {
      parts.push(`${COLOR_PREFIX}-(?:${[...names.palette].sort((a, b) => b.length - a.length).map(esc).join('|')})`)
    }
    if (names.shadows.size > 0) parts.push(`shadow-(?:${[...names.shadows].sort((a, b) => b.length - a.length).map(esc).join('|')})`)
    re = parts.length > 0 ? new RegExp(`(?<![\\w-])(?:${parts.join('|')})(?![\\w-])`, 'g') : null
    classRegexCache.set(names, re)
  }
  return re
}
const namesByRoot = new Map()
function namesFor(root) {
  if (!namesByRoot.has(root)) namesByRoot.set(root, loadLayerNames(root))
  return namesByRoot.get(root)
}
const VAR_REF = /var\(\s*(--[\w-]+)/g

export const RULES = ['arbitrary', 'color-literal', 'inline-visual', 'raw-element', 'primitive-ref', 'palette-class', 'card-padding']
const LAYER_FIX =
  '의미·컴포넌트 토큰이나 서비스 눈금 클래스를 쓰세요. 맞는 토큰이 없으면 새로 만들지 말고 카리나에게 토큰 추가 승인을 요청하세요(이 규칙은 ui-allow 예외를 받지 않습니다).'

export const FIXES = {
  arbitrary: '토큰 클래스나 정본 컴포넌트의 variant를 쓰세요. 맞는 토큰이 없으면 새로 만들지 말고 카리나에게 토큰 추가 승인을 요청하세요.',
  'color-literal': '색은 DS 색 토큰(var(--…) 또는 토큰 클래스)으로 쓰세요. 맞는 토큰이 없으면 새로 만들지 말고 카리나에게 토큰 추가 승인을 요청하세요.',
  'inline-visual': '시각 속성은 토큰 클래스나 정본 컴포넌트의 variant로 옮기세요. 값이 필요하면 var(--…) 토큰을 참조하세요.',
  'raw-element': '`@/components/ui`의 정본 컴포넌트(Button 등)를 쓰세요.',
  'primitive-ref': LAYER_FIX,
  'palette-class': LAYER_FIX,
  'card-padding': '정본 Card의 여백은 인라인 style로 들어가 className의 여백 클래스가 무시됩니다. Card 안쪽에 여백 래퍼를 두거나 맞는 variant가 없으면 카리나에게 요청하세요.',
}

const ALLOW = /ui-allow:\s*(?!\*\/|-->|\}|$)\S/

const SPACING_PREFIX = '(?:gap-x|gap-y|space-x|space-y|gap|px|py|pt|pb|pl|pr|p|mx|my|mt|mb|ml|mr|m)'
const SPACING_PX = new RegExp(`^-?${SPACING_PREFIX}$`)
// 접두-[값] 뒤에 ':'가 붙으면 변형이다. 값에는 공백·']'가 없다.
const ARBITRARY = /(?<![\w\-[])(-?[a-z][\w-]*)-\[([^\]\s]+)\](?!:)/g
const VAR_ONLY = /^(?:[a-z][\w-]*:)?var\(--[\w-]+\)$/
// calc(·min(·max(·clamp( 식: 토큰·100%·화면 단위·단위 없는 숫자·연산자·괄호·쉼표·_(공백)만 남으면 토큰만의 값이다.
const CALC_FN = /^(?:calc|min|max|clamp)\(/
const CALC_ALLOWED = /(?:calc|min|max|clamp)\(|var\(--[\w-]+\)|100(?:%|dvh|svh|lvh|vh|vw)(?![\w.%])|\d+(?:\.\d+)?(?![\w.%])|[+\-*/(),_]/g
function isTokenOnly(value) {
  if (VAR_ONLY.test(value)) return true
  if (!CALC_FN.test(value) || !value.endsWith(')')) return false
  // 계산식은 var(--…) 토큰이 적어도 하나 있어야 토큰 조합이다(calc(0.96)·calc(100%)는 리터럴 값이다).
  if (!/var\(--[\w-]+\)/.test(value)) return false
  return value.replace(CALC_ALLOWED, '').length === 0
}
const COLOR = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch)\(/g
const RAW_ELEMENT = /<(?:button|input|select|textarea)(?=[\s/>]|$)/g
const VISUAL_KEYS = [
  'color', 'background', 'backgroundColor', 'borderColor', 'border', 'fontSize',
  'fontWeight', 'lineHeight', 'letterSpacing', 'borderRadius', 'boxShadow', 'fontFamily',
]
const VISUAL_PROP = new RegExp(
  `(?<![\\w$.])(${VISUAL_KEYS.join('|')})\\s*:\\s*(?:(['"\`])((?:(?!\\2)[^\\\\\\n]|\\\\.)*)\\2|(-?\\d[\\w.%]*))\\s*(?=[,}\\n]|$)`,
  'g',
)

// 텍스트와 경로로 위반 목록을 낸다: [{ rule, line }]
export function findHits(rawText, relPath, names = namesFor(path.join(SCRIPT_DIR, '..'))) {
  // 주석 안의 글자는 세지 않는다. 같은 길이로 지우므로 줄 번호가 같고, 예외 주석은 원래 줄에서 읽는다.
  const text = stripComments(rawText, path.posix.extname(relPath))
  const lines = text.split('\n')
  const rawLines = rawText.split('\n')
  const hits = []
  const allowed = (i) => ALLOW.test(rawLines[i] ?? '')
  const add = (rule, i) => {
    if (!allowed(i)) hits.push({ rule, line: i + 1 })
  }
  const isCanonical = relPath.startsWith(CANONICAL_UI_DIR)
  // 층 규칙은 ui-allow 예외를 받지 않는다. 정본 폴더와 transitions.css는 기본값을 쓸 수 있는 구역이다.
  const layerExempt = isCanonical || relPath === TRANSITIONS_CSS
  const paletteRe = layerExempt ? null : paletteRegex(names)

  lines.forEach((line, i) => {
    for (const m of line.matchAll(ARBITRARY)) {
      const [, prefix, value] = m
      if (isTokenOnly(value)) continue
      if (SPACING_PX.test(prefix) && /^\d+(?:\.\d+)?px$/.test(value)) continue
      add('arbitrary', i)
    }
    for (const _ of line.matchAll(COLOR)) add('color-literal', i)
    if (!isCanonical) {
      for (const _ of line.matchAll(RAW_ELEMENT)) add('raw-element', i)
    }
    if (!layerExempt) {
      for (const m of line.matchAll(VAR_REF)) {
        if (names.primitives.has(m[1])) hits.push({ rule: 'primitive-ref', line: i + 1 })
      }
      if (paletteRe) for (const _ of line.matchAll(paletteRe)) hits.push({ rule: 'palette-class', line: i + 1 })
    }
  })

  // inline-visual: style={{ … }} 본문을 중괄호 짝으로 잘라 속성을 본다.
  const lineStarts = [0]
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') lineStarts.push(k + 1)
  const lineOf = (offset) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  const STYLE_OPEN = /style=\{\{/g
  let sm
  while ((sm = STYLE_OPEN.exec(text)) !== null) {
    const bodyStart = sm.index + sm[0].length
    let depth = 1
    let k = bodyStart
    for (; k < text.length && depth > 0; k++) {
      if (text[k] === '{') depth++
      else if (text[k] === '}') depth--
    }
    const body = text.slice(bodyStart, k - 1)
    for (const pm of body.matchAll(VISUAL_PROP)) {
      const quoted = pm[3]
      if (quoted !== undefined) {
        if (quoted.includes('var(') || (pm[2] === '`' && quoted.includes('${'))) continue
      }
      add('inline-visual', lineOf(bodyStart + pm.index))
    }
  }

  // card-padding: `<Card …>` 태그의 className 값 안에 여백 클래스가 있으면 센다.
  const CARD_OPEN = /<Card(?=[\s/>])/g
  const PADDING_CLASS = /(?<![\w-])(?:[\w[\]&>*=-]+:)*-?p[xytrblse]?-[\w[\]./%()-]+/g
  let cm
  while ((cm = CARD_OPEN.exec(text)) !== null) {
    const tagStart = cm.index + cm[0].length
    let depth = 0
    let end = tagStart
    for (; end < text.length; end++) {
      const ch = text[end]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth <= 0) break
    }
    const tag = text.slice(tagStart, end)
    const cn = /(?<![\w-])className\s*=\s*/.exec(tag)
    if (!cn) continue
    const vStart = cn.index + cn[0].length
    const open = tag[vStart]
    let vEnd = vStart
    if (open === '"' || open === "'") {
      vEnd = tag.indexOf(open, vStart + 1)
      if (vEnd < 0) vEnd = tag.length
    } else if (open === '{') {
      let d = 0
      for (; vEnd < tag.length; vEnd++) {
        if (tag[vEnd] === '{') d++
        else if (tag[vEnd] === '}' && --d === 0) break
      }
    }
    const value = tag.slice(vStart, vEnd)
    for (const pm of value.matchAll(PADDING_CLASS)) {
      add('card-padding', lineOf(tagStart + vStart + pm.index))
    }
  }
  return hits
}

// 규칙별 개수와 줄 번호: { counts: {규칙: n}, lines: {규칙: [줄…]} }
export function summarize(hits) {
  const counts = {}
  const lines = {}
  for (const h of hits) {
    counts[h.rule] = (counts[h.rule] ?? 0) + 1
    ;(lines[h.rule] ??= []).push(h.line)
  }
  return { counts, lines }
}

export function normalizePath(root, p) {
  const abs = path.resolve(root, p)
  return path.relative(root, abs).split(path.sep).join('/').normalize('NFC')
}

// 상대 경로가 검사 대상인가(폴더·확장자·건너뜀 규칙)
export function isTarget(rel) {
  const dir = TARGET_DIRS.find((d) => rel.startsWith(d.normalize('NFC') + '/'))
  if (!dir) return false
  if (!EXT.test(rel) || SKIP_FILE.test(path.posix.basename(rel))) return false
  const rest = rel.slice(dir.length + 1).split('/')
  return !rest.slice(0, -1).some((seg) => SKIP_DIRS.has(seg))
}

function walk(dir, out) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out)
    } else if (EXT.test(name) && !SKIP_FILE.test(name)) {
      out.push(full)
    }
  }
}

function scanFile(root, rel, text) {
  return summarize(findHits(text, rel, namesFor(root)))
}

// 대상 전체: { "경로": { counts, lines } } (위반 있는 파일만)
export function scan(root) {
  const files = []
  for (const d of TARGET_DIRS) walk(path.join(root, d), files)
  const result = {}
  for (const f of files.sort()) {
    const rel = normalizePath(root, f)
    const s = scanFile(root, rel, readFileSync(f, 'utf8'))
    if (Object.keys(s.counts).length > 0) result[rel] = s
  }
  return result
}

// 주어진 파일만(대상이고 디스크에 있는 것)
export function scanFiles(root, paths) {
  const result = {}
  for (const p of paths) {
    const rel = normalizePath(root, p)
    if (!isTarget(rel)) continue
    const abs = path.join(root, rel)
    if (!existsSync(abs)) continue
    const s = scanFile(root, rel, readFileSync(abs, 'utf8'))
    if (Object.keys(s.counts).length > 0) result[rel] = s
  }
  return result
}

// 표준 입력 내용을 그 경로의 새 내용으로 본다(디스크를 읽지 않는다)
export function scanContent(root, p, text) {
  const rel = normalizePath(root, p)
  if (!isTarget(rel)) return {}
  const s = scanFile(root, rel, text)
  return Object.keys(s.counts).length > 0 ? { [rel]: s } : {}
}

// 위반을 파일·규칙별 실패 목록으로 바꾼다(기준선 없이 위반이 하나라도 있으면 실패).
export function toFailures(current) {
  const failures = []
  for (const file of Object.keys(current).sort()) {
    for (const rule of RULES) {
      const now = current[file].counts[rule] ?? 0
      if (now > 0) failures.push({ file, rule, now, lines: current[file].lines[rule], fix: FIXES[rule] })
    }
  }
  return failures
}

function main() {
  const args = process.argv.slice(2)
  const opt = (name, fallback) => {
    const i = args.indexOf(name)
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback
  }
  const root = path.resolve(opt('--root', path.join(SCRIPT_DIR, '..')))
  const json = args.includes('--json')

  let current
  const stdinIdx = args.indexOf('--stdin-file')
  const filesIdx = args.indexOf('--files')
  if (stdinIdx >= 0) {
    const target = args[stdinIdx + 1]
    if (!target) {
      console.error('check-ui-rules: --stdin-file 뒤에 경로가 필요합니다')
      return 1
    }
    current = scanContent(root, target, readFileSync(0, 'utf8'))
  } else if (filesIdx >= 0) {
    const paths = []
    for (let i = filesIdx + 1; i < args.length && !args[i].startsWith('--'); i++) paths.push(args[i])
    current = scanFiles(root, paths)
  } else {
    current = scan(root)
  }

  const failures = toFailures(current)

  if (json) {
    console.log(JSON.stringify({ ok: failures.length === 0, failures }, null, 2))
    return failures.length === 0 ? 0 : 1
  }
  if (failures.length > 0) {
    console.error('check-ui-rules: DS 밖 값이 있습니다. 불가피하면 같은 줄에 `ui-allow: <사유>` 주석을 답니다(primitive-ref·palette-class는 예외 없음).')
    for (const f of failures) {
      console.error(`  ${f.file} [${f.rule}]: ${f.now}건 (줄 ${f.lines.join(', ')})`)
      console.error(`    고치는 방법: ${f.fix}`)
    }
    return 1
  }
  console.log('check-ui-rules: 통과')
  return 0
}

// 실행 판정은 양쪽 경로를 실제 경로(심볼릭 링크 해제)·NFC로 맞춰 비교한다. 그냥 비교하면 링크 경로나 한글 정규화
// 차이(NFC/NFD)로 main이 돌지 않고 검사 없이 종료 코드 0이 된다 (티켓 20261125_2050 민지 주의 발견물).
const canon = (p) => { try { return realpathSync(p).normalize('NFC') } catch { return path.resolve(p).normalize('NFC') } }
if (process.argv[1] && canon(process.argv[1]) === canon(fileURLToPath(import.meta.url))) {
  process.exit(main())
}
