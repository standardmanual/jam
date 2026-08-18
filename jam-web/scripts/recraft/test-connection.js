#!/usr/bin/env node
/**
 * Recraft API 연결 테스트 (2026-08-18)
 *
 * GET /v1/users/me 호출로 API 키 유효성과 크레딧 잔액을 확인한다.
 * 배지 이미지 대량 생성 워크플로우(Service Plan/Specs/Content/IMAGE_PRODUCTION/) 착수 전
 * 연결 확인용.
 *
 * 필요 환경변수 (.env.local): RECRAFT_API_KEY
 * 실행: node scripts/recraft/test-connection.js
 */
const fs = require('fs')
const path = require('path')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env.local')
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=\"?([^\"]*)\"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

async function main() {
  const env = loadEnv()
  const apiKey = env.RECRAFT_API_KEY
  if (!apiKey) {
    console.error('RECRAFT_API_KEY가 .env.local에 없습니다.')
    process.exit(1)
  }

  const res = await fetch('https://external.api.recraft.ai/v1/users/me', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    console.error(`연결 실패: HTTP ${res.status}`)
    console.error(await res.text())
    process.exit(1)
  }

  const data = await res.json()
  console.log('Recraft API 연결 성공')
  console.log(`- 계정: ${data.email ?? '(비공개)'}`)
  console.log(`- 크레딧 잔액: ${data.credits}`)
}

main()
