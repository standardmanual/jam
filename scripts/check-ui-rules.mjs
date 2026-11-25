#!/usr/bin/env node
// check-ui-rules — 서비스 화면 소스에서 DS 밖 값을 찾는 규칙 엔진 (티켓 20261125_2012, UI 소스 정리 2-1회차, 상위 20261125_1923).
//
// 규칙 네 가지(규칙 키는 기준선·출력에 그대로 쓴다):
//   arbitrary      Tailwind 임의값 클래스 `접두-[값]`. 값이 var(--…) 하나뿐이면 위반이 아니다. `data-[…]:` 같은 임의 변형(뒤에 `:`)과
//                  check-spacing.mjs가 이미 세는 간격 접두의 `[Npx]`는 세지 않는다.
//   color-literal  `#rgb`~`#rrggbbaa`, rgb(·rgba(·hsl(·hsla(·oklch(. `//`·`*`·`/*`로 시작하는 주석 줄은 세지 않는다.
//   inline-visual  style={{ … }} 안에서 시각 속성에 리터럴 값(숫자 또는 var( 없는 문자열)을 준 것. 변수·식은 세지 않는다.
//   raw-element    JSX <button·<input·<select·<textarea. 정본 컴포넌트 폴더(jam-web/src/components/ui/) 안은 세지 않는다.
// 같은 줄에 `ui-allow: <사유>` 주석이 있으면 세지 않는다(사유가 비면 예외가 아니다).
//
// 남아 있는 위반은 scripts/ui-rules-baseline.json에 { "경로": { "규칙 키": 개수 } }로 고정한다(7회차에 0까지 고치는 임시 장치).
// 기준선보다 늘어난 파일·기준선에 없는 파일의 위반은 실패(종료 코드 1), 줄어든 파일은 「기준선을 줄이세요」 안내만 낸다.
//
// 사용법: node scripts/check-ui-rules.mjs                      대상 전체 검사
//         --files <경로…>                                       주어진 파일만 검사(pre-commit용)
//         --stdin-file <경로>                                   표준 입력 내용을 그 경로의 새 내용으로 보고 검사(클로드 코드 훅용, 디스크를 읽지 않음)
//         --write-baseline                                      현재 개수로 기준선을 다시 쓴다
//         --json                                                결과를 JSON으로 낸다
//         --root <dir> --baseline <file>                        시험용
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

export const TARGET_DIRS = [
  'jam-web/src/app/(main)',
  'jam-web/src/app/(auth)',
  'jam-web/src/app/(onboarding)',
  'jam-web/src/app/(legal)',
  'jam-web/src/components',
]
const EXT = /\.(tsx|ts|css)$/
const SKIP_FILE = /\.(test|stories)\./
const SKIP_DIRS = new Set(['admin', '__tests__', 'dev-sample', 'spike', 'node_modules'])
const CANONICAL_UI_DIR = 'jam-web/src/components/ui/'

export const RULES = ['arbitrary', 'color-literal', 'inline-visual', 'raw-element']

export const FIXES = {
  arbitrary: '토큰 클래스나 정본 컴포넌트의 variant를 쓰세요. 맞는 토큰이 없으면 새로 만들지 말고 카리나에게 토큰 추가 승인을 요청하세요.',
  'color-literal': '색은 DS 색 토큰(var(--…) 또는 토큰 클래스)으로 쓰세요. 맞는 토큰이 없으면 새로 만들지 말고 카리나에게 토큰 추가 승인을 요청하세요.',
  'inline-visual': '시각 속성은 토큰 클래스나 정본 컴포넌트의 variant로 옮기세요. 값이 필요하면 var(--…) 토큰을 참조하세요.',
  'raw-element': '`@/components/ui`의 정본 컴포넌트(Button 등)를 쓰세요.',
}

const ALLOW = /ui-allow:\s*(?!\*\/|-->|\}|$)\S/

const SPACING_PREFIX = '(?:gap-x|gap-y|space-x|space-y|gap|px|py|pt|pb|pl|pr|p|mx|my|mt|mb|ml|mr|m)'
const SPACING_PX = new RegExp(`^-?${SPACING_PREFIX}$`)
// 접두-[값] 뒤에 ':'가 붙으면 변형이다. 값에는 공백·']'가 없다.
const ARBITRARY = /(?<![\w\-[])(-?[a-z][\w-]*)-\[([^\]\s]+)\](?!:)/g
const VAR_ONLY = /^var\(--[\w-]+\)$/
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

function isCommentLine(line) {
  const t = line.trimStart()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

// 텍스트와 경로로 위반 목록을 낸다: [{ rule, line }]
export function findHits(text, relPath) {
  const lines = text.split('\n')
  const hits = []
  const allowed = (i) => ALLOW.test(lines[i] ?? '')
  const add = (rule, i) => {
    if (!allowed(i)) hits.push({ rule, line: i + 1 })
  }
  const isCanonical = relPath.startsWith(CANONICAL_UI_DIR)

  lines.forEach((line, i) => {
    for (const m of line.matchAll(ARBITRARY)) {
      const [, prefix, value] = m
      if (VAR_ONLY.test(value)) continue
      if (SPACING_PX.test(prefix) && /^\d+(?:\.\d+)?px$/.test(value)) continue
      add('arbitrary', i)
    }
    if (!isCommentLine(line)) {
      for (const _ of line.matchAll(COLOR)) add('color-literal', i)
    }
    if (!isCanonical) {
      for (const _ of line.matchAll(RAW_ELEMENT)) add('raw-element', i)
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
  return summarize(findHits(text, rel))
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

// 기준선과 견준다. onlyFiles가 있으면 그 파일만 본다(없는 파일의 기준선을 «줄었다»로 오판하지 않기 위해).
export function compare(current, baseline, onlyFiles) {
  const failures = []
  const shrunk = []
  const files = new Set([...Object.keys(current), ...(onlyFiles ? onlyFiles : Object.keys(baseline))])
  for (const file of [...files].sort()) {
    const cur = current[file]?.counts ?? {}
    const base = baseline[file] ?? {}
    for (const rule of RULES) {
      const now = cur[rule] ?? 0
      const b = base[rule] ?? 0
      if (now > b) failures.push({ file, rule, base: b, now, lines: current[file].lines[rule], fix: FIXES[rule] })
      else if (now < b) shrunk.push({ file, rule, base: b, now })
    }
  }
  return { failures, shrunk }
}

function toBaseline(current) {
  const out = {}
  for (const file of Object.keys(current).sort()) {
    out[file] = {}
    for (const rule of RULES) if (current[file].counts[rule]) out[file][rule] = current[file].counts[rule]
  }
  return out
}

function main() {
  const args = process.argv.slice(2)
  const opt = (name, fallback) => {
    const i = args.indexOf(name)
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback
  }
  const root = path.resolve(opt('--root', path.join(SCRIPT_DIR, '..')))
  const baselinePath = path.resolve(opt('--baseline', path.join(SCRIPT_DIR, 'ui-rules-baseline.json')))
  const json = args.includes('--json')

  if (args.includes('--write-baseline')) {
    const b = toBaseline(scan(root))
    writeFileSync(baselinePath, JSON.stringify(b, null, 2) + '\n')
    const totals = Object.fromEntries(RULES.map((r) => [r, 0]))
    for (const v of Object.values(b)) for (const [r, n] of Object.entries(v)) totals[r] += n
    console.log(
      `check-ui-rules: 기준선을 썼습니다 — 파일 ${Object.keys(b).length}개, ` +
        RULES.map((r) => `${r} ${totals[r]}건`).join(', ') + ` (${path.basename(baselinePath)})`,
    )
    return 0
  }

  let baseline = {}
  if (existsSync(baselinePath)) {
    try {
      baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
    } catch (e) {
      console.error(`check-ui-rules: 기준선이 올바른 JSON이 아닙니다 — ${e.message}`)
      return 1
    }
  }

  let current
  let only
  const stdinIdx = args.indexOf('--stdin-file')
  const filesIdx = args.indexOf('--files')
  if (stdinIdx >= 0) {
    const target = args[stdinIdx + 1]
    if (!target) {
      console.error('check-ui-rules: --stdin-file 뒤에 경로가 필요합니다')
      return 1
    }
    current = scanContent(root, target, readFileSync(0, 'utf8'))
    only = [normalizePath(root, target)]
  } else if (filesIdx >= 0) {
    const paths = []
    for (let i = filesIdx + 1; i < args.length && !args[i].startsWith('--'); i++) paths.push(args[i])
    current = scanFiles(root, paths)
    only = paths.map((p) => normalizePath(root, p)).filter(isTarget)
  } else {
    current = scan(root)
  }

  const { failures, shrunk } = compare(current, baseline, only)

  if (json) {
    console.log(JSON.stringify({ ok: failures.length === 0, failures, shrunk }, null, 2))
    return failures.length === 0 ? 0 : 1
  }
  if (shrunk.length > 0) {
    console.log('check-ui-rules: 위반이 줄었습니다. 기준선을 줄이세요 (node scripts/check-ui-rules.mjs --write-baseline):')
    for (const s of shrunk) console.log(`  ${s.file} [${s.rule}]: ${s.base} → ${s.now}`)
  }
  if (failures.length > 0) {
    console.error('check-ui-rules: DS 밖 값이 늘었습니다. 불가피하면 같은 줄에 `ui-allow: <사유>` 주석을 답니다.')
    for (const f of failures) {
      console.error(`  ${f.file} [${f.rule}]: 기준선 ${f.base} → 현재 ${f.now} (줄 ${f.lines.join(', ')})`)
      console.error(`    고치는 방법: ${f.fix}`)
    }
    return 1
  }
  console.log('check-ui-rules: 통과')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
