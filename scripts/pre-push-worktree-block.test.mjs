// pre-push 워크트리 차단 검사 테스트 (티켓 20260921_2304)
//
// 워크트리 두 개(이름이 wf_로 시작하는 것과 아닌 것)와 브랜치 이름 두 종류(claude/jamwork-*와
// 일반)를 만들어 staging push가 조건별로 막히거나 통과하는지 확인한다. GIT_* 변수와 전역
// 설정은 격리해 실제 저장소를 건드리지 않는다.
// 실행: node scripts/pre-push-worktree-block.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '.githooks', 'pre-push')
const ZERO = '0'.repeat(40)

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
// 기준 방어(guard the bar) 검사는 이 테스트의 관심사가 아니므로 origin 리모트 없이 둔다 —
// remote_sha가 0이면 그 검사는 비교 기준을 찾지 못해 스스로 건너뛴다.
const runHook = (cwd, localRef, localSha) =>
  spawnSync('bash', [HOOK], {
    cwd,
    encoding: 'utf8',
    env: env({ JAM_SKIP_LINT: '1' }),
    input: `${localRef} ${localSha} refs/heads/staging ${ZERO}\n`,
  })
// 리뷰 브랜치(claude/jamwork-*) push — verify 게이트 검사용 (티켓 20260922_1755)
const runReviewHook = (cwd, branchRef, localSha, remoteSha = ZERO) =>
  spawnSync('bash', [HOOK], {
    cwd,
    encoding: 'utf8',
    env: env({ JAM_SKIP_LINT: '1' }),
    input: `refs/heads/${branchRef} ${localSha} refs/heads/${branchRef} ${remoteSha}\n`,
  })

const root = mkdtempSync(join(tmpdir(), 'pre-push-worktree-block-'))
try {
  const main = join(root, 'main')
  git(['init', '-q', main], root)
  git(['-c', 'user.name=x', '-c', 'user.email=dev@jam.internal', 'commit', '-q', '--allow-empty', '-m', 'init'], main)
  git(['config', 'extensions.worktreeConfig', 'true'], main)
  const headSha = git(['rev-parse', 'HEAD'], main)

  // (a) 폴더 이름이 wf_로 시작하는 링크드 워크트리에서 staging push → 차단
  const wfWorktree = join(root, 'wf_test123')
  git(['worktree', 'add', '-q', '-b', 'some-branch', wfWorktree, 'HEAD'], main)
  let r = runHook(wfWorktree, 'refs/heads/some-branch', headSha)
  assert.equal(r.status, 1, 'wf_ 워크트리에서 staging push는 막혀야 한다')
  assert.match(r.stderr, /에이전트 작업 워크트리/)

  // (b) wf_가 아닌 이름의 링크드 워크트리는 통과한다
  const normalWorktree = join(root, 'normal-worktree')
  git(['worktree', 'add', '-q', '-b', 'another-branch', normalWorktree, 'HEAD'], main)
  r = runHook(normalWorktree, 'refs/heads/another-branch', headSha)
  assert.equal(r.status, 0, `wf_가 아닌 워크트리는 통과해야 한다:\n${r.stderr}`)

  // (c) 메인 트리라도 로컬 브랜치가 claude/jamwork-*이면 막힌다
  git(['checkout', '-q', '-b', 'claude/jamwork-9999-test'], main)
  r = runHook(main, 'refs/heads/claude/jamwork-9999-test', headSha)
  assert.equal(r.status, 1, 'claude/jamwork-* 브랜치의 staging push는 막혀야 한다')
  assert.match(r.stderr, /리뷰 브랜치/)

  // (d) git push origin HEAD:staging 형식(local_ref가 HEAD)이어도 현재 브랜치 이름으로 판정한다
  r = runHook(main, 'HEAD', headSha)
  assert.equal(r.status, 1, 'HEAD:staging 형식도 현재 브랜치 이름으로 판정해 막아야 한다')

  // (e) 메인 트리에서 일반 브랜치면 통과한다
  git(['checkout', '-q', '-b', 'regular-branch'], main)
  r = runHook(main, 'refs/heads/regular-branch', headSha)
  assert.equal(r.status, 0, `일반 브랜치의 메인 트리는 통과해야 한다:\n${r.stderr}`)

  // (f)(g) 리뷰 브랜치(claude/jamwork-*) push 시 verify 게이트 — wf_* 링크드 워크트리에서는
  // verify.sh를 실행하지 않고 CI에 맡긴다(티켓 20260922_1755). 가짜 verify.sh가 마커 파일을
  // 만들도록 해서 실행 여부를 확인한다.
  mkdirSync(join(main, 'scripts'), { recursive: true })
  writeFileSync(
    join(main, 'scripts', 'verify.sh'),
    '#!/bin/bash\ntouch "$(cd "$(dirname "$0")/.." && pwd)/VERIFY_RAN"\nexit 0\n',
  )
  chmodSync(join(main, 'scripts', 'verify.sh'), 0o755)
  mkdirSync(join(main, 'jam-web', 'node_modules'), { recursive: true })
  writeFileSync(join(main, 'jam-web', 'node_modules', '.gitkeep'), '')
  git(['add', '-A'], main)
  git(['-c', 'user.name=x', '-c', 'user.email=dev@jam.internal', 'commit', '-q', '-m', 'verify 게이트 픽스처 추가'], main)
  const verifyHeadSha = git(['rev-parse', 'HEAD'], main)

  // (f) wf_* 링크드 워크트리에서 claude/jamwork-* push → verify.sh를 실행하지 않고 종료 0
  const wfVerifyWorktree = join(root, 'wf_verify123')
  git(['worktree', 'add', '-q', '-b', 'claude/jamwork-f-test', wfVerifyWorktree, 'HEAD'], main)
  r = runReviewHook(wfVerifyWorktree, 'claude/jamwork-f-test', verifyHeadSha)
  assert.equal(r.status, 0, `wf_ 워크트리의 리뷰 브랜치 push는 verify 없이 통과해야 한다:\n${r.stderr}`)
  assert.match(r.stderr, /CI\(verify 워크플로\)가 검증합니다/)
  assert.equal(
    existsSync(join(wfVerifyWorktree, 'VERIFY_RAN')),
    false,
    'wf_ 워크트리는 verify.sh를 실행하지 않아야 한다',
  )

  // (g) wf_가 아닌 이름의 워크트리에서 claude/jamwork-* push → verify.sh(가짜)를 실행한다
  const normalVerifyWorktree = join(root, 'normal-verify-worktree')
  git(['worktree', 'add', '-q', '-b', 'claude/jamwork-g-test', normalVerifyWorktree, 'HEAD'], main)
  r = runReviewHook(normalVerifyWorktree, 'claude/jamwork-g-test', verifyHeadSha)
  assert.equal(r.status, 0, `wf_가 아닌 워크트리는 verify.sh(가짜, 종료 0) 실행 후 통과해야 한다:\n${r.stderr}`)
  assert.equal(
    existsSync(join(normalVerifyWorktree, 'VERIFY_RAN')),
    true,
    'wf_가 아닌 워크트리는 verify.sh를 실행해야 한다',
  )

  // (h) 브랜치 삭제 push(local_sha가 전부 0)는 wf_가 아닌 워크트리에서도 verify.sh를 실행하지
  // 않고 종료 0 (티켓 20261014_1442). (g)와 같은 조건에서 local_sha만 0으로 바꾼 사례다.
  const deleteVerifyWorktree = join(root, 'delete-verify-worktree')
  git(['worktree', 'add', '-q', '-b', 'claude/jamwork-h-test', deleteVerifyWorktree, 'HEAD'], main)
  r = runReviewHook(deleteVerifyWorktree, 'claude/jamwork-h-test', ZERO, verifyHeadSha)
  assert.equal(r.status, 0, `삭제 push는 verify 없이 통과해야 한다:\n${r.stderr}`)
  assert.match(r.stderr, /브랜치 삭제 push/)
  assert.equal(
    existsSync(join(deleteVerifyWorktree, 'VERIFY_RAN')),
    false,
    '삭제 push는 verify.sh를 실행하지 않아야 한다',
  )

  console.log('통과: pre-push 워크트리 차단·리뷰 브랜치 verify 게이트·삭제 push 건너뜀 검사')
} finally {
  rmSync(root, { recursive: true, force: true })
}
