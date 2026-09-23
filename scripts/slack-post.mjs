#!/usr/bin/env node
// Slack 봇 게시 — 예약 루틴이 `#jam-alert`·`#jam-report`에 JAM 봇 계정으로 직접 글을 올린다.
// (티켓 20260923_1106, 선행 20260918_1154 잔여 이슈 해결)
//
// 기존에는 claude.ai에 연결된 사용자 계정용 Slack 커넥터로 게시해 게시자가 항상 사용자 본인
// 계정으로 표시됐다. 이 스크립트는 별도 Slack 앱("JAM 봇")의 Bot Token으로 Slack Web API
// `chat.postMessage`를 직접 호출해 봇 계정 이름으로 게시한다.
//
// 채널 ID는 넘겨받은 값을 그대로 쓴다(하드코딩하지 않는다). 단일 원천은
// `.claude/skills/jam-work/references/automation-list.md` "Slack 채널" 절이다:
//   #jam-alert  → C0C2S11PPRQ
//   #jam-report → C0C2U1T186M
//
// 사용법:
//   SLACK_BOT_TOKEN=xoxb-... \
//     node scripts/slack-post.mjs --channel C0C2S11PPRQ --text "게시할 내용"

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_URL = 'https://slack.com/api/chat.postMessage'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function parseArgs(argv) {
  const channelIdx = argv.indexOf('--channel')
  const textIdx = argv.indexOf('--text')
  const channel = channelIdx !== -1 ? argv[channelIdx + 1] : null
  const text = textIdx !== -1 ? argv[textIdx + 1] : null
  return { channel, text }
}

// Slack chat.postMessage를 봇 토큰으로 호출한다. 토큰 값 자체는 로그에 찍지 않는다
// (deploy-gate.mjs의 원칙 — 출력에는 값이 아니라 종류만 적는다).
export async function postToSlack({ channel, text, token, fetchImpl = fetch }) {
  if (!token) {
    fail('SLACK_BOT_TOKEN 환경변수가 필요합니다.')
  }
  if (!channel || !text) {
    fail('--channel과 --text 인자가 모두 필요합니다.')
  }

  const res = await fetchImpl(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text }),
  })

  if (!res.ok) {
    fail(`Slack API 호출 실패: ${res.status} ${res.statusText}`)
  }

  const json = await res.json()
  if (!json.ok) {
    fail(`Slack 게시 실패: ${json.error}`)
  }

  return json
}

async function main() {
  const { channel, text } = parseArgs(process.argv.slice(2))
  const token = process.env.SLACK_BOT_TOKEN
  await postToSlack({ channel, text, token })
  console.log(`Slack 게시 완료: ${channel}`)
}

// 테스트에서 이 모듈을 import할 때는 실행하지 않는다. 한글 경로는 URL에서 퍼센트 인코딩되므로
// 문자열이 아니라 파일 경로로 바꿔 비교한다.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
