// gen-ticket-index.mjs 테스트 (티켓 20261026_2028)
// 실행: node scripts/gen-ticket-index.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TICKET_INDEX_PATH,
  buildTicketIndex,
  isTicketTarget,
  parseTicketEntry,
  serializeTicketIndex,
} from './gen-ticket-index.mjs'

// 훅(pre-push -> verify.sh) 안에서 도는 경우 git이 GIT_DIR 등을 물려준다. 임시 저장소 명령이
// 실제 저장소 설정을 건드리지 않도록 물려받은 GIT_*를 버린다(티켓 20260921_1116 사고).
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k]

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const GEN = join(SCRIPTS, 'gen-ticket-index.mjs')
const HOOK = join(SCRIPTS, '..', '.githooks', 'pre-commit')

assert.equal(TICKET_INDEX_PATH, 'docs/tickets/_index.json')

// 대상 판정
assert.equal(isTicketTarget('docs/tickets/p1-high/20261026_2028_Admin_x.md'), true)
assert.equal(isTicketTarget('docs/tickets/p3-low/20260710_001_Infra_x.md'), true)
assert.equal(isTicketTarget('docs/tickets/modular/001_P0_FIX_x.md'), false)
assert.equal(isTicketTarget('docs/tickets/_TEMPLATE.md'), false)
assert.equal(isTicketTarget('docs/tickets/README.md'), false)
assert.equal(isTicketTarget('docs/tickets/Archive/old.md'), false)
assert.equal(isTicketTarget('docs/tickets/p2-normal/Archive/old.md'), false)
assert.equal(isTicketTarget('docs/tickets/_index.json'), false)
assert.equal(isTicketTarget('docs/service/x.md'), false)

// 파싱: 따옴표 있는 id, 없는 id, 옛 NNN 형식
const ticket = (fm, title = '# [Admin] 제목') => `---\n${fm}\n---\n\n${title}\n\n본문\n`
const quoted = parseTicketEntry(
  'docs/tickets/p2-normal/a.md',
  ticket('id: "20261026_2028"\ncategory: Admin\npriority: P2\nstatus: IN_PROGRESS\ncreated: 2026-10-26\nclosed:\nparent: "20261026_2020"'),
)
assert.deepEqual(quoted, {
  id: '20261026_2028',
  title: '[Admin] 제목',
  status: 'IN_PROGRESS',
  category: 'Admin',
  priority: 'P2',
  parent: '20261026_2020',
  origin: '',
  created: '2026-10-26',
  closed: '',
  path: 'docs/tickets/p2-normal/a.md',
})
assert.deepEqual(Object.keys(quoted), ['id', 'title', 'status', 'category', 'priority', 'parent', 'origin', 'created', 'closed', 'path'])
assert.equal(parseTicketEntry('x.md', ticket('id: 20260710_001\nstatus: CLOSED\nclosed: 2026-07-15')).id, '20260710_001')
assert.equal(parseTicketEntry('x.md', ticket('id: 20260710_001\nstatus: CLOSED\nclosed: 2026-07-15')).closed, '2026-07-15')

// closed: 빈 값, parent 없음
const open = parseTicketEntry('x.md', ticket('id: "20261001_0900"\nstatus: OPEN\nclosed:'))
assert.equal(open.closed, '')
assert.equal(open.parent, '')

// origin: 허용 값만, 밖이면 빈 문자열
assert.equal(parseTicketEntry('x.md', ticket('id: "1"\norigin: eco')).origin, 'eco')
assert.equal(parseTicketEntry('x.md', ticket('id: "1"\norigin: "ops"')).origin, 'ops')
assert.equal(parseTicketEntry('x.md', ticket('id: "1"\norigin: other')).origin, 'other')
assert.equal(parseTicketEntry('x.md', ticket('id: "1"\norigin: marketing')).origin, '')

// 제목: 카테고리 접두와 뒤쪽 (…) 표시는 그대로 두고 100자로 자른다
assert.equal(parseTicketEntry('x.md', ticket('id: "1"', '# [API] 제목 (후속)')).title, '[API] 제목 (후속)')
const long = parseTicketEntry('x.md', ticket('id: "1"', `# ${'가'.repeat(150)}`)).title
assert.equal(Array.from(long).length, 100)
assert.equal(parseTicketEntry('x.md', ticket('id: "1"', '# 짧은 제목')).title, '짧은 제목')

// frontmatter 없음 -> null
assert.equal(parseTicketEntry('x.md', '# 제목만 있다\n'), null)

// 직렬화: id 오름차순(같으면 경로순), 한 줄 한 티켓, 같은 입력은 같은 결과
const e = (id, p) => parseTicketEntry(p, ticket(`id: "${id}"\nstatus: OPEN`, `# ${id}`))
const b = e('20261002_0900', 'docs/tickets/p2-normal/b.md')
const a2 = e('20261001_0900', 'docs/tickets/p2-normal/z.md')
const a1 = e('20261001_0900', 'docs/tickets/p2-normal/a.md')
const sorted = buildTicketIndex([b, a2, a1])
assert.deepEqual(sorted.map((x) => x.path), ['docs/tickets/p2-normal/a.md', 'docs/tickets/p2-normal/z.md', 'docs/tickets/p2-normal/b.md'])
assert.deepEqual(buildTicketIndex([a1, b, a2]), sorted)
const text = serializeTicketIndex(sorted)
assert.equal(text, serializeTicketIndex(buildTicketIndex([a2, a1, b])))
assert.ok(text.startsWith('[\n') && text.endsWith('\n]\n'))
assert.equal(text.split('\n').length, 3 + 2 + 1) // 여는 줄 + 티켓 3줄 + 닫는 줄 + 끝 줄바꿈
assert.deepEqual(JSON.parse(text), sorted)
assert.equal(serializeTicketIndex([]), '[]\n')

// 임시 저장소 실행
function sh(cwd, cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', ...opts })
}
function gitIn(cwd, ...args) {
  const r = sh(cwd, 'git', args)
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout
}
function newRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'ticket-index-'))
  gitIn(dir, 'init', '-q')
  gitIn(dir, 'config', 'user.email', 'test@example.com')
  gitIn(dir, 'config', 'user.name', 'test')
  gitIn(dir, 'config', 'core.hooksPath', '/dev/null')
  return dir
}
function write(dir, rel, content) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), content)
}
const gen = (dir, ...args) => sh(dir, 'node', [GEN, ...args])
const indexedIds = (dir) => JSON.parse(gitIn(dir, 'show', `:${TICKET_INDEX_PATH}`)).map((x) => x.id)

const A = 'docs/tickets/p2-normal/20261001_0900_Admin_a.md'
const B = 'docs/tickets/p1-high/20261002_0900_Admin_b.md'
const dir = newRepo()
try {
  write(dir, A, ticket('id: "20261001_0900"\ncategory: Admin\npriority: P2\nstatus: OPEN\ncreated: 2026-10-01\nclosed:', '# [Admin] 가'))
  write(dir, 'docs/tickets/modular/001_P0_FIX_x.md', ticket('id: "001"\nstatus: OPEN'))
  write(dir, 'docs/tickets/README.md', '# 안내\n')
  write(dir, 'docs/tickets/_TEMPLATE.md', ticket('id: "0"\nstatus: OPEN'))
  write(dir, 'docs/tickets/p2-normal/Archive/old.md', ticket('id: "1"\nstatus: CLOSED'))
  write(dir, 'docs/tickets/p2-normal/no-frontmatter.md', '# 머리말 없음\n')
  gitIn(dir, 'add', '-A')

  // 색인 파일이 아직 없으면 --check는 실패한다
  const missing = gen(dir, '--check')
  assert.equal(missing.status, 1)
  assert.ok(missing.stderr.includes('node scripts/gen-ticket-index.mjs'))

  // --stage는 색인을 쓰고 스테이지한다. 대상만 담고, frontmatter 없는 파일은 건수를 알리고 건너뛴다
  const staged = gen(dir, '--stage')
  assert.equal(staged.status, 0, staged.stderr)
  assert.ok(staged.stderr.includes('1건'))
  assert.deepEqual(indexedIds(dir), ['20261001_0900'])
  assert.equal(readFileSync(join(dir, TICKET_INDEX_PATH), 'utf8'), gitIn(dir, 'show', `:${TICKET_INDEX_PATH}`))
  assert.equal(gen(dir, '--check').status, 0)

  // 작업 폴더의 미스테이지 변경과 추적되지 않는 새 티켓은 색인에 섞이지 않는다 (git 인덱스만 읽는다)
  write(dir, A, ticket('id: "20261001_0900"\ncategory: Admin\npriority: P2\nstatus: CLOSED\ncreated: 2026-10-01\nclosed: 2026-10-05', '# [Admin] 다른 제목'))
  write(dir, B, ticket('id: "20261002_0900"\nstatus: OPEN', '# 남의 새 티켓'))
  assert.equal(gen(dir, '--check').status, 0)
  assert.equal(gen(dir, '--stage').status, 0)
  const afterStray = JSON.parse(gitIn(dir, 'show', `:${TICKET_INDEX_PATH}`))
  assert.deepEqual(afterStray.map((x) => [x.id, x.status, x.title]), [['20261001_0900', 'OPEN', '[Admin] 가']])

  // 티켓을 스테이지하면 색인이 낡은 것이 되어 --check가 1을 돌려주고, --stage가 고친다
  gitIn(dir, 'add', '--', A, B)
  const stale = gen(dir, '--check')
  assert.equal(stale.status, 1)
  assert.ok(stale.stderr.includes('node scripts/gen-ticket-index.mjs'))
  assert.equal(gen(dir, '--stage').status, 0)
  assert.deepEqual(indexedIds(dir), ['20261001_0900', '20261002_0900'])
  assert.equal(gen(dir, '--check').status, 0)

  // 티켓을 스테이지에서 지우면(삭제) 색인에서도 빠진다
  gitIn(dir, 'rm', '-q', '-f', '--', B)
  assert.equal(gen(dir, '--check').status, 1)
  assert.equal(gen(dir, '--stage').status, 0)
  assert.deepEqual(indexedIds(dir), ['20261001_0900'])
} finally {
  rmSync(dir, { recursive: true, force: true })
}

// 실제 pre-commit 훅: 티켓을 스테이지해 커밋하면 색인이 같은 커밋에 들어간다
const hookDir = newRepo()
try {
  mkdirSync(join(hookDir, 'scripts'), { recursive: true })
  copyFileSync(GEN, join(hookDir, 'scripts', 'gen-ticket-index.mjs'))
  mkdirSync(join(hookDir, '.githooks'), { recursive: true })
  copyFileSync(HOOK, join(hookDir, '.githooks', 'pre-commit'))
  gitIn(hookDir, 'config', 'core.hooksPath', '.githooks')
  gitIn(hookDir, 'add', '-A')
  gitIn(hookDir, 'commit', '-q', '-m', '기반')

  write(hookDir, A, ticket('id: "20261001_0900"\nstatus: OPEN', '# [Admin] 가'))
  gitIn(hookDir, 'add', '--', A)
  const commit = sh(hookDir, 'git', ['commit', '-q', '-m', '티켓 추가'])
  assert.equal(commit.status, 0, commit.stderr)
  const committed = gitIn(hookDir, 'show', `HEAD:${TICKET_INDEX_PATH}`)
  assert.deepEqual(JSON.parse(committed).map((x) => x.id), ['20261001_0900'])
  assert.ok(gitIn(hookDir, 'show', '--name-only', '--format=', 'HEAD').split('\n').includes(TICKET_INDEX_PATH))

  // 티켓이 아닌 파일만 커밋하면 훅이 색인을 건드리지 않는다
  write(hookDir, 'README.md', '안녕\n')
  gitIn(hookDir, 'add', '--', 'README.md')
  assert.equal(sh(hookDir, 'git', ['commit', '-q', '-m', '다른 파일']).status, 0)
  assert.ok(!gitIn(hookDir, 'show', '--name-only', '--format=', 'HEAD').split('\n').includes(TICKET_INDEX_PATH))
} finally {
  rmSync(hookDir, { recursive: true, force: true })
}

console.log('gen-ticket-index 테스트 통과')
