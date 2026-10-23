// 대화형 클라우드 세션 git 작성자 보장 테스트 (티켓 20261002_0734, 방법 B)
// 임시 저장소에 가짜 contract.json을 두고 scripts/ensure-session-author.sh를 환경 변수 조합별로 실행한다.
// GIT_* 변수와 전역 설정은 격리해 실제 저장소를 건드리지 않는다. 소유자 이메일도 가짜 값을 쓴다.
// 실행: node scripts/ensure-session-author.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ensure-session-author.sh')
const ROUTINE_EMAIL = 'noreply@anthropic.com'
const OWNER = { name: 'owner-name', email: 'owner@example.test' }
const ENTRYPOINTS = ['remote_mobile', 'remote_web']

const contract = (extra = {}) => ({
  routine_commit_restriction: { author_email: ROUTINE_EMAIL, allowed_prefix: 'docs/operations/reports/' },
  interactive_session_author: { name: OWNER.name, email: OWNER.email, entrypoints: ENTRYPOINTS },
  ...extra,
})

// 사람이 붙은 클라우드 세션의 신호 — 이 조합일 때만 작성자를 바꾼다
const ATTENDED_ENV = {
  CLAUDE_CODE_REMOTE: 'true',
  CLAUDE_CODE_SESSION_ATTENDED: '1',
  CLAUDE_CODE_USER_EMAIL: OWNER.email,
  CLAUDE_CODE_ENTRYPOINT: 'remote_mobile',
}

const base = mkdtempSync(join(tmpdir(), 'ensure-session-author-'))

const cleanEnv = (extra) => {
  const e = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_') && !k.startsWith('CLAUDE_') && !k.startsWith('CCR_') && !k.startsWith('JAM_')) e[k] = v
  }
  return { ...e, HOME: base, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...extra }
}
const git = (args) => {
  const r = spawnSync('git', args, { cwd: base, encoding: 'utf8', env: cleanEnv({}) })
  assert.equal(r.status, 0, `git ${args.join(' ')} 실패:\n${r.stderr}`)
  return r.stdout.trim()
}
const effectiveEmail = () => {
  const out = git(['var', 'GIT_AUTHOR_IDENT'])
  return out.match(/<([^>]*)>/)?.[1]
}
const resetAuthor = (email = ROUTINE_EMAIL, name = 'Claude') => {
  git(['config', '--local', 'user.name', name])
  git(['config', '--local', 'user.email', email])
}
const writeContract = (obj) => {
  mkdirSync(join(base, 'docs', 'agents'), { recursive: true })
  writeFileSync(join(base, 'docs', 'agents', 'contract.json'), JSON.stringify(obj, null, 2))
}
const run = (env) => {
  const r = spawnSync('bash', [SCRIPT], { cwd: base, encoding: 'utf8', env: cleanEnv(env) })
  assert.equal(r.status, 0, `종료 코드는 항상 0이어야 한다:\n${r.stderr}`)
  return r
}

try {
  git(['init', '-q', base])
  writeContract(contract())

  // 1. 사람이 붙은 클라우드 세션: 작성자를 사용자 계정으로 맞춘다
  resetAuthor()
  let r = run(ATTENDED_ENV)
  assert.equal(effectiveEmail(), OWNER.email, '대화형 세션이면 작성자 이메일이 사용자 계정으로 바뀌어야 한다')
  assert.equal(git(['config', '--local', 'user.name']), OWNER.name)
  assert.match(r.stdout, /맞췄습니다/, '바꾸면 한 줄로 알려야 한다')

  // 2. 두 번째 실행은 이미 사용자 작성자이므로 아무것도 출력하지 않는다
  r = run(ATTENDED_ENV)
  assert.equal(r.stdout, '', '이미 맞춰져 있으면 출력이 없어야 한다')
  assert.equal(r.stderr, '')
  assert.equal(effectiveEmail(), OWNER.email)

  // 3. 무인(ATTENDED=0): 바꾸지 않고 이유는 stderr로만 남긴다
  resetAuthor()
  r = run({ ...ATTENDED_ENV, CLAUDE_CODE_SESSION_ATTENDED: '0' })
  assert.equal(effectiveEmail(), ROUTINE_EMAIL, '무인 세션은 작성자가 그대로여야 한다')
  assert.equal(r.stdout, '', '사람이 붙지 않은 세션의 안내는 화면(stdout)에 내지 않는다')
  assert.match(r.stderr, /CLAUDE_CODE_SESSION_ATTENDED=0/)

  // 4. ATTENDED가 없는 경우도 닫힌다
  resetAuthor()
  const { CLAUDE_CODE_SESSION_ATTENDED: _drop, ...noAttended } = ATTENDED_ENV
  r = run(noAttended)
  assert.equal(effectiveEmail(), ROUTINE_EMAIL, 'ATTENDED가 없으면 바꾸지 않아야 한다')
  assert.match(r.stderr, /없음/)

  // 5. 예약 작업이 시작한 세션(TRIGGER_ID 있음)은 ATTENDED=1이어도 바꾸지 않는다
  resetAuthor()
  r = run({ ...ATTENDED_ENV, CLAUDE_CODE_TRIGGER_ID: 'trig_test' })
  assert.equal(effectiveEmail(), ROUTINE_EMAIL, 'TRIGGER_ID가 있으면 바꾸지 않아야 한다')
  assert.match(r.stdout, /TRIGGER_ID/, '사람이 붙은 세션이면 이유를 화면에 알린다')

  // 6. 세션 소유자가 저장소 소유자와 다르면 바꾸지 않는다(다른 사람의 세션을 소유자 명의로 만들지 않는다)
  resetAuthor()
  r = run({ ...ATTENDED_ENV, CLAUDE_CODE_USER_EMAIL: 'someone-else@example.test' })
  assert.equal(effectiveEmail(), ROUTINE_EMAIL)
  assert.match(r.stdout, /소유자/)
  assert.ok(!r.stdout.includes('someone-else@example.test'), '다른 사용자의 이메일을 출력에 남기지 않는다')

  // 7. 허용 목록에 없는 진입점은 바꾸지 않고, 진입점 값을 알려 허용 목록에 더할 수 있게 한다
  resetAuthor()
  r = run({ ...ATTENDED_ENV, CLAUDE_CODE_ENTRYPOINT: 'remote_unknown' })
  assert.equal(effectiveEmail(), ROUTINE_EMAIL)
  assert.match(r.stdout, /remote_unknown/)
  // 허용 목록의 다른 값은 통과한다
  resetAuthor()
  run({ ...ATTENDED_ENV, CLAUDE_CODE_ENTRYPOINT: 'remote_web' })
  assert.equal(effectiveEmail(), OWNER.email, '허용 목록의 모든 진입점에서 동작해야 한다')
  // 허용 목록의 두 항목을 쉼표로 이어 붙인 값은 통과하지 않는다(목록을 문자열로 이어 붙여 비교하면 뚫린다)
  resetAuthor()
  run({ ...ATTENDED_ENV, CLAUDE_CODE_ENTRYPOINT: 'remote_mobile,remote_web' })
  assert.equal(effectiveEmail(), ROUTINE_EMAIL, '쉼표가 든 진입점 값은 허용 목록의 항목이 아니므로 바꾸지 않아야 한다')
  // 허용 목록 항목의 일부만 같은 값도 통과하지 않는다
  resetAuthor()
  run({ ...ATTENDED_ENV, CLAUDE_CODE_ENTRYPOINT: 'remote' })
  assert.equal(effectiveEmail(), ROUTINE_EMAIL, '항목의 앞부분만 같은 값은 바꾸지 않아야 한다')
  // 진입점이 비어 있으면 닫힌다
  resetAuthor()
  const { CLAUDE_CODE_ENTRYPOINT: _e, ...noEntry } = ATTENDED_ENV
  run(noEntry)
  assert.equal(effectiveEmail(), ROUTINE_EMAIL, '진입점이 없으면 바꾸지 않아야 한다')

  // 8. 클라우드 컨테이너가 아니면(로컬 PC) 아무것도 하지 않는다
  resetAuthor()
  r = run({ ...ATTENDED_ENV, CLAUDE_CODE_REMOTE: '' })
  assert.equal(effectiveEmail(), ROUTINE_EMAIL)
  assert.equal(r.stdout + r.stderr, '', '로컬 세션에서는 출력이 없어야 한다')

  // 9. 이미 루틴 작성자가 아니면(사용자가 직접 설정한 값) 건드리지 않는다
  resetAuthor('mine@example.test', 'mine')
  r = run(ATTENDED_ENV)
  assert.equal(effectiveEmail(), 'mine@example.test', '루틴 작성자가 아닌 설정은 덮어쓰지 않아야 한다')
  assert.equal(git(['config', '--local', 'user.name']), 'mine')
  assert.equal(r.stdout + r.stderr, '')

  // 10. 계약에 선언이 없거나 깨져 있으면 닫힌다(종료 코드는 여전히 0)
  for (const [label, obj] of [
    ['선언 없음', { routine_commit_restriction: { author_email: ROUTINE_EMAIL } }],
    ['진입점 빈 목록', contract({ interactive_session_author: { name: OWNER.name, email: OWNER.email, entrypoints: [] } })],
    ['이메일 누락', contract({ interactive_session_author: { name: OWNER.name, entrypoints: ENTRYPOINTS } })],
  ]) {
    writeContract(obj)
    resetAuthor()
    run(ATTENDED_ENV)
    assert.equal(effectiveEmail(), ROUTINE_EMAIL, `${label}이면 바꾸지 않아야 한다`)
  }
  writeFileSync(join(base, 'docs', 'agents', 'contract.json'), '{ 깨진 JSON')
  resetAuthor()
  run(ATTENDED_ENV)
  assert.equal(effectiveEmail(), ROUTINE_EMAIL, '계약이 깨져 있으면 바꾸지 않아야 한다')
  writeContract(contract())

  // 11. GIT_AUTHOR_EMAIL 환경 변수가 설정보다 우선하면 바뀌지 않았다고 알린다
  resetAuthor()
  r = run({ ...ATTENDED_ENV, GIT_AUTHOR_NAME: 'Claude', GIT_AUTHOR_EMAIL: ROUTINE_EMAIL })
  assert.match(r.stdout, /환경 변수\(GIT_AUTHOR_\*\)가 우선/, '환경 변수가 작성자를 고정하면 그 사실을 알려야 한다')

  console.log('ensure-session-author.test.mjs 통과')
} finally {
  rmSync(base, { recursive: true, force: true })
}
