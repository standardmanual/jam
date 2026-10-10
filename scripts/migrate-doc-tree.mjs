#!/usr/bin/env node
// migrate-doc-tree — docs/와 jam-doc/ 두 루트를 docs/ 하나로 합친다 (티켓 20261010_1214, 일회용).
//
// 하는 일
//   1) 이동표(MOVES)대로 git mv 한다.
//   2) 저장소 안 텍스트 파일의 경로 참조를 새 경로로 고친다.
//      - 마크다운 상대 링크: 옛 위치에서 대상을 풀어 새 대상으로 바꾼 뒤, 새 위치 기준 상대 경로로 다시 계산한다.
//      - 작업 폴더 기준 경로(백틱 경로, frontmatter, 스크립트 문자열): 이동표의 긴 접두어부터 치환한다.
//   3) 고친 파일 수와 남은 옛 경로 수를 출력한다.
//
// 사용법
//   node scripts/migrate-doc-tree.mjs --dry-run   옮길 목록과 고칠 파일 수만 출력한다
//   node scripts/migrate-doc-tree.mjs             실제로 옮기고 고친다
//
// 이전이 끝난 뒤에도 기록으로 남긴다. 다시 돌릴 일은 없다(옮길 원본이 없으면 아무것도 하지 않는다).

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'

// 왼쪽이 지금 경로, 오른쪽이 새 경로. 폴더는 접두어로, 파일은 정확히 일치로 옮긴다.
export const FILE_MOVES = [
  ['docs/specs/SERVICE_OPERATIONS.md', 'docs/service/SERVICE_OPERATIONS.md'],
  ['docs/specs/UX_WRITING_GUIDELINE.md', 'docs/service/writing/UX_WRITING_GUIDELINE.md'],
  ['docs/specs/SLOP_DICTIONARY.md', 'docs/service/writing/SLOP_DICTIONARY.md'],
  ['docs/specs/SERVER_ERROR_MESSAGE_RULE.md', 'docs/service/writing/SERVER_ERROR_MESSAGE_RULE.md'],
  ['docs/specs/PRIVACY_POLICY.md', 'docs/service/legal/PRIVACY_POLICY.md'],
  ['docs/specs/LOCATION_TERMS.md', 'docs/service/legal/LOCATION_TERMS.md'],
  ['docs/specs/DOCUMENT_SCHEMA.md', 'docs/DOCUMENT_SCHEMA.md'],
  ['docs/specs/INDEX.md', 'docs/INDEX.md'],
  ['docs/specs/DEV_PROCESS_GUARDRAILS.md', 'docs/agents/DEV_PROCESS_GUARDRAILS.md'],
  ['jam-doc/README.md', 'docs/README.md'],
]

export const DIR_MOVES = [
  ['docs/specs/badge-engine', 'docs/service/badge-engine'],
  ['docs/specs/prd', 'docs/service/prd'],
  ['jam-doc/planning/content', 'docs/service/content'],
  ['jam-doc/planning/business-plan', 'docs/plan/vision'],
  ['jam-doc/planning/jam2-redesign', 'docs/plan/jam2'],
  ['jam-doc/marketing', 'docs/marketing'],
  ['jam-doc/operations/reports', 'docs/operations/reports'],
  ['jam-doc/inbox/trends', 'docs/operations/inbox/trends'],
  ['jam-doc/assets', 'docs/assets'],
  ['jam-doc/archive', 'docs/archive'],
]

// 파일을 옮기지는 않지만 문장 속 경로를 고칠 때만 쓰는 상위 폴더 이름.
export const TEXT_ONLY = [
  ['jam-doc/operations', 'docs/operations'],
  ['jam-doc/inbox', 'docs/operations/inbox'],
]

const ALL_ENTRIES = [...FILE_MOVES, ...DIR_MOVES, ...TEXT_ONLY]

// 내용을 고치지 않는 경로(동결 문서·도구 폴더·이 스크립트·이 티켓)
const NO_REWRITE_PREFIXES = [
  'jam-doc/archive/',
  'docs/archive/',
  'docs/agents/workflow/',
  '.claude/worktrees/',
  '.git/',
  'scripts/migrate-doc-tree.mjs',
  'scripts/migrate-doc-tree.test.mjs',
  'docs/tickets/p1-high/20261010_1214_',
]
const NO_REWRITE_SEGMENTS = ['node_modules', '.next']

const nfc = (s) => s.normalize('NFC')

export function isNoRewrite(file) {
  const p = nfc(file)
  if (NO_REWRITE_PREFIXES.some((x) => p.startsWith(x))) return true
  return p.split('/').some((seg) => NO_REWRITE_SEGMENTS.includes(seg))
}

// 작업 폴더 기준 경로 하나의 새 경로. 이동표에 없으면 그대로 돌려준다.
export function mapPath(p, entries = ALL_ENTRIES) {
  const norm = nfc(p)
  let best = null
  for (const [from, to] of entries) {
    if (norm === from || norm.startsWith(`${from}/`)) {
      if (!best || from.length > best[0].length) best = [from, to]
    }
  }
  if (!best) return p
  return best[1] + norm.slice(best[0].length)
}

// 접두어 치환용 정규식. 긴 접두어부터 맞추고, 앞뒤가 경로 문자면 맞추지 않는다.
function buildPrefixRegex(entries) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const alts = [...entries].map(([from]) => from).sort((a, b) => b.length - a.length).map(esc)
  return new RegExp(`(?<![A-Za-z0-9_\\-/])(${alts.join('|')})(?![A-Za-z0-9_\\-])`, 'g')
}
const PREFIX_RE = buildPrefixRegex(ALL_ENTRIES)

export function rewritePrefixes(text) {
  return text.replace(PREFIX_RE, (m) => mapPath(m))
}

const LINK_RE = /(!?\[[^\]]*\]\(\s*)(<[^>]*>|[^)\s]*)((?:\s+(?:"[^"]*"|'[^']*'))?\s*\))/g
const REF_DEF_RE = /^(\s{0,3}\[[^\]]+\]:\s*)(<[^>]*>|\S+)/

// 링크 대상 하나를 고친다. oldFile/newFile은 링크가 적힌 문서의 옛·새 경로(작업 폴더 기준).
// 바꿀 것이 없으면 원문 그대로 돌려준다.
export function rewriteLinkTarget(raw, oldFile, newFile) {
  let t = raw
  let angle = false
  if (t.startsWith('<') && t.endsWith('>')) {
    angle = true
    t = t.slice(1, -1)
  }
  if (!t || t.startsWith('#') || t.startsWith('/') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t) || t.startsWith('//')) return raw
  const cut = t.search(/[#?]/)
  let pathPart = cut === -1 ? t : t.slice(0, cut)
  const tail = cut === -1 ? '' : t.slice(cut)
  if (!pathPart) return raw
  const encoded = /%[0-9A-Fa-f]{2}/.test(pathPart)
  let decoded = pathPart
  if (encoded) {
    try {
      decoded = decodeURIComponent(pathPart)
    } catch {
      decoded = pathPart
    }
  }
  const oldDir = posix.dirname(oldFile)
  const newDir = posix.dirname(newFile)
  const trailingSlash = decoded.endsWith('/')
  const resolved = posix.normalize(posix.join(oldDir, decoded)).replace(/\/+$/, '')
  if (resolved === '..' || resolved.startsWith('../')) return raw
  const newResolved = mapPath(resolved)
  if (newResolved === resolved && oldDir === newDir) return raw
  let rel = posix.relative(newDir, newResolved) || '.'
  if (trailingSlash && !rel.endsWith('/')) rel += '/'
  if (decoded.startsWith('./') && !rel.startsWith('.')) rel = `./${rel}`
  if (encoded) rel = /[^\x00-\x7f]/.test(pathPart) ? rel.replace(/ /g, '%20') : encodeURI(rel)
  const out = rel + tail
  return angle ? `<${out}>` : out
}

// 코드 스팬 안은 같은 길이의 공백으로 가려, 링크를 찾을 때 끼어들지 않게 한다 (doc-check.splitCodeSpans와 같은 목적).
function blankCodeSpans(line) {
  let out = ''
  let i = 0
  while (i < line.length) {
    if (line[i] !== '`') {
      out += line[i++]
      continue
    }
    let run = 0
    while (line[i + run] === '`') run++
    let j = i + run
    let close = -1
    while (j < line.length) {
      if (line[j] === '`') {
        let r = 0
        while (line[j + r] === '`') r++
        if (r === run) {
          close = j
          break
        }
        j += r
      } else j++
    }
    if (close === -1) {
      out += line.slice(i, i + run)
      i += run
      continue
    }
    out += ' '.repeat(close + run - i)
    i = close + run
  }
  return out
}

// 문서 한 개의 본문을 고친다. oldFile/newFile은 작업 폴더 기준 경로.
export function rewriteContent(text, oldFile, newFile) {
  const isMd = oldFile.endsWith('.md')
  let out = text
  if (isMd) {
    const lines = text.split('\n')
    let fence = null
    for (let n = 0; n < lines.length; n++) {
      const line = lines[n]
      const fm = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
      if (fence) {
        if (fm && fm[1][0] === fence.ch && fm[1].length >= fence.len && fm[2].trim() === '') fence = null
        continue
      }
      if (fm && !(fm[1][0] === '`' && fm[2].includes('`'))) {
        fence = { ch: fm[1][0], len: fm[1].length }
        continue
      }
      const stripped = blankCodeSpans(line)
      const edits = []
      LINK_RE.lastIndex = 0
      let m
      while ((m = LINK_RE.exec(stripped)) !== null) {
        const start = m.index + m[1].length
        edits.push([start, start + m[2].length])
      }
      const def = REF_DEF_RE.exec(stripped)
      if (def) {
        const start = def[1].length
        edits.push([start, start + def[2].length])
      }
      if (edits.length === 0) continue
      let rebuilt = line
      for (const [s, e] of edits.sort((a, b) => b[0] - a[0])) {
        const next = rewriteLinkTarget(line.slice(s, e), oldFile, newFile)
        rebuilt = rebuilt.slice(0, s) + next + rebuilt.slice(e)
      }
      lines[n] = rebuilt
    }
    out = lines.join('\n')
  }
  return rewritePrefixes(out)
}

// ───────────────────────── 실행부 ─────────────────────────

function gitFiles(cwd) {
  return execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  })
    .split('\0')
    .filter(Boolean)
}

function looksBinary(buf) {
  return buf.subarray(0, 8000).includes(0)
}

export function plan(files) {
  const moves = []
  for (const f of files) {
    const to = mapPath(f, [...FILE_MOVES, ...DIR_MOVES])
    if (to !== f) moves.push([f, to])
  }
  return moves
}

function main() {
  const dry = process.argv.includes('--dry-run')
  const cwd = process.cwd()
  const files = gitFiles(cwd)
  const moves = plan(files)
  const moveMap = new Map(moves)

  let edited = 0
  const editedList = []
  for (const f of files) {
    if (isNoRewrite(f)) continue
    const abs = `${cwd}/${f}`
    if (!existsSync(abs)) continue
    const buf = readFileSync(abs)
    if (buf.length > 8 * 1024 * 1024 || looksBinary(buf)) continue
    const text = buf.toString('utf8')
    const next = rewriteContent(text, f, moveMap.get(f) ?? f)
    if (next !== text) {
      edited++
      editedList.push(f)
      if (!dry) writeFileSync(abs, next)
    }
  }

  console.log(`옮길 파일 ${moves.length}개, 내용을 고칠 파일 ${edited}개${dry ? ' (드라이런: 아무것도 바꾸지 않음)' : ''}`)
  const byRule = new Map()
  for (const [from] of moves) {
    const rule = [...FILE_MOVES, ...DIR_MOVES].find(([r]) => from === r || from.startsWith(`${r}/`))[0]
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1)
  }
  for (const [rule, n] of byRule) console.log(`  ${rule} → ${mapPath(rule)} (${n}개)`)
  if (dry) return

  const entries = [...FILE_MOVES, ...DIR_MOVES]
  for (const [from, to] of entries) {
    if (!existsSync(`${cwd}/${from}`)) continue
    mkdirSync(posix.dirname(`${cwd}/${to}`), { recursive: true })
    execFileSync('git', ['mv', from, to], { cwd, stdio: 'inherit' })
  }
  // 비어 버린 옛 폴더를 지운다.
  for (const dir of ['docs/specs', 'jam-doc/planning', 'jam-doc/operations', 'jam-doc/inbox', 'jam-doc']) {
    pruneEmpty(`${cwd}/${dir}`)
  }

  const after = gitFiles(cwd)
  let leftover = 0
  const leftoverFiles = []
  for (const f of after) {
    if (isNoRewrite(f)) continue
    const abs = `${cwd}/${f}`
    if (!existsSync(abs)) continue
    const buf = readFileSync(abs)
    if (buf.length > 8 * 1024 * 1024 || looksBinary(buf)) continue
    const n = (buf.toString('utf8').match(/jam-doc|docs\/specs/g) ?? []).length
    if (n > 0) {
      leftover += n
      leftoverFiles.push(`${f} (${n})`)
    }
  }
  console.log(`남은 옛 경로 ${leftover}건 (${leftoverFiles.length}개 파일)`)
  for (const l of leftoverFiles.slice(0, 80)) console.log(`  ${l}`)
}

function pruneEmpty(dir) {
  if (!existsSync(dir)) return
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) pruneEmpty(`${dir}/${e.name}`)
  }
  const left = readdirSync(dir).filter((n) => n !== '.DS_Store')
  if (left.length === 0) rmSync(dir, { recursive: true, force: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
