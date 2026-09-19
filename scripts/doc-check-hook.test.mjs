// .githooks/pre-commit 의 문서 링크 검사 연동 테스트 (티켓 20260919_1245)
//
// 임시 저장소에 훅·엔진·설정을 복사하고 그 저장소에만 hooksPath를 지정해 실제 `git commit`을
// 돌린다. 이 저장소의 hooksPath 설정은 건드리지 않는다.
// 실행: node scripts/doc-check-hook.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CFG = {
  schemaVersion: '1',
  scope: { include: ['docs/'], exclude: [] },
  externalPrefixes: [],
  codeSpanRoots: ['docs/'],
}

const tmpDirs = []
const run = (cmd, args, cwd, env = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
const write = (dir, rel, body) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), body)
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'doc-check-hook-'))
  tmpDirs.push(dir)
  run('git', ['init', '-q'], dir)
  run('git', ['config', 'user.email', 't@example.com'], dir)
  run('git', ['config', 'user.name', 'tester'], dir)
  mkdirSync(join(dir, '.githooks'))
  copyFileSync(join(ROOT, '.githooks/pre-commit'), join(dir, '.githooks/pre-commit'))
  chmodSync(join(dir, '.githooks/pre-commit'), 0o755)
  mkdirSync(join(dir, 'scripts'))
  copyFileSync(join(ROOT, 'scripts/doc-check.mjs'), join(dir, 'scripts/doc-check.mjs'))
  write(dir, 'scripts/doc-check.config.json', JSON.stringify(CFG))
  write(dir, 'docs/a.md', '본문\n')
  write(dir, 'docs/b.md', '다른 문서\n')
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

test('없는 경로로 링크를 추가한 커밋은 차단된다', () => {
  const dir = makeRepo()
  write(dir, 'docs/a.md', '본문\n[x](nope.md)\n')
  const r = commit(dir)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /차단\(pre-commit\): 문서 검사 오류/)
  assert.match(r.stderr, /링크: 새로 추가한 링크는/)
  assert.doesNotMatch(r.stderr, /DOCUMENT_SCHEMA/)
  assert.equal(run('git', ['rev-list', '--count', 'HEAD'], dir).stdout.trim(), '1', '커밋이 만들어지지 않아야 한다')
})

test('필드 오류는 링크 안내 대신 frontmatter 안내를 출력한다', () => {
  const dir = makeRepo()
  write(dir, 'scripts/doc-check.config.json', JSON.stringify({ ...CFG, severity: { field: 'error' } }))
  write(dir, 'docs/c.md', '본문만 있는 문서\n')
  const r = commit(dir)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /차단\(pre-commit\): 문서 검사 오류/)
  assert.match(r.stderr, /frontmatter: .*DOCUMENT_SCHEMA\.md/)
  assert.doesNotMatch(r.stderr, /링크: 새로 추가한 링크는/)
})

test('올바른 링크를 추가한 커밋은 통과한다', () => {
  const dir = makeRepo()
  write(dir, 'docs/a.md', '본문\n[x](b.md)\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
})

test('기존에 깨진 링크만 있는 문서의 다른 줄을 고치는 커밋은 통과한다', () => {
  const dir = makeRepo()
  write(dir, 'docs/a.md', '옛 [깨짐](gone.md)\n두번째\n')
  run('git', ['add', '-A'], dir)
  run('git', ['commit', '-q', '--no-verify', '-m', 'broken base'], dir)
  write(dir, 'docs/a.md', '옛 [깨짐](gone.md)\n고친 줄\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
})

test('다른 문서가 링크하는 파일을 git mv 하는 커밋은 차단, 참조도 고치면 통과', () => {
  const dir = makeRepo()
  write(dir, 'docs/a.md', '[b](b.md)\n')
  run('git', ['add', '-A'], dir)
  run('git', ['commit', '-q', '--no-verify', '-m', 'link'], dir)
  mkdirSync(join(dir, 'docs/sub'))
  run('git', ['mv', 'docs/b.md', 'docs/sub/b.md'], dir)
  let r = run('git', ['commit', '-q', '-m', 'move'], dir)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /이동·삭제된 파일을 가리킵니다/)
  write(dir, 'docs/a.md', '[b](sub/b.md)\n')
  r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
})

test('엔진 자체 실패(설정 파싱 오류)는 경고만 내고 커밋이 통과한다', () => {
  const dir = makeRepo()
  write(dir, 'scripts/doc-check.config.json', '{ 깨진')
  write(dir, 'docs/a.md', '본문\n[x](nope.md)\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /검사기가 스스로 실패/)
  assert.match(r.stderr, /종료 코드 2/)
})

test('엔진 파일이 문법 오류로 죽어도(node 기본 종료 코드 1) 위반으로 오인하지 않고 통과한다', () => {
  const dir = makeRepo()
  write(dir, 'scripts/doc-check.mjs', 'const = ;\n')
  write(dir, 'docs/a.md', '본문\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /비정상 종료/)
})

test('엔진 파일이 없으면 검사를 건너뛰고 통과한다', () => {
  const dir = makeRepo()
  rmSync(join(dir, 'scripts/doc-check.mjs'))
  write(dir, 'docs/a.md', '본문\n[x](nope.md)\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
})

test('JAM_SKIP_DOCLINT=1 우회는 검사를 건너뛴다', () => {
  const dir = makeRepo()
  write(dir, 'docs/a.md', '본문\n[x](nope.md)\n')
  const r = commit(dir, { JAM_SKIP_DOCLINT: '1' })
  assert.equal(r.status, 0, r.stderr)
})

test('백틱 경로·frontmatter 문제는 경고만 하고 통과한다', () => {
  const dir = makeRepo()
  write(dir, 'docs/a.md', '본문 `docs/none.md`\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /경고/)
})

for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
console.log(`doc-check 훅 테스트 ${process.exitCode ? '실패 있음' : '통과'} (${passed}건 통과)`)
