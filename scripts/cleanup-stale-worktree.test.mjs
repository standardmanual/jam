// cleanup-stale-worktree.sh 상태 확인 검사 테스트 (티켓 20260922_1056)
//
// 같은 review 브랜치를 점유한 워크트리 3종(깨끗함/미커밋/미푸시)을 만들어 깨끗한 것만
// 제거되고 나머지 둘은 거부되며 남아 있는지 확인한다. GIT_* 변수와 전역 설정은 격리해
// 실제 저장소를 건드리지 않는다.
// 실행: node scripts/cleanup-stale-worktree.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'cleanup-stale-worktree.sh')

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
const runScript = (branch, cwd) => spawnSync('bash', [SCRIPT, branch], { cwd, encoding: 'utf8', env: env() })

const root = mkdtempSync(join(tmpdir(), 'cleanup-stale-worktree-'))
try {
  const originDir = join(root, 'origin.git')
  git(['init', '-q', '--bare', originDir], root)

  const main = join(root, 'main')
  git(['init', '-q', main], root)
  git(['-c', 'user.name=x', '-c', 'user.email=dev@jam.internal', 'commit', '-q', '--allow-empty', '-m', 'init'], main)
  git(['remote', 'add', 'origin', originDir], main)
  git(['push', '-q', 'origin', 'HEAD:refs/heads/staging'], main)

  // (a) 깨끗함: 미커밋 변경이 없고 HEAD가 origin에 push돼 있으면 제거된다
  const cleanWt = join(root, 'wt-clean')
  git(['worktree', 'add', '-q', '-b', 'claude/jamwork-clean', cleanWt, 'HEAD'], main)
  git(['push', '-q', 'origin', 'claude/jamwork-clean'], cleanWt)
  let r = runScript('claude/jamwork-clean', main)
  assert.equal(r.status, 0, `깨끗한 워크트리는 제거돼야 한다:\n${r.stdout}${r.stderr}`)
  assert.match(r.stdout, /제거/)
  let list = git(['worktree', 'list', '--porcelain'], main)
  assert.ok(!list.includes(cleanWt), '제거 후 워크트리 목록에 남아 있으면 안 된다')

  // (b) 미커밋: 변경사항이 있으면 거부되고(종료 코드 2) 워크트리가 남는다
  const dirtyWt = join(root, 'wt-dirty')
  git(['worktree', 'add', '-q', '-b', 'claude/jamwork-dirty', dirtyWt, 'HEAD'], main)
  git(['push', '-q', 'origin', 'claude/jamwork-dirty'], dirtyWt)
  writeFileSync(join(dirtyWt, 'untracked.txt'), 'wip')
  r = runScript('claude/jamwork-dirty', main)
  assert.equal(r.status, 2, `미커밋 변경이 있으면 거부해야 한다:\n${r.stdout}${r.stderr}`)
  assert.match(r.stderr, /거부.*미커밋/)
  list = git(['worktree', 'list', '--porcelain'], main)
  assert.ok(list.includes(dirtyWt), '거부됐으면 워크트리가 남아 있어야 한다')

  // (c) 미푸시: origin에 이 브랜치가 없으면(=push 안 함) 거부되고 워크트리가 남는다
  const unpushedWt = join(root, 'wt-unpushed')
  git(['worktree', 'add', '-q', '-b', 'claude/jamwork-unpushed', unpushedWt, 'HEAD'], main)
  r = runScript('claude/jamwork-unpushed', main)
  assert.equal(r.status, 2, `미푸시 커밋이 있으면 거부해야 한다:\n${r.stdout}${r.stderr}`)
  assert.match(r.stderr, /거부.*미푸시/)
  list = git(['worktree', 'list', '--porcelain'], main)
  assert.ok(list.includes(unpushedWt), '거부됐으면 워크트리가 남아 있어야 한다')

  // (d) 점유한 워크트리가 없으면 할 일이 없어 종료 코드 0을 낸다
  r = runScript('claude/jamwork-no-such-branch', main)
  assert.equal(r.status, 0, `점유한 워크트리가 없으면 통과해야 한다:\n${r.stdout}${r.stderr}`)
  assert.match(r.stdout, /점유한 워크트리 없음/)

  // (e) git 명령이 실패하는 상황(저장소 밖 실행): 조용히 흘러가지 않고 종료 코드 1로 멈춘다 (티켓 20260922_1214)
  const outside = join(root, 'not-a-repo')
  mkdirSync(outside)
  r = spawnSync('bash', [SCRIPT, 'claude/jamwork-clean'], {
    cwd: outside,
    encoding: 'utf8',
    env: env({ GIT_CEILING_DIRECTORIES: root }),
  })
  assert.equal(r.status, 1, `저장소 밖 실행은 종료 코드 1이어야 한다:\n${r.stdout}${r.stderr}`)
  assert.match(r.stderr, /git 저장소/)
  assert.doesNotMatch(r.stdout, /점유한 워크트리 없음|제거/)

  // 스크립트 자체가 set -euo pipefail 이다
  assert.match(readFileSync(SCRIPT, 'utf8'), /^set -euo pipefail$/m)

  console.log('통과: cleanup-stale-worktree 상태 확인')
} finally {
  rmSync(root, { recursive: true, force: true })
}
