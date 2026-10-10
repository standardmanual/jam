#!/usr/bin/env node
// gen-doc-index — docs/INDEX.md를 문서 frontmatter에서 생성한다 (티켓 20260921_1400, 20261010_1214).
//
// 배경: 어떤 문서가 있는지 한눈에 보는 목록이 없어 새 세션의 읽기 순서를 손으로 나열했고,
// 손으로 쓴 목록은 낡는다. 목록은 문서 자신의 description·tags를 모은 것이므로 사본을 손으로
// 쓰지 않고 생성한다. 시각·난수를 넣지 않아 같은 저장소 상태에서는 항상 같은 결과가 나온다.
//
// 구성
//   1) 주제 지도 — 태그(DOCUMENT_SCHEMA.md §6.2 어휘)별로 문서를 폴더 성격(현재 서비스·JAM 2.0·
//      비전·마케팅·운영·에이전트·보관)으로 나눠 보여 준다. 태그가 없는 문서는 「주제 없음」에 모은다.
//   2) 폴더별 목록 — 보관 문서를 뺀 문서를 폴더별로 보여 준다.
//
// 대상: docs/ 아래 .md (티켓·assets·operations/reports 제외). 보관(docs/archive/, docs/agents/workflow/)은
// 주제 지도에만 나온다.
//
// 사용법:
//   node scripts/gen-doc-index.mjs          INDEX.md를 갱신한다
//   node scripts/gen-doc-index.mjs --check  최신인지만 판정한다 (다르면 종료 코드 1)

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path, { posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from './doc-check.mjs'

export const INDEX_PATH = 'docs/INDEX.md'
export const ROOTS = ['docs/']
const EXCLUDE = ['docs/tickets/', 'docs/assets/', 'docs/operations/reports/']

// 주제 지도에서 문서를 나누는 묶음. 화면에 보이는 순서대로 적고, 문서는 가장 긴 접두어가 맞는 묶음에 든다.
// 보관에는 읽기 전용 폴더(docs/archive/, docs/agents/workflow/)와 트라이브 설정 스냅샷 이력 폴더가 든다.
export const BUCKETS = [
  { key: 'service', label: '현재 서비스 (service)', prefixes: ['docs/service/'] },
  { key: 'jam2', label: 'JAM 2.0 (plan/jam2)', prefixes: ['docs/plan/jam2/'] },
  { key: 'vision', label: '비전 (plan/vision)', prefixes: ['docs/plan/vision/'] },
  { key: 'marketing', label: '마케팅 (marketing)', prefixes: ['docs/marketing/'] },
  { key: 'operations', label: '운영 (operations)', prefixes: ['docs/operations/'] },
  { key: 'agents', label: '에이전트 (agents)', prefixes: ['docs/agents/'] },
  { key: 'docs', label: '문서 체계 (docs 루트)', prefixes: ['docs/'] },
  {
    key: 'archive',
    label: '보관 (archive)',
    prefixes: ['docs/archive/', 'docs/agents/workflow/', 'docs/service/content/tribes-history/'],
  },
]

const nfc = (s) => s.normalize('NFC')
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const NO_TOPIC = '주제 없음'

export function isIndexTarget(file) {
  const p = nfc(file)
  if (!p.endsWith('.md') || p === INDEX_PATH) return false
  if (EXCLUDE.some((x) => p.startsWith(x))) return false
  return ROOTS.some((r) => p.startsWith(r))
}

export function bucketOf(file) {
  const p = nfc(file)
  let best = null
  for (const b of BUCKETS) {
    for (const x of b.prefixes) {
      if (p.startsWith(x) && (!best || x.length > best.len)) best = { b, len: x.length }
    }
  }
  return best ? best.b : BUCKETS.find((b) => b.key === 'docs')
}

function oneLine(s) {
  return String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function linkOf(file) {
  const rel = posix.relative(posix.dirname(INDEX_PATH), nfc(file)).replace(/ /g, '%20')
  return `[${posix.basename(nfc(file))}](${rel})`
}

function bullet(e) {
  const desc = oneLine(e.description) || '(description 없음)'
  return `- ${linkOf(e.file)} — ${desc}`
}

function topicMap(sorted, vocabulary) {
  const byTopic = new Map()
  const add = (topic, e) => {
    if (!byTopic.has(topic)) byTopic.set(topic, [])
    byTopic.get(topic).push(e)
  }
  for (const e of sorted) {
    const tags = Array.isArray(e.tags) ? e.tags.filter((t) => typeof t === 'string' && t) : []
    if (tags.length === 0) add(NO_TOPIC, e)
    else for (const t of new Set(tags)) add(t, e)
  }
  const known = vocabulary.filter((t) => byTopic.has(t))
  const extra = [...byTopic.keys()].filter((t) => t !== NO_TOPIC && !vocabulary.includes(t)).sort(cmp)
  const order = [...known, ...extra, ...(byTopic.has(NO_TOPIC) ? [NO_TOPIC] : [])]

  const out = ['## 주제 지도', '']
  out.push(
    '태그(`docs/DOCUMENT_SCHEMA.md` §6.2)별로 문서를 모았다. 한 주제 안에서 현재 서비스(service)·JAM 2.0(plan/jam2)·비전·마케팅·운영·에이전트·보관(archive) 순으로 나눠 보여 준다. 티켓은 넣지 않았다(`docs/tickets/`).',
    '',
    `주제: ${order.map((t) => `[${t}](#${anchorOf(t)})`).join(' · ')}`,
    '',
  )
  for (const topic of order) {
    out.push(`### ${topic}`, '')
    const docs = byTopic.get(topic)
    for (const b of BUCKETS) {
      const inBucket = docs.filter((e) => bucketOf(e.file).key === b.key)
      if (inBucket.length === 0) continue
      out.push(`**${b.label}**`, '')
      // 주제 없음에 모인 보관 문서는 frontmatter가 없는 옛 기록이 대부분이라 폴더 단위로 접는다.
      if (topic === NO_TOPIC && b.key === 'archive') {
        const byDir = new Map()
        for (const e of inBucket) {
          const dir = posix.dirname(nfc(e.file))
          byDir.set(dir, (byDir.get(dir) ?? 0) + 1)
        }
        for (const dir of [...byDir.keys()].sort(cmp)) {
          const rel = posix.relative(posix.dirname(INDEX_PATH), dir)
          out.push(`- [${dir}/](${rel.replace(/ /g, '%20')}/) — 문서 ${byDir.get(dir)}개`)
        }
      } else {
        for (const e of inBucket) out.push(bullet(e))
      }
      out.push('')
    }
  }
  return out
}

// GitHub·옵시디언 헤딩 앵커: 소문자, 공백은 하이픈, 마침표·쉼표 등 기호는 뺀다.
function anchorOf(text) {
  return nfc(text).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
}

// entries: [{ file, description, tags }] — 순서와 무관하게 같은 결과를 낸다.
// vocabulary: 주제 지도의 정렬 기준이 되는 태그 어휘(doc-check.config.json의 tags.vocabulary).
export function renderIndex(entries, vocabulary = []) {
  const sorted = [...entries].sort((a, b) => cmp(nfc(a.file), nfc(b.file)))
  const byDir = new Map()
  for (const e of sorted) {
    if (bucketOf(e.file).key === 'archive') continue
    const dir = posix.dirname(nfc(e.file))
    if (!byDir.has(dir)) byDir.set(dir, [])
    byDir.get(dir).push(e)
  }
  const out = [
    '---',
    'type: index',
    'description: docs/ 문서를 태그별 주제 지도와 폴더별 목록으로 모은 자동 생성 색인이다.',
    'status: active',
    '---',
    '',
    '# 문서 색인',
    '',
    '이 파일은 `node scripts/gen-doc-index.mjs`가 생성한다. 손으로 고치지 않는다. 문서를 추가·삭제하거나 description·tags를 고치면 같은 명령을 다시 실행한다(pre-commit이 최신 여부를 검사한다). 폴더 지도와 쓰기 규칙은 [README.md](README.md)에 있다.',
    '',
    ...topicMap(sorted, vocabulary),
    '## 폴더별 목록',
    '',
  ]
  for (const dir of [...byDir.keys()].sort(cmp)) {
    out.push(`### ${dir}/`, '')
    for (const e of byDir.get(dir)) out.push(bullet(e))
    out.push('')
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`
}

function vocabulary(repo) {
  try {
    const cfg = JSON.parse(readFileSync(path.join(repo, 'scripts/doc-check.config.json'), 'utf8'))
    return cfg.tags?.vocabulary ?? []
  } catch {
    return []
  }
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
    const data = parseFrontmatter(text)?.data ?? {}
    entries.push({ file, description: data.description ?? '', tags: data.tags })
  }
  return renderIndex(entries, vocabulary(repo))
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
      console.log('docs/INDEX.md가 최신입니다.')
      return 0
    }
    console.error('')
    console.error('docs/INDEX.md가 문서 현황과 다릅니다. 손으로 고치지 말고 아래를 실행한 뒤 결과를 스테이지하세요:')
    console.error('')
    console.error('    node scripts/gen-doc-index.mjs')
    console.error('')
    return 1
  }
  if (current === next) {
    console.log('docs/INDEX.md가 이미 최신입니다.')
  } else {
    writeFileSync(target, next)
    console.log('docs/INDEX.md를 갱신했습니다.')
  }
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main())
}
