#!/usr/bin/env node
// GA4 Data API 연결 — 주간 브리핑 성장·행동 지표를 GA4에서 읽는다.
// (티켓 20260918_1151, 상위 20260918_1101 안건 4-7)
//
// GA4 Data API runReport를 서비스 계정 인증(JWT Bearer, OAuth2 서버-투-서버 흐름)으로 호출한다.
// 공식 문서:
//   https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
//   https://developers.google.com/identity/protocols/oauth2/service-account#jwt-auth
//
// 지표 정의는 GA4_EVENTS.md "주간 브리핑 지표 정의" 절 참고. 지난 7일(7daysAgo~yesterday)
// 값을 숫자로만 출력한다 — 개인 식별 정보는 다루지 않는다.
//
// 인증: 서비스 계정 키 JSON 파일의 전체 내용을 GA4_SERVICE_ACCOUNT_KEY 환경변수로 받는다
// (파일 경로가 아니라 JSON 문자열 그대로). 키 파일·키 값은 저장소에 커밋하지 않는다.
//
// 사용법:
//   GA4_PROPERTY_ID=123456789 \
//   GA4_SERVICE_ACCOUNT_KEY="$(cat service-account.json)" \
//     node scripts/ga4-weekly-metrics.mjs

import { createSign } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// [이벤트명, 표시 라벨] — GA4_EVENTS.md "주간 브리핑 지표 정의"와 동기화한다.
const EVENT_METRICS = [
  ['sign_up_complete', '가입 완료'],
  ['onboarding_complete', '온보딩 완료'],
  ['item_drop', '드랍'],
  ['item_pickup', '픽업'],
  ['combine_success', '믹스 성공'],
  ['mission_join', '미션 참가'],
]

function fail(message) {
  console.error(message)
  process.exit(1)
}

// 환경변수를 읽고 검증한다. import 시점이 아니라 실행 시점에만 호출해야 테스트에서
// 이 모듈을 안전하게 import할 수 있다.
function readServiceAccountConfig() {
  const propertyId = process.env.GA4_PROPERTY_ID
  const serviceAccountKeyRaw = process.env.GA4_SERVICE_ACCOUNT_KEY

  if (!propertyId) {
    fail('GA4_PROPERTY_ID 환경변수가 필요합니다.')
  }
  if (!serviceAccountKeyRaw) {
    fail('GA4_SERVICE_ACCOUNT_KEY 환경변수가 필요합니다 (서비스 계정 키 JSON 전체 내용).')
  }

  let serviceAccount
  try {
    serviceAccount = JSON.parse(serviceAccountKeyRaw)
  } catch {
    fail('GA4_SERVICE_ACCOUNT_KEY가 올바른 JSON이 아닙니다.')
  }

  const clientEmail = serviceAccount?.client_email
  const privateKey = serviceAccount?.private_key
  if (!clientEmail || !privateKey) {
    fail('GA4_SERVICE_ACCOUNT_KEY에 client_email 또는 private_key가 없습니다.')
  }

  return { propertyId, clientEmail, privateKey }
}

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

// 서비스 계정 JWT 어써션을 만들고 RS256으로 서명한다 (OAuth2 JWT Bearer 흐름).
function buildAssertionJwt({ clientEmail, privateKey }) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature = base64url(signer.sign(privateKey))
  return `${unsigned}.${signature}`
}

async function getAccessToken(config) {
  const assertion = buildAssertionJwt(config)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`토큰 발급 실패: ${res.status} ${text.slice(0, 200)}`)
  }
  const json = await res.json()
  return json.access_token
}

async function runReport(propertyId, accessToken, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`runReport 실패: ${res.status} ${text.slice(0, 200)}`)
  }
  return res.json()
}

// 지난 7일 값을 숫자로 계산해 돌려준다. 실패하면 예외를 던진다.
// getToken·callRunReport는 실제 GA4 호출(기본값)을 테스트용 목으로 바꿔치기할 수 있게 둔
// 주입 지점이다 — 기본값은 함수 호출 시점에만 환경변수를 읽으므로 테스트에서 이 모듈을
// import해도 환경변수 검증이 실행되지 않는다.
export async function fetchWeeklyMetrics({
  getToken = () => getAccessToken(readServiceAccountConfig()),
  callRunReport = (accessToken, body) =>
    runReport(readServiceAccountConfig().propertyId, accessToken, body),
} = {}) {
  const accessToken = await getToken()
  const dateRanges = [{ startDate: '7daysAgo', endDate: 'yesterday' }]

  const activeUsersReport = await callRunReport(accessToken, {
    dateRanges,
    metrics: [{ name: 'activeUsers' }],
  })
  const activeUsers = Number(activeUsersReport.rows?.[0]?.metricValues?.[0]?.value ?? 0)

  const eventReport = await callRunReport(accessToken, {
    dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: EVENT_METRICS.map(([name]) => name) },
      },
    },
  })

  const eventCounts = Object.fromEntries(EVENT_METRICS.map(([name]) => [name, 0]))
  for (const row of eventReport.rows ?? []) {
    const eventName = row.dimensionValues?.[0]?.value
    const count = Number(row.metricValues?.[0]?.value ?? 0)
    if (eventName in eventCounts) {
      eventCounts[eventName] = count
    }
  }

  return { activeUsers, eventCounts }
}

async function main() {
  let result
  try {
    result = await fetchWeeklyMetrics()
  } catch (e) {
    fail(`GA4 조회 실패: ${e.message ?? e}`)
    return
  }

  console.log('## GA4 주간 지표 (최근 7일)')
  console.log(`- 활성 유저: ${result.activeUsers}`)
  for (const [eventName, label] of EVENT_METRICS) {
    console.log(`- ${label}(${eventName}): ${result.eventCounts[eventName]}`)
  }
}

// 테스트에서 이 모듈을 import할 때는 실행하지 않는다. 한글 경로는 URL에서 퍼센트 인코딩되므로
// 문자열이 아니라 파일 경로로 바꿔 비교한다.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
