// guard-shared-head.mjs 테스트 (티켓 20261002_1905)
//
// 1) 명령 분석: 공유 폴더의 HEAD·작업 트리를 바꾸는 git 명령만 찾아내고, 읽기 명령과
//    `.claude/worktrees/` 아래에서 실행하는 명령은 통과시키는가
// 2) 판정: 메인 워크트리가 아니거나 판정할 수 없거나 입력이 이상하면 막지 않는가
// 3) 실제 git 저장소: 메인 워크트리에서는 deny JSON이 나오고 격리 워크트리에서는 나오지 않는가
// 4) 등록: 민지·채원 정의 frontmatter에 훅 명령이 등록돼 있는가 (빠지면 실패)
// 실행: node scripts/guard-shared-head.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decide, findViolations } from './guard-shared-head.mjs'

// 훅(pre-push -> verify.sh) 안에서 도는 경우 git이 GIT_DIR 등을 물려준다. 임시 저장소 명령이 실제
// 저장소 설정을 건드리지 않도록 물려받은 GIT_*를 버린다(티켓 20260921_1116, 가드레일 패턴 15).
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k]
process.env.GIT_CONFIG_GLOBAL = '/dev/null'
process.env.GIT_CONFIG_NOSYSTEM = '1'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SCRIPT = join(HERE, 'guard-shared-head.mjs')
const CWD = '/repo'

const violations = (cmd) => findViolations(cmd, CWD)

// ── 1) 막는 명령 ─────────────────────────────────────────────────────────────
const BLOCKED = [
  ['git checkout -q --detach abc123', ['checkout']],
  ['git switch staging', ['switch']],
  ['git reset --hard origin/staging', ['reset']],
  ['git rebase origin/staging', ['rebase']],
  ['git log --oneline -3 && git checkout -q --detach abc123', ['checkout']],
  ['git status; git diff HEAD~1 | head -5; git checkout abc123', ['checkout']],
  ['git show HEAD:a.txt\ngit rebase origin/staging', ['rebase']],
  ['FOO=1 git -c user.name=x commit -m "메시지"', ['commit']],
  ['git merge origin/staging && git pull', ['merge', 'pull']],
  ['git cherry-pick abc', ['cherry-pick']],
  ['git revert abc', ['revert']],
  ['git stash', ['stash']],
  ['git stash push -u -m tag', ['stash']],
  ['git restore a.txt', ['restore']],
  ['git clean -fd', ['clean']],
  ['git am fix.patch', ['am']],
  ['command git checkout x', ['checkout']],
  ['/usr/bin/git checkout x', ['checkout']],
  ["bash -c 'git checkout x'", ['checkout']],
  ['echo $(git checkout x)', ['checkout']],
  ['echo "결과: $(git switch y)"', ['switch']],
  ['x=`git reset --hard`', ['reset']],
  ['if true; then git checkout x; fi', ['checkout']],
  ['git -C /repo checkout x', ['checkout']],
  ['git -c core.editor=true -C /repo rebase main', ['rebase']],
  // 옮겨 실행하지 않았거나, 옮겨 간 곳이 worktrees 밖이거나, 옮기기 전에 실행한 경우
  ['cd /tmp/other && git checkout x', ['checkout']],
  ['git checkout x && cd .claude/worktrees/gate-x', ['checkout']],
  ['cd .claude/worktrees/gate-x && git log && cd /repo && git checkout x', ['checkout']],
  ['git -C .claude/worktrees/gate-x log && git checkout x', ['checkout']],
  ['cd "$(git rev-parse --show-toplevel)" && git checkout x', ['checkout']],
  ['cd && git checkout x', ['checkout']],
  ['git -C .claude/other checkout x', ['checkout']],
]
for (const [cmd, expected] of BLOCKED) {
  assert.deepEqual(violations(cmd), expected, `막아야 한다: ${cmd}`)
}

// ── 통과하는 명령 ────────────────────────────────────────────────────────────
const ALLOWED = [
  'git show HEAD:a.txt',
  'git diff origin/staging...HEAD -- scripts',
  'git log --oneline -3',
  'git cat-file -p abc123',
  'git status --short',
  'git fetch origin staging',
  'git branch -a',
  'git rev-parse --show-toplevel',
  'git ls-files scripts',
  'git merge-base origin/staging HEAD',
  'git commit-tree abc -m x',
  'git stash list',
  'git stash show -p',
  'git fetch origin staging && git diff origin/staging...HEAD | head',
  // 별도 워크트리 만들기·지우기와 그 안에서의 실행 — 정의의 탈출구
  'git worktree add --detach .claude/worktrees/gate-x abc123',
  'git worktree remove .claude/worktrees/gate-x',
  'cd .claude/worktrees/gate-x && git checkout -q abc123',
  'cd ./.claude/worktrees/gate-x; git reset --hard abc123',
  'cd /repo/.claude/worktrees/gate-x/jam-web && git checkout x',
  'cd "$CLAUDE_PROJECT_DIR/.claude/worktrees/gate-x" && git checkout x',
  'git -C .claude/worktrees/gate-x checkout x',
  'git -C /repo/.claude/worktrees/gate-x reset --hard',
  'git -C .claude/worktrees/gate-x -c core.editor=true rebase main',
  'cd .claude/worktrees/gate-x && git log && git checkout abc',
  // 명령이 아닌 글자
  'echo "git checkout main"',
  "grep -rn 'git checkout' docs/",
  'git log --grep="git reset --hard"',
  '# git checkout x',
  "cat <<'EOF'\ngit checkout x\nEOF",
  '',
]
for (const cmd of ALLOWED) {
  assert.deepEqual(violations(cmd), [], `통과해야 한다: ${JSON.stringify(cmd)}`)
}
assert.deepEqual(findViolations(undefined, CWD), [], '명령이 문자열이 아니면 통과')
assert.deepEqual(findViolations(42, CWD), [], '명령이 문자열이 아니면 통과')

// heredoc 뒤에 오는 실제 명령은 여전히 본다
assert.deepEqual(violations("cat <<'EOF'\n본문\nEOF\ngit checkout x"), ['checkout'])

// ── 2) decide: 입력·메인 워크트리 판정 ───────────────────────────────────────
const input = (command, extra = {}) => ({ tool_name: 'Bash', cwd: CWD, tool_input: { command }, ...extra })
const MAIN = () => true
const LINKED = () => false
const UNSURE = () => null

const blocked = decide(input('git checkout -q --detach abc123'), MAIN)
assert.equal(blocked.block, true)
assert.match(blocked.reason, /git checkout/)
assert.match(blocked.reason, /git worktree add --detach \.claude\/worktrees\/gate-/)
assert.match(blocked.reason, /읽기 명령/)

assert.equal(decide(input('git checkout abc'), LINKED).block, false, '격리 워크트리면 통과')
assert.equal(decide(input('git checkout abc'), UNSURE).block, false, '판정할 수 없으면 통과')
assert.equal(decide(input('git log'), MAIN).block, false, '읽기 명령은 메인 워크트리여도 통과')
assert.equal(decide(input('git checkout abc', { tool_name: 'Read' }), MAIN).block, false, 'Bash가 아니면 통과')
assert.equal(decide({ tool_name: 'Bash', cwd: CWD, tool_input: {} }, MAIN).block, false, 'command가 없으면 통과')
assert.equal(decide({ tool_name: 'Bash', cwd: CWD }, MAIN).block, false, 'tool_input이 없으면 통과')
assert.equal(decide(null, MAIN).block, false)
assert.equal(decide('문자열', MAIN).block, false)

// git 판정은 막을 만한 명령이 있을 때만 부른다 — 읽기 명령 때마다 git을 띄우지 않는다
let calls = 0
decide(input('git log && git diff'), () => { calls++; return true })
assert.equal(calls, 0, '읽기 명령에는 메인 워크트리 판정을 호출하지 않는다')

// ── 3) 실제 git 저장소 ───────────────────────────────────────────────────────
const sh = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')} 실패:\n${r.stderr}`)
  return r.stdout.trim()
}
const runHook = (payload, raw) =>
  spawnSync('node', [SCRIPT], { input: raw ?? JSON.stringify(payload), encoding: 'utf8' })

const root = realpathSync(mkdtempSync(join(tmpdir(), 'guard-shared-head-')))
try {
  const main = join(root, 'main')
  mkdirSync(main)
  sh('git', ['init', '-q'], main)
  sh('git', ['-c', 'user.name=x', '-c', 'user.email=dev@jam.internal', 'commit', '-q', '--allow-empty', '-m', 'init'], main)
  const headBefore = sh('git', ['rev-parse', 'HEAD'], main)
  const gate = join(main, '.claude', 'worktrees', 'gate-x')
  sh('git', ['worktree', 'add', '-q', '--detach', gate, 'HEAD'], main)

  const denyJson = (r) => JSON.parse(r.stdout).hookSpecificOutput

  // 메인 워크트리: 막는다(종료 코드 0 + deny JSON)
  let r = runHook(input('git log -1 && git checkout -q --detach HEAD', { cwd: main }))
  assert.equal(r.status, 0)
  assert.equal(denyJson(r).hookEventName, 'PreToolUse')
  assert.equal(denyJson(r).permissionDecision, 'deny')
  assert.match(denyJson(r).permissionDecisionReason, /git checkout/)

  // 메인 워크트리의 하위 폴더에서도 막는다
  mkdirSync(join(main, 'sub'))
  r = runHook(input('git switch -', { cwd: join(main, 'sub') }))
  assert.equal(denyJson(r).permissionDecision, 'deny')

  // 메인 워크트리라도 읽기 명령과 worktrees 아래 실행은 통과(출력 없음)
  for (const cmd of [
    'git log --oneline -3',
    'git worktree add --detach .claude/worktrees/gate-y HEAD',
    'cd .claude/worktrees/gate-x && git checkout -q --detach HEAD',
    'git -C .claude/worktrees/gate-x reset --hard HEAD',
  ]) {
    r = runHook(input(cmd, { cwd: main }))
    assert.equal(r.status, 0, cmd)
    assert.equal(r.stdout, '', `통과해야 한다: ${cmd}`)
  }

  // 격리(연결) 워크트리 cwd: 같은 checkout도 통과
  r = runHook(input('git checkout -q --detach HEAD', { cwd: gate }))
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '', '격리 워크트리에서는 막지 않는다')

  // git 저장소가 아닌 cwd: 판정할 수 없어 막지 않고 stderr에 남긴다
  const plain = join(root, 'plain')
  mkdirSync(plain)
  r = runHook(input('git checkout x', { cwd: plain }))
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  assert.match(r.stderr, /판정 실패/)

  // 잘못된 입력: 막지 않고 stderr에 남긴다
  for (const raw of ['', '이건 JSON이 아니다', '{"tool_name":']) {
    r = runHook(null, raw)
    assert.equal(r.status, 0, `입력 ${JSON.stringify(raw)}`)
    assert.equal(r.stdout, '')
    assert.match(r.stderr, /읽지 못했습니다/)
  }

  // 훅은 판정만 한다 — 저장소 HEAD는 움직이지 않았다
  assert.equal(sh('git', ['rev-parse', 'HEAD'], main), headBefore)
  assert.equal(sh('git', ['symbolic-ref', '-q', 'HEAD'], main).startsWith('refs/heads/'), true)
} finally {
  rmSync(root, { recursive: true, force: true })
}

// ── 4) 정의 frontmatter에 훅 등록 ────────────────────────────────────────────
// 등록이 빠지면 막는 장치가 조용히 꺼지므로, 두 정의의 frontmatter를 직접 읽어 확인한다.
function registersGuard(src) {
  if (!src.startsWith('---')) return false
  const end = src.indexOf('\n---', 3)
  if (end === -1) return false
  const lines = src.slice(4, end).split('\n').map((l) => l.replace(/\r$/, ''))
  const start = lines.findIndex((l) => /^hooks:\s*$/.test(l))
  if (start === -1) return false
  const block = []
  for (const l of lines.slice(start + 1)) {
    if (/^\S/.test(l) && !l.startsWith('#')) break           // 다음 최상위 키
    block.push(l)
  }
  const pre = block.findIndex((l) => /^\s+PreToolUse:\s*$/.test(l))
  if (pre === -1) return false
  const matcher = block.findIndex((l, i) => i > pre && /^\s+-\s*matcher:\s*["']?Bash["']?\s*$/.test(l))
  if (matcher === -1) return false
  return block.some((l, i) => i > matcher && /^\s+(-\s*)?command:.*scripts\/guard-shared-head\.mjs/.test(l))
}

const OK_FM = [
  '---',
  'name: jam-x',
  'hooks:',
  '  PreToolUse:',
  '    - matcher: "Bash"',
  '      hooks:',
  '        - type: command',
  '          command: node "$CLAUDE_PROJECT_DIR/scripts/guard-shared-head.mjs"',
  'model: sonnet',
  '---',
  '본문',
].join('\n')
assert.equal(registersGuard(OK_FM), true)
assert.equal(registersGuard(OK_FM.replace('hooks:\n', '')), false, 'hooks 키가 없으면 실패')
assert.equal(registersGuard(OK_FM.replace('PreToolUse', 'PostToolUse')), false, 'PreToolUse가 아니면 실패')
assert.equal(registersGuard(OK_FM.replace('"Bash"', '"Read"')), false, 'matcher가 Bash가 아니면 실패')
assert.equal(registersGuard(OK_FM.replace('guard-shared-head.mjs', 'other.mjs')), false, '다른 스크립트면 실패')
assert.equal(registersGuard('본문만'), false)
// frontmatter 밖(본문)에 같은 글자가 있어도 등록으로 치지 않는다
assert.equal(registersGuard(OK_FM.replace(/hooks:[\s\S]*?model: sonnet/, 'model: sonnet') + '\nhooks:\n  PreToolUse:\n'), false)

for (const name of ['jam-reviewer', 'jam-designer']) {
  const src = readFileSync(join(REPO, '.claude', 'agents', `${name}.md`), 'utf8')
  assert.equal(registersGuard(src), true, `${name}.md frontmatter에 hooks.PreToolUse(matcher Bash) 훅 등록이 없다`)
}

console.log('guard-shared-head 테스트 통과')
