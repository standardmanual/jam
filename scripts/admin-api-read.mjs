#!/usr/bin/env node
// 어드민 API 읽기 — 미션·배지·유저·배지 지표 라벨 현황을 어드민 API 경유로 조회한다.
// (티켓 20260918_0421, 근거: JAM-WORK/05_자동화목록.md A5. 드랍 정책 조회는 어드민 «드랍 정책» 화면과 API를 지우면서 뺐다, 티켓 20261022_0938)
//
// service_role 키를 쓰지 않는다. DB 직접 접근이 아니라 반드시 /api/admin/* HTTP 경유로만
// 조회한다 — 권한 검사·검증 로직을 그대로 타기 위함이다(JAM-WORK/05_자동화목록.md 원칙).
//
// 인증: 두 가지 방식을 지원한다 (티켓 20260918_1149).
// 1. ADMIN_API_READ_TOKEN(권장, 자동화용) — GET 전용 자동화 토큰. 클라우드 예약 작업
//    환경에 등록해두면 로그인 쿠키 없이 바로 조회할 수 있다. 만료가 없고, 환경변수 값을
//    바꾸면 즉시 이전 토큰이 차단된다.
// 2. ADMIN_API_COOKIE(기존 방식) — 어드민 화이트리스트 계정(ADMIN_EMAILS)으로 브라우저에서
//    /admin에 로그인한 뒤, 개발자도구 Network 탭에서 Cookie 헤더 값을 복사해 넘긴다
//    (Google OAuth 세션이라 스크립트가 자체적으로 로그인할 수 없다 — 사람이 한 번 발급).
// ADMIN_API_READ_TOKEN이 있으면 그 값을 우선 쓰고, 없으면 쿠키 방식으로 폴백한다.
//
// 참고: 어드민 API에는 "지표"(서비스 KPI) 전용 엔드포인트가 없다. badge-metric-labels로
// 가장 근접한 값을 대신 조회한다 — 실제 KPI 대시보드가 생기면 이 스크립트도 갱신해야 한다.
//
// 사용법:
//   ADMIN_API_BASE_URL=https://stage.j-a-m.app \
//   ADMIN_API_READ_TOKEN=xxxxx \
//     node scripts/admin-api-read.mjs
//
//   또는(기존 쿠키 방식):
//   ADMIN_API_BASE_URL=https://stage.j-a-m.app \
//   ADMIN_API_COOKIE="sb-xxx-auth-token=...; sb-xxx-auth-token.1=..." \
//     node scripts/admin-api-read.mjs

import { buildPublicMissionCheckLines } from './public-mission-check.mjs'

const BASE_URL = process.env.ADMIN_API_BASE_URL || 'http://localhost:3000'
const READ_TOKEN = process.env.ADMIN_API_READ_TOKEN
const COOKIE = process.env.ADMIN_API_COOKIE

if (!READ_TOKEN && !COOKIE) {
  console.error(
    'ADMIN_API_READ_TOKEN 또는 ADMIN_API_COOKIE가 필요합니다. 자동화 토큰을 등록했거나, ' +
      '어드민 계정으로 /admin에 로그인한 뒤 쿠키를 복사해 넘기세요.'
  )
  process.exit(1)
}

const AUTH_HEADERS = READ_TOKEN ? { 'x-admin-read-token': READ_TOKEN } : { Cookie: COOKIE }

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: AUTH_HEADERS })
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json()
}

const TARGETS = [
  ['missions', '/api/admin/missions'],
  ['badges', '/api/admin/badges'],
  ['users', '/api/admin/users'],
  ['badgeMetricLabels', '/api/admin/badge-metric-labels'],
]

async function main() {
  const results = {}
  for (const [key, path] of TARGETS) {
    try {
      results[key] = await getJson(path)
    } catch (e) {
      results[key] = { __error: String(e.message ?? e) }
    }
  }

  console.log(`## 어드민 현황 (${BASE_URL})`)

  if (results.missions.__error) console.log(`- 미션: 조회 실패 (${results.missions.__error})`)
  else console.log(`- 미션: ${results.missions.length}건`)

  if (results.badges.__error) console.log(`- 배지: 조회 실패 (${results.badges.__error})`)
  else console.log(`- 배지: ${results.badges.badges?.length ?? 0}건`)

  if (results.users.__error) console.log(`- 유저(최근 20): 조회 실패 (${results.users.__error})`)
  else console.log(`- 유저(최근 20): ${results.users.users?.length ?? 0}건`)

  if (results.badgeMetricLabels.__error)
    console.log(`- 배지 지표 라벨: 조회 실패 (${results.badgeMetricLabels.__error})`)
  else console.log(`- 배지 지표 라벨: ${results.badgeMetricLabels.labels?.length ?? 0}건`)

  // 공개 미션 점검 (티켓 20260924_1502) — 미션·배지 응답으로 집계 건수만 출력한다
  for (const line of buildPublicMissionCheckLines(results.missions, results.badges)) console.log(line)
}

main()
