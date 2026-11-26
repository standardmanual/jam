// cleanup-stale-worktree.sh 상태 확인 검사 테스트 (티켓 20260922_1056)
//
// 같은 review 브랜치를 점유한 워크트리 2종(깨끗함/미커밋)을 만들어 깨끗한 것만
// 브랜치가 풀리고 미커밋은 거부되는지 확인한다. GIT_* 변수와 전역 설정은 격리해
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

  // (a) 깨끗함: 변경이 없으면 push 여부와 무관하게 브랜치만 풀리고 작업 폴더·커밋은 남는다 (티켓 20261126_2309)
  const cleanWt = join(root, 'wt-clean')
  git(['worktree', 'add', '-q', '-b', 'claude/jamwork-clean', cleanWt, 'HEAD'], main)
  git(['-c', 'user.name=x', '-c', 'user.email=dev@jam.internal', 'commit', '-q', '--allow-empty', '-m', '로컬 전용 커밋'], cleanWt)
  const cleanHead = git(['rev-parse', 'HEAD'], cleanWt)
  let r = runScript('claude/jamwork-clean', main)
  assert.equal(r.status, 0, `깨끗한 워크트리는 브랜치가 풀려야 한다:\n${r.stdout}${r.stderr}`)
  assert.match(r.stdout, /브랜치 해제/)
  assert.equal(git(['rev-parse', 'claude/jamwork-clean'], main), cleanHead, '커밋은 브랜치에 남아야 한다')
  let list = git(['worktree', 'list', '--porcelain'], main)
  assert.ok(list.includes(cleanWt), '작업 폴더는 지우지 않는다')
  assert.ok(!list.includes('branch refs/heads/claude/jamwork-clean'), '브랜치 점유가 풀려야 한다')
  git(['checkout', '-q', 'claude/jamwork-clean'], main)
  git(['checkout', '-q', '--detach'], main)

  // (b) 미커밋: 변경사항이 있으면 거부되고(종료 코드 2) 브랜치를 그대로 잡고 있다
  const dirtyWt = join(root, 'wt-dirty')
  git(['worktree', 'add', '-q', '-b', 'claude/jamwork-dirty', dirtyWt, 'HEAD'], main)
  writeFileSync(join(dirtyWt, 'untracked.txt'), 'wip')
  r = runScript('claude/jamwork-dirty', main)
  assert.equal(r.status, 2, `미커밋 변경이 있으면 거부해야 한다:\n${r.stdout}${r.stderr}`)
  assert.match(r.stderr, /거부.*미커밋/)
  list = git(['worktree', 'list', '--porcelain'], main)
  assert.ok(list.includes('branch refs/heads/claude/jamwork-dirty'), '거부됐으면 브랜치를 그대로 잡고 있어야 한다')

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
  assert.doesNotMatch(r.stdout, /점유한 워크트리 없음|브랜치 해제/)

  // 스크립트 자체가 set -euo pipefail 이다
  assert.match(readFileSync(SCRIPT, 'utf8'), /^set -euo pipefail$/m)

  console.log('통과: cleanup-stale-worktree 상태 확인')
} finally {
  rmSync(root, { recursive: true, force: true })
}
