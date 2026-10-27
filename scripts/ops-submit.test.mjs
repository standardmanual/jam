// ops-submit.mjs 테스트 (티켓 20260930_1504 1회차)
//
// 실제 서버·실제 토큰을 쓰지 않는다. 로컬 http.createServer 가짜 서버로 상태 코드별 처리를 확인한다.
// scripts/verify.sh의 scripts-test 단계가 이 파일을 돌린다. 직접 실행도 된다.
// 실행: node scripts/ops-submit.test.mjs

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUBMIT_TARGETS, resolveConnection, run } from './ops-submit.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TOKEN = 'secret-token-for-test-0123456789'

/** 가짜 서버: reply가 응답을 정한다. requests에 받은 요청을 쌓는다. */
async function startFake(reply) {
  const requests = []
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      requests.push({ method: req.method, url: req.url, token: req.headers['x-admin-read-token'], body })
      const r = reply(req, body, requests.length)
      res.writeHead(r.status, { 'content-type': 'application/json', ...(r.headers ?? {}) })
      res.end(r.raw ?? JSON.stringify(r.json ?? {}))
    })
  })
  await new Promise((resolve) => server.listen(0, 'localhost', resolve))
  const { port } = server.address()
  return {
    base: `http://localhost:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function capture() {
  const out = []
  const err = []
  return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } }
}

function tmpFile(dir, name, content) {
  const file = path.join(dir, name)
  writeFileSync(file, content)
  return file
}

function assertNoToken(cap) {
  const all = [...cap.out, ...cap.err].join('\n')
  assert.ok(!all.includes(TOKEN), '출력에 토큰이 있으면 안 된다')
}

const tmp = mkdtempSync(path.join(tmpdir(), 'ops-submit-test-'))
const bundleBody = JSON.stringify({ bundle_id: 'b1', items: [{ secret_body_marker: 'BODYMARK' }] })
const bundleFile = tmpFile(tmp, 'bundle.json', bundleBody)
const startFile = tmpFile(tmp, 'start.json', JSON.stringify({ run_key: 'run-1' }))

async function submit(base, argv, extraEnv = {}) {
  const cap = capture()
  const code = await run({
    argv,
    env: { ADMIN_API_BASE_URL: base, ADMIN_API_READ_TOKEN: TOKEN, ...extraEnv },
    ...cap.io,
  })
  return { code, cap }
}

async function test201PrintsSummaryAndSendsTokenHeader() {
  const fake = await startFake(() => ({
    status: 201,
    json: { id: 'uuid-1', bundle_id: 'b1', item_count: 3, format_errors: ['항목 2: 형식'], warnings: ['주의 하나'] },
  }))
  const { code, cap } = await submit(fake.base, ['bundle', bundleFile])
  assert.equal(code, 0)
  assert.equal(fake.requests.length, 1)
  assert.equal(fake.requests[0].method, 'POST')
  assert.equal(fake.requests[0].url, '/api/admin/ops-inbox')
  assert.equal(fake.requests[0].token, TOKEN)
  assert.equal(fake.requests[0].body, bundleBody)
  const text = cap.out.join('\n')
  assert.match(text, /201 묶음을\(를\) 받았어요/)
  assert.match(text, /id: uuid-1/)
  assert.match(text, /bundle_id: b1/)
  assert.match(text, /item_count: 3/)
  assert.match(text, /format_errors: 1건/)
  assert.match(text, /항목 2: 형식/)
  assert.match(text, /warnings: 1건/)
  assert.ok(!text.includes('BODYMARK'), '본문을 출력하면 안 된다')
  assertNoToken(cap)
  await fake.close()
}

async function test200DuplicateExitsZero() {
  const fake = await startFake(() => ({ status: 200, json: { status: 'duplicate', id: 'u', bundle_id: 'b1', item_count: 3 } }))
  const { code, cap } = await submit(fake.base, ['bundle', bundleFile])
  assert.equal(code, 0)
  assert.match(cap.out.join('\n'), /이미 같은 묶음을\(를\) 받았어요/)
  await fake.close()
}

async function test409TellsToUseNewBundleId() {
  const fake = await startFake(() => ({ status: 409, json: { error: '같은 bundle_id로 이미 다른 내용이', id: 'u', bundle_id: 'b1' } }))
  const { code, cap } = await submit(fake.base, ['bundle', bundleFile])
  assert.equal(code, 1)
  assert.match(cap.err.join('\n'), /새 bundle_id로 바꿔서 다시 보내세요/)
  await fake.close()
}

async function test400PrintsServerDetails() {
  const fake = await startFake(() => ({ status: 400, json: { error: '필수 형식이 맞지 않아요', details: ['week가 없어요', 'items가 배열이 아니에요'] } }))
  const { code, cap } = await submit(fake.base, ['bundle', bundleFile])
  assert.equal(code, 1)
  const text = cap.err.join('\n')
  assert.match(text, /400 형식 오류/)
  assert.match(text, /week가 없어요/)
  assert.match(text, /items가 배열이 아니에요/)
  await fake.close()
}

async function test401And403AreTokenProblems() {
  for (const status of [401, 403]) {
    const fake = await startFake(() => ({ status, json: { error: 'x' } }))
    const { code, cap } = await submit(fake.base, ['bundle', bundleFile])
    assert.equal(code, 1)
    assert.match(cap.err.join('\n'), /토큰 문제/)
    assertNoToken(cap)
    await fake.close()
  }
}

async function testOtherStatusIsGenericFailure() {
  const fake = await startFake(() => ({ status: 500, json: { error: '내부 오류 원문' } }))
  const { code, cap } = await submit(fake.base, ['bundle', bundleFile])
  assert.equal(code, 1)
  const text = cap.err.join('\n')
  assert.match(text, /500 보내지 못했어요/)
  assert.ok(!text.includes('내부 오류 원문'), '400·409가 아니면 서버 문장을 그대로 싣지 않는다')
  await fake.close()
}

async function testServerEchoOfTokenIsScrubbed() {
  const fake = await startFake(() => ({ status: 400, json: { error: `토큰 ${TOKEN} 이 보임`, details: [`d ${TOKEN}`] } }))
  const { code, cap } = await submit(fake.base, ['bundle', bundleFile])
  assert.equal(code, 1)
  assertNoToken(cap)
  await fake.close()
}

async function testNetworkErrorHasNoToken() {
  const fake = await startFake(() => ({ status: 201 }))
  const base = fake.base
  await fake.close() // 닫힌 포트로 보낸다
  const { code, cap } = await submit(base, ['bundle', bundleFile])
  assert.equal(code, 1)
  assert.match(cap.err.join('\n'), /서버에 연결하지 못했어요/)
  assertNoToken(cap)
}

async function testRedirectIsNotFollowed() {
  const fake = await startFake(() => ({ status: 302, headers: { location: '/elsewhere' } }))
  const { code, cap } = await submit(fake.base, ['bundle', bundleFile])
  assert.equal(code, 1)
  assert.equal(fake.requests.length, 1, '리다이렉트를 따라가면 토큰이 다른 곳으로 간다')
  assert.match(cap.err.join('\n'), /302/)
  await fake.close()
}

async function testOversizedBundleBlockedBeforeSending() {
  const fake = await startFake(() => ({ status: 201 }))
  const big = tmpFile(tmp, 'big.json', 'x'.repeat(1_048_576 + 1))
  const { code, cap } = await submit(fake.base, ['bundle', big])
  assert.equal(code, 1)
  assert.equal(fake.requests.length, 0, '1MB를 넘으면 보내지 않는다')
  assert.match(cap.err.join('\n'), /너무 커요/)
  const atLimit = tmpFile(tmp, 'limit.json', 'x'.repeat(1_048_576))
  const ok = await submit(fake.base, ['bundle', atLimit])
  assert.equal(ok.code, 0, '정확히 1MB는 보낸다')
  assert.equal(fake.requests.length, 1)
  await fake.close()
}

async function testStartUsesRoutineStartPathAndLimit() {
  const fake = await startFake(() => ({ status: 201, json: { status: 'created', id: 'r1', run_key: 'run-1' } }))
  const { code, cap } = await submit(fake.base, ['start', startFile])
  assert.equal(code, 0)
  assert.equal(fake.requests[0].url, '/api/admin/ops-inbox/routine-start')
  assert.equal(fake.requests[0].token, TOKEN)
  assert.match(cap.out.join('\n'), /run_key: run-1/)
  const big = tmpFile(tmp, 'big-start.json', 'x'.repeat(16 * 1024 + 1))
  const blocked = await submit(fake.base, ['start', big])
  assert.equal(blocked.code, 1)
  assert.equal(fake.requests.length, 1, '16KB를 넘는 시작 기록은 보내지 않는다')
  await fake.close()
}

async function testUnknownTargetNamesAreRejected() {
  const fake = await startFake(() => ({ status: 201 }))
  for (const name of ['ops-inbox', '/api/admin/ops-inbox', '../x', 'toString', '__proto__', 'bundle/', undefined]) {
    const argv = name === undefined ? [] : [name, bundleFile]
    const { code, cap } = await submit(fake.base, argv)
    assert.equal(code, 1, `${name} 거절`)
    assert.match(cap.err.join('\n'), /허용하지 않는 경로 이름/)
  }
  assert.equal(fake.requests.length, 0)
  assert.deepEqual(Object.keys(SUBMIT_TARGETS).sort(), ['bundle', 'start'], '쓰기 경로는 두 개뿐이다')
  await fake.close()
}

async function testMissingFileAndExtraArgsFail() {
  const fake = await startFake(() => ({ status: 201 }))
  const missing = await submit(fake.base, ['bundle', path.join(tmp, '없는파일.json')])
  assert.equal(missing.code, 1)
  assert.match(missing.cap.err.join('\n'), /파일을 읽을 수 없어요/)
  const noFile = await submit(fake.base, ['bundle'])
  assert.equal(noFile.code, 1)
  const extra = await submit(fake.base, ['bundle', bundleFile, 'more'])
  assert.equal(extra.code, 1)
  assert.equal(fake.requests.length, 0)
  await fake.close()
}

async function testConnectionRules() {
  const fake = await startFake(() => ({ status: 201 }))
  // https와 localhost의 http만 받는다
  const remoteHttp = await submit('http://example.com', ['bundle', bundleFile])
  assert.equal(remoteHttp.code, 1)
  assert.match(remoteHttp.cap.err.join('\n'), /https:\/\//)
  assertNoToken(remoteHttp.cap)
  const lookalike = await submit('http://localhost.evil.com', ['bundle', bundleFile])
  assert.equal(lookalike.code, 1)
  const ftp = await submit('ftp://localhost', ['bundle', bundleFile])
  assert.equal(ftp.code, 1)
  const userinfo = await submit('https://user:pw@example.com', ['bundle', bundleFile])
  assert.equal(userinfo.code, 1)
  const garbage = await submit('not a url', ['bundle', bundleFile])
  assert.equal(garbage.code, 1)
  // 토큰·주소가 없으면 실행하지 않는다
  const cap = capture()
  assert.equal(await run({ argv: ['bundle', bundleFile], env: { ADMIN_API_BASE_URL: fake.base }, ...cap.io }), 1)
  assert.match(cap.err.join('\n'), /ADMIN_API_READ_TOKEN/)
  const cap2 = capture()
  assert.equal(await run({ argv: ['bundle', bundleFile], env: { ADMIN_API_READ_TOKEN: TOKEN }, ...cap2.io }), 1)
  assert.match(cap2.err.join('\n'), /ADMIN_API_BASE_URL/)
  assert.equal(fake.requests.length, 0)
  // https는 받는다(연결 자체는 하지 않는다)
  assert.deepEqual(resolveConnection({ ADMIN_API_BASE_URL: 'https://stage.j-a-m.app/some/path', ADMIN_API_READ_TOKEN: 't' }), {
    origin: 'https://stage.j-a-m.app',
    token: 't',
  })
  await fake.close()
}

function testPathsAndLimitsMatchServerConstants() {
  const src = readFileSync(path.join(__dirname, '..', 'jam-web/src/lib/admin/opsInbox/constants.ts'), 'utf8')
  const read = (re, label) => {
    const m = src.match(re)
    assert.ok(m, `constants.ts에서 ${label}을 찾지 못했다`)
    return m[1]
  }
  assert.equal(SUBMIT_TARGETS.bundle.path, read(/export const OPS_INBOX_PATH = '([^']+)'/, 'OPS_INBOX_PATH'))
  assert.equal(SUBMIT_TARGETS.start.path, read(/export const OPS_ROUTINE_START_PATH = '([^']+)'/, 'OPS_ROUTINE_START_PATH'))
  assert.equal(SUBMIT_TARGETS.bundle.maxBytes, Number(read(/export const MAX_BODY_BYTES = ([\d_]+)/, 'MAX_BODY_BYTES').replaceAll('_', '')))
  const kb = read(/export const MAX_ROUTINE_START_BODY_BYTES = (\d+) \* 1024/, 'MAX_ROUTINE_START_BODY_BYTES')
  assert.equal(SUBMIT_TARGETS.start.maxBytes, Number(kb) * 1024)
  const writePaths = read(/OPS_INBOX_TOKEN_WRITE_PATHS: readonly string\[\] = \[([^\]]+)\]/, 'OPS_INBOX_TOKEN_WRITE_PATHS')
  assert.equal(writePaths.replace(/\s/g, ''), 'OPS_INBOX_PATH,OPS_ROUTINE_START_PATH', '서버의 토큰 쓰기 경로가 두 개에서 바뀌면 이 스크립트도 다시 봐야 한다')
}

function runChild(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'ops-submit.mjs'), ...args], { env: { PATH: process.env.PATH, ...env } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

async function testCommandLineEntry() {
  const fake = await startFake(() => ({ status: 201, json: { id: 'cli-1', bundle_id: 'b1', item_count: 1 } }))
  const ok = await runChild(['bundle', bundleFile], { ADMIN_API_BASE_URL: fake.base, ADMIN_API_READ_TOKEN: TOKEN })
  assert.equal(ok.status, 0)
  assert.match(ok.stdout, /id: cli-1/)
  assert.ok(!(ok.stdout + ok.stderr).includes(TOKEN))
  const noToken = await runChild(['bundle', bundleFile], { ADMIN_API_BASE_URL: fake.base })
  assert.equal(noToken.status, 1)
  assert.match(noToken.stderr, /ADMIN_API_READ_TOKEN/)
  assert.equal(fake.requests.length, 1, '토큰이 없으면 요청하지 않는다')
  await fake.close()
}

async function main() {
  try {
    await test201PrintsSummaryAndSendsTokenHeader()
    await test200DuplicateExitsZero()
    await test409TellsToUseNewBundleId()
    await test400PrintsServerDetails()
    await test401And403AreTokenProblems()
    await testOtherStatusIsGenericFailure()
    await testServerEchoOfTokenIsScrubbed()
    await testNetworkErrorHasNoToken()
    await testRedirectIsNotFollowed()
    await testOversizedBundleBlockedBeforeSending()
    await testStartUsesRoutineStartPathAndLimit()
    await testUnknownTargetNamesAreRejected()
    await testMissingFileAndExtraArgsFail()
    await testConnectionRules()
    testPathsAndLimitsMatchServerConstants()
    await testCommandLineEntry()
    console.log('ops-submit.test.mjs 통과')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main()
