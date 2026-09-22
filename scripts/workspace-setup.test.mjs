// workspace-setup.sh cleanup 브랜치 정리 테스트 (티켓 20260921_2309)
//
// 임시 저장소에 브랜치 4종(연결된 worktree-wf / 연결 안 된 worktree-wf / 병합된 jamwork /
// 미병합 jamwork)을 만들어 보존·삭제가 맞는지 확인한다. 이어서 cleanup --remote가 목록만
// 출력하고, --yes가 있을 때만 실제로 지우는지 확인한다. GIT_* 변수와 전역 설정은 격리해
// 실제 저장소를 건드리지 않는다.
// 실행: node scripts/workspace-setup.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

  const r = runCleanup(main)
  assert.equal(r.status, 0, `cleanup 실패:\n${r.stdout}${r.stderr}`)

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
} finally {
  rmSync(root, { recursive: true, force: true })
}
