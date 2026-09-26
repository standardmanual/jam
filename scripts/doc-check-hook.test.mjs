// .githooks/pre-commit 의 문서 링크 검사 연동 테스트 (티켓 20260919_1245)
//
// 임시 저장소에 훅·엔진·설정을 복사하고 그 저장소에만 hooksPath를 지정해 실제 `git commit`을
// 돌린다. 이 저장소의 hooksPath 설정은 건드리지 않는다.
// 실행: node scripts/doc-check-hook.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
// 훅(pre-push → verify.sh) 안에서 이 테스트가 돌면 git이 GIT_DIR 등을 물려준다. 임시 저장소에서 실행하는
// git 명령이 그 값을 받으면 임시 저장소가 아니라 실제 저장소 설정에 쓰므로(티켓 20260921_1116 사고: core.bare,
// core.hooksPath, user.name 오염) 물려받은 GIT_*는 버린다. 호출부가 넘긴 env는 그대로 쓴다.
const inheritedEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const run = (cmd, args, cwd, env = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...inheritedEnv(), ...env } })
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

// ── ⑨ 설계 원본 폴더 동결 (티켓 20260921_2311) ─────────────────────────────────
// docs/agents/workflow/ 는 README.md를 뺀 나머지가 신규·수정·이름변경·삭제 모두 막힌
// 기록이다. 이 파일이 이미 pre-commit·doc-check 통합 테스트 인프라(임시 저장소 + 실제
// git commit)를 갖추고 있어 여기에 같이 둔다.

test('docs/agents/workflow/ 안 파일을 새로 추가하면 차단된다', () => {
  const dir = makeRepo()
  write(dir, 'docs/agents/workflow/02_결정사항.md', '내용\n')
  const r = commit(dir)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /동결된 기록입니다 — README\.md 외 파일은/)
  assert.equal(run('git', ['rev-list', '--count', 'HEAD'], dir).stdout.trim(), '1', '커밋이 만들어지지 않아야 한다')
})

test('docs/agents/workflow/README.md 수정은 통과한다', () => {
  const dir = makeRepo()
  write(dir, 'docs/agents/workflow/README.md', '배너\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
})

test('docs/agents/workflow/ 안 파일 삭제는 차단된다', () => {
  const dir = makeRepo()
  write(dir, 'docs/agents/workflow/02_결정사항.md', '내용\n')
  run('git', ['add', '-A'], dir)
  run('git', ['commit', '-q', '--no-verify', '-m', 'seed'], dir)
  run('git', ['rm', '-q', 'docs/agents/workflow/02_결정사항.md'], dir)
  const r = run('git', ['commit', '-q', '-m', 'delete'], dir)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /삭제할 수 없습니다/)
})

test('docs/agents/workflow/ 밖 파일 수정은 동결과 무관하게 통과한다', () => {
  const dir = makeRepo()
  write(dir, 'docs/a.md', '본문\n고친 줄\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
})

// ── ⑨ 블록이 무력화된 훅을 check-contract가 잡는가 (티켓 20260922_1401) ─────────────────────
// 임시 저장소에 훅·check-contract·최소 contract.json만 복사해 그 저장소 안에서 검사기를 돌린다.
// 실제 저장소의 계약·훅은 읽지도 고치지도 않는다.
const readHook = () => readFileSync(join(ROOT, '.githooks/pre-commit'), 'utf8')

// ⑨ 동결 블록(`"docs/agents/workflow/"*)` 분기부터 그 case를 닫는 `;;`까지)을 줄마다 주석 처리한다.
// 문자열은 주석 안에 그대로 남으므로 옛 방식(문자열 존재 대조)은 이 훅을 통과시킨다.
function commentOutFreezeBlock(hook) {
  const lines = hook.split('\n')
  const start = lines.findIndex((l) => l.includes('"docs/agents/workflow/"*)'))
  assert.ok(start >= 0, '훅에서 ⑨ 블록을 찾지 못했다')
  let end = -1
  let sawEsac = false
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*esac\s*$/.test(lines[i])) sawEsac = true
    if (sawEsac && /^\s*;;\s*$/.test(lines[i])) {
      end = i
      break
    }
  }
  assert.ok(end > start, '⑨ 블록의 끝을 찾지 못했다')
  return lines.map((l, i) => (i >= start && i <= end ? `# ${l}` : l)).join('\n')
}

function makeContractRepo({ hook = readHook(), spec = { frozen_prefix: 'docs/agents/workflow/', exempt_file: 'docs/agents/workflow/README.md' } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'contract-freeze-test-'))
  tmpDirs.push(dir)
  run('git', ['init', '-q'], dir)
  write(dir, '.githooks/pre-commit', hook)
  write(dir, 'docs/agents/contract.json', JSON.stringify({ workflow_freeze: spec, deploy_gate: { rollback_sql_required_from: 1, public_routes: [] } }))
  mkdirSync(join(dir, 'scripts'))
  copyFileSync(join(ROOT, 'scripts/check-contract.mjs'), join(dir, 'scripts/check-contract.mjs'))
  copyFileSync(join(ROOT, 'scripts/deploy-gate.mjs'), join(dir, 'scripts/deploy-gate.mjs'))
  return dir
}
const checkContract = (dir) => run('node', ['scripts/check-contract.mjs'], dir)

test('⑨ 블록을 주석 처리한 훅은 동결 폴더 파일 커밋을 막지 못한다(재현)', () => {
  const dir = makeRepo()
  write(dir, '.githooks/pre-commit', commentOutFreezeBlock(readHook()))
  write(dir, 'docs/agents/workflow/02_결정사항.md', '내용\n')
  const r = commit(dir)
  assert.equal(r.status, 0, '무력화된 훅이면 동결 폴더 파일이 통과해야 재현이다')
})

test('check-contract: 온전한 훅은 동결 실동작 검사를 통과한다', () => {
  const r = checkContract(makeContractRepo())
  assert.equal(r.status, 0, r.stderr)
})

test('check-contract: ⑨ 블록을 주석 처리한 훅은 위반으로 잡는다', () => {
  const dir = makeContractRepo({ hook: commentOutFreezeBlock(readHook()) })
  const r = checkContract(dir)
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stderr, /\[workflow_freeze\]/)
  assert.match(r.stderr, /무력화/)
})

test('check-contract: workflow_freeze 절에서 frozen_prefix 키를 빼면 위반으로 잡는다', () => {
  const r = checkContract(makeContractRepo({ spec: { exempt_file: 'docs/agents/workflow/README.md' } }))
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stderr, /\[workflow_freeze\]/)
  assert.match(r.stderr, /동결 대상 경로가 없습니다/)
})

test('check-contract: workflow_freeze 절에서 exempt_file 키를 빼면 위반으로 잡는다', () => {
  const r = checkContract(makeContractRepo({ spec: { frozen_prefix: 'docs/agents/workflow/' } }))
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stderr, /예외 파일이 없습니다/)
})

// ── probeWorkflowFreeze의 나머지 두 분기 (티켓 20260926_1410) ────────────────────────────────
// 훅이 예외 파일(README.md)까지 막으면 위반으로, 임시 저장소를 못 만들면 위반이 아니라 참고로 남긴다.
// 둘 다 임시 저장소 안에서만 돈다 — 이 저장소의 훅·설정은 읽기만 한다.

// README.md 예외 조건을 «항상 참»으로 바꿔 예외 파일까지 막는 훅을 만든다. 예외 파일 경로 문자열은
// 훅에 그대로 남아 있어 문자열 대조 검사(exempt_file 존재)는 통과하고 실동작 검사만 이를 잡는다.
function blockExemptFileToo(hook) {
  const condition = '[ "$f" != "docs/agents/workflow/README.md" ]'
  assert.ok(hook.includes(condition), '훅에서 README.md 예외 조건을 찾지 못했다')
  return hook.replace(condition, `${condition} || true`)
}

test('check-contract: 예외 파일(README.md)까지 막는 훅은 위반으로 잡는다', () => {
  const dir = makeContractRepo({ hook: blockExemptFileToo(readHook()) })
  const r = checkContract(dir)
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stderr, /\[workflow_freeze\]/)
  assert.match(r.stderr, /동결 예외 파일\(docs\/agents\/workflow\/README\.md\) 커밋이 막혔습니다/)
  // 동결 파일 커밋을 막지 못한 경우의 «무력화» 문구와는 구분되어야 한다
  assert.doesNotMatch(r.stderr, /무력화/)
})

test('check-contract: 임시 저장소를 만들지 못하면 위반이 아니라 참고로 건너뛴다', () => {
  const dir = makeContractRepo()
  // 저장소 루트 조회(`rev-parse`)만 통과시키고 나머지(`init` 포함)는 실패하는 가짜 git만 PATH에 둔다.
  // node는 절대경로로 부른다.
  const fakeBin = mkdtempSync(join(tmpdir(), 'contract-nogit-'))
  tmpDirs.push(fakeBin)
  write(fakeBin, 'git', '#!/bin/sh\nif [ "$1" = "rev-parse" ]; then pwd; exit 0; fi\nexit 1\n')
  chmodSync(join(fakeBin, 'git'), 0o755)
  const r = run(process.execPath, ['scripts/check-contract.mjs'], dir, { PATH: fakeBin })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /참고: 임시 저장소를 만들지 못해 동결 실동작 검사를 건너뜁니다\./)
  assert.doesNotMatch(r.stderr, /\[workflow_freeze\]/)
})

test('check-contract: 임시 폴더를 만들지 못하면 종료하지 않고 참고로 건너뛴다(티켓 20260926_1535)', () => {
  const dir = makeContractRepo()
  // TMPDIR를 없는 경로로 가리켜 mkdtempSync가 던지게 한다. 임시 저장소(dir) 안에서만 돈다.
  const r = run(process.execPath, ['scripts/check-contract.mjs'], dir, { TMPDIR: join(dir, '없는-임시-경로') })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /참고: 임시 폴더를 만들지 못해 동결 실동작 검사를 건너뜁니다\./)
  assert.doesNotMatch(r.stderr, /\[workflow_freeze\]/)
})

// ── 현황판 스크립트만 바뀐 커밋 경고 (티켓 20260918_1251) — 경고만 하고 차단하지 않는다 ────────────
const DASH_SCRIPT = 'scripts/ticket-dashboard.mjs'
const DASH_DOC = '.claude/skills/jam-work/references/dashboard-format.md'

test('ticket-dashboard.mjs만 바뀐 커밋은 경고를 내되 통과한다', () => {
  const dir = makeRepo()
  write(dir, DASH_SCRIPT, '// 수정\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /경고\(pre-commit\): scripts\/ticket-dashboard\.mjs를 고쳤는데 dashboard-format\.md가/)
})

test('ticket-dashboard.mjs와 dashboard-format.md를 함께 고친 커밋은 경고가 없다', () => {
  const dir = makeRepo()
  write(dir, DASH_SCRIPT, '// 수정\n')
  write(dir, DASH_DOC, '형식\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stderr, /dashboard-format/)
})

test('현황판과 무관한 커밋에는 현황판 경고가 없다', () => {
  const dir = makeRepo()
  write(dir, 'docs/a.md', '본문\n고친 줄\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stderr, /ticket-dashboard/)
})

test('dashboard-format.md만 바뀐 커밋에도 경고가 없다', () => {
  const dir = makeRepo()
  write(dir, DASH_DOC, '형식\n')
  const r = commit(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stderr, /ticket-dashboard/)
})

// ── INDEX.md 병합 충돌 재생성 안내 (티켓 20260921_1412) ────────────────────────────────────
test('INDEX.md가 낡아 차단될 때 병합 충돌 재생성 안내가 나온다', () => {
  const dir = makeRepo()
  copyFileSync(join(ROOT, 'scripts/gen-doc-index.mjs'), join(dir, 'scripts/gen-doc-index.mjs'))
  write(dir, 'docs/specs/INDEX.md', '<<<<<<< HEAD\n충돌 표시\n=======\n>>>>>>> other\n')
  const r = commit(dir)
  assert.notEqual(r.status, 0, r.stderr)
  assert.match(r.stderr, /병합 충돌로 docs\/specs\/INDEX\.md에 충돌 표시가 남았다면/)
  assert.match(r.stderr, /node scripts\/gen-doc-index\.mjs/)
})

for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
console.log(`doc-check 훅 테스트 ${process.exitCode ? '실패 있음' : '통과'} (${passed}건 통과)`)
