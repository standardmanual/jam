// ops-read.mjs 테스트 (티켓 20260930_1504 1회차)
//
// 실제 서버·실제 토큰을 쓰지 않는다. 로컬 http.createServer 가짜 서버로 허용 목록의 경로·메서드·헤더를 확인한다.
// scripts/verify.sh의 scripts-test 단계가 이 파일을 돌린다. 직접 실행도 된다.
// 실행: node scripts/ops-read.test.mjs

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { READ_TARGETS, parseArgs, run } from './ops-read.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TOKEN = 'secret-token-for-test-0123456789'

async function startFake(reply) {
  const requests = []
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, token: req.headers['x-admin-read-token'] })
    const r = reply(req)
    res.writeHead(r.status, { 'content-type': 'application/json', ...(r.headers ?? {}) })
    res.end(r.raw ?? JSON.stringify(r.json ?? {}))
  })
  await new Promise((resolve) => server.listen(0, 'localhost', resolve))
  const { port } = server.address()
  return { base: `http://localhost:${port}`, requests, close: () => new Promise((resolve) => server.close(resolve)) }
}

function capture() {
  const out = []
  const err = []
  return { out, err, io: { out: (t) => out.push(t), err: (l) => err.push(l) } }
}

async function read(base, argv, extraEnv = {}) {
  const cap = capture()
  const code = await run({ argv, env: { ADMIN_API_BASE_URL: base, ADMIN_API_READ_TOKEN: TOKEN, ...extraEnv }, ...cap.io })
  return { code, cap }
}

function assertNoToken(cap) {
  assert.ok(![...cap.out, ...cap.err].join('\n').includes(TOKEN), '출력에 토큰이 있으면 안 된다')
}

async function testEveryNameIsGetWithTokenAndPrintsBodyAsIs() {
  const payload = JSON.stringify({ items: Array.from({ length: 200 }, (_, i) => ({ i })) })
  const fake = await startFake(() => ({ status: 200, raw: payload }))
  for (const [name, route] of Object.entries(READ_TARGETS)) {
    const before = fake.requests.length
    const { code, cap } = await read(fake.base, [name])
    assert.equal(code, 0, name)
    assert.equal(fake.requests.length, before + 1)
    const req = fake.requests.at(-1)
    assert.equal(req.method, 'GET', name)
    assert.equal(req.url, route, name)
    assert.equal(req.token, TOKEN)
    assert.equal(cap.out.join(''), payload, `${name}: 응답을 줄이지 않고 그대로 낸다`)
    assertNoToken(cap)
  }
  assert.deepEqual(
    Object.keys(READ_TARGETS),
    ['trend-sources', 'patterns-draw', 'rules', 'decisions', 'patterns', 'item-paths', 'kpi-weekly', 'today-metrics']
  )
  await fake.close()
}

async function testQueryPairsAreEncodedAndPassed() {
  const fake = await startFake(() => ({ status: 200, json: {} }))
  const { code } = await read(fake.base, ['patterns-draw', '--query', 'limit=5', '--query', 'q=가 나&x=1'])
  assert.equal(code, 0)
  assert.equal(fake.requests[0].url, `/api/admin/ops-patterns/draw?limit=5&q=${encodeURIComponent('가 나&x=1').replace(/%20/g, '+')}`)
  assert.deepEqual(parseArgs(['rules', '--query', 'a=b=c']), { name: 'rules', query: 'a=b%3Dc' })
  for (const bad of [['rules', '--query'], ['rules', '--query', 'novalue'], ['rules', '--query', '=x'], ['rules', '--other', 'a=b']]) {
    assert.ok(parseArgs(bad).error, `${bad.join(' ')} 거절`)
  }
  await fake.close()
}

async function testUnknownNamesAreRejectedWithoutRequest() {
  const fake = await startFake(() => ({ status: 200, json: {} }))
  for (const name of ['ops-inbox', '/api/admin/users', '../x', 'toString', '__proto__', 'constructor', undefined]) {
    const { code, cap } = await read(fake.base, name === undefined ? [] : [name])
    assert.equal(code, 1, `${name} 거절`)
    assert.match(cap.err.join('\n'), /허용하지 않는 이름/)
  }
  assert.equal(fake.requests.length, 0)
  await fake.close()
}

async function testErrorStatusesExitOneWithoutToken() {
  for (const status of [400, 401, 403, 500]) {
    const fake = await startFake(() => ({ status, json: { error: `서버 안내 ${TOKEN}` } }))
    const { code, cap } = await read(fake.base, ['rules'])
    assert.equal(code, 1)
    assert.match(cap.err.join('\n'), new RegExp(`rules: ${status} 읽지 못했어요`))
    assert.equal(cap.out.length, 0, '실패하면 표준 출력에 아무것도 내지 않는다')
    assertNoToken(cap)
    await fake.close()
  }
}

async function testNetworkErrorAndRedirect() {
  const gone = await startFake(() => ({ status: 200 }))
  const base = gone.base
  await gone.close()
  const net = await read(base, ['rules'])
  assert.equal(net.code, 1)
  assert.match(net.cap.err.join('\n'), /서버에 연결하지 못했어요/)
  assertNoToken(net.cap)

  const fake = await startFake(() => ({ status: 302, headers: { location: '/elsewhere' } }))
  const redirected = await read(fake.base, ['rules'])
  assert.equal(redirected.code, 1)
  assert.equal(fake.requests.length, 1, '리다이렉트를 따라가지 않는다')
  await fake.close()
}

async function testConnectionRulesAreSameAsSubmit() {
  const fake = await startFake(() => ({ status: 200, json: {} }))
  const remote = await read('http://example.com', ['rules'])
  assert.equal(remote.code, 1)
  assert.match(remote.cap.err.join('\n'), /https:\/\//)
  assertNoToken(remote.cap)
  const cap = capture()
  assert.equal(await run({ argv: ['rules'], env: { ADMIN_API_BASE_URL: fake.base }, ...cap.io }), 1)
  assert.match(cap.err.join('\n'), /ADMIN_API_READ_TOKEN/)
  assert.equal(fake.requests.length, 0)
  await fake.close()
}

function testReadPathsHaveRouteFiles() {
  // 목록의 각 경로에 해당하는 라우트 파일이 있고 GET을 내보낸다.
  for (const [name, route] of Object.entries(READ_TARGETS)) {
    const file = path.join(__dirname, '..', 'jam-web/src/app', route, 'route.ts')
    assert.ok(existsSync(file), `${name}: ${file} 없음`)
    assert.match(readFileSync(file, 'utf8'), /export async function GET\b/, `${name}: GET이 없다`)
  }
}

function runChild(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'ops-read.mjs'), ...args], { env: { PATH: process.env.PATH, ...env } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

async function testCommandLineEntry() {
  const fake = await startFake(() => ({ status: 200, json: { ok: true } }))
  const ok = await runChild(['trend-sources'], { ADMIN_API_BASE_URL: fake.base, ADMIN_API_READ_TOKEN: TOKEN })
  assert.equal(ok.status, 0)
  assert.deepEqual(JSON.parse(ok.stdout), { ok: true })
  const noToken = await runChild(['trend-sources'], { ADMIN_API_BASE_URL: fake.base })
  assert.equal(noToken.status, 1)
  assert.equal(fake.requests.length, 1)
  await fake.close()
}

async function main() {
  await testEveryNameIsGetWithTokenAndPrintsBodyAsIs()
  await testQueryPairsAreEncodedAndPassed()
  await testUnknownNamesAreRejectedWithoutRequest()
  await testErrorStatusesExitOneWithoutToken()
  await testNetworkErrorAndRedirect()
  await testConnectionRulesAreSameAsSubmit()
  testReadPathsHaveRouteFiles()
  await testCommandLineEntry()
  console.log('ops-read.test.mjs 통과')
}

main()
