// scripts/ensure-hooks-path.sh 와 check-contract.mjs 의 git_config 검사 테스트 (티켓 20260921_0841)
//
// 이 저장소의 .git/config 는 건드리지 않는다. 훅 경로 보장 스크립트는 임시 저장소에서만 실행하고,
// check-contract 는 환경변수(GIT_CONFIG_COUNT·KEY·VALUE)로 값을 주입해 실제 설정 없이 검사한다.
// 정상 판정 규칙(이 저장소의 .githooks로 해석되면 상대·절대 모두 정상)은 두 구현이 같아야 하므로,
// 같은 표를 양쪽에 돌려 결과가 일치하는지 확인한다.
// 실행: node scripts/ensure-hooks-path.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
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
const setHooksPath = (dir, value) => run('git', ['config', 'core.hooksPath', value], dir)

const tmpDirs = []
const tmp = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(dir)
  return dir
}
function makeRepo({ withHooksDir = true, prefix = 'ensure-hooks-path-' } = {}) {
  const dir = tmp(prefix)
  run('git', ['init', '-q'], dir)
  if (withHooksDir) mkdirSync(join(dir, '.githooks'))
  return dir
}
// 링크드 워크트리가 있는 임시 저장소. 워크트리를 만들려면 커밋이 하나 필요하다.
function makeRepoWithLinkedWorktree() {
  const main = makeRepo()
  writeFileSync(join(main, '.githooks/pre-commit'), '#!/bin/sh\nexit 0\n')
  run('git', ['add', '.githooks/pre-commit'], main)
  const commit = run('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init'], main)
  assert.equal(commit.status, 0, commit.stderr)
  const linked = join(tmp('ensure-hooks-path-wt-'), 'linked')
  const add = run('git', ['worktree', 'add', '-q', linked], main)
  assert.equal(add.status, 0, add.stderr)
  return { main, linked }
}
const ensure = (dir, env) => run('bash', [ENSURE], dir, env)

// 이 저장소가 아닌 곳: 실제로 있는 다른 훅 폴더와, 사라진 폴더.
const otherHooksDir = join(tmp('ensure-hooks-path-other-'), '.githooks')
mkdirSync(otherHooksDir)
const goneHooksDir = join(tmp('ensure-hooks-path-gone-'), 'moved', '.githooks')

let passed = 0
let skipped = 0
const test = (name, fn) => {
  try {
    fn()
    passed++
  } catch (e) {
    console.error(`실패: ${name}\n${e.stack}`)
    process.exitCode = 1
  }
}

// ── 같은 표를 두 구현에 돌린다 ────────────────────────────────────────────────

// [이름, 저장소 루트를 받아 값을 돌려주는 함수, 정상 여부]
const kinds = [
  ['상대경로 .githooks', () => '.githooks', true],
  ['이 저장소의 .githooks를 가리키는 절대경로', (root) => join(root, '.githooks'), true],
  ['다른 곳을 가리키는 절대경로', () => otherHooksDir, false],
  ['사라진 절대경로', () => goneHooksDir, false],
  ['엉뚱한 상대경로', () => 'hooks', false],
  ['빈 값', () => '', false],
]

for (const [name, valueFor, normal] of kinds) {
  test(`ensure: ${name}은(는) ${normal ? '무출력·무변경' : '한 줄 출력하고 .githooks로 교정'}`, () => {
    const dir = makeRepo()
    mkdirSync(join(dir, 'hooks'))
    const value = valueFor(dir)
    setHooksPath(dir, value)
    const r = ensure(dir)
    assert.equal(r.status, 0)
    if (normal) {
      assert.equal(r.stdout, '')
      assert.equal(r.stderr, '')
      assert.equal(hooksPath(dir), value)
    } else {
      assert.equal(r.stdout.trim().split('\n').length, 1)
      assert.match(r.stdout, /훅 경로를 \.githooks 로 맞췄습니다/)
      assert.equal(hooksPath(dir), '.githooks')
      const again = ensure(dir)
      assert.equal(again.status, 0)
      assert.equal(again.stdout, '')
    }
  })

  test(`check-contract: ${name}은(는) ${normal ? '통과' : '실패'}`, () => {
    const r = run('node', [CHECK], ROOT, inject(valueFor(ROOT)))
    if (normal) {
      assert.doesNotMatch(r.stderr, /\[git_config\]/)
      assert.equal(r.status, 0, r.stderr)
    } else {
      assert.equal(r.status, 1)
      assert.match(r.stderr, /\[git_config\]/)
    }
  })
}

// ── scripts/ensure-hooks-path.sh ──────────────────────────────────────────────

test('값이 없으면 .githooks로 맞추고 한 줄만 출력한다', () => {
  const dir = makeRepo()
  const r = ensure(dir)
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  assert.match(r.stdout, /훅 경로를 \.githooks 로 맞췄습니다 \(이전 값: 없음\)/)
  assert.equal(hooksPath(dir), '.githooks')
})

test('교정할 때 이전 값을 알린다', () => {
  const dir = makeRepo()
  setHooksPath(dir, otherHooksDir)
  const r = ensure(dir)
  assert.equal(r.stdout.trim(), `훅 경로를 .githooks 로 맞췄습니다 (이전 값: ${otherHooksDir})`)
})

test('.githooks 폴더가 없으면 설정을 바꾸지 않고 종료 코드 0으로 끝난다', () => {
  const dir = makeRepo({ withHooksDir: false })
  const r = ensure(dir)
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  assert.equal(hooksPath(dir), '')
})

test('저장소 밖에서 실행해도 조용히 종료 코드 0으로 끝난다', () => {
  const dir = tmp('ensure-hooks-path-nogit-')
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

test('링크드 워크트리에서 값이 메인 체크아웃의 .githooks 절대경로이면 무출력·무변경이다', () => {
  const { main, linked } = makeRepoWithLinkedWorktree()
  const value = join(main, '.githooks')
  setHooksPath(main, value)
  for (const dir of [linked, main]) {
    const r = ensure(dir)
    assert.equal(r.status, 0)
    assert.equal(r.stdout, '', `${dir}에서 출력이 있었다`)
    assert.equal(hooksPath(dir), value)
  }
})

test('링크드 워크트리에서 값이 상대경로 .githooks이면 무출력이다', () => {
  const { main, linked } = makeRepoWithLinkedWorktree()
  setHooksPath(main, '.githooks')
  const r = ensure(linked)
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  assert.equal(hooksPath(linked), '.githooks')
})

test('링크드 워크트리에서 값이 다른 곳을 가리키면 교정한다', () => {
  const { main, linked } = makeRepoWithLinkedWorktree()
  setHooksPath(main, otherHooksDir)
  const r = ensure(linked)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /훅 경로를 \.githooks 로 맞췄습니다/)
  assert.equal(hooksPath(linked), '.githooks')
})

// 한글 폴더명이 든 경로는 설정에는 NFC로, git이 알려주는 경로는 NFD로 적힌다(이 PC의 실제 값이 그랬다).
// 파일 시스템이 두 표기를 같은 이름으로 취급할 때만(APFS) 재현되므로 아니면 건너뛴다.
const nfdName = '훅경로-'.normalize('NFD')
test('한글 폴더명 경로는 NFC·NFD 표기가 달라도 같은 폴더로 본다 (ensure)', () => {
  const dir = makeRepo({ prefix: nfdName })
  const nfc = join(dir, '.githooks').normalize('NFC')
  if (!existsSync(nfc)) { skipped++; return }
  setHooksPath(dir, nfc)
  const r = ensure(dir)
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  assert.equal(hooksPath(dir), nfc)
})

// ── scripts/check-contract.mjs 의 git_config 검사 ─────────────────────────────

const check = (value) => run('node', [CHECK], ROOT, inject(value))

test('check-contract: 값이 비어 있으면 pre-commit이 안 돈다고 알리고 고치는 명령을 준다', () => {
  const r = check('')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /core\.hooksPath가 비어 있습니다/)
  assert.match(r.stderr, /pre-commit·pre-push가 돌지 않습니다/)
  assert.match(r.stderr, /git config core\.hooksPath \.githooks/)
})

test('check-contract: 이 저장소의 .githooks가 아닌 절대경로이면 그렇게 알리고 고치는 명령을 준다', () => {
  for (const value of ['/tmp/x', otherHooksDir, goneHooksDir]) {
    const r = check(value)
    assert.equal(r.status, 1, value)
    assert.match(r.stderr, /이 저장소의 \.githooks가 아닌 절대경로입니다/, value)
    assert.match(r.stderr, new RegExp(`실제 ${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), value)
    assert.doesNotMatch(r.stderr, /비어 있습니다/, value)
    assert.doesNotMatch(r.stderr, /선언과 다릅니다/, value)
    assert.match(r.stderr, /git config core\.hooksPath \.githooks/, value)
  }
})

test('check-contract: 그 밖의 값(엉뚱한 상대경로)이면 선언과 다르다고 알린다', () => {
  const r = check('hooks')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /core\.hooksPath가 선언과 다릅니다 \(선언 \.githooks · 실제 hooks\)/)
  assert.doesNotMatch(r.stderr, /절대경로입니다/)
  assert.doesNotMatch(r.stderr, /비어 있습니다/)
  assert.match(r.stderr, /git config core\.hooksPath \.githooks/)
})

test('check-contract: 메인 체크아웃의 .githooks 절대경로도 통과한다', () => {
  // ROOT가 링크드 워크트리여도 메인 체크아웃 루트는 git 공용 디렉터리의 상위다.
  const common = run('git', ['rev-parse', '--git-common-dir'], ROOT).stdout.trim()
  const r = check(join(dirname(resolve(ROOT, common)), '.githooks'))
  assert.doesNotMatch(r.stderr, /\[git_config\]/)
  assert.equal(r.status, 0, r.stderr)
})

test('check-contract: 한글 폴더명 경로는 NFC·NFD 표기가 달라도 통과한다', () => {
  let tried = 0
  for (const form of ['NFC', 'NFD']) {
    const value = join(ROOT, '.githooks').normalize(form)
    if (!existsSync(value)) continue
    tried++
    const r = check(value)
    assert.doesNotMatch(r.stderr, /\[git_config\]/, form)
    assert.equal(r.status, 0, `${form}: ${r.stderr}`)
  }
  if (tried === 0) skipped++
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
if (!process.exitCode) console.log(`통과: ${passed}개${skipped ? ` (파일 시스템 조건이 안 맞아 건너뜀: ${skipped}개)` : ''}`)
