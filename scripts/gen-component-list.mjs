#!/usr/bin/env node
// gen-component-list — 정본 컴포넌트(jam-web/src/components/ui/*.tsx) 목록 문서의 생성 구간을 만들고,
// «정본 컴포넌트마다 스토리 파일이 있는가»를 검사한다 (티켓 20261126_0947, UI 소스 정리 6-1a회차).
//
// 사용법
//   node scripts/gen-component-list.mjs            생성 구간(<!-- BEGIN generated: component-list --> ~ END)을 다시 쓴다
//   node scripts/gen-component-list.mjs --check    ① 생성 구간이 최신인지 ② 스토리 없는 정본 파일이 없는지 확인한다 (0 = 통과, 1 = 어긋남)
//   --root <dir> --doc <file>    시험용 경로
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_ROOT = path.join(REPO_ROOT, 'jam-web/src/components/ui')
const DEFAULT_DOC = path.join(REPO_ROOT, 'docs/service/prd/ui-components/README.md')
export const BEGIN = '<!-- BEGIN generated: component-list -->'
export const END = '<!-- END generated: component-list -->'
const MANY = 6

/** 정본 컴포넌트 파일 이름 목록(스토리·시험·하위 폴더 제외). */
export function listComponentFiles(root = DEFAULT_ROOT) {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.tsx') && !/\.(stories|test)\.tsx$/.test(e.name))
    .map((e) => e.name)
    .sort()
}

function cleanJsdoc(block) {
  return block
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\* ?/, '').trimEnd())
}

/** 소스 한 파일에서 export된 컴포넌트 이름과 설명 한 줄을 뽑는다. */
export function parseComponentSource(src) {
  const exports = [
    ...[...src.matchAll(/^export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z]\w*)/gm)].map((m) => m[1]),
    // `const Button = forwardRef(…)` 뒤에 따로 쓴 `export default Button`
    ...[...src.matchAll(/^export\s+default\s+([A-Z]\w*)\s*;?\s*$/gm)].map((m) => m[1]),
  ].filter((n) => !/^[A-Z][A-Z0-9_]*$/.test(n)) // PEBBLE_SIZE 같은 대문자 상수는 컴포넌트가 아니다
  // 0열에서 시작하는 JSDoc만 센다(들여쓴 props 설명은 컴포넌트 설명이 아니다).
  const blocks = [...src.matchAll(/^\/\*\*[\s\S]*?\*\//gm)].map((m) => ({ end: m.index + m[0].length, lines: cleanJsdoc(m[0]) }))
  let summary = ''
  for (const b of blocks) {
    const line = b.lines.find((l) => /^@summary\s+/.test(l))
    if (line) {
      summary = line.replace(/^@summary\s+/, '').trim()
      break
    }
  }
  if (!summary && blocks.length) {
    // 주된 export 바로 위 JSDoc, 없으면 파일의 첫 JSDoc
    const firstExport = src.search(/^export\s+(?:default\s+)?(?:function|const|class)\s+[A-Z]/m)
    const above = firstExport >= 0 ? blocks.find((b) => /^\s*$/.test(src.slice(b.end, firstExport))) : undefined
    const lines = (above ?? blocks[0]).lines
    const first = lines.find((l) => l.trim() && !l.startsWith('@')) ?? ''
    summary = first.split(/(?<=[.。])\s/)[0].trim()
  }
  return { exports: [...new Set(exports)], summary: summary || '—' }
}

/** 스토리 파일에서 meta title과 스토리 개수를 뽑는다. */
export function parseStorySource(src) {
  const starts = ['const meta', 'export default'].map((k) => src.indexOf(k)).filter((i) => i >= 0)
  const from = starts.length ? Math.min(...starts) : 0
  const m = src.slice(from).match(/\btitle:\s*['"]([^'"]+)['"]/)
  const count = (src.match(/^export const [A-Z]/gm) ?? []).length
  return { title: m ? m[1] : '—', count }
}

/** 정본 컴포넌트 항목 목록을 만든다. */
export function collectEntries(root = DEFAULT_ROOT) {
  return listComponentFiles(root).map((file) => {
    const base = file.replace(/\.tsx$/, '')
    const comp = parseComponentSource(readFileSync(path.join(root, file), 'utf8'))
    const storyFile = path.join(root, `${base}.stories.tsx`)
    const story = existsSync(storyFile) ? parseStorySource(readFileSync(storyFile, 'utf8')) : null
    return { file, ...comp, story }
  })
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** 항목 목록 → 생성 구간 문자열(마커 포함). */
export function renderBlock(entries) {
  const rows = entries.map((e) => {
    const names =
      e.exports.length === 0
        ? '—'
        : e.exports.length >= MANY
          ? `${e.exports.length}개 (${e.exports.slice(0, 3).join(', ')} 외)`
          : e.exports.join(', ')
    const story = e.story ? `${e.story.title} (${e.story.count}개)` : '없음'
    const summary = e.summary.length > 90 ? `${e.summary.slice(0, 89)}…` : e.summary
    return `| \`${e.file}\` | ${cell(names)} | ${cell(summary)} | ${cell(story)} |`
  })
  return [
    BEGIN,
    `정본 컴포넌트 파일 ${entries.length}개 · 스토리 있음 ${entries.filter((e) => e.story).length}개 · 없음 ${entries.filter((e) => !e.story).length}개`,
    '',
    '| 파일 | export | 설명 | 스토리 (제목·개수) |',
    '|---|---|---|---|',
    ...rows,
    END,
  ].join('\n')
}

/** 스토리 파일이 없는 정본 컴포넌트 파일 이름 목록. */
export function judgeStories(entries) {
  return entries.filter((e) => !e.story).map((e) => e.file)
}

/** 문서 본문의 생성 구간을 바꾼다. 마커가 없으면 null. */
export function replaceBlock(doc, block) {
  const a = doc.indexOf(BEGIN)
  const b = doc.indexOf(END)
  if (a < 0 || b < a) return null
  return doc.slice(0, a) + block + doc.slice(b + END.length)
}

function parseArgs(argv) {
  const o = { check: false, root: DEFAULT_ROOT, doc: DEFAULT_DOC }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') o.check = true
    else if (['--root', '--doc'].includes(argv[i])) o[argv[i].slice(2)] = path.resolve(argv[++i])
  }
  return o
}

export function main(argv = process.argv.slice(2)) {
  const o = parseArgs(argv)
  const entries = collectEntries(o.root)
  const block = renderBlock(entries)
  if (!existsSync(o.doc)) {
    console.error(`목록 문서가 없습니다: ${o.doc}`)
    return 1
  }
  const doc = readFileSync(o.doc, 'utf8')
  const next = replaceBlock(doc, block)
  if (next === null) {
    console.error(`${o.doc}에 생성 구간 마커(${BEGIN} ~ ${END})가 없습니다.`)
    return 1
  }
  if (!o.check) {
    if (next !== doc) writeFileSync(o.doc, next)
    console.log(`component-list: 정본 컴포넌트 ${entries.length}개로 생성 구간을 썼습니다.`)
    return 0
  }
  let bad = false
  if (next !== doc) {
    console.error('component-list: 목록 문서의 생성 구간이 낡았습니다. `node scripts/gen-component-list.mjs`를 실행해 다시 쓰세요.')
    bad = true
  }
  const missing = judgeStories(entries)
  if (missing.length) {
    console.error(`component-list: 스토리 파일이 없는 정본 컴포넌트가 있습니다: ${missing.join(', ')}`)
    console.error('  같은 이름의 <이름>.stories.tsx를 만드세요.')
    bad = true
  }
  if (!bad) console.log('component-list 통과')
  return bad ? 1 : 0
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
