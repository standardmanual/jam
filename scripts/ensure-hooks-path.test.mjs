// scripts/ensure-hooks-path.sh 와 check-contract.mjs 의 git_config 검사 테스트 (티켓 20260921_0841)
//
// 이 저장소의 .git/config 는 건드리지 않는다. 훅 경로 보장 스크립트는 임시 저장소에서만 실행하고,
// check-contract 는 환경변수(GIT_CONFIG_COUNT·KEY·VALUE)로 값을 주입해 실제 설정 없이 검사한다.
// 실행: node scripts/ensure-hooks-path.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENSURE = join(ROOT, 'scripts/ensure-hooks-path.sh')
const CHECK = join(ROOT, 'scripts/check-contract.mjs')

// 호출한 셸의 GIT_* 변수와 전역·시스템 설정이 결과에 끼어들지 않게 한다.
const cleanEnv = () => {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
}
const inject = (value) => ({
  ...cleanEnv(), GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: value,
})

const run = (cmd, args, cwd, env = cleanEnv()) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env })
const hooksPath = (dir) => run('git', ['config', '--get', 'core.hooksPath'], dir).stdout.trim()

const tmpDirs = []
function makeRepo({ withHooksDir = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ensure-hooks-path-'))
  tmpDirs.push(dir)
  run('git', ['init', '-q'], dir)
  if (withHooksDir) mkdirSync(join(dir, '.githooks'))
  return dir
}
const ensure = (dir, env) => run('bash', [ENSURE], dir, env)

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

// ── scripts/ensure-hooks-path.sh ──────────────────────────────────────────────

test('값이 비어 있으면 .githooks로 맞추고 한 줄만 출력한다', () => {
  const dir = makeRepo()
  const r = ensure(dir)
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  assert.match(r.stdout, /훅 경로를 \.githooks 로 맞췄습니다 \(이전 값: 없음\)/)
  assert.equal(hooksPath(dir), '.githooks')
})

test('이미 정상이면 아무것도 출력하지 않는다', () => {
  const dir = makeRepo()
  ensure(dir)
  const r = ensure(dir)
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, '')
  assert.equal(hooksPath(dir), '.githooks')
})

test('절대경로가 남아 있으면 상대경로로 고치고 이전 값을 알린다', () => {
  const dir = makeRepo()
  run('git', ['config', 'core.hooksPath', join(dir, '.githooks')], dir)
  const r = ensure(dir)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /이전 값: .*\.githooks\)/)
  assert.equal(hooksPath(dir), '.githooks')
  const again = ensure(dir)
  assert.equal(again.stdout, '')
  assert.equal(again.status, 0)
})

test('.githooks 폴더가 없으면 설정을 바꾸지 않고 종료 코드 0으로 끝난다', () => {
  const dir = makeRepo({ withHooksDir: false })
  const r = ensure(dir)
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  assert.equal(hooksPath(dir), '')
})

test('저장소 밖에서 실행해도 조용히 종료 코드 0으로 끝난다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ensure-hooks-path-nogit-'))
  tmpDirs.push(dir)
  const r = ensure(dir, { ...cleanEnv(), GIT_CEILING_DIRECTORIES: dirname(dir) })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

test('다른 범위의 설정이 덮어쓰면 실효값과 출처를 붙여 알리고 종료 코드는 0이다', () => {
  const dir = makeRepo()
  const r = ensure(dir, inject('/tmp/x'))
  assert.equal(r.status, 0)
  assert.match(r.stdout, /실효값이 \/tmp\/x 입니다/)
  assert.match(r.stdout, /file:.*config\t\.githooks/)
  assert.match(r.stdout, /command line:\t\/tmp\/x/)
})

// ── scripts/check-contract.mjs 의 git_config 검사 ─────────────────────────────

const check = (value) => run('node', [CHECK], ROOT, inject(value))

test('check-contract: 값이 .githooks이면 git_config 위반이 없다', () => {
  const r = check('.githooks')
  assert.doesNotMatch(r.stderr, /\[git_config\]/)
  assert.equal(r.status, 0, r.stderr)
})

test('check-contract: 값이 비어 있으면 실패하고 pre-commit이 안 돈다고 알린다', () => {
  const r = check('')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /\[git_config\]/)
  assert.match(r.stderr, /core\.hooksPath가 비어 있습니다/)
  assert.match(r.stderr, /pre-commit·pre-push가 돌지 않습니다/)
  assert.match(r.stderr, /git config core\.hooksPath \.githooks/)
})

test('check-contract: 절대경로이면 실패하고 다른 체크아웃의 훅이 실행된다고 알린다', () => {
  const r = check('/tmp/x')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /core\.hooksPath가 절대경로입니다 \(선언 \.githooks · 실제 \/tmp\/x\)/)
  assert.match(r.stderr, /워크트리에서 커밋해도 이 경로에 있는 훅이 실행됩니다/)
  assert.doesNotMatch(r.stderr, /pre-commit·pre-push가 돌지 않습니다/)
  assert.match(r.stderr, /git config core\.hooksPath \.githooks/)
})

test('check-contract: 절대경로가 아닌 다른 값이면 선언과 다르다고 알린다', () => {
  const r = check('hooks')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /core\.hooksPath가 선언과 다릅니다 \(선언 \.githooks · 실제 hooks\)/)
  assert.doesNotMatch(r.stderr, /절대경로입니다/)
})

// ── .claude/settings.json 에 연결한 명령 문자열 ──────────────────────────────

test('settings.json의 SessionStart 명령은 정상 상태에서 출력 없이 종료 코드 0이다', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, '.claude/settings.json'), 'utf8'))
  const commands = cfg.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command))
  const cmd = commands.find((c) => c.includes('ensure-hooks-path.sh'))
  assert.ok(cmd, 'ensure-hooks-path.sh 명령이 SessionStart에 있어야 한다')
  // 값이 이미 .githooks로 보이도록 주입하므로 이 저장소의 설정은 쓰지 않는다.
  const r = spawnSync('sh', ['-c', cmd], {
    cwd: ROOT, encoding: 'utf8', env: { ...inject('.githooks'), CLAUDE_PROJECT_DIR: ROOT },
  })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
if (!process.exitCode) console.log(`통과: ${passed}개`)
