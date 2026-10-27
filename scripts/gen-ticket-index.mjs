#!/usr/bin/env node
// gen-ticket-index — docs/tickets/_index.json(티켓 색인)을 티켓 frontmatter에서 생성한다 (티켓 20261026_2028).
//
// 배경: 개발·배포 상황판(어드민)이 티켓 상태를 GitHub에서 읽는다. docs/는 Vercel 배포 범위
// (jam-web/) 밖이라 서버 함수가 파일을 직접 읽을 수 없고, 티켓을 하나씩 GitHub로 읽으면 요청이
// 수백 번이다. 그래서 티켓 2천여 개를 한 파일로 모은 색인을 저장소에 두고 그 한 파일만 읽는다.
// 색인은 티켓 자신의 frontmatter를 모은 것이므로 사본을 손으로 쓰지 않고 생성한다.
// 시각·난수를 넣지 않아 같은 입력에서는 항상 같은 결과가 나온다.
//
// 티켓은 작업 폴더가 아니라 git 인덱스(스테이지된 상태)에서 읽는다. 병렬 세션이 작업 폴더를 같이
// 쓰므로, 작업 폴더를 읽으면 남의 미스테이지 티켓 변경이 이 커밋의 색인에 섞인다.
//
// 대상: docs/tickets/ 아래 .md. 제외: modular/, _TEMPLATE.md, README.md, Archive 폴더.
//
// 사용법:
//   node scripts/gen-ticket-index.mjs           색인 파일을 갱신한다 (작업 폴더에 쓴다)
//   node scripts/gen-ticket-index.mjs --check   git 인덱스에 올라간 색인이 생성 결과와 같은지만 판정한다 (다르면 종료 코드 1)
//   node scripts/gen-ticket-index.mjs --stage   갱신하고 git add까지 한다 (.githooks/pre-commit용)

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TICKET_INDEX_PATH = 'docs/tickets/_index.json'
const TICKETS_DIR = 'docs/tickets/'
const ORIGINS = new Set(['ops', 'eco', 'other'])
const TITLE_MAX = 100

const nfc = (s) => s.normalize('NFC')
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// 색인에 넣을 티켓 파일인가
export function isTicketTarget(file) {
  const p = nfc(file)
  if (!p.startsWith(TICKETS_DIR) || !p.endsWith('.md')) return false
  const rest = p.slice(TICKETS_DIR.length).split('/')
  if (rest.slice(0, -1).some((seg) => seg === 'modular' || seg === 'Archive')) return false
  const base = rest[rest.length - 1]
  return base !== '_TEMPLATE.md' && base !== 'README.md'
}

function stripQuotes(v) {
  const s = v.trim()
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1)
  }
  return s
}

function truncate(s, max) {
  const chars = Array.from(s)
  return chars.length <= max ? s : chars.slice(0, max).join('')
}

// 티켓 한 장 -> 색인 항목. frontmatter가 없으면 null.
export function parseTicketEntry(file, text) {
  const body = text.replace(/\r\n/g, '\n')
  const m = body.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const fm = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) fm[kv[1]] = stripQuotes(kv[2])
  }
  const h1 = body.slice(m[0].length).match(/^#\s+(.+)$/m)
  const origin = fm.origin ?? ''
  return {
    id: fm.id ?? '',
    title: truncate(h1 ? h1[1].trim() : '', TITLE_MAX),
    status: fm.status ?? '',
    category: fm.category ?? '',
    priority: fm.priority ?? '',
    parent: fm.parent ?? '',
    origin: ORIGINS.has(origin) ? origin : '',
    created: fm.created ?? '',
    closed: fm.closed ?? '',
    path: nfc(file),
  }
}

// id 오름차순, 같으면 경로순
export function buildTicketIndex(entries) {
  return entries
    .filter((e) => e != null)
    .slice()
    .sort((a, b) => cmp(a.id, b.id) || cmp(a.path, b.path))
}

// JSON 배열, 티켓 한 줄, 끝에 줄바꿈
export function serializeTicketIndex(entries) {
  if (entries.length === 0) return '[]\n'
  return `[\n${entries.map((e) => `  ${JSON.stringify(e)}`).join(',\n')}\n]\n`
}

function git(repo, args, options = {}) {
  return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {
    cwd: repo,
    maxBuffer: 1 << 30,
    ...options,
  })
}

// git 인덱스(스테이지 0)에서 대상 티켓의 [경로, 내용]을 읽는다. 작업 폴더는 보지 않는다.
export function readTicketsFromGitIndex(repo) {
  const listing = git(repo, ['ls-files', '-s', '-z', '--', 'docs/tickets']).toString('utf8')
  const targets = []
  for (const record of listing.split('\0')) {
    if (!record) continue
    const tab = record.indexOf('\t')
    const [mode, sha, stage] = record.slice(0, tab).split(' ')
    const file = record.slice(tab + 1)
    if (stage !== '0' || mode === '160000' || !isTicketTarget(file)) continue
    targets.push({ file, sha })
  }
  if (targets.length === 0) return []

  // 블롭을 git cat-file --batch 한 프로세스로 읽는다 (티켓마다 git show를 부르지 않는다)
  const out = git(repo, ['cat-file', '--batch'], {
    input: targets.map((t) => `${t.sha}\n`).join(''),
  })
  const result = []
  let pos = 0
  for (const t of targets) {
    const eol = out.indexOf(0x0a, pos)
    const header = out.subarray(pos, eol).toString('utf8').split(' ')
    if (header[1] !== 'blob') throw new Error(`티켓 블롭을 읽지 못했습니다: ${t.file}`)
    const size = Number(header[2])
    const start = eol + 1
    result.push({ file: t.file, text: out.subarray(start, start + size).toString('utf8') })
    pos = start + size + 1
  }
  return result
}

// 전체 생성: 직렬화된 문자열과 건너뛴 건수
export function buildFromGitIndex(repo) {
  const entries = []
  let skipped = 0
  for (const { file, text } of readTicketsFromGitIndex(repo)) {
    const entry = parseTicketEntry(file, text)
    if (entry) entries.push(entry)
    else skipped += 1
  }
  return { text: serializeTicketIndex(buildTicketIndex(entries)), skipped }
}

// git 인덱스에 올라간 색인 파일 내용. 없으면 빈 문자열.
function indexedIndexFile(repo) {
  const r = spawnSync('git', ['cat-file', 'blob', `:0:${TICKET_INDEX_PATH}`], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  })
  return r.status === 0 ? r.stdout : ''
}

function main() {
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const { text: next, skipped } = buildFromGitIndex(repo)
  if (skipped > 0) console.error(`frontmatter가 없는 티켓 ${skipped}건은 색인에서 건너뜁니다.`)

  if (process.argv.includes('--check')) {
    if (indexedIndexFile(repo) === next) {
      console.log(`${TICKET_INDEX_PATH}가 최신입니다.`)
      return 0
    }
    console.error('')
    console.error(`${TICKET_INDEX_PATH}가 티켓 현황과 다릅니다. 손으로 고치지 말고 아래를 실행한 뒤 결과를 스테이지하세요:`)
    console.error('')
    console.error('    node scripts/gen-ticket-index.mjs')
    console.error('')
    return 1
  }

  const target = path.join(repo, TICKET_INDEX_PATH)
  let current = ''
  try {
    current = readFileSync(target, 'utf8')
  } catch {
    // 아직 없으면 빈 문자열과 비교한다
  }
  if (current !== next) {
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, next)
    console.log(`${TICKET_INDEX_PATH}를 갱신했습니다.`)
  } else {
    console.log(`${TICKET_INDEX_PATH}가 이미 최신입니다.`)
  }
  if (process.argv.includes('--stage')) {
    git(repo, ['add', '--', TICKET_INDEX_PATH])
  }
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main())
}
