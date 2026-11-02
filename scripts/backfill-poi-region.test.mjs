// backfill-poi-region.mjs 테스트 (티켓 20261102_2254)
//
// 실제 NCP·DB는 부르지 않는다. 역지오코딩·행 읽기·쓰기는 가짜로 바꿔 끼운다(모든 외부 의존이 주입 가능).
// scripts/verify.sh의 scripts-test 단계가 이 파일을 돌린다. 직접 실행도 된다: node scripts/backfill-poi-region.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import {
  MAX_LISTED_FAILURES,
  MIN_INTERVAL_MS,
  REVERSE_GEOCODE_MODULE,
  createRestClient,
  formatReport,
  parseArgs,
  runBackfill,
  selectTargets,
} from './backfill-poi-region.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const row = (id, over = {}) => ({ id, latitude: 37.5, longitude: 127.0, sido: null, gu: null, ...over })

function fakeDeps(rows, geocodeMap = {}) {
  const calls = { geocode: [], write: [], sleep: [] }
  return {
    calls,
    fetchRows: async () => rows,
    geocode: async (lat, lng) => {
      calls.geocode.push([lat, lng])
      const id = rows[calls.geocode.length - 1]?.id
      return id in geocodeMap ? geocodeMap[id] : { sido: '서울특별시', gu: '강남구', dong: '역삼동' }
    },
    writeRow: async (id, sido, gu) => {
      calls.write.push([id, sido, gu])
    },
    sleep: async (ms) => {
      calls.sleep.push(ms)
    },
  }
}

function testParseArgs() {
  assert.deepEqual(parseArgs([]), { apply: false, limit: null }, '기본은 드라이런')
  assert.deepEqual(parseArgs(['--apply', '--limit', '20']), { apply: true, limit: 20 })
  assert.throws(() => parseArgs(['--limit']), /정수/)
  assert.throws(() => parseArgs(['--limit', '0']), /정수/)
  assert.throws(() => parseArgs(['--limit', 'abc']), /정수/)
  assert.throws(() => parseArgs(['--force']), /알 수 없는 옵션/)
}

function testSelectTargetsSkipsFilledRows() {
  const rows = [row('a'), row('b', { sido: '서울특별시', gu: '강남구' }), row('c', { sido: '세종특별자치시', gu: null })]
  assert.deepEqual(selectTargets(rows).map((r) => r.id), ['a'], 'sido가 있으면 gu가 NULL이어도 채워진 행이다')
}

async function testDryRunDoesNotWrite() {
  const rows = [row('a'), row('b'), row('c', { sido: '경기도', gu: '성남시' })]
  const deps = fakeDeps(rows, { b: null })
  const report = await runBackfill({ ...deps, apply: false })
  assert.equal(deps.calls.write.length, 0, '드라이런은 쓰지 않는다')
  assert.equal(report.apply, false)
  assert.equal(report.totalRows, 3)
  assert.equal(report.alreadyFilled, 1)
  assert.equal(report.targets, 2)
  assert.equal(report.resolved, 1)
  assert.equal(report.failed, 1)
  assert.deepEqual(report.failedIds, ['b'])
  assert.equal(report.written, 0)
  assert.equal(deps.calls.geocode.length, 2, '이미 채워진 행은 역지오코딩하지 않는다')
  assert.match(formatReport(report), /드라이런/)
}

async function testApplyWritesOnlySuccessfulRows() {
  const rows = [row('a'), row('b'), row('c'), row('d')]
  const deps = fakeDeps(rows, {
    b: null, // 실패
    c: { sido: '세종특별자치시', gu: null, dong: '한솔동' }, // 시·군·구 없는 지역
    d: { sido: null, gu: '어딘가', dong: null }, // 시·도가 없으면 실패
  })
  const report = await runBackfill({ ...deps, apply: true })
  assert.deepEqual(deps.calls.write, [
    ['a', '서울특별시', '강남구'],
    ['c', '세종특별자치시', null],
  ])
  assert.equal(report.written, 2)
  assert.equal(report.failed, 2)
  assert.deepEqual(report.failedIds, ['b', 'd'])
  assert.match(formatReport(report), /적용/)
}

async function testGeocodeThrowCountsAsFailure() {
  const deps = fakeDeps([row('a'), row('b')])
  deps.geocode = async () => {
    throw new Error('boom')
  }
  const report = await runBackfill({ ...deps, apply: true })
  assert.equal(report.failed, 2)
  assert.equal(deps.calls.write.length, 0, '실패한 행은 쓰지 않고 NULL로 둔다')
}

async function testRateLimitAndFailureListCap() {
  const rows = Array.from({ length: 30 }, (_, i) => row(`r${i}`))
  const map = Object.fromEntries(rows.map((r) => [r.id, null]))
  const deps = fakeDeps(rows, map)
  const report = await runBackfill({ ...deps, apply: false })
  assert.equal(report.failed, 30)
  assert.equal(report.failedIds.length, MAX_LISTED_FAILURES, '실패 id는 최대 20개만 싣는다')
  assert.equal(deps.calls.sleep.length, 29, '호출 사이마다 쉰다')
  assert.ok(deps.calls.sleep.every((ms) => ms >= 200), '초당 5건 이하(호출 간격 200ms 이상)')
  assert.ok(MIN_INTERVAL_MS >= 200)
  const text = formatReport(report)
  assert.match(text, /외 10개/)
  assert.ok(!text.includes('r25'), '20개를 넘는 id는 출력하지 않는다')
}

async function testLimitCapsTargets() {
  const deps = fakeDeps([row('a'), row('b'), row('c')])
  const report = await runBackfill({ ...deps, apply: false, limit: 2 })
  assert.equal(report.targets, 2)
  assert.equal(deps.calls.geocode.length, 2)
}

async function testRestClientUsesGuardedPatchAndPaging() {
  const requests = []
  const page = Array.from({ length: 1000 }, (_, i) => row(`x${i}`))
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init })
    if (init.method === 'PATCH') return { ok: true, status: 204 }
    const from = Number(init.headers.Range.split('-')[0])
    return { ok: true, status: 200, json: async () => (from === 0 ? page : [row('last')]) }
  }
  const client = createRestClient({ url: 'https://example.supabase.co/', serviceKey: 'fake-key', fetchImpl })
  const rows = await client.fetchRows()
  assert.equal(rows.length, 1001, '1,000행씩 쪽을 넘겨 모두 읽는다')
  assert.match(requests[0].url, /select=id,latitude,longitude,sido,gu&order=id\.asc/)

  await client.writeRow('abc', '서울특별시', '강남구')
  const patch = requests.at(-1)
  assert.equal(patch.init.method, 'PATCH')
  assert.match(patch.url, /\?id=eq\.abc&sido=is\.null$/, 'sido가 NULL인 행에만 쓴다')
  assert.deepEqual(JSON.parse(patch.init.body), { sido: '서울특별시', gu: '강남구' })
}

async function testRestClientReadFailureThrowsWithoutKey() {
  const fetchImpl = async () => ({ ok: false, status: 400 })
  const client = createRestClient({ url: 'https://example.supabase.co', serviceKey: 'secret-key-value', fetchImpl })
  await assert.rejects(client.fetchRows(), (error) => {
    assert.match(error.message, /313/)
    assert.ok(!error.message.includes('secret-key-value'), '키 값을 메시지에 싣지 않는다')
    return true
  })
}

async function testRealGeocodeModuleLoads() {
  const modulePath = path.join(__dirname, '..', REVERSE_GEOCODE_MODULE)
  const mod = await import(pathToFileURL(modulePath).href)
  assert.equal(typeof mod.reverseGeocodeToRegions, 'function', '채움 스크립트가 불러 쓰는 역지오코딩 함수가 있다')
}

function testMissingEnvFailsWithOneLineAndExitCode1() {
  const res = spawnSync(process.execPath, [path.join(__dirname, 'backfill-poi-region.mjs')], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  })
  assert.equal(res.status, 1)
  assert.equal(res.stderr.trim().split('\n').length, 1, '실패 원인은 한 줄')
  assert.match(res.stderr, /NEXT_PUBLIC_SUPABASE_URL/)
  assert.equal(res.stdout, '', '아무것도 하지 않는다')
}

function testBadOptionFailsBeforeAnyWork() {
  const res = spawnSync(process.execPath, [path.join(__dirname, 'backfill-poi-region.mjs'), '--force'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  })
  assert.equal(res.status, 1)
  assert.match(res.stderr, /알 수 없는 옵션/)
}

async function main() {
  testParseArgs()
  testSelectTargetsSkipsFilledRows()
  await testDryRunDoesNotWrite()
  await testApplyWritesOnlySuccessfulRows()
  await testGeocodeThrowCountsAsFailure()
  await testRateLimitAndFailureListCap()
  await testLimitCapsTargets()
  await testRestClientUsesGuardedPatchAndPaging()
  await testRestClientReadFailureThrowsWithoutKey()
  await testRealGeocodeModuleLoads()
  testMissingEnvFailsWithOneLineAndExitCode1()
  testBadOptionFailsBeforeAnyWork()
  console.log('backfill-poi-region.test.mjs 통과')
}

main()
