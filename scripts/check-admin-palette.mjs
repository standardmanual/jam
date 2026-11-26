#!/usr/bin/env node
// check-admin-palette — 기본 팔레트 모양의 클래스(`bg-lime-500`, `text-gray-700/80`, `shadow-xl` 등)가 admin-theme.css에 정의돼 있는지 확인한다
// (티켓 20261126_2115, UI 소스 정리 9-4회차, 상위 20261125_1923).
//
// Tailwind 기본 테마를 닫았으므로(jam-theme.css) admin-theme.css에 없는 팔레트·그림자 클래스는 규칙이 만들어지지 않고 조용히 무시된다.
// 어드민에서 새 팔레트 색을 쓰려면 admin-theme.css에 먼저 추가한다. 주석 안의 글자는 세지 않는다.
//
// 사용법: node scripts/check-admin-palette.mjs            jam-web/src/**의 .ts·.tsx 전체 검사
//         --root <dir>                                     시험용(그 아래 jam-web/src, admin-theme.css를 본다)
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments } from './strip-code-comments.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ADMIN_THEME = 'jam-web/src/app/admin-theme.css'

export const COLOR_NAMES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue',
  'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'slate', 'gray', 'zinc', 'neutral', 'stone',
]
const STEPS = '(?:50|100|200|300|400|500|600|700|800|900|950)'
const SHADOW_SIZES = '(?:2xs|xs|sm|md|lg|xl|2xl)'
const COLOR_PREFIX = '(?:bg|text|border(?:-[xytblrse])?|fill|stroke|from|via|to|ring-offset|ring|outline|decoration|accent|caret|divide|placeholder)'
const CLASS_RE = new RegExp(
  `(?<![\\w-])(?:${COLOR_PREFIX}-((?:${COLOR_NAMES.join('|')})-${STEPS})|shadow-(${SHADOW_SIZES}))(?![\\w-])`,
  'g',
)

/** admin-theme.css에 정의된 색(`red-500`)·그림자(`sm`) 이름 */
export function loadDefined(cssText) {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '')
  const colors = new Set()
  const shadows = new Set()
  for (const m of css.matchAll(/--(color|shadow)-([\w-]+)\s*:/g)) (m[1] === 'color' ? colors : shadows).add(m[2])
  return { colors, shadows }
}

/** 소스 한 파일에서 정의 없는 팔레트·그림자 클래스를 찾는다: [{ cls, line }] */
export function findMissing(rawText, ext, defined) {
  const text = stripComments(rawText, ext)
  const hits = []
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(CLASS_RE)) {
      const isShadow = m[2] !== undefined
      if (isShadow ? !defined.shadows.has(m[2]) : !defined.colors.has(m[1])) hits.push({ cls: m[0], line: i + 1 })
    }
  })
  return hits
}

function walk(dir, out) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
}

function main() {
  const args = process.argv.slice(2)
  const ri = args.indexOf('--root')
  const root = path.resolve(ri >= 0 && args[ri + 1] ? args[ri + 1] : path.join(SCRIPT_DIR, '..'))
  const themeFile = path.join(root, ADMIN_THEME)
  const defined = loadDefined(existsSync(themeFile) ? readFileSync(themeFile, 'utf8') : '')
  const files = []
  walk(path.join(root, 'jam-web/src'), files)
  let bad = 0
  for (const f of files.sort()) {
    const hits = findMissing(readFileSync(f, 'utf8'), path.extname(f), defined)
    if (hits.length === 0) continue
    bad += hits.length
    console.error(`  ${path.relative(root, f).normalize('NFC')}: ${hits.map((h) => `${h.cls}(줄 ${h.line})`).join(', ')}`)
  }
  if (bad > 0) {
    console.error(`check-admin-palette: admin-theme.css에 정의가 없는 팔레트·그림자 클래스 ${bad}건. Tailwind 기본 테마가 닫혀 있어 이 클래스는 조용히 무시됩니다. 쓰려면 admin-theme.css에 색을 먼저 추가하세요.`)
    return 1
  }
  console.log(`check-admin-palette: 통과 (${files.length}개 파일)`)
  return 0
}

const canon = (p) => { try { return realpathSync(p).normalize('NFC') } catch { return path.resolve(p).normalize('NFC') } }
if (process.argv[1] && canon(process.argv[1]) === canon(fileURLToPath(import.meta.url))) {
  process.exit(main())
}
