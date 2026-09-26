// weekly-collect.mjs 테스트 (티켓 20260926_1545)
//
// scripts/verify.sh의 scripts-test 단계가 이 파일을 돌린다. 직접 실행도 된다.
// 실행: node scripts/weekly-collect.test.mjs
//
// 실 GA4·어드민 API는 호출하지 않는다 — 출처는 주입 가능한 { name, run } 배열이다.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  collectWeekly,
  fetchKpiWeekly,
  flattenJson,
  parseArgs,
  sanitize,
  summarizeGitLog,
  summarizeTriage,
  trimDashboardCard,
} from './weekly-collect.mjs'

const NO_SECRET_ENV = {}

async function testSectionsInSourceOrder() {
  const { output, results } = await collectWeekly({
    env: NO_SECRET_ENV,
    sources: [
      { name: 'A', run: async () => '- a: 1' },
      { name: 'B', run: async () => '- b: 2' },
    ],
  })
  assert.ok(results.every((r) => r.ok))
  assert.ok(output.indexOf('### 출처: A') < output.indexOf('### 출처: B'))
  assert.ok(output.includes('- a: 1') && output.includes('- b: 2'))
  assert.ok(!output.includes('수집 실패'))
}

async function testFailedSourceRetriedOnceAndOthersContinue() {
  let failCalls = 0
  let flakyCalls = 0
  const { output, results } = await collectWeekly({
    env: NO_SECRET_ENV,
    sources: [
      {
        name: '망가진 출처',
        run: async () => {
          failCalls++
          throw new Error('503 Service Unavailable\n스택 줄')
        },
      },
      {
        name: '한 번 실패',
        run: async () => {
          flakyCalls++
          if (flakyCalls === 1) throw new Error('일시 오류')
          return '- ok: 1'
        },
      },
      { name: '정상', run: async () => '- fine: 1' },
    ],
  })
  assert.equal(failCalls, 2, '실패한 출처는 정확히 1회 재시도한다')
  assert.equal(flakyCalls, 2)
  assert.equal(results.filter((r) => !r.ok).length, 1)
  assert.ok(output.startsWith('수집 실패: 망가진 출처 (503 Service Unavailable)'))
  assert.ok(output.includes('### 출처: 망가진 출처\n수집 실패: 503 Service Unavailable'))
  assert.ok(!output.includes('스택 줄'), '사유는 첫 줄만 적는다')
  assert.ok(output.includes('- ok: 1'), '재시도로 성공한 출처는 정상 출력')
  assert.ok(output.includes('- fine: 1'), '실패 출처가 있어도 나머지는 출력')
}

async function testOutputHasNoEmailOrToken() {
  const env = {
    ADMIN_API_READ_TOKEN: 'super-secret-token-value',
    ADMIN_API_COOKIE: 'sb-abc-auth-token=cookievalue123456',
  }
  const { output } = await collectWeekly({
    env,
    sources: [
      {
        name: '유출 시도',
        run: async () =>
          [
            '- 유저: hong@example.com',
            '- 토큰: super-secret-token-value',
            '- 쿠키: sb-abc-auth-token=cookievalue123456; other=1',
            '- 헤더: Bearer abc.def-123',
          ].join('\n'),
      },
      {
        name: '사유에 유출',
        run: async () => {
          throw new Error('401 for user kim@example.org with super-secret-token-value')
        },
      },
    ],
  })
  assert.ok(!output.includes('@'), '이메일 형태(@)가 없다')
  assert.ok(!output.includes('super-secret-token-value'))
  assert.ok(!output.includes('cookievalue123456'))
  assert.ok(!output.includes('abc.def-123'))
}

function testSanitizeKeepsPlainNumbers() {
  assert.equal(sanitize('- 활성 유저: 120', NO_SECRET_ENV), '- 활성 유저: 120')
}

function testParseArgs() {
  const now = new Date('2026-09-28T00:00:00Z')
  assert.deepEqual(parseArgs(['--since', '2026-09-21'], now), { since: '2026-09-21' })
  assert.deepEqual(parseArgs([], now), { since: '2026-09-21' })
  assert.throws(() => parseArgs(['--since', '9/21'], now))
  assert.throws(() => parseArgs(['--since', '2026-13-40'], now))
  assert.throws(() => parseArgs(['--since'], now))
}

function testFlattenJson() {
  const lines = flattenJson({ a: 1, b: { c: 2, d: [1, 2] } })
  assert.deepEqual(lines.slice(0, 2), ['- a: 1', '- b.c: 2'])
  assert.ok(lines[2].startsWith('- b.d: 2건'))
}

async function testFetchKpiWeekly() {
  await assert.rejects(() => fetchKpiWeekly({ env: {} }), /ADMIN_API_READ_TOKEN/)

  let seen
  const ok = await fetchKpiWeekly({
    env: { ADMIN_API_READ_TOKEN: 'tok-12345678', ADMIN_API_BASE_URL: 'https://x.test' },
    fetchImpl: async (url, init) => {
      seen = { url, init }
      return { ok: true, json: async () => ({ missionCompleters: 4 }) }
    },
  })
  assert.equal(seen.url, 'https://x.test/api/admin/kpi/weekly')
  assert.equal(seen.init.headers['x-admin-read-token'], 'tok-12345678')
  assert.equal(ok, '- missionCompleters: 4')

  await assert.rejects(
    () =>
      fetchKpiWeekly({
        env: { ADMIN_API_READ_TOKEN: 'tok-12345678' },
        fetchImpl: async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }),
      }),
    /401 Unauthorized/
  )
}

function testTrimDashboardCard() {
  const raw = '[경고] 리포트 누락\n## 티켓 현황판 (2건)\n- [OPEN] P2 A\n- [OPEN] P2 B\n\n**카리나 — 카드**\n본문'
  const out = trimDashboardCard(raw)
  assert.ok(out.includes('[경고] 리포트 누락') && out.includes('- [OPEN] P2 B'))
  assert.ok(!out.includes('카리나'))
  assert.equal(trimDashboardCard('헤더 없음'), '헤더 없음')
}

function testSummarizeGitLog() {
  const text = summarizeGitLog('abc1234 첫 커밋\ndef5678 둘째 커밋\n')
  assert.ok(text.startsWith('- 커밋 2건'))
  assert.ok(text.includes('- abc1234 첫 커밋'))
  assert.equal(summarizeGitLog(''), '- 커밋 0건')
}

function testSummarizeTriage() {
  const root = mkdtempSync(join(tmpdir(), 'weekly-collect-'))
  try {
    assert.equal(summarizeTriage(root, '2026-09-21'), '- 대상 없음 (선별 리포트 폴더 없음)')

    const dir = join(root, 'jam-doc', 'operations', 'reports', 'triage')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, '2026-09-20.md'),
      '# 선별\n- [x] 20260920_0001 · 적격 · 오래된 파일\n'
    )
    assert.equal(summarizeTriage(root, '2026-09-21'), '- 대상 없음')

    writeFileSync(
      join(dir, '2026-09-22.md'),
      [
        '# 선별 2026-09-22',
        '',
        '- [x] 20260922_0001 · 적격 · 사유',
        '- [ ] 20260922_0002 · 적격 · 사유',
        '- [x] 20260922_0003 · 사람 필요 · 사유',
        '- [x] 20260922_0004 · 사람 필요 · 사유',
      ].join('\n')
    )
    const text = summarizeTriage(root, '2026-09-21')
    assert.ok(text.includes('3 / 4 (동의율 75%)'))
    assert.ok(text.includes('적격 2건 · 사람 필요 2건'))
    assert.ok(!text.includes('오래된 파일'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

await testSectionsInSourceOrder()
await testFailedSourceRetriedOnceAndOthersContinue()
await testOutputHasNoEmailOrToken()
testSanitizeKeepsPlainNumbers()
testParseArgs()
testFlattenJson()
await testFetchKpiWeekly()
testTrimDashboardCard()
testSummarizeGitLog()
testSummarizeTriage()
console.log('weekly-collect 테스트 통과')
