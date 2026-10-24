// workspace-setup.sh cleanup 브랜치 정리 테스트 (티켓 20260921_2309)
//
// 임시 저장소에 브랜치 4종(연결된 worktree-wf / 연결 안 된 worktree-wf / 병합된 jamwork /
// 미병합 jamwork)을 만들어 보존·삭제가 맞는지 확인한다. 이어서 cleanup --remote가 목록만
// 출력하고, --yes가 있을 때만 실제로 지우는지 확인한다. 워크트리 정리는 wf_*·gate-*만 제거하고
// 앱 세션 워크트리는 보존하는지, 판정이 workspace-cleanup.log에 남는지 확인한다(티켓 20261001_1143).
// 허용 목록 경계(밖의 위치·하위 폴더·대소문자·비슷한 이름·공백 경로)는 보존되는지도 확인한다(티켓 20261024_1053).
// GIT_* 변수와 전역 설정은 격리해 실제 저장소를 건드리지 않는다.
// 실행: node scripts/workspace-setup.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'workspace-setup.sh')

const env = (extra = {}) => {
  const e = {}
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && !k.startsWith('JAM_')) e[k] = v
  return { ...e, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...extra }
}
const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: env() })
  assert.equal(r.status, 0, `git ${args.join(' ')} 실패:\n${r.stderr}`)
  return r.stdout.trim()
}
const runCleanup = (cwd, extraArgs = []) =>
  spawnSync('bash', [SCRIPT, 'cleanup', ...extraArgs], { cwd, encoding: 'utf8', env: env() })

const branchExists = (cwd, name) => git(['branch', '--list', name], cwd).length > 0

const root = mkdtempSync(join(tmpdir(), 'workspace-setup-'))
try {
  const originDir = join(root, 'origin.git')
  git(['init', '-q', '--bare', originDir], root)

  const main = join(root, 'main')
  git(['init', '-q', main], root)
  git(['-c', 'user.name=x', '-c', 'user.email=dev@jam.internal', 'commit', '-q', '--allow-empty', '-m', 'init'], main)
  git(['remote', 'add', 'origin', originDir], main)
  git(['push', '-q', 'origin', 'HEAD:refs/heads/staging'], main)

  // (a) 연결된 worktree-wf_*: 워크트리를 만들고 미커밋 변경을 남겨 워크트리 루프에서 보존시킨다.
  //     연결돼 있으므로 브랜치 루프에서도 보존돼야 한다.
  const connectedWt = join(root, 'wt-connected')
  git(['worktree', 'add', '-q', '-b', 'worktree-wf_connected', connectedWt, 'HEAD'], main)
  writeFileSync(join(connectedWt, 'untracked.txt'), 'wip')

  // (b) 연결 안 된 worktree-wf_*: 워크트리 없이 브랜치만 존재 → 지워져야 한다.
  git(['branch', 'worktree-wf_disconnected'], main)

  // (c) 병합된 claude/jamwork-*: origin/staging과 같은 커밋 → 지워져야 한다.
  git(['branch', 'claude/jamwork-merged'], main)

  // (d) 미병합 claude/jamwork-*: origin/staging에 없는 커밋 → 보존돼야 한다.
  const unmergedWt = join(root, 'wt-unmerged-src')
  git(['worktree', 'add', '-q', unmergedWt, 'HEAD'], main)
  git(['-c', 'user.name=x', '-c', 'user.email=dev@jam.internal', 'commit', '-q', '--allow-empty', '-m', 'ahead'], unmergedWt)
  const unmergedHead = git(['rev-parse', 'HEAD'], unmergedWt)
  git(['branch', 'claude/jamwork-unmerged', unmergedHead], main)
  git(['worktree', 'remove', '--force', unmergedWt], main)

  // (e) 작업 커밋이 쌓인 채 워크트리만 제거된 worktree-wf_*: origin 어디에도 없고 제목도
  //     staging 이력에 없다 → 보존되고 이유가 출력돼야 한다 (티켓 20260922_1432).
  // (f) 조상 관계만 끊긴 worktree-wf_*: 제목이 staging 이력('init')에 그대로 있다 → 지워져야 한다.
  const commitOnBranch = (branch, message) => {
    const wt = join(root, `wt-src-${branch}`)
    git(['worktree', 'add', '-q', '-b', branch, wt, 'HEAD'], main)
    git(['-c', 'user.name=x', '-c', 'user.email=dev@jam.internal', 'commit', '-q', '--allow-empty', '-m', message], wt)
    git(['worktree', 'remove', '--force', wt], main)
  }
  commitOnBranch('worktree-wf_work', 'wip: 임시 커밋')
  commitOnBranch('worktree-wf_rewritten', 'init')

  const r = runCleanup(main)
  assert.equal(r.status, 0, `cleanup 실패:\n${r.stdout}${r.stderr}`)

  assert.ok(branchExists(main, 'worktree-wf_work'), '작업 커밋이 있는 worktree-wf_*는 보존돼야 한다')
  assert.match(r.stdout, /^보존\(작업 커밋 있음\): worktree-wf_work wip: 임시 커밋$/m)
  assert.ok(!branchExists(main, 'worktree-wf_rewritten'), '제목이 staging 이력에 있는 worktree-wf_*는 지워져야 한다')
  assert.ok(!/^제거.*worktree-wf_work/m.test(r.stdout), '보존한 브랜치가 제거 줄로 출력되면 안 된다')

  assert.ok(branchExists(main, 'worktree-wf_connected'), '연결된 worktree-wf_*는 보존돼야 한다')
  assert.ok(!branchExists(main, 'worktree-wf_disconnected'), '연결 안 된 worktree-wf_*는 지워져야 한다')
  assert.ok(!branchExists(main, 'claude/jamwork-merged'), '병합된 claude/jamwork-*는 지워져야 한다')
  assert.ok(branchExists(main, 'claude/jamwork-unmerged'), '미병합 claude/jamwork-*는 보존돼야 한다')

  // 세션 훅은 `grep -E "^제거"`로 거른다 — "제거"로 시작하는 줄만 이 두 삭제를 가리켜야 한다.
  const removedLines = r.stdout.split('\n').filter((l) => /^제거/.test(l))
  assert.ok(removedLines.some((l) => l.includes('worktree-wf_disconnected')), removedLines.join('\n'))
  assert.ok(removedLines.some((l) => l.includes('claude/jamwork-merged')), removedLines.join('\n'))
  assert.ok(!removedLines.some((l) => l.includes('worktree-wf_connected')), removedLines.join('\n'))
  assert.ok(!removedLines.some((l) => l.includes('claude/jamwork-unmerged')), removedLines.join('\n'))

  console.log('통과: workspace-setup cleanup 로컬 브랜치 정리')

  // ── 워크트리 정리: 허용 목록(wf_*·gate-*)만 제거하고 앱 세션 워크트리는 보존 (티켓 20261001_1143) ──
  // 앱이 만든 세션 워크트리(.claude/worktrees/app-test, 브랜치 claude/app-test)는 변경이 없고 staging에
  // 병합돼 있어도 지워지면 안 된다. 허용 목록 안에서는 기존 조건(미커밋 변경 없음 + staging 병합)이 그대로 적용된다.
  const cleanupLog = join(main, '.git', 'workspace-cleanup.log')
  const wtPath = (name) => join(main, '.claude', 'worktrees', name)
  const addWt = (name, ...extra) => git(['worktree', 'add', '-q', ...extra, wtPath(name), 'HEAD'], main)
  addWt('wf_test', '-b', 'worktree-wf_test')
  addWt('gate-abc1234', '--detach')
  addWt('app-test', '-b', 'claude/app-test')
  addWt('wf_dirty', '-b', 'worktree-wf_dirty')
  writeFileSync(join(wtPath('wf_dirty'), 'untracked.txt'), 'wip')
  addWt('wf_ahead', '-b', 'worktree-wf_ahead')
  git(['-c', 'user.name=x', '-c', 'user.email=dev@jam.internal', 'commit', '-q', '--allow-empty', '-m', 'ahead'], wtPath('wf_ahead'))
  addWt('wf_locked', '--detach')
  git(['worktree', 'lock', '--reason', 'test', wtPath('wf_locked')], main)

  const wr = runCleanup(main)
  assert.equal(wr.status, 0, `cleanup 실패:\n${wr.stdout}${wr.stderr}`)

  assert.ok(!existsSync(wtPath('wf_test')), 'staging에 병합된 깨끗한 wf_* 워크트리는 제거돼야 한다')
  assert.ok(!existsSync(wtPath('gate-abc1234')), 'staging에 병합된 깨끗한 gate-* 워크트리는 제거돼야 한다')
  assert.ok(existsSync(wtPath('app-test')), '앱 세션 워크트리는 변경이 없고 병합돼 있어도 보존돼야 한다')
  assert.ok(branchExists(main, 'claude/app-test'), '앱 세션 워크트리의 브랜치는 보존돼야 한다')
  assert.ok(existsSync(wtPath('wf_dirty')), '미커밋 변경이 있는 wf_*는 보존돼야 한다')
  assert.ok(existsSync(wtPath('wf_ahead')), 'staging에 병합되지 않은 wf_*는 보존돼야 한다')
  assert.match(wr.stdout, /^제거\(staging에 병합됨\): .*[/]wf_test$/m)
  assert.match(wr.stdout, /^제거\(staging에 병합됨\): .*[/]gate-abc1234$/m)
  assert.match(wr.stdout, /^보존\(정리 대상 경로 아님\): .*[/]app-test$/m)
  assert.match(wr.stdout, /^보존\(미커밋 변경 있음\): .*[/]wf_dirty$/m)
  assert.match(wr.stdout, /^보존\(아직 staging에 병합되지 않음\): .*[/]wf_ahead$/m)
  // 잠겨서 제거가 거부되면 "제거"로 보고하지 않고, git이 알려 준 사유를 함께 적는다(git 메시지는 로캘마다 달라 내용은 보지 않는다).
  assert.ok(existsSync(wtPath('wf_locked')), '잠긴 wf_*는 제거되지 않는다')
  assert.match(wr.stdout, /^제거 실패: .*[/]wf_locked \(사유: (?!확인 못함).+\)$/m)

  // 판정 기록: git 공용 디렉터리의 workspace-cleanup.log에 워크트리별로 시각과 함께 남는다.
  const stamp = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}`
  const logText = readFileSync(cleanupLog, 'utf8')
  assert.match(logText, new RegExp(`^${stamp} 제거\\(staging에 병합됨\\): .*[/]wf_test$`, 'm'))
  assert.match(logText, new RegExp(`^${stamp} 제거\\(staging에 병합됨\\): .*[/]gate-abc1234$`, 'm'))
  assert.match(logText, new RegExp(`^${stamp} 보존\\(정리 대상 경로 아님\\): .*[/]app-test$`, 'm'))
  assert.match(logText, new RegExp(`^${stamp} 보존\\(미커밋 변경 있음\\): .*[/]wf_dirty$`, 'm'))
  assert.match(logText, new RegExp(`^${stamp} 제거 실패: .*[/]wf_locked \\(사유: (?!확인 못함).+\\)$`, 'm'))

  // 다른 워크트리(앱 세션)에서 연 세션도 같은 대상을 정리한다. 현재 워크트리와 메인 체크아웃은 건드리지 않는다.
  addWt('wf_sibling', '--detach')
  const fromWt = runCleanup(wtPath('app-test'))
  assert.equal(fromWt.status, 0, `워크트리에서 cleanup 실패:\n${fromWt.stdout}${fromWt.stderr}`)
  assert.ok(!existsSync(wtPath('wf_sibling')), '앱 세션 워크트리에서 실행해도 형제 wf_*는 제거돼야 한다')
  assert.ok(existsSync(wtPath('app-test')), '실행 중인 앱 세션 워크트리는 그대로여야 한다')
  assert.ok(!fromWt.stdout.split('\n').some((l) => l.endsWith(`: ${main}`)), '메인 체크아웃은 판정 대상이 아니다')
  assert.match(readFileSync(cleanupLog, 'utf8'), new RegExp(`^${stamp} 제거\\(staging에 병합됨\\): .*[/]wf_sibling$`, 'm'))

  // 로그는 최근 500줄만 유지한다.
  const old = Array.from({ length: 600 }, (_, i) => `old-${String(i).padStart(3, '0')}`)
  writeFileSync(cleanupLog, old.join('\n') + '\n')
  const trimmed = runCleanup(main)
  assert.equal(trimmed.status, 0, `cleanup 실패:\n${trimmed.stdout}${trimmed.stderr}`)
  const trimmedLines = readFileSync(cleanupLog, 'utf8').trimEnd().split('\n')
  assert.equal(trimmedLines.length, 500, `로그가 500줄로 줄어야 한다: ${trimmedLines.length}줄`)
  assert.ok(!trimmedLines.includes('old-000'), '오래된 줄이 먼저 버려져야 한다')
  assert.ok(trimmedLines.some((l) => /보존\(정리 대상 경로 아님\): .*[/]app-test$/.test(l)), '이번 실행의 판정 줄은 남아야 한다')

  console.log('통과: workspace-setup cleanup 워크트리 허용 목록·판정 기록')

  // ── 허용 목록 경계 (티켓 20261024_1053): 변경이 없고 staging에 병합돼 이전 규칙이라면 지워졌을 워크트리도
  // 이름이나 위치가 허용 목록 밖이면 보존돼야 한다. 대조군 wf_ok·gate-ok는 같은 실행에서 제거된다.
  const outside = join(root, 'elsewhere', 'wf_outside')
  const nested = 'wf_nest/sub'
  const lookalikes = ['WF_upper', 'Gate-upper', 'wfx', 'gate_x']
  const spaced = 'wf_ space'
  addWt('wf_ok', '--detach')
  addWt('gate-ok', '--detach')
  for (const name of [nested, ...lookalikes, spaced]) addWt(name, '--detach')
  git(['worktree', 'add', '-q', '--detach', outside, 'HEAD'], main)

  const edge = runCleanup(main)
  assert.equal(edge.status, 0, `cleanup 실패:\n${edge.stdout}${edge.stderr}`)
  assert.ok(!existsSync(wtPath('wf_ok')), '대조군 wf_ok는 제거돼야 한다')
  assert.ok(!existsSync(wtPath('gate-ok')), '대조군 gate-ok는 제거돼야 한다')
  const edgeLines = edge.stdout.split('\n')
  const keptNotTarget = (suffix) =>
    edgeLines.some((l) => l.startsWith('보존(정리 대상 경로 아님): ') && l.endsWith(`/${suffix}`))
  assert.ok(existsSync(outside) && keptNotTarget('elsewhere/wf_outside'), '.claude/worktrees 밖의 wf_*는 보존돼야 한다')
  assert.ok(existsSync(wtPath(nested)) && keptNotTarget(nested), '하위 폴더의 워크트리는 보존돼야 한다')
  for (const name of lookalikes) {
    assert.ok(existsSync(wtPath(name)) && keptNotTarget(name), `대소문자·접두가 다른 이름(${name})은 보존돼야 한다`)
  }
  // 공백이 든 경로(⑥): 지워지지 않는 것이 핵심이다. 현재는 `awk '{print $2}'`가 첫 토큰에서 잘라 `.../wf_`로 읽고,
  // 그 경로의 HEAD를 못 읽어 «건너뜀»으로 끝난다. awk를 고치면 이 줄의 형태가 달라지니 그때 이 단언을 함께 정한다.
  assert.ok(existsSync(wtPath(spaced)), '이름에 공백이 든 워크트리는 지워지면 안 된다')
  assert.match(edge.stdout, /^건너뜀\(HEAD 조회 실패\): .*[/]wf_$/m)
  assert.ok(!edgeLines.some((l) => /^제거/.test(l) && /[/]wf_( space)?$/.test(l)), '공백 경로가 제거 줄로 나오면 안 된다')

  console.log('통과: workspace-setup cleanup 허용 목록 경계(위치·깊이·대소문자·비슷한 이름·공백)')

  // ── 원격 정리: 목록만 출력 → --yes일 때만 실제 삭제 ──────────────────────────
  const remoteSrc = join(root, 'remote-src')
  git(['clone', '-q', originDir, remoteSrc], root)
  git(['checkout', '-q', '-b', 'claude/jamwork-remote-merged', 'origin/staging'], remoteSrc)
  git(['push', '-q', 'origin', 'claude/jamwork-remote-merged'], remoteSrc)
  git(['checkout', '-q', '-b', 'claude/jamwork-remote-unmerged', 'origin/staging'], remoteSrc)
  git(['-c', 'user.name=x', '-c', 'user.email=dev@jam.internal', 'commit', '-q', '--allow-empty', '-m', 'ahead'], remoteSrc)
  git(['push', '-q', 'origin', 'claude/jamwork-remote-unmerged'], remoteSrc)

  const listOnly = runCleanup(main, ['--remote'])
  assert.equal(listOnly.status, 0, `cleanup --remote 실패:\n${listOnly.stdout}${listOnly.stderr}`)
  assert.match(listOnly.stdout, /정리 대상.*claude\/jamwork-remote-merged/s)
  assert.doesNotMatch(listOnly.stdout, /claude\/jamwork-remote-unmerged/)

  let remoteRefs = git(['ls-remote', '--heads', originDir], main)
  assert.ok(remoteRefs.includes('claude/jamwork-remote-merged'), '--remote만으로는 지워지면 안 된다')

  const withYes = runCleanup(main, ['--remote', '--yes'])
  assert.equal(withYes.status, 0, `cleanup --remote --yes 실패:\n${withYes.stdout}${withYes.stderr}`)
  assert.match(withYes.stdout, /제거\(원격.*claude\/jamwork-remote-merged/)

  remoteRefs = git(['ls-remote', '--heads', originDir], main)
  assert.ok(!remoteRefs.includes('claude/jamwork-remote-merged'), '--yes면 병합된 원격 브랜치가 지워져야 한다')
  assert.ok(remoteRefs.includes('claude/jamwork-remote-unmerged'), '미병합 원격 브랜치는 보존돼야 한다')

  console.log('통과: workspace-setup cleanup --remote 목록/삭제 분리')

  // ── link-secrets: 시크릿 3종을 메인 체크아웃에서 워크트리로 연결 (티켓 20260924_0625) ──
  mkdirSync(join(main, 'jam-web'), { recursive: true })
  writeFileSync(join(main, '.mcp.json'), '{}')
  writeFileSync(join(main, 'jam-web', '.env.local'), 'K=V')
  // .vercel은 일부러 만들지 않는다 → "원본 없음"으로 건너뛰어야 한다.

  const secretWt = join(root, 'wt-secrets')
  git(['worktree', 'add', '-q', '--detach', secretWt, 'HEAD'], main)

  const run = (cmd, arg) => spawnSync('bash', [SCRIPT, cmd, arg], { cwd: main, encoding: 'utf8', env: env() })

  const ls = run('link-secrets', secretWt)
  assert.equal(ls.status, 0, `link-secrets 실패:\n${ls.stdout}${ls.stderr}`)
  assert.ok(lstatSync(join(secretWt, '.mcp.json')).isSymbolicLink(), '.mcp.json은 심볼릭 링크여야 한다')
  assert.equal(readFileSync(join(secretWt, 'jam-web', '.env.local'), 'utf8'), 'K=V')
  assert.ok(!existsSync(join(secretWt, '.vercel')), '원본이 없는 항목은 만들지 않는다')
  assert.match(ls.stdout, /원본 없음.*\.vercel/)

  const again = run('link-secrets', secretWt)
  assert.equal(again.status, 0)
  assert.match(again.stdout, /이미 존재함.*\.mcp\.json/)

  const onMain = run('link-secrets', main)
  assert.equal(onMain.status, 0)
  assert.match(onMain.stdout, /메인 체크아웃/)

  // `link`(아현 경로)는 시크릿을 연결하지 않는다 — 아현에게 DB 실행 권한이 없기 때문이다.
  const plainWt = join(root, 'wt-plain')
  git(['worktree', 'add', '-q', '--detach', plainWt, 'HEAD'], main)
  mkdirSync(join(main, 'jam-web', 'node_modules'), { recursive: true })
  const plain = run('link', plainWt)
  assert.equal(plain.status, 0, `link 실패:\n${plain.stdout}${plain.stderr}`)
  assert.ok(!existsSync(join(plainWt, '.mcp.json')), 'link는 .mcp.json을 연결하면 안 된다')
  assert.ok(!existsSync(join(plainWt, 'jam-web', '.env.local')), 'link는 .env.local을 연결하면 안 된다')

  // 아현 프롬프트를 만드는 워크플로가 link-secrets를 부르지 않는다.
  const workflow = readFileSync(join(dirname(SCRIPT), '..', '.claude', 'workflows', 'jam-work.js'), 'utf8')
  assert.ok(!workflow.includes('link-secrets'), 'jam-work.js(아현 경로)가 link-secrets를 부르면 안 된다')

  console.log('통과: workspace-setup link-secrets 연결·아현 경로 분리')
} finally {
  rmSync(root, { recursive: true, force: true })
}
