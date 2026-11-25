// UI 승인 관문 — 토큰·정본 컴포넌트를 바꾸는 커밋은 티켓(또는 상위 티켓)에 사용자 승인 기록이 있어야 한다.
// 티켓 20261125_2013. .githooks/commit-msg가 커밋 메시지 파일 경로를 첫 인자로 넘겨 부른다.
// 시험용 옵션: --root <dir>, --staged <경로…>(스테이징 목록 대신), --status <A|M|D…>(--staged와 같은 순서).
// 실행: node scripts/check-ui-approval.mjs <커밋메시지파일>

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const TOKENS = 'jam-web/design-system/tokens/'
const GLOBALS = 'jam-web/src/app/globals.css'
const UI_DIR = 'jam-web/src/components/ui/'
const APPROVAL_RE = /^- 사용자 승인: \d{4}-\d{2}-\d{2} — .+/m
const TICKET_ID_RE = /\d{8}_\d{4}/g

const isTestOrStory = (p) => /\.(test|stories)\.[^/]+$/.test(p) || p.includes('/__tests__/')

export const isProtected = (p) => {
  if (isTestOrStory(p)) return false
  return p.startsWith(TOKENS) || p === GLOBALS || p.startsWith(UI_DIR)
}

const git = (root, args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

const parseArgs = (argv) => {
  const o = { msgFile: null, root: process.cwd(), staged: null, status: null }
  let mode = null
  for (const a of argv) {
    if (a === '--root') mode = 'root'
    else if (a === '--staged') {
      mode = 'staged'
      o.staged = []
    } else if (a === '--status') {
      mode = 'status'
      o.status = []
    } else if (mode === 'root') {
      o.root = resolve(a)
      mode = null
    } else if (mode === 'staged') o.staged.push(a)
    else if (mode === 'status') o.status.push(a)
    else if (!o.msgFile) o.msgFile = a
  }
  return o
}

// 머지·리베이스·체리픽 진행 중이면 이미 검사를 거친 커밋을 옮기는 것이라 건너뛴다.
const inProgress = (root) =>
  ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD'].some((n) => {
    try {
      return existsSync(resolve(root, git(root, ['rev-parse', '--git-path', n]).trim()))
    } catch {
      return false
    }
  })

const stagedEntries = (root) => {
  const out = git(root, ['diff', '--cached', '--name-status', '--no-renames', '-z'])
  const parts = out.split('\0').filter(Boolean)
  const list = []
  for (let i = 0; i + 1 < parts.length; i += 2) list.push({ status: parts[i][0], path: parts[i + 1] })
  return list
}

const walk = (dir, acc = []) => {
  if (!existsSync(dir)) return acc
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

// 티켓 번호로 파일을 찾는다. 한글 파일명은 NFC·NFD가 섞일 수 있어 NFC로 정규화해 비교한다.
const findTicketFile = (root, id) =>
  walk(join(root, 'docs', 'tickets')).find((f) => {
    const name = f.slice(f.lastIndexOf('/') + 1).normalize('NFC')
    return name.endsWith('.md') && name.startsWith(`${id}_`)
  })

// 스테이징된 판이 있으면 그것을, 없으면 작업 폴더 판을 읽는다.
const readTicket = (root, file) => {
  const rel = file.slice(root.length + 1)
  try {
    return git(root, ['show', `:${rel}`])
  } catch {
    return readFileSync(file, 'utf8')
  }
}

const parentOf = (text) => {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)
  const m = fm && /^parent:\s*"?(\d{8}_\d{4})"?/m.exec(fm[1])
  return m ? m[1] : null
}

const hasApproval = (root, ids) => {
  const seen = new Set()
  const queue = [...ids]
  while (queue.length) {
    const id = queue.shift()
    if (seen.has(id)) continue
    seen.add(id)
    const file = findTicketFile(root, id)
    if (!file) continue
    const text = readTicket(root, file)
    if (APPROVAL_RE.test(text)) return true
    const parent = parentOf(text)
    if (parent) queue.push(parent)
  }
  return false
}

export const check = ({ msgFile, root, staged, status }) => {
  if (inProgress(root)) return { ok: true, skipped: true, errors: [] }
  const entries = staged
    ? staged.map((path, i) => ({ path, status: (status?.[i] ?? 'M')[0] }))
    : stagedEntries(root)
  const prot = entries.filter((e) => isProtected(e.path))
  if (!prot.length) return { ok: true, errors: [] }

  const errors = []
  const list = prot.map((e) => `    - ${e.path}`).join('\n')
  const msg = (msgFile && existsSync(msgFile) ? readFileSync(msgFile, 'utf8') : '')
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
  const ids = [...new Set(msg.match(TICKET_ID_RE) ?? [])]

  if (!ids.length) {
    errors.push(`커밋 메시지에 티켓 번호(YYYYMMDD_HHMM)가 없어 승인 기록을 찾을 수 없습니다.\n  막힌 경로:\n${list}`)
  } else if (!hasApproval(root, ids)) {
    errors.push(`티켓(${ids.join(', ')})과 그 상위 티켓에 사용자 승인 기록이 없습니다.\n  막힌 경로:\n${list}`)
  }

  for (const e of prot) {
    const m = /^(jam-web\/src\/components\/ui\/)([^/]+)\.tsx$/.exec(e.path)
    if (e.status !== 'A' || !m) continue
    const story = `${m[1]}${m[2]}.stories.tsx`
    const stagedStory = entries.some((x) => x.path === story && x.status !== 'D')
    if (!stagedStory && !existsSync(join(root, story))) {
      errors.push(`새 정본 컴포넌트 ${e.path}에 스토리 파일(${story})이 없습니다. 스토리를 함께 추가하세요.`)
    }
  }

  return { ok: !errors.length, errors }
}

if (process.argv[1]?.endsWith('check-ui-approval.mjs')) {
  const r = check(parseArgs(process.argv.slice(2)))
  if (!r.ok) {
    console.error('차단(commit-msg): UI 승인 관문 — 토큰·정본 컴포넌트 변경은 사용자 승인 기록이 필요합니다.')
    for (const e of r.errors) console.error(`  ${e}`)
    console.error('  해결: 카리나가 사용자 승인을 받은 뒤 티켓에 `- 사용자 승인: YYYY-MM-DD — 내용` 줄을 적습니다.')
    console.error('  에이전트는 이 줄을 쓰지 않고, --no-verify로 우회하지 않습니다.')
    process.exit(1)
  }
}
