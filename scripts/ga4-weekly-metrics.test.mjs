// ga4-weekly-metrics.mjs 테스트 (티켓 20260918_1151)
//
// verify.sh는 jam-web/ 안쪽만 검사하므로, 루트 scripts/의 순수 로직은 이 파일을 직접 실행해
// 검증한다. 실행: node scripts/ga4-weekly-metrics.test.mjs
//
// 실 GA4 호출은 하지 않는다 — 서비스 계정 키가 필요한 인증·runReport는 주입 가능한 콜백으로
// 분리해(fetchWeeklyMetrics의 getToken/callRunReport) 목으로 대체한다.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchWeeklyMetrics } from './ga4-weekly-metrics.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function testFetchWeeklyMetricsAggregatesEventCounts() {
  const runReportCalls = []
  const result = await fetchWeeklyMetrics({
    getToken: async () => 'fake-token',
    callRunReport: async (token, body) => {
      runReportCalls.push(body)
      assert.equal(token, 'fake-token')
      if (body.dimensions) {
        // 이벤트 카운트 리포트 — 일부 이벤트만 값이 있고 나머지는 응답에 없는 경우도 대비한다.
        return {
          rows: [
            { dimensionValues: [{ value: 'item_drop' }], metricValues: [{ value: '12' }] },
            { dimensionValues: [{ value: 'mission_join' }], metricValues: [{ value: '3' }] },
            { dimensionValues: [{ value: 'unrelated_event' }], metricValues: [{ value: '999' }] },
          ],
        }
      }
      // 활성 유저 리포트
      return { rows: [{ metricValues: [{ value: '42' }] }] }
    },
  })

  assert.equal(result.activeUsers, 42)
  assert.equal(result.eventCounts.item_drop, 12)
  assert.equal(result.eventCounts.mission_join, 3)
  assert.equal(result.eventCounts.item_pickup, 0, '응답에 없는 이벤트는 0으로 채워야 한다')
  assert.equal('unrelated_event' in result.eventCounts, false, '정의되지 않은 이벤트는 무시해야 한다')
  assert.equal(runReportCalls.length, 2, 'activeUsers·이벤트 카운트 두 번의 runReport 호출이어야 한다')
}

function testMissingEnvVarsFailsWithOneLineMessageAndExitCode1() {
  const scriptPath = path.join(__dirname, 'ga4-weekly-metrics.mjs')
  const res = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH }, // GA4_PROPERTY_ID·GA4_SERVICE_ACCOUNT_KEY 없이 실행
  })

  assert.equal(res.status, 1, '환경변수가 없으면 실패 코드로 끝나야 한다')
  const stderrLines = res.stderr.trim().split('\n')
  assert.equal(stderrLines.length, 1, '실패 원인은 한 줄로 출력해야 한다')
  assert.match(res.stderr, /GA4_PROPERTY_ID/)
}

async function main() {
  await testFetchWeeklyMetricsAggregatesEventCounts()
  testMissingEnvVarsFailsWithOneLineMessageAndExitCode1()
  console.log('ga4-weekly-metrics.test.mjs 통과')
}

main()
