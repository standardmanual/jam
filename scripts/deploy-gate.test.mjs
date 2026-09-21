// deploy-gate 테스트 (티켓 20260922_0001)
//
// ① check   — 임시 저장소에 base·head 브랜치를 만들어 통과·차단 사례를 각각 검증한다.
// ② served  — 로컬 http.createServer로 식별자 추출·none·변경 대기·타임아웃을 검증한다.
// ③ contract — check-contract.mjs가 deploy_gate 선언과 실제의 어긋남을 잡는지 검증한다.
//
// 가드레일 패턴 15: 임시 저장소에서 git을 실행하므로, 물려받은 GIT_* 환경변수를 버리고 시작한다.
// 가짜 비밀값은 소스에 통째로 적지 않고 실행할 때 조립한다(저장소 비밀값 검사·푸시 보호에 걸리지 않게).
// 실행: node scripts/deploy-gate.test.mjs

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const GATE = join(SCRIPTS, 'deploy-gate.mjs')
const CONTRACT_CHECK = join(SCRIPTS, 'check-contract.mjs')

const cleanEnv = () => {
  const e = {}
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && !k.startsWith('JAM_')) e[k] = v
  return { ...e, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
}
const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() })
  assert.equal(r.status, 0, `git ${args.join(' ')} 실패:\n${r.stderr}`)
  return r.stdout.trim()
}
const commit = (cwd, message) =>
  git(['-c', 'user.name=t', '-c', 'user.email=t@jam.internal', 'commit', '-q', '--allow-empty', '-m', message], cwd)
const write = (cwd, rel, content) => {
  const abs = join(cwd, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}
const newRepo = (branch) => {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-gate-'))
  git(['init', '-q'], dir)
  git(['symbolic-ref', 'HEAD', `refs/heads/${branch}`], dir)
  return dir
}

// 가짜 비밀값 — 조립해서 쓴다.
const FAKE_SB = ['sb', 'secret', 'A1b2C3d4E5f6G7h8I9j0K1l2'].join('_')
const FAKE_JWT = ['eyJ' + 'a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20)].join('.')
const ENV_NAME = ['CRON', 'SECRET'].join('_')
const FAKE_ASSIGN = `const ${ENV_NAME} = "${'x'.repeat(24)}"`

const contractJson = (overrides = {}) =>
  JSON.stringify({ deploy_gate: { rollback_sql_required_from: 180, public_routes: ['public/pong'], ...overrides } }, null, 2)

// ── ① check ──────────────────────────────────────────────────────────────────
const repo = newRepo('base')
const cleanups = [() => rmSync(repo, { recursive: true, force: true })]

write(repo, 'docs/agents/contract.json', contractJson())
write(repo, 'jam-web/src/app/api/existing/route.ts', 'export async function GET() { await supabase.auth.getUser() }\n')
write(repo, 'jam-web/supabase/migrations/179_legacy.sql', 'select 1;\n')
write(repo, 'jam-web/supabase/migrations/180_base_existing.sql', 'select 3;\n')
write(repo, 'jam-web/src/lib/keep.ts', 'export const keep = 1\n')
write(repo, 'jam-web/src/lib/insert.ts', 'export const a = 1\nexport const b = 2\n')
// 이미 기준선에 있는 비밀 형태의 줄 — 추가된 줄만 검사하므로 이 파일을 건드려도 걸리지 않아야 한다.
write(repo, 'jam-web/src/lib/legacy.ts', `export const legacy = 1\nexport const old = "${FAKE_SB}"\n`)
git(['add', '-A'], repo)
commit(repo, 'base')

/** base에서 head 브랜치를 새로 만들고, mutate가 바꾼 내용을 커밋한 상태(작업 트리도 head)로 둔다. */
const onHead = (message, mutate) => {
  git(['checkout', '-q', '-B', 'head', 'base'], repo)
  mutate((rel, content) => write(repo, rel, content))
  git(['add', '-A'], repo)
  commit(repo, message)
}
const gate = (args, cwd = repo) => spawnSync('node', [GATE, ...args], { cwd, encoding: 'utf8', env: cleanEnv() })
const check = (extra = []) => gate(['check', '--base', 'base', '--head', 'head', ...extra])
const checkJson = () => {
  const r = check(['--json'])
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null }
}
const firstLines = (r, n) => r.stdout.split('\n').slice(0, n)

// 1) 변경 없음 → 통과
onHead('변경 없음', () => {})
let r = checkJson()
assert.equal(r.status, 0, `변경이 없으면 통과해야 한다:\n${r.stdout}${r.stderr}`)
assert.equal(r.json.ok, true)
assert.equal(r.json.jamWebChangedFiles, 0)
assert.deepEqual(r.json.migrations.numbered, [])
assert.equal(r.json.migrations.seedCount, 0)
assert.deepEqual(r.json.routes, [])

// 2) 종합 통과 — 환경변수 읽기 코드는 오탐하지 않고, 되돌림 표식·_down.sql·seed·인증 있는 새 라우트는 통과한다
onHead('종합 통과', (put) => {
  put(
    'jam-web/src/lib/env.ts',
    [
      'export const url = process.env.SUPABASE_SERVICE_ROLE_KEY',
      'export const secret = process.env.CRON_SECRET',
      'export const enc: string = process.env.ENCRYPTION_KEY ?? ""',
      'if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) throw new Error("x")',
      '',
    ].join('\n'),
  )
  put('jam-web/supabase/migrations/seed_fix_a.sql', 'update t set x = 1;\n')
  put('jam-web/supabase/migrations/seed_fix_b.sql', 'update t set x = 2;\n')
  put('jam-web/supabase/migrations/179_extra_legacy.sql', 'select 2;\n')
  put('jam-web/supabase/migrations/180_marker_ko.sql', 'create table a(id int);\n-- 되돌림 SQL\n-- drop table a;\ncreate index i on a(id);\n')
  put('jam-web/supabase/migrations/181_marker_en.sql', 'create table b(id int);\n-- ROLLBACK\n-- drop table b;\n')
  put('jam-web/supabase/migrations/182_with_down.sql', 'create table c(id int);\n')
  put('jam-web/supabase/migrations/182_with_down_down.sql', 'drop table c;\n')
  put('jam-web/src/app/api/new-one/route.ts', 'export async function GET() { await supabase.auth.getUser() }\n')
  put('jam-web/src/app/api/admin/new-two/route.ts', "import { requireAdmin } from '@/lib/admin/auth'\nexport const GET = requireAdmin\n")
  put('jam-web/src/app/api/public/pong/route.ts', 'export const GET = () => new Response("pong")\n')
})
r = checkJson()
assert.equal(r.status, 0, `종합 통과 사례가 막혔다:\n${r.stdout}${r.stderr}`)
assert.equal(r.json.migrations.numbered.length, 4, '_down.sql은 마이그레이션으로 세지 않는다')
assert.equal(r.json.migrations.seedCount, 2)
assert.deepEqual(r.json.routes.map((x) => x.status).sort(), ['auth', 'auth', 'public'])
assert.equal(r.json.secrets.findings.length, 0)
assert.equal(r.json.jamWebChangedFiles, 11, '무인 루틴이 새 배포 여부를 가릴 때 쓰는 값이다')
r = check()
assert.equal(r.status, 0)
assert.deepEqual(firstLines(r, 3), [
  '배포 게이트: 통과',
  '신규 마이그레이션: 번호 4건(되돌림 SQL 있음), seed 2건',
  '점검 범위: base → head, jam-web 변경 11개 파일',
])

// 3) 기존 비밀 형태의 줄이 있는 파일을 건드리거나 jam-web 밖에 적어도 걸리지 않는다(추가된 줄 · jam-web 아래만 검사)
onHead('범위 밖', (put) => {
  put('jam-web/src/lib/legacy.ts', `export const legacy = 1\nexport const old = "${FAKE_SB}"\nexport const more = 3\n`)
  put('docs/note.md', `메모: ${FAKE_SB}\n`)
  put('scripts/sample.mjs', `${FAKE_ASSIGN}\n`)
})
r = checkJson()
assert.equal(r.status, 0, `기존 줄·jam-web 밖은 걸리면 안 된다:\n${r.stdout}${r.stderr}`)

// 4) 비밀값 세 형태는 각각 차단하고, 출력에는 값이 아니라 종류와 위치만 남긴다
for (const [kind, line] of [
  ['sb_secret', `export const k = "${FAKE_SB}"`],
  ['jwt', `export const t = "${FAKE_JWT}"`],
  ['env_assign', FAKE_ASSIGN],
]) {
  onHead(`비밀값 ${kind}`, (put) => put('jam-web/src/lib/leak.ts', `export const a = 1\nexport const b = 2\n${line}\n`))
  r = checkJson()
  assert.equal(r.status, 1, `${kind}는 차단해야 한다:\n${r.stdout}${r.stderr}`)
  assert.deepEqual(r.json.secrets.findings, [{ file: 'jam-web/src/lib/leak.ts', line: 3, kind }])
  assert.deepEqual(r.json.blockers, ['비밀값 1건'])
  const text = check()
  assert.equal(text.status, 1)
  assert.equal(firstLines(text, 1)[0], '배포 게이트: 차단(비밀값 1건)')
  assert.match(text.stdout, /jam-web\/src\/lib\/leak\.ts:3/)
  for (const secret of [FAKE_SB, FAKE_JWT, 'x'.repeat(24)]) {
    assert.ok(!text.stdout.includes(secret) && !r.stdout.includes(secret), `${kind}: 출력에 비밀값이 그대로 나오면 안 된다`)
  }
}

// 5) 기존 파일 중간에 끼워 넣은 줄도 새 파일 기준 줄 번호로 알려 준다
onHead('중간 삽입', (put) => put('jam-web/src/lib/insert.ts', `export const a = 1\nexport const k = "${FAKE_SB}"\nexport const b = 2\n`))
r = checkJson()
assert.equal(r.status, 1)
assert.deepEqual(r.json.secrets.findings, [{ file: 'jam-web/src/lib/insert.ts', line: 2, kind: 'sb_secret' }])

// 6) 마이그레이션: 기준선(180) 이상은 되돌림 SQL이 필요하고 179 이하는 요구하지 않는다
onHead('180 되돌림 없음', (put) => put('jam-web/supabase/migrations/180_no_rollback.sql', 'create table d(id int);\n'))
r = checkJson()
assert.equal(r.status, 1, '180번 이상에 되돌림 SQL이 없으면 차단해야 한다')
assert.deepEqual(r.json.blockers, ['되돌림 SQL 없는 마이그레이션 1건'])
assert.equal(r.json.migrations.numbered[0].required, true)
assert.equal(r.json.migrations.numbered[0].rollback, null)
r = check()
assert.deepEqual(firstLines(r, 2), [
  '배포 게이트: 차단(되돌림 SQL 없는 마이그레이션 1건)',
  '신규 마이그레이션: 번호 1건(되돌림 SQL 없음: 180_no_rollback.sql), seed 0건',
])

onHead('179 되돌림 없음', (put) => put('jam-web/supabase/migrations/179_no_rollback.sql', 'create table e(id int);\n'))
r = check()
assert.equal(r.status, 0, '179 이하는 되돌림 SQL을 요구하지 않는다')
assert.equal(firstLines(r, 2)[1], '신규 마이그레이션: 번호 1건(180번 미만이라 되돌림 SQL 확인 대상 아님), seed 0건')

// 7) 되돌림 표식: 대소문자·공백·들여쓰기는 허용하고, 다른 단어와 줄 끝 주석은 표식으로 치지 않는다
onHead('표식 변형 통과', (put) => {
  put('jam-web/supabase/migrations/183_lower.sql', 'create table f(id int);\n-- rollback\n-- drop table f;\n')
  put('jam-web/supabase/migrations/184_nospace.sql', 'create table g(id int);\n--ROLLBACK\n')
  put('jam-web/supabase/migrations/185_colon.sql', 'create table h(id int);\n-- 되돌림: drop table h;\n')
  put('jam-web/supabase/migrations/186_indent.sql', 'create table i(id int);\n   -- DOWN\n   -- drop table i;\n')
})
r = check()
assert.equal(r.status, 0, `표식 변형이 막혔다:\n${r.stdout}${r.stderr}`)
onHead('표식 아님', (put) => {
  put('jam-web/supabase/migrations/187_downtime.sql', 'create table j(id int);\n-- downtime 없음\n')
  put('jam-web/supabase/migrations/188_korean_other.sql', 'create table k(id int);\n-- 롤백 불필요\n')
  put('jam-web/supabase/migrations/189_trailing.sql', 'create table l(id int); -- ROLLBACK\n')
  put('jam-web/supabase/migrations/190_block_comment.sql', '/* ROLLBACK */\ncreate table m(id int);\n')
})
r = checkJson()
assert.equal(r.status, 1)
assert.equal(r.json.migrations.numbered.filter((x) => x.required && !x.rollback).length, 4, '표식이 아닌 네 파일이 모두 차단돼야 한다')

// 8) _down.sql은 이름이 짝이 맞고 같은 범위에 있을 때만 인정한다. 이름이 _down.sql로 끝나는 진짜 마이그레이션은 짝으로 오인하지 않는다
onHead('down 짝', (put) => {
  put('jam-web/supabase/migrations/191_a.sql', 'create table n(id int);\n')
  put('jam-web/supabase/migrations/191_a_down.sql', 'drop table n;\n')
  put('jam-web/supabase/migrations/192_b.sql', 'create table o(id int);\n')
  put('jam-web/supabase/migrations/192_other_down.sql', 'drop table o;\n')
  put('jam-web/supabase/migrations/193_scale_down.sql', 'alter table t alter column c set default 0;\n')
})
r = checkJson()
assert.equal(r.status, 1)
assert.deepEqual(
  r.json.migrations.numbered.map((x) => [x.file.split('/').pop(), x.rollback]),
  [['191_a.sql', 'down_file'], ['192_b.sql', null], ['192_other_down.sql', null], ['193_scale_down.sql', null]],
  '짝이 없는 *_down.sql은 그 자체가 마이그레이션이라 되돌림 SQL이 필요하다',
)

// 이미 있던 마이그레이션의 _down.sql만 추가하는 것은 신규 마이그레이션이 아니다
onHead('기존 마이그레이션의 down만 추가', (put) => put('jam-web/supabase/migrations/180_base_existing_down.sql', 'drop table x;\n'))
r = checkJson()
assert.equal(r.status, 0, `기존 마이그레이션의 짝 파일이 신규로 잡혔다:\n${r.stdout}${r.stderr}`)
assert.deepEqual(r.json.migrations.numbered, [])

// 9) 기준선은 선언(contract.json)에서 읽는다
onHead('기준선 상향', (put) => {
  put('docs/agents/contract.json', contractJson({ rollback_sql_required_from: 200 }))
  put('jam-web/supabase/migrations/180_no_rollback.sql', 'create table p(id int);\n')
})
r = check()
assert.equal(r.status, 0, '기준선을 200으로 올리면 180번은 요구 대상이 아니다')
git(['checkout', '-q', 'base'], repo) // 작업 트리는 기준선 180인 base — 그래도 head의 선언(200)을 써야 한다
assert.equal(check().status, 0, '선언은 작업 트리가 아니라 점검 대상(head)에서 읽는다')

// 10) 이미 있던 마이그레이션을 고친 것(추가가 아님)은 신규로 세지 않고, 규칙 밖 이름은 참고로만 알린다
onHead('수정과 기타', (put) => {
  put('jam-web/supabase/migrations/179_legacy.sql', 'select 1;\nselect 2;\n')
  put('jam-web/supabase/migrations/add_column.sql', 'alter table t add column c int;\n')
})
r = checkJson()
assert.equal(r.status, 0)
assert.deepEqual(r.json.migrations.numbered, [])
assert.equal(r.json.migrations.others.length, 1)
assert.match(check().stdout, /참고: 번호·seed 이름 규칙 밖의 마이그레이션 파일 1건/)

// 11) 새 API 라우트: 인증 확인이 없으면 차단, 있거나 공개 등록돼 있으면 통과, 기존 라우트 수정·route.ts 아닌 파일은 대상이 아니다
onHead('인증 없는 새 라우트', (put) => put('jam-web/src/app/api/open/thing/route.ts', 'export const GET = () => new Response("hi")\n'))
r = checkJson()
assert.equal(r.status, 1)
assert.deepEqual(r.json.routes, [{ file: 'jam-web/src/app/api/open/thing/route.ts', route: 'open/thing', status: 'missing' }])
r = check()
assert.equal(firstLines(r, 1)[0], '배포 게이트: 차단(인증 확인 없는 새 API 라우트 1건)')
assert.match(r.stdout, /jam-web\/src\/app\/api\/open\/thing\/route\.ts 인증 확인 호출이 없고 공개 라우트로 등록돼 있지 않음/)
assert.match(r.stdout, /deploy_gate\.public_routes에 "open\/thing" 등록/)

onHead('cron·admin 비밀 라우트', (put) => {
  put('jam-web/src/app/api/cron/job/route.ts', `if (req.headers.get("authorization") !== \`Bearer \${process.env.${ENV_NAME}}\`) throw 1\n`)
  put('jam-web/src/app/api/admin/op/route.ts', 'if (secret !== process.env.ADMIN_SECRET) throw 1\n')
})
assert.equal(check().status, 0, 'CRON_SECRET·ADMIN_SECRET을 쓰는 새 라우트는 인증이 있는 것으로 본다')

onHead('기존 라우트 수정', (put) => {
  put('jam-web/src/app/api/existing/route.ts', 'export const GET = () => new Response("no auth now")\n')
  put('jam-web/src/app/api/foo/helper.ts', 'export const helper = 1\n')
})
r = checkJson()
assert.equal(r.status, 0, '추가된 route.ts만 대상이다')
assert.deepEqual(r.json.routes, [])

// 12) 기본 범위는 origin/main → origin/staging이고 두 팁의 트리 비교만 쓴다(공통 조상이 없어도 돈다)
onHead('기본 범위', (put) => put('jam-web/supabase/migrations/181_default_range.sql', 'create table q(id int);\n'))
git(['update-ref', 'refs/remotes/origin/main', 'base'], repo)
git(['update-ref', 'refs/remotes/origin/staging', 'head'], repo)
r = gate(['check', '--json'])
assert.equal(r.status, 1)
assert.equal(JSON.parse(r.stdout).base, 'origin/main')
assert.equal(JSON.parse(r.stdout).head, 'origin/staging')

const unrelated = newRepo('main')
cleanups.push(() => rmSync(unrelated, { recursive: true, force: true }))
write(unrelated, 'docs/agents/contract.json', contractJson())
write(unrelated, 'jam-web/supabase/migrations/181_orphan.sql', 'create table r(id int);\n')
git(['add', '-A'], unrelated)
commit(unrelated, '공통 조상 없는 팁')
git(['fetch', '-q', unrelated, '+refs/heads/main:refs/heads/orphan'], repo)
assert.equal(spawnSync('git', ['merge-base', 'base', 'orphan'], { cwd: repo, env: cleanEnv() }).status, 1, '공통 조상이 없는 시나리오가 아니다')
r = gate(['check', '--base', 'base', '--head', 'orphan', '--json'])
assert.equal(r.status, 1, `공통 조상이 없어도 트리 비교로 돌아야 한다:\n${r.stdout}${r.stderr}`)
assert.equal(JSON.parse(r.stdout).migrations.numbered[0].file, 'jam-web/supabase/migrations/181_orphan.sql')

// 13) 얕은 복제(클라우드 세션과 같은 형태)에서도 돈다
onHead('얕은 복제용', (put) => put('jam-web/supabase/migrations/180_shallow.sql', 'create table s(id int);\n'))
const cloneParent = mkdtempSync(join(tmpdir(), 'deploy-gate-clone-'))
cleanups.push(() => rmSync(cloneParent, { recursive: true, force: true }))
const clone = join(cloneParent, 'clone')
git(['clone', '-q', '--depth', '1', '--branch', 'base', `file://${repo}`, clone], cloneParent)
git(['fetch', '-q', '--depth', '1', 'origin', '+refs/heads/head:refs/remotes/origin/head'], clone)
assert.equal(git(['rev-parse', '--is-shallow-repository'], clone), 'true', '얕은 복제 시나리오가 아니다')
r = gate(['check', '--base', 'origin/base', '--head', 'origin/head', '--json'], clone)
assert.equal(r.status, 1, `얕은 복제에서 돌지 않았다:\n${r.stdout}${r.stderr}`)
assert.equal(JSON.parse(r.stdout).migrations.numbered[0].file, 'jam-web/supabase/migrations/180_shallow.sql')

// 14) 실행 오류와 인자 오류: 배포를 막는 방향(0이 아님)으로 끝난다
r = gate(['check', '--base', 'base', '--head', 'nope'])
assert.equal(r.status, 2)
assert.match(r.stderr, /"nope"를 찾을 수 없습니다/)

git(['checkout', '-q', '-B', 'nocontract', 'base'], repo)
git(['rm', '-q', 'docs/agents/contract.json'], repo)
commit(repo, '선언 없음')
r = gate(['check', '--base', 'base', '--head', 'nocontract'])
assert.equal(r.status, 2, '선언을 읽지 못하면 통과시키지 않는다')
assert.match(r.stderr, /contract\.json/)

for (const args of [[], ['bogus'], ['check', '--unknown'], ['check', '--base'], ['served', '--timeout', '0']]) {
  r = gate(args)
  assert.equal(r.status, 64, `인자 오류는 64여야 한다: ${args.join(' ')}\n${r.stderr}`)
}

console.log('통과: deploy-gate check')

// ── ② served ────────────────────────────────────────────────────────────────
const runServed = (args) =>
  new Promise((resolve) => {
    const child = spawn('node', [GATE, 'served', ...args], { cwd: SCRIPTS, env: cleanEnv() })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    const startedAt = Date.now()
    child.on('close', (status) => resolve({ status, stdout: stdout.trim(), stderr, elapsedMs: Date.now() - startedAt }))
  })
const startServer = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections()
            server.close(done)
          }),
      })
    })
  })
const page = (...ids) => `<html><head>${ids.map((id) => `<link rel="preload" href="/a.woff2?dpl=${id}" as="font">`).join('')}</head></html>`

const servers = []
const serve = async (handler) => {
  const s = await startServer(handler)
  servers.push(s)
  return s
}
const deadPort = async () => {
  const s = await startServer(() => {})
  const url = s.url
  await s.close()
  return url
}

try {
  let s = await serve((req, res) => res.end(page('dpl_AAA111', 'dpl_AAA111')))
  let out = await runServed(['--url', s.url])
  assert.deepEqual([out.status, out.stdout], [0, 'dpl_AAA111'], `식별자를 읽지 못했다:\n${out.stderr}`)

  s = await serve((req, res) => res.end(page('dpl_FIRST1', 'dpl_SECOND2')))
  out = await runServed(['--url', s.url])
  assert.deepEqual([out.status, out.stdout], [0, 'dpl_FIRST1'], '첫 번째 식별자를 써야 한다')

  s = await serve((req, res) => res.end('<html>식별자 없음</html>'))
  out = await runServed(['--url', s.url])
  assert.deepEqual([out.status, out.stdout], [3, 'none'])

  s = await serve((req, res) => {
    res.statusCode = 503
    res.end('busy')
  })
  out = await runServed(['--url', s.url])
  assert.deepEqual([out.status, out.stdout], [3, 'none'], '응답은 왔으나 식별자가 없으면 3')

  s = await serve((req, res) => {
    if (req.url === '/') {
      res.statusCode = 302
      res.setHeader('location', '/login')
      res.end()
    } else {
      res.end(page('dpl_REDIR9'))
    }
  })
  out = await runServed(['--url', s.url])
  assert.deepEqual([out.status, out.stdout], [0, 'dpl_REDIR9'], '리다이렉트를 따라가야 한다')

  const dead = await deadPort()
  out = await runServed(['--url', dead])
  assert.deepEqual([out.status, out.stdout], [2, ''], '연결이 거부되면 2')

  s = await serve(() => {}) // 연결만 받고 응답하지 않는다
  out = await runServed(['--url', s.url, '--timeout', '1'])
  assert.deepEqual([out.status, out.stdout], [2, ''], '응답이 없으면 시간 초과로 2')
  assert.ok(out.elapsedMs < 10_000, `시간 초과가 너무 늦다: ${out.elapsedMs}ms`)

  // --wait-change: 값이 바뀔 때까지 기다린다
  let hits = 0
  s = await serve((req, res) => res.end(page(++hits <= 2 ? 'dpl_OLD001' : 'dpl_NEW002')))
  out = await runServed(['--url', s.url, '--wait-change', 'dpl_OLD001', '--interval', '0.2', '--timeout', '15'])
  assert.deepEqual([out.status, out.stdout], [0, 'dpl_NEW002'], `바뀐 id를 기다리지 못했다:\n${out.stderr}`)
  assert.ok(hits >= 3, '이전 id가 나오는 동안 재시도해야 한다')

  // 일시적인 네트워크 오류 뒤에 바뀌어도 성공으로 본다
  hits = 0
  s = await serve((req, res) => {
    if (++hits === 1) return req.destroy()
    res.end(page('dpl_NEW003'))
  })
  out = await runServed(['--url', s.url, '--wait-change', 'dpl_OLD001', '--interval', '0.2', '--timeout', '15'])
  assert.deepEqual([out.status, out.stdout], [0, 'dpl_NEW003'], `일시 오류 뒤 재시도하지 않았다:\n${out.stderr}`)

  // 시간 안에 바뀌지 않으면 4, 마지막으로 본 값을 출력한다
  s = await serve((req, res) => res.end(page('dpl_OLD001')))
  out = await runServed(['--url', s.url, '--wait-change', 'dpl_OLD001', '--interval', '0.2', '--timeout', '1'])
  assert.deepEqual([out.status, out.stdout], [4, 'dpl_OLD001'])
  assert.ok(out.elapsedMs >= 900 && out.elapsedMs < 10_000, `대기 시간이 timeout에 맞지 않는다: ${out.elapsedMs}ms`)

  s = await serve((req, res) => res.end('<html>식별자 없음</html>'))
  out = await runServed(['--url', s.url, '--wait-change', 'dpl_OLD001', '--interval', '0.2', '--timeout', '1'])
  assert.deepEqual([out.status, out.stdout], [4, 'none'], '식별자를 읽지 못하는 동안은 바뀐 것으로 치지 않는다')

  out = await runServed(['--url', dead, '--wait-change', 'dpl_OLD001', '--interval', '0.2', '--timeout', '1'])
  assert.deepEqual([out.status, out.stdout], [2, ''], '내내 응답이 없으면 4가 아니라 2')

  // 인자 오류
  for (const args of [['--wait-change', 'none'], ['--url', 'ftp://example.com'], ['--interval', '-1'], ['--timeout', 'abc']]) {
    out = await runServed(args)
    assert.equal(out.status, 64, `인자 오류는 64여야 한다: ${args.join(' ')}\n${out.stderr}`)
  }

  console.log('통과: deploy-gate served')
} finally {
  for (const server of servers) await server.close()
}

// ── ③ check-contract의 deploy_gate 대조 ──────────────────────────────────────
const contractRepo = newRepo('main')
cleanups.push(() => rmSync(contractRepo, { recursive: true, force: true }))
const contractCheck = () => spawnSync('node', [CONTRACT_CHECK], { cwd: contractRepo, encoding: 'utf8', env: cleanEnv() })
const setUp = ({ declaration, script = true, routeFiles = ['dev-login'] }) => {
  rmSync(join(contractRepo, 'docs'), { recursive: true, force: true })
  rmSync(join(contractRepo, 'scripts'), { recursive: true, force: true })
  rmSync(join(contractRepo, 'jam-web'), { recursive: true, force: true })
  write(contractRepo, 'docs/agents/contract.json', JSON.stringify(declaration === undefined ? {} : { deploy_gate: declaration }))
  if (script) write(contractRepo, 'scripts/deploy-gate.mjs', '// 자리 표시\n')
  for (const route of routeFiles) write(contractRepo, `jam-web/src/app/api/${route}/route.ts`, 'export {}\n')
}
const valid = { rollback_sql_required_from: 180, public_routes: ['dev-login'] }

setUp({ declaration: valid })
let c = contractCheck()
assert.equal(c.status, 0, `올바른 선언이 막혔다:\n${c.stdout}${c.stderr}`)

setUp({ declaration: { ...valid, public_routes: ['dev-login', 'ghost/route'] } })
c = contractCheck()
assert.equal(c.status, 1, '없는 라우트를 공개 라우트로 등록하면 잡아야 한다')
assert.match(c.stderr, /ghost\/route/)

setUp({ declaration: { ...valid, rollback_sql_required_from: '180' } })
assert.equal(contractCheck().status, 1, '기준선이 정수가 아니면 잡아야 한다')

setUp({ declaration: { ...valid, public_routes: 'dev-login' } })
assert.equal(contractCheck().status, 1, 'public_routes가 배열이 아니면 잡아야 한다')

setUp({ declaration: valid, script: false })
c = contractCheck()
assert.equal(c.status, 1, '선언은 있는데 스크립트가 없으면 잡아야 한다')
assert.match(c.stderr, /scripts\/deploy-gate\.mjs/)

setUp({ declaration: undefined })
c = contractCheck()
assert.equal(c.status, 1, '스크립트는 있는데 선언이 없으면 잡아야 한다')
assert.match(c.stderr, /deploy_gate/)

console.log('통과: check-contract deploy_gate 대조')

for (const fn of cleanups) fn()
