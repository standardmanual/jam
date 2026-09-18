// jam-work.js 스모크 테스트 (티켓 20260918_1148)
//
// `.claude/workflows/*.js`는 Workflow 도구가 `agent`·`phase`·`args`·`budget`을 전역으로 주입한
// 채 실행하는 특수 스크립트라, jam-web의 vitest 하네스로는 돌릴 수 없다(verify.sh는 jam-web/
// 안쪽만 본다). 이 파일은 같은 방식(전역 주입 + 최상위 await/return)으로 스크립트 본문을
// AsyncFunction에 담아 실행하는 최소 러너다.
//
// 실행: node .claude/workflows/jam-work.test.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

let src = readFileSync(path.join(__dirname, 'jam-work.js'), 'utf8')
// `export const meta = {...}`는 Workflow 도구 메타데이터라 본문 실행에 필요 없다 — 제거한다.
src = src.replace(/^export const meta = \{[\s\S]*?\n\}\n/, '')

function makeRunner({ agentImpl, budgetStep = 100 }) {
  let spent = 0
  const calls = []
  const agent = async (prompt, opts) => {
    calls.push({ label: opts?.label, agentType: opts?.agentType })
    spent += budgetStep
    return agentImpl(prompt, opts)
  }
  const phase = () => {}
  const budget = { spent: () => spent }
  const raw = new AsyncFunction('args', 'agent', 'phase', 'budget', src)
  const run = (a) => raw(a, agent, phase, budget)
  return { run, calls, budget }
}

async function test1_needsApprovalStops() {
  const { run, calls } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-designer-pre') {
        return '| needs_approval | 새 토큰 `surface-alt` 필요 |'
      }
      throw new Error(`예상치 못한 호출: ${opts.label}`)
    },
  })
  const result = await run(
    { ticketPath: 't.md', userRequest: 'r', workType: 'ui' },
  )
  assert.equal(result.stoppedAt, '채원 사전 판정')
  assert.equal(result.needsApprovalItems.includes('surface-alt'), true)
  assert.equal(calls.length, 1, 'needs_approval이면 채원①만 호출하고 아현은 부르지 않아야 한다')
  assert.ok(result.tokenUsage['jam-designer-pre'] > 0)
  console.log('PASS test1_needsApprovalStops')
}

async function test2_needsApprovalNoneProceeds() {
  const { run, calls } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-designer-pre') return '| needs_approval | 없음 |'
      if (opts.label === 'jam-developer') return 'status: done\n구현 완료'
      if (opts.label === 'conservative-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 20 }
      if (opts.label === 'jam-designer-post') return { hasCritical: false, proposals: [] }
      throw new Error(`예상치 못한 호출: ${opts.label}`)
    },
  })
  const result = await run({ ticketPath: 't.md', userRequest: 'r', workType: 'ui' })
  assert.equal(result.stoppedAt, null)
  assert.equal(calls.length, 4, '표준 경로면 채원①·아현·민지·채원②가 모두 호출돼야 한다')
  console.log('PASS test2_needsApprovalNoneProceeds')
}

async function test3_lightRouteSkipsDesigner() {
  const { run, calls } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-developer') return 'status: done\n구현 완료'
      if (opts.label === 'conservative-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 20 }
      throw new Error(`예상치 못한 호출: ${opts.label}`)
    },
  })
  const result = await run({ ticketPath: 't.md', userRequest: 'r', workType: 'ui', route: 'light' })
  assert.equal(result.stoppedAt, null)
  assert.equal(result.designDecision, null)
  assert.equal(result.designReview, null)
  assert.equal(calls.length, 2, '경로 ②면 채원①·②를 건너뛰고 아현·민지만 호출돼야 한다')
  assert.ok(!calls.some((c) => c.agentType === 'jam-designer'))
  console.log('PASS test3_lightRouteSkipsDesigner')
}

async function main() {
  await test1_needsApprovalStops()
  await test2_needsApprovalNoneProceeds()
  await test3_lightRouteSkipsDesigner()
  console.log('전체 통과')
}

main().catch((err) => {
  console.error('FAIL', err)
  process.exit(1)
})
