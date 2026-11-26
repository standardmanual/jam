#!/usr/bin/env node
// gen-token-catalog — 디자인 토큰이 어느 층에 어떤 이름·값으로 있고 몇 곳에서 쓰이는지 한 문서로 만든다
// (티켓 20261126_2116, UI 소스 정리 9-5회차, 상위 20261125_1923).
//
// 사용법
//   node scripts/gen-token-catalog.mjs            docs/service/prd/ui-components/tokens.md를 다시 쓴다
//   node scripts/gen-token-catalog.mjs --check    메모리에서 만든 결과와 파일이 다르면 차이 요약과 함께 종료 코드 1
//   node scripts/gen-token-catalog.mjs --stage    다시 쓰고 git add 한다 (pre-commit이 쓴다)
//   --root <dir> --doc <file>    시험용: 원천이 있는 저장소 루트, 출력 문서 경로
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments } from './strip-code-comments.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOC_REL = 'docs/service/prd/ui-components/tokens.md'
export const BEGIN = '<!-- BEGIN generated: gen-token-catalog -->'
export const END = '<!-- END generated: gen-token-catalog -->'

const TOKEN_DIR = 'jam-web/design-system/tokens'
const GLOBALS = 'jam-web/src/app/globals.css'
const SOURCES = [
  { layer: 'primitive', file: `${TOKEN_DIR}/primitive.css` },
  { layer: 'primitive', file: 'jam-web/src/app/jam-theme.css' },
  { layer: 'semantic', file: `${TOKEN_DIR}/semantic.css` },
  { layer: 'component', file: `${TOKEN_DIR}/component.css` },
  { layer: 'admin', file: 'jam-web/src/app/admin-theme.css' },
  { layer: 'admin', file: GLOBALS },
]
// 토큰 정의·클래스 대응이 있는 파일. 사용 수를 셀 때는 빠지고, 토큰 안 참조 수를 셀 때만 읽는다.
const TOKEN_FILES = [...new Set([...SOURCES.map((s) => s.file), `${TOKEN_DIR}/fonts.css`])]
const USAGE_DIRS = ['jam-web/src', 'jam-web/design-system']
const LAYERS = [
  ['primitive', '기본값 (primitive)'],
  ['semantic', '의미 (semantic)'],
  ['component', '컴포넌트 (component)'],
  ['admin', '어드민 (admin)'],
]

// ── CSS 읽기 ────────────────────────────────────────────────────────────────
const norm = (s) => s.replace(/\s+/g, ' ').trim()

/** CSS 텍스트에서 `--이름: 값` 선언을 모두 뽑는다. 각 선언은 감싼 선택자 목록(stack)을 함께 돌려준다. */
export function parseDeclarations(css) {
  const text = stripComments(css, 'css')
  const out = []
  const stack = []
  let buf = ''
  let paren = 0
  const flush = () => {
    const m = norm(buf).match(/^(--[\w-]+)\s*:\s*([\s\S]+)$/)
    if (m) out.push({ name: m[1], value: norm(m[2]), stack: [...stack] })
    buf = ''
  }
  for (const ch of text) {
    if (ch === '(') paren++
    else if (ch === ')') paren = Math.max(0, paren - 1)
    if (paren === 0 && ch === '{') {
      stack.push(norm(buf))
      buf = ''
    } else if (paren === 0 && ch === '}') {
      flush()
      stack.pop()
    } else if (paren === 0 && ch === ';') flush()
    else buf += ch
  }
  return out
}

const ROOT_SELECTOR = /^(:root|\[data-service-theme\]|:root, ?\[data-service-theme\]|@theme( inline)?( reference)?|\[data-admin-theme\])$/
const isRootContext = (stack) => stack.length > 0 && stack.every((s) => ROOT_SELECTOR.test(s))
const isThemeContext = (stack) => stack.length === 1 && /^@theme/.test(stack[0])

// ── 클래스 대응 ─────────────────────────────────────────────────────────────
const COLOR_UTILS = 'bg|text|border|border-[xytblrse]|ring|ring-offset|fill|stroke|from|to|via|divide|outline|decoration|shadow|accent|caret|placeholder'
const NAMESPACES = [
  ['color', (n) => `*-${n}`, COLOR_UTILS],
  ['text', (n) => `text-${n}`, 'text'],
  ['radius', (n) => `rounded-${n}`, 'rounded(?:-[xytblrse]{1,2})?'],
  ['font-weight', (n) => `font-${n}`, 'font'],
  ['font', (n) => `font-${n}`, 'font'],
  ['tracking', (n) => `tracking-${n}`, 'tracking'],
  ['leading', (n) => `leading-${n}`, 'leading'],
  ['animate', (n) => `animate-${n}`, 'animate'],
  ['aspect', (n) => `aspect-${n}`, 'aspect'],
  ['shadow', (n) => `shadow-${n}`, 'shadow'],
  ['drop-shadow', (n) => `drop-shadow-${n}`, 'drop-shadow'],
  ['ease', (n) => `ease-${n}`, 'ease'],
  ['blur', (n) => `blur-${n}`, '(?:backdrop-)?blur'],
  ['container', (n) => `max-w-${n}`, null],
  ['breakpoint', (n) => `${n}:`, null],
]
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 이름 뒤에 단계가 붙지 않는 Tailwind 이름 공간. 클래스 하나가 아니라 클래스 묶음이 읽는다.
const SPACING_UTILS =
  '(?:-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|inset|inset-x|inset-y|top|right|bottom|left|start|end|translate-x|translate-y|basis|indent|scroll-m|scroll-p))'
const BARE = {
  spacing: { display: 'p-4·gap-2 등 간격 클래스 전부', re: new RegExp(`(?<![\\w-])${SPACING_UTILS}-\\d+(?:\\.\\d+)?(?![\\w-])`, 'g') },
  shadow: { display: 'shadow', re: /(?<![\w-])shadow(?![\w-])/g },
  blur: { display: 'blur · backdrop-blur', re: /(?<![\w-])(?:backdrop-)?blur(?![\w-])/g },
  'drop-shadow': { display: 'drop-shadow', re: /(?<![\w-])drop-shadow(?![\w-])/g },
  radius: { display: 'rounded', re: /(?<![\w-])rounded(?![\w-])/g },
  'default-transition-duration': { display: 'transition · transition-*', re: /(?<![\w-])transition(?:-(?:all|colors|opacity|shadow|transform))?(?![\w-])/g },
  'default-transition-timing-function': { display: 'transition · transition-*', re: /(?<![\w-])transition(?:-(?:all|colors|opacity|shadow|transform))?(?![\w-])/g },
}
// Tailwind 기본 스타일(preflight)이 직접 읽는 토큰. 화면 코드에 클래스로 나타나지 않는다.
const ENGINE_READS = new Set(['--default-font-family', '--default-mono-font-family'])

/** `--color-muted` 같은 @theme 이름 → 클래스 표시와 센 정규식. 클래스가 아니면 null. */
export function classOf(themeName) {
  const n = themeName.replace(/^--/, '')
  if (BARE[n]) return { display: BARE[n].display, re: BARE[n].re }
  const lh = n.match(/^text-(.+)--line-height$/)
  if (lh) return { display: `text-${lh[1]}`, re: new RegExp(`(?<![\\w-])text-${esc(lh[1])}(?![\\w-])`, 'g') } // 글자 크기 쌍의 행간
  if (n.includes('--')) return null // 그 밖의 보조 값
  for (const [ns, show, utils] of NAMESPACES) {
    if (!n.startsWith(`${ns}-`)) continue
    const name = n.slice(ns.length + 1)
    if (!name) return null
    let re
    if (ns === 'breakpoint') re = new RegExp(`(?<![\\w-])${esc(name)}:`, 'g')
    else if (ns === 'container') {
      re = new RegExp(`(?<![\\w-])(?:max-w|min-w|w)-${esc(name)}(?![\\w-])|(?<![\\w-])@${esc(name)}(?![\\w-])`, 'g')
    } else re = new RegExp(`(?<![\\w-])(?:${utils})-${esc(name)}(?![\\w-])`, 'g')
    return { display: show(name), re }
  }
  return null
}

// ── 값 풀기 ─────────────────────────────────────────────────────────────────
/** `var()`를 maps 순서대로 찾아 끝까지 풀어 쓴다. 못 풀면 null. */
export function resolveValue(value, maps, seen = []) {
  let failed = false
  const out = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (all, name, fallback) => {
    if (seen.includes(name)) {
      failed = true
      return all
    }
    const hit = maps.map((m) => m.get(name)).find((v) => v !== undefined)
    if (hit === undefined) {
      if (fallback !== undefined) return fallback.trim()
      failed = true
      return all
    }
    const r = resolveValue(hit, maps, [...seen, name])
    if (r === null) {
      failed = true
      return all
    }
    return r
  })
  return failed ? null : norm(out)
}

// ── 원천 수집 ───────────────────────────────────────────────────────────────
function readText(root, rel) {
  const p = path.join(root, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

function walkUsageFiles(root) {
  const skip = new Set(TOKEN_FILES.map((f) => path.join(root, f)))
  const out = []
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue
        walk(p)
      } else if (/\.(ts|tsx|css)$/.test(e.name) && !/\.(test|spec|stories)\./.test(e.name) && !skip.has(p)) out.push(p)
    }
  }
  for (const d of USAGE_DIRS) walk(path.join(root, d))
  return out
}

/** 토큰 목록과 사용 수를 만든다. */
export function collect(root) {
  const tokens = []
  const byKey = new Map()
  const serviceMap = new Map()
  const adminMap = new Map()
  const classSources = new Map() // 토큰 이름 → [{display, re}]
  const refGraph = new Map() // 토큰 이름 → 값 안에서 var()로 가리키는 토큰 이름들
  const addClass = (tokenName, themeName) => {
    const c = classOf(themeName)
    if (!c) return
    const list = classSources.get(tokenName) ?? []
    if (!list.some((x) => x.display === c.display)) list.push(c)
    classSources.set(tokenName, list)
  }

  for (const src of SOURCES) {
    const css = readText(root, src.file)
    if (css === null) continue
    for (const d of parseDeclarations(css)) {
      if (d.stack.length === 0) continue
      if (src.file === GLOBALS) {
        if (d.stack[0].startsWith('@theme')) {
          // @theme inline 의 `--color-muted: var(--muted)` 는 클래스 대응이다. 토큰이 아니다.
          const m = d.value.match(/^var\(\s*(--[\w-]+)\s*\)$/)
          if (m) addClass(m[1], d.name)
          continue
        }
        if (!d.stack[0].startsWith('[data-admin-theme]')) continue
      }
      for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) {
        const set = refGraph.get(d.name) ?? new Set()
        set.add(m[1])
        refGraph.set(d.name, set)
      }
      const key = `${src.layer}:${d.name}`
      let t = byKey.get(key)
      if (!t) {
        t = { name: d.name, layer: src.layer, def: null, defFile: null, overrides: [], dups: [], pointers: [], coexist: [], defReference: false }
        byKey.set(key, t)
        tokens.push(t)
      }
      if (isRootContext(d.stack)) {
        if (t.def === null) {
          t.def = d.value
          t.defFile = src.file
          t.defReference = /reference/.test(d.stack[0])
          if (isThemeContext(d.stack)) addClass(d.name, d.name)
          const map = src.layer === 'admin' ? adminMap : serviceMap
          if (!map.has(d.name)) map.set(d.name, d.value)
        } else if (t.defFile !== src.file) {
          if (isThemeContext(d.stack)) addClass(d.name, d.name)
          // `@theme inline reference`가 같은 이름을 var()로 가리키기만 하면 값을 다시 적은 것이 아니라 «이름만 알린 것»이다(눈금 단일 원천).
          if (d.value === `var(${d.name})`) t.pointers.push(src.file)
          // 한쪽이 `@theme inline reference`면 변수가 아니라 클래스(`rounded` 등)에만 값을 채우는 정의다. 서로 다른 것을 맡으므로 «값 다름»이 아니다.
          else if (t.defReference || /reference/.test(d.stack[0])) t.coexist.push(src.file)
          else t.dups.push({ file: src.file, same: norm(t.def) === norm(d.value) })
        }
      } else {
        t.overrides.push(d.stack.join(' > '))
        if (t.def === null) {
          t.def = d.value
          t.defFile = src.file
        }
      }
    }
  }

  const usageFiles = walkUsageFiles(root).map((p) => ({ text: stripComments(readFileSync(p, 'utf8'), path.extname(p)) }))
  const globalsCss = readText(root, GLOBALS)
  if (globalsCss !== null) usageFiles.push({ text: plainRulesOf(globalsCss) })
  const tokenText = TOKEN_FILES.map((f) => readText(root, f))
    .filter((x) => x !== null)
    .map((x) => stripComments(x, 'css'))
    .join('\n')
  const count = (re, text) => (text.match(re) ?? []).length
  const rows = tokens
    .filter((t) => t.def !== null)
    .map((t) => {
      const varRe = new RegExp(`\\(${esc(t.name)}(?![\\w-])`, 'g')
      const classes = classSources.get(t.name) ?? []
      let varUses = 0
      let classUses = 0
      let strUses = 0
      let fileCount = 0
      const strRe = new RegExp(`(["'\`])${esc(t.name)}\\1`, 'g') // 이름을 문자열 데이터로 들고 var(${이름})으로 읽는 곳
      for (const f of usageFiles) {
        const v = count(varRe, f.text)
        const c = classes.reduce((sum, k) => sum + count(k.re, f.text), 0)
        const x = count(strRe, f.text)
        varUses += v
        classUses += c
        strUses += x
        if (v + c + x > 0) fileCount++
      }
      const maps = t.layer === 'admin' ? [adminMap, serviceMap] : [serviceMap]
      return {
        name: t.name,
        layer: t.layer,
        def: t.def,
        final: resolveValue(t.def, maps) ?? t.def,
        classes: classes.map((c) => c.display),
        varUses,
        classUses,
        strUses,
        fileCount,
        engine: ENGINE_READS.has(t.name),
        pointers: t.pointers,
        coexist: t.coexist,
        inToken: count(varRe, tokenText), // 자기 정의(`--이름:`)는 앞에 `(`가 없어 세지 않는다
        overrides: [...new Set(t.overrides)],
        dups: t.dups,
      }
    })
  // 직접 쓰는 곳이 없어도 쓰이는 토큰이 값 안에서 가리키면 «재료로 쓰임»이다(끝까지 따라간다).
  const direct = (r) => r.varUses + r.classUses + r.strUses > 0 || r.engine
  const live = new Set(rows.filter(direct).map((r) => r.name))
  const queue = [...live]
  while (queue.length) {
    for (const ref of refGraph.get(queue.pop()) ?? []) {
      if (!live.has(ref)) {
        live.add(ref)
        queue.push(ref)
      }
    }
  }
  for (const r of rows) r.material = !direct(r) && live.has(r.name)
  return rows
}

/** globals.css에서 `--이름: 값` 선언을 뺀 일반 규칙 선언(`background: var(--page-bg)` 등)만 남긴다. 토큰 정의가 아니라 쓰임이다. */
export function plainRulesOf(css) {
  const out = []
  for (const stmt of stripComments(css, 'css').split(/[;{}]/)) {
    const m = stmt.trim().match(/^([a-z][\w-]*)\s*:\s*([\s\S]*)$/)
    if (m && m[2].includes('var(')) out.push(`${m[1]}: ${m[2]}`)
  }
  return out.join('\n')
}

// ── 문서 쓰기 ───────────────────────────────────────────────────────────────
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const code = (s) => `\`${cell(s)}\``

function note(r) {
  const parts = []
  if (r.overrides.length) parts.push(`덮어쓰기 있음 (${r.overrides.join(', ')})`)
  for (const f of r.pointers) parts.push(`${path.basename(f)}는 이름만 알리고 값은 이 정의를 가리킴`)
  for (const f of r.coexist) parts.push(`reference 정의(클래스 값만)와 별개로 ${path.basename(f)}에 변수 정의가 있음`)
  if (r.engine) parts.push('Tailwind 기본 스타일이 읽음')
  if (r.material) parts.push('다른 토큰의 재료로 쓰임')
  for (const d of r.dups) parts.push(`${path.basename(d.file)}에도 정의됨 (${d.same ? '값 같음' : '값 다름'})`)
  return parts.join('; ')
}

// ── 대비 표 ─────────────────────────────────────────────────────────────────
// 함께 쓰이는 글자색×배경색 조합의 WCAG 2.x 대비. 판정은 참고용이며 verify를 막지 않는다(티켓 20261126_2225).
// kind 'text'는 4.5, 'ui'(선·아이콘·채움)는 3.0이 기준이다. 비고는 사용자가 값을 알고 받아들인 조합에 적는다.
const ACCEPTED_91 = '사용자가 대비를 알고 받아들인 값(티켓 20261126_1908, 9-1회차)'
export const CONTRAST_PAIRS = [
  ...['--background', '--card-bg', '--surface', '--background-secondary', '--btn-secondary', '--page-bg'].map((bg) => ({ fg: '--foreground', bg })),
  { fg: '--muted', bg: '--background', note: `${ACCEPTED_91} — 보조 글자 4.35` },
  { fg: '--muted', bg: '--card-bg' },
  { fg: '--muted', bg: '--background-secondary', note: `${ACCEPTED_91} — #e5e5e5 면 위 3.76` },
  { fg: '--muted', bg: '--btn-secondary', note: `${ACCEPTED_91} — #e5e5e5 면 위 3.76` },
  { fg: '--tabs-text-muted', bg: '--tabs-bar-bg', note: `${ACCEPTED_91} — #e5e5e5 면 위 3.76` },
  { fg: '--snow', bg: '--background-inverse' },
  { fg: '--muted-on-inverse', bg: '--background-inverse' },
  { fg: '--accent-foreground', bg: '--accent' },
  { fg: '--danger-text', bg: '--card-bg' },
  { fg: '--point-text', bg: '--card-bg', note: '값 보존 결정(상위 티켓 20261125_1923, 사용자 결정)' },
  ...['common', 'rare', 'epic', 'mystic'].map((n) => ({ fg: `--rarity-${n}-foreground`, bg: `--rarity-${n}` })),
  ...['red', 'yellow', 'green', 'purple', 'blue', 'pink', 'sky', 'chip-white'].map((n) => ({ fg: '--foreground', bg: `--jam-${n}` })),
  { fg: '--snow', bg: '--jam-green-deep', note: '짙은 초록 위 글자 예외(primitive.css 주석)' },
  { fg: '--field-border', bg: '--card-bg', kind: 'ui', note: `${ACCEPTED_91} — 입력 테두리 2.52` },
  { fg: '--capsule-fill', bg: '--capsule-track', kind: 'ui' },
]

const hex2 = (h) => parseInt(h, 16)
/** CSS 색 문자열 → {r,g,b,a}(0~255, a 0~1). hex·color-mix(in srgb)·transparent만 읽고 못 읽으면 null. */
export function parseColor(str) {
  const v = norm(str).toLowerCase()
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  let m = v.match(/^#([0-9a-f]{3,8})$/)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    return { r: hex2(h.slice(0, 2)), g: hex2(h.slice(2, 4)), b: hex2(h.slice(4, 6)), a: h.length === 8 ? hex2(h.slice(6, 8)) / 255 : 1 }
  }
  m = v.match(/^color-mix\(\s*in srgb\s*,([\s\S]*)\)$/)
  if (!m) return null
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of m[1]) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  if (parts.length !== 2) return null
  const read = (x) => {
    const mm = x.trim().match(/^([\s\S]*?)(?:\s+(\d+(?:\.\d+)?)%)?$/)
    return { c: parseColor(mm[1]), p: mm[2] === undefined ? null : Number(mm[2]) / 100 }
  }
  const x = read(parts[0])
  const y = read(parts[1])
  if (!x.c || !y.c) return null
  const px = x.p ?? (y.p === null ? 0.5 : 1 - y.p)
  const py = y.p ?? 1 - px
  const a = x.c.a * px + y.c.a * py
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
  const ch = (k) => (x.c[k] * x.c.a * px + y.c[k] * y.c.a * py) / a
  return { r: ch('r'), g: ch('g'), b: ch('b'), a }
}

const lin = (c) => {
  const x = c / 255
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
/** 글자색을 바탕 위에 얹은 뒤 WCAG 대비를 구한다. 바탕은 불투명이어야 한다. */
export function contrastRatio(fg, bg) {
  const over = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
  const [hi, lo] = [lum(over), lum(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

export function contrastRows(rows) {
  const finalOf = new Map()
  for (const r of rows) if (r.layer !== 'admin' && !finalOf.has(r.name)) finalOf.set(r.name, r.final)
  const out = []
  for (const p of CONTRAST_PAIRS) {
    const f = finalOf.has(p.fg) ? parseColor(finalOf.get(p.fg)) : null
    const b = finalOf.has(p.bg) ? parseColor(finalOf.get(p.bg)) : null
    if (!f || !b || b.a !== 1) {
      out.push({ ...p, kind: p.kind ?? 'text', ratio: null })
      continue
    }
    out.push({ ...p, kind: p.kind ?? 'text', ratio: contrastRatio(f, b) })
  }
  return out
}

function contrastSection(rows) {
  const lines = ['## 글자색 × 배경색 대비', '']
  lines.push('함께 쓰이는 조합의 WCAG 대비다(계산값, 반투명 글자는 바탕 위에 얹어 계산). 글자는 4.5, 선·채움은 3.0이 기준이다. 판정은 참고용이며 `verify`를 막지 않는다.')
  lines.push('색을 읽지 못한 조합은 «계산 못 함»으로 둔다.', '')
  lines.push('| 글자·선 | 배경 | 대비 | 기준 | 판정 | 비고 |', '|---|---|---|---|---|---|')
  for (const r of contrastRows(rows)) {
    const need = r.kind === 'ui' ? 3 : 4.5
    const verdict = r.ratio === null ? '계산 못 함' : r.ratio < 3 ? '3.0 미만' : r.ratio < need ? `${need} 미만` : '통과'
    lines.push(`| ${code(r.fg)} | ${code(r.bg)} | ${r.ratio === null ? '—' : r.ratio.toFixed(2)} | ${need} | ${verdict} | ${cell(r.note ?? '—')} |`)
  }
  lines.push('')
  return lines
}

export function renderDoc(rows) {
  const byLayer = Object.fromEntries(LAYERS.map(([k]) => [k, rows.filter((r) => r.layer === k)]))
  const zero = rows.filter((r) => r.varUses + r.classUses + r.strUses === 0 && !r.engine && !r.material)
  const mismatches = rows.filter((r) => r.dups.some((d) => !d.same))
  const lines = [BEGIN]
  lines.push(`토큰 ${rows.length}개 · ${LAYERS.map(([k, label]) => `${label} ${byLayer[k].length}개`).join(' · ')} · 쓰는 곳 0인 토큰 ${zero.length}개`)
  lines.push('')
  lines.push('**층 규칙**: 색·px·ms 같은 직접 값은 기본값 층에만 둔다. 의미 층과 컴포넌트 층은 기본값을 참조한다.')
  lines.push('화면 코드는 의미·컴포넌트 토큰과 서비스 눈금 클래스만 쓴다. 기본값을 직접 쓸 수 있는 곳은 토큰 파일·정본 폴더 등 일부뿐이다.')
  lines.push('전문은 티켓 `20261126_1908`(9-1회차 «층 규칙»)과 `jam-web/design-system/tokens/primitive.css` 머리 주석에 있다.')
  lines.push('')
  if (mismatches.length) {
    lines.push('**주의** — 같은 층의 두 파일에 같은 이름이 있고 값이 다르다.')
    for (const r of mismatches) lines.push(`- ${code(r.name)}: ${code(r.def)} ↔ ${r.dups.filter((d) => !d.same).map((d) => path.basename(d.file)).join(', ')}`)
    lines.push('')
  }
  lines.push('**열 설명** — 정의 값은 파일에 적힌 그대로, 최종 값은 `:root` 기준으로 `var()`를 끝까지 따라간 값이다(같으면 〃, 못 풀면 정의 값).')
  lines.push('`var()` 수·클래스 사용·문자열은 `jam-web/src`와 `jam-web/design-system`의 `.ts`·`.tsx`·`.css`에서 센 값이다(주석·시험·스토리·토큰 파일 자신 제외). 토큰 파일 중 `globals.css`는 일반 규칙의 `var()`만 센다.')
  lines.push('클래스 사용에는 Tailwind 유틸리티 경유(`font-*`→굵기, `tracking-*`, `leading-*`, `animate-*`, `aspect-*`, 모든 간격 클래스→`--spacing`, `text-*`→행간 쌍, 어드민 단독 `rounded`·`shadow`·`blur`)가 들어간다. 문자열은 `"--이름"` 꼴로 데이터에 적어 두고 `var(${이름})`으로 읽는 곳이다.')
  lines.push('쓰이는 토큰이 값 안에서 가리키는 재료(끝까지 따라감)와 Tailwind 기본 스타일이 읽는 토큰은 «쓰는 곳 0»에서 뺀다.')
  lines.push('토큰 안 참조는 토큰 파일(globals.css의 `@theme inline` 포함) 안에서 다른 토큰이 가리키는 수다. 서비스와 어드민이 같은 이름을 쓰면 사용 수는 양쪽 줄에 같은 값으로 나온다.')
  lines.push('')
  for (const [k, label] of LAYERS) {
    lines.push(`## ${label}`, '')
    lines.push('| 이름 | 정의 값 | 최종 값 | 클래스 | var() | 클래스 사용 | 문자열 | 쓰는 파일 | 토큰 안 참조 | 비고 |')
    lines.push('|---|---|---|---|---|---|---|---|---|---|')
    for (const r of byLayer[k]) {
      const cls = r.classes.length ? r.classes.map((c) => code(c)).join(' ') : '—'
      lines.push(
        `| ${code(r.name)} | ${code(r.def)} | ${r.final === r.def ? '〃' : code(r.final)} | ${cls} | ${r.varUses} | ${r.classUses} | ${r.strUses} | ${r.fileCount} | ${r.inToken} | ${cell(note(r)) || '—'} |`,
      )
    }
    lines.push('')
  }
  lines.push(...contrastSection(rows))
  lines.push('## 쓰는 곳 0인 토큰', '')
  lines.push('`var()` 수·클래스 사용·문자열이 모두 0이고, 쓰이는 토큰의 재료도 아닌 토큰이다. 눈금의 빈 칸(회색·간격·모서리·컨테이너 단계 등)이 남기는 대상이다.', '')
  if (zero.length === 0) lines.push('없음')
  else {
    lines.push('| 이름 | 층 | 토큰 안 참조 |', '|---|---|---|')
    for (const r of zero) lines.push(`| ${code(r.name)} | ${LAYERS.find(([k]) => k === r.layer)[1]} | ${r.inToken} |`)
  }
  lines.push(END)
  return lines.join('\n')
}

const FRONT = `---
type: prd
status: active
description: "디자인 토큰의 층·이름·값·클래스·사용 수 카탈로그다. 생성기가 만들며 손으로 고치지 않는다."
related:
  - "20261126_2116"
code:
  - "jam-web/design-system/tokens"
  - "jam-web/src/app/jam-theme.css"
  - "jam-web/src/app/admin-theme.css"
  - "jam-web/src/app/globals.css"
---

# 디자인 토큰 카탈로그

이 문서는 \`node scripts/gen-token-catalog.mjs\`가 만든다. 손으로 고치지 않는다. 토큰이나 이를 쓰는 코드가 바뀌었는데 문서가 낡았으면 \`verify\`의 \`token-catalog\` 단계가 실패하고, pre-commit이 스테이지된 변경에 맞춰 다시 만들어 스테이지한다.
정본 컴포넌트 목록은 [README](README.md)에 있다.

`

export function buildDoc(root) {
  return `${FRONT}${renderDoc(collect(root))}\n`
}

function parseArgs(argv) {
  const o = { check: false, stage: false, root: REPO_ROOT, doc: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') o.check = true
    else if (argv[i] === '--stage') o.stage = true
    else if (argv[i] === '--root') o.root = path.resolve(argv[++i])
    else if (argv[i] === '--doc') o.doc = path.resolve(argv[++i])
  }
  o.doc ??= path.join(o.root, DOC_REL)
  return o
}

/** 기대 문서(a)와 파일(b)이 다른 줄을 최대 5개 보여 준다. */
export function diffSummary(a, b) {
  const x = a.split('\n')
  const y = b.split('\n')
  const out = []
  for (let i = 0; i < Math.max(x.length, y.length) && out.length < 5; i++) {
    if (x[i] !== y[i]) out.push(`  ${i + 1}줄: 파일 «${(y[i] ?? '(없음)').slice(0, 80)}» ↔ 기대 «${(x[i] ?? '(없음)').slice(0, 80)}»`)
  }
  return out
}

export function main(argv = process.argv.slice(2)) {
  const o = parseArgs(argv)
  const next = buildDoc(o.root)
  const cur = existsSync(o.doc) ? readFileSync(o.doc, 'utf8') : ''
  if (o.check) {
    if (next === cur) {
      console.log('token-catalog 통과')
      return 0
    }
    console.error('token-catalog: 토큰 카탈로그가 낡았습니다. `node scripts/gen-token-catalog.mjs`를 실행해 다시 쓰세요.')
    for (const l of diffSummary(next, cur)) console.error(l)
    return 1
  }
  if (next !== cur) {
    mkdirSync(path.dirname(o.doc), { recursive: true })
    writeFileSync(o.doc, next)
  }
  console.log(`token-catalog: ${path.relative(o.root, o.doc)}를 ${next === cur ? '그대로 두었습니다' : '다시 썼습니다'}.`)
  if (o.stage) {
    try {
      execFileSync('git', ['add', '--', o.doc], { cwd: o.root, stdio: 'inherit' })
    } catch {
      console.error('token-catalog: git add에 실패했습니다.')
      return 1
    }
  }
  return 0
}

const canon = (p) => {
  try {
    return realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}
if (process.argv[1] && canon(process.argv[1]) === canon(fileURLToPath(import.meta.url))) {
  process.exit(main())
}
