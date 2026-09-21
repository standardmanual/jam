#!/usr/bin/env node
// gen-doc-index — docs/specs/INDEX.md를 문서 frontmatter의 description에서 생성한다
// (티켓 20260921_1400).
//
// 배경: 어떤 문서가 있는지 한눈에 보는 목록이 없어 새 세션의 읽기 순서를 손으로 나열했고,
// 손으로 쓴 목록은 낡는다. 목록은 문서 자신의 description을 모은 것이므로 사본을 손으로
// 쓰지 않고 생성한다. 시각·난수를 넣지 않아 같은 저장소 상태에서는 항상 같은 결과가 나온다.
//
// 대상: docs/specs/, jam-doc/planning/, jam-doc/marketing/ 의 .md (티켓·archive·assets·reports 제외)
//
// 사용법:
//   node scripts/gen-doc-index.mjs          INDEX.md를 갱신한다
//   node scripts/gen-doc-index.mjs --check  최신인지만 판정한다 (다르면 종료 코드 1)

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path, { posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from './doc-check.mjs'

export const INDEX_PATH = 'docs/specs/INDEX.md'
export const ROOTS = ['docs/specs/', 'jam-doc/planning/', 'jam-doc/marketing/']
const EXCLUDE = ['jam-doc/archive/', 'jam-doc/assets/', 'jam-doc/operations/reports/', 'docs/tickets/']

const nfc = (s) => s.normalize('NFC')
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

export function isIndexTarget(file) {
  const p = nfc(file)
  if (!p.endsWith('.md') || p === INDEX_PATH) return false
  if (EXCLUDE.some((x) => p.startsWith(x))) return false
  return ROOTS.some((r) => p.startsWith(r))
}

function oneLine(s) {
  return String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

// entries: [{ file, description }] — 순서와 무관하게 같은 결과를 낸다.
export function renderIndex(entries) {
  const sorted = [...entries].sort((a, b) => cmp(nfc(a.file), nfc(b.file)))
  const byDir = new Map()
  for (const e of sorted) {
    const dir = posix.dirname(nfc(e.file))
    if (!byDir.has(dir)) byDir.set(dir, [])
    byDir.get(dir).push(e)
  }
  const out = [
    '---',
    'type: index',
    'description: docs/specs, jam-doc/planning, jam-doc/marketing 문서를 frontmatter description으로 모은 자동 생성 목록이다.',
    'status: active',
    '---',
    '',
    '# 문서 색인',
    '',
    '이 파일은 `node scripts/gen-doc-index.mjs`가 생성한다. 손으로 고치지 않는다. 문서를 추가·삭제하거나 description을 고치면 같은 명령을 다시 실행한다(pre-commit이 최신 여부를 검사한다).',
    '',
  ]
  for (const dir of [...byDir.keys()].sort(cmp)) {
    out.push(`## ${dir}/`, '')
    for (const e of byDir.get(dir)) {
      const rel = posix.relative(posix.dirname(INDEX_PATH), nfc(e.file)).replace(/ /g, '%20')
      const name = posix.basename(nfc(e.file))
      const desc = oneLine(e.description) || '(description 없음)'
      out.push(`- [${name}](${rel}) — ${desc}`)
    }
    out.push('')
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`
}

export function buildIndex(repo) {
  const files = execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z'], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  })
    .split('\0')
    .filter(Boolean)
    .map(nfc)
    .filter(isIndexTarget)
  const entries = []
  for (const file of new Set(files)) {
    let text
    try {
      text = readFileSync(path.join(repo, file), 'utf8')
    } catch {
      continue
    }
    entries.push({ file, description: parseFrontmatter(text)?.data?.description ?? '' })
  }
  return renderIndex(entries)
}

function main() {
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const target = path.join(repo, INDEX_PATH)
  const next = buildIndex(repo)
  let current = ''
  try {
    current = readFileSync(target, 'utf8')
  } catch {
    // 아직 없으면 빈 문자열과 비교한다
  }
  if (process.argv.includes('--check')) {
    if (current === next) {
      console.log('docs/specs/INDEX.md가 최신입니다.')
      return 0
    }
    console.error('')
    console.error('docs/specs/INDEX.md가 문서 현황과 다릅니다. 손으로 고치지 말고 아래를 실행한 뒤 결과를 스테이지하세요:')
    console.error('')
    console.error('    node scripts/gen-doc-index.mjs')
    console.error('')
    return 1
  }
  if (current === next) {
    console.log('docs/specs/INDEX.md가 이미 최신입니다.')
  } else {
    writeFileSync(target, next)
    console.log('docs/specs/INDEX.md를 갱신했습니다.')
  }
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main())
}
