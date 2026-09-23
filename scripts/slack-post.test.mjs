// slack-post.mjs 테스트 (티켓 20260923_1106)
//
// jam-web의 npm test는 루트 scripts/를 보지 않아 이 파일이 루트 scripts/의 순수 로직을 검증한다.
// scripts/verify.sh의 scripts-test 단계가 이 파일을 돌린다. 직접 실행도 된다.
// 실행: node scripts/slack-post.test.mjs
//
// 실 Slack API 호출은 하지 않는다 — chat.postMessage 호출은 주입 가능한 fetchImpl로
// 목으로 대체한다.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postToSlack } from './slack-post.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function testPostToSlackCallsChatPostMessageWithAuthAndBody() {
  const calls = []
  const result = await postToSlack({
    channel: 'C0C2S11PPRQ',
    text: '테스트 메시지',
    token: 'xoxb-fake-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({ ok: true, channel: 'C0C2S11PPRQ', ts: '123.456' }),
      }
    },
  })

  assert.equal(calls.length, 1, 'chat.postMessage를 한 번만 호출해야 한다')
  assert.equal(calls[0].url, 'https://slack.com/api/chat.postMessage')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer xoxb-fake-token')
  const body = JSON.parse(calls[0].options.body)
  assert.equal(body.channel, 'C0C2S11PPRQ')
  assert.equal(body.text, '테스트 메시지')
  assert.equal(result.ok, true)
}

function testMissingTokenFailsWithOneLineMessageAndExitCode1() {
  const scriptPath = path.join(__dirname, 'slack-post.mjs')
  const res = spawnSync(
    process.execPath,
    [scriptPath, '--channel', 'C0C2S11PPRQ', '--text', '테스트'],
    {
      encoding: 'utf8',
      env: { PATH: process.env.PATH }, // SLACK_BOT_TOKEN 없이 실행
    }
  )

  assert.equal(res.status, 1, '토큰이 없으면 실패 코드로 끝나야 한다')
  const stderrLines = res.stderr.trim().split('\n')
  assert.equal(stderrLines.length, 1, '실패 원인은 한 줄로 출력해야 한다')
  assert.match(res.stderr, /SLACK_BOT_TOKEN/)
}

async function main() {
  await testPostToSlackCallsChatPostMessageWithAuthAndBody()
  testMissingTokenFailsWithOneLineMessageAndExitCode1()
  console.log('slack-post.test.mjs 통과')
}

main()
