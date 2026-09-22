// docs/agents/contract.json의 mirror_docs 규칙과 check-contract.mjs가 pre-commit 훅에서
// 실제로 경고/차단을 내는지 확인한다 (티켓 20260922_1030).
//
// 배경: docs/agents/workflow/agents/*.md 9개는 .claude/agents/*.md(또는 orchestrator.md)
// 정의를 사람이 옮겨 적은 요약본이라, 원본만 고치고 미러를 놓치는 드리프트가 재발했다.
// mode=warn(초기)은 경고만 하고 통과시키고, mode=block(정착 후)은 위반으로 처리해 커밋을
// 막는다. 반대 방향(미러만 수정)은 mode와 무관하게 항상 경고만 한다.
//
// 임시 저장소에 훅·검사기·최소 contract.json을 복사하고 실제 git commit을 돌린다. 이 저장소의
// hooksPath 설정은 건드리지 않는다.
// 실행: node scripts/mirror-docs-hook.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = 'src/original.md'
const MIRROR = 'mirror/summary.md'

const contractJson = (mode) => JSON.stringify({
  mirror_docs: {
    mode,
    pairs: [{ source: SOURCE, mirror: MIRROR }],
  },
})

const tmpDirs = []
// 훅(pre-push → verify.sh) 안에서 이 테스트가 돌면 git이 GIT_DIR 등을 물려준다. 임시 저장소에서
// 실행하는 git 명령이 그 값을 받으면 임시 저장소가 아니라 실제 저장소 설정에 쓰므로(티켓
// 20260921_1116 사고 재발 방지) 물려받은 GIT_*는 버린다.
const inheritedEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const run = (cmd, args, cwd, env = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...inheritedEnv(), ...env } })
const write = (dir, rel, body) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), body)
}

function makeRepo(mode) {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-docs-hook-'))
  tmpDirs.push(dir)
  run('git', ['init', '-q'], dir)
  run('git', ['config', 'user.email', 't@example.com'], dir)
  run('git', ['config', 'user.name', 'tester'], dir)
  mkdirSync(join(dir, '.githooks'))
  copyFileSync(join(ROOT, '.githooks/pre-commit'), join(dir, '.githooks/pre-commit'))
  chmodSync(join(dir, '.githooks/pre-commit'), 0o755)
  mkdirSync(join(dir, 'scripts'))
  copyFileSync(join(ROOT, 'scripts/check-contract.mjs'), join(dir, 'scripts/check-contract.mjs'))
  write(dir, 'docs/agents/contract.json', contractJson(mode))
  write(dir, SOURCE, '원본 v1\n')
  write(dir, MIRROR, '미러 v1\n')
  run('git', ['add', '-A'], dir)
  run('git', ['commit', '-q', '--no-verify', '-m', 'base'], dir)
  run('git', ['config', 'core.hooksPath', '.githooks'], dir)
  return dir
}

const commit = (dir, env = {}) => {
  run('git', ['add', '-A'], dir)
  return run('git', ['commit', '-q', '-m', 'test'], dir, env)
}

let passed = 0
const test = (name, fn) => {
  try {
    fn()
    passed++
  } catch (e) {
    console.error(`실패: ${name}\n${e.stack}`)
    process.exitCode = 1
  }
}

test('mode=warn: 원본만 고치면 경고만 하고 통과한다', () => {
  const dir = makeRepo('warn')
  write(dir, SOURCE, '원본 v2\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /경고: \[mirror_docs\]/)
  assert.match(r.stderr, /src\/original\.md/)
})

test('mode=warn: 원본과 미러를 함께 고치면 경고 없이 통과한다', () => {
  const dir = makeRepo('warn')
  write(dir, SOURCE, '원본 v2\n')
  write(dir, MIRROR, '미러 v2\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stderr, /mirror_docs/)
})

test('mode=warn: 미러만 고쳐도 경고만 하고 통과한다 (반대 방향)', () => {
  const dir = makeRepo('warn')
  write(dir, MIRROR, '미러 v2\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /경고: \[mirror_docs\]/)
  assert.match(r.stderr, /mirror\/summary\.md/)
})

test('mode=block: 원본만 고치면 커밋이 차단된다', () => {
  const dir = makeRepo('block')
  write(dir, SOURCE, '원본 v2\n')
  const r = commit(dir)
  assert.notEqual(r.status, 0, 'block 모드에서는 차단되어야 한다')
  assert.match(r.stderr, /mirror_docs/)
  assert.equal(run('git', ['rev-list', '--count', 'HEAD'], dir).stdout.trim(), '1', '커밋이 만들어지지 않아야 한다')
})

test('mode=block: 원본과 미러를 함께 고치면 통과한다', () => {
  const dir = makeRepo('block')
  write(dir, SOURCE, '원본 v2\n')
  write(dir, MIRROR, '미러 v2\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
})

test('mode=block: 미러만 고쳐도 차단 없이 경고만 하고 통과한다 (반대 방향)', () => {
  const dir = makeRepo('block')
  write(dir, MIRROR, '미러 v2\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /경고: \[mirror_docs\]/)
})

for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
console.log(`mirror_docs 훅 테스트 ${process.exitCode ? '실패 있음' : '통과'} (${passed}건 통과)`)
