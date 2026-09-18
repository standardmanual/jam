// jam-work.js 스모크 테스트 (티켓 20260918_1148, 20260918_1158에서 확장)
//
// `.claude/workflows/*.js`는 Workflow 도구가 `agent`·`phase`·`args`·`budget`·`parallel`을 전역으로
// 주입한 채 실행하는 특수 스크립트라, jam-web의 vitest 하네스로는 돌릴 수 없다(verify.sh는
// jam-web/ 안쪽만 본다). 이 파일은 같은 방식(전역 주입 + 최상위 await/return)으로 스크립트
// 본문을 AsyncFunction에 담아 실행하는 최소 러너다.
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
    calls.push({ label: opts?.label, agentType: opts?.agentType, prompt })
    spent += budgetStep
    return agentImpl(prompt, opts)
  }
  const phase = () => {}
  const budget = { spent: () => spent }
  // 전역 parallel() — 배리어, 실패한 작업은 null (티켓 20260918_1158). Promise.all이 아니라
  // allSettled를 써서, 한쪽 agent()가 던져도 다른 쪽 결과를 잃지 않는 실제 동작을 그대로 흉내낸다.
  const parallel = async (thunks) => {
    const settled = await Promise.allSettled(thunks.map((fn) => (typeof fn === 'function' ? fn() : fn)))
    return settled.map((r) => (r.status === 'fulfilled' ? r.value : null))
  }
  const raw = new AsyncFunction('args', 'agent', 'phase', 'budget', 'parallel', src)
  const run = (a) => raw(a, agent, phase, budget, parallel)
  return { run, calls, budget }
}

async function test1_needsApprovalStops() {
  const { run, calls } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-designer-pre') {
        return { decision: '서비스 전용', needsApproval: true, approvalItems: ['새 토큰 surface-alt 필요'] }
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

async function test2_needsApprovalNoneProceedsInParallel() {
  const { run, calls } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-designer-pre') return { decision: '재사용', needsApproval: false }
      if (opts.label === 'jam-developer') {
        return {
          status: 'done', summary: '구현 완료',
          branch: 'claude/jamwork-t-slug', commitSha: 'cccc111', baseSha: 'bbbb000',
          diffLineCount: 20,
        }
      }
      if (opts.label === 'conservative-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 20, reviewedRange: 'bbbb000..cccc111' }
      if (opts.label === 'jam-designer-post') return { hasCritical: false, proposals: [] }
      throw new Error(`예상치 못한 호출: ${opts.label}`)
    },
  })
  const result = await run({ ticketPath: 't.md', userRequest: 'r', workType: 'ui' })
  assert.equal(result.stoppedAt, null)
  assert.equal(calls.length, 4, '표준 경로면 채원①·아현·민지·채원②가 모두 호출돼야 한다')
  const gateCall = calls.find((c) => c.label === 'conservative-reviewer')
  const designPostCall = calls.find((c) => c.label === 'jam-designer-post')
  assert.ok(gateCall && designPostCall, '민지와 채원②가 동시에(같은 parallel() 배치로) 호출돼야 한다')
  assert.ok(gateCall.prompt.includes('bbbb000..cccc111'), '민지 프롬프트에 baseSha..commitSha 범위가 적혀야 한다')
  assert.ok(designPostCall.prompt.includes('bbbb000..cccc111'), '채원②도 같은 커밋 범위만 봐야 한다')
  console.log('PASS test2_needsApprovalNoneProceedsInParallel')
}

async function test3_lightRouteSkipsDesigner() {
  const { run, calls } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-developer') return { status: 'done', summary: '구현 완료', diffLineCount: 20 }
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

async function test4_retryBranchResumesExistingBranch() {
  const { run, calls } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-developer') return { status: 'done', summary: '재작업 완료', diffLineCount: 5 }
      if (opts.label === 'conservative-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 5 }
      throw new Error(`예상치 못한 호출: ${opts.label}`)
    },
  })
  await run({
    ticketPath: 't.md', userRequest: 'r', workType: 'copy', route: 'light',
    retryBranch: 'claude/jamwork-t-slug', retryReason: '오탈자 수정 누락',
  })
  const devCall = calls.find((c) => c.label === 'jam-developer')
  assert.ok(devCall.prompt.includes('git checkout claude/jamwork-t-slug'), '재시도는 기존 브랜치를 체크아웃해 이어받아야 한다')
  assert.ok(!devCall.prompt.includes('checkout -b'), '재시도 프롬프트가 새 브랜치 생성 지시와 섞이면 안 된다')
  console.log('PASS test4_retryBranchResumesExistingBranch')
}

async function test5_smallDiffSkipsDesignReviewByDevReportedCount() {
  const { run, calls } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-designer-pre') return { decision: '재사용', needsApproval: false }
      // diffLineCount는 게이트가 아니라 아현이 채운다 — 게이트 호출 전에 병렬 여부를 정해야 하므로.
      if (opts.label === 'jam-developer') return { status: 'done', summary: '패딩 조정', diffLineCount: 3 }
      if (opts.label === 'conservative-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 3 }
      throw new Error(`예상치 못한 호출: ${opts.label}`)
    },
  })
  const result = await run({ ticketPath: 't.md', userRequest: 'r', workType: 'ui' })
  assert.equal(result.designReview, null, '작은 diff는 아현이 보고한 수치만으로 채원②를 건너뛰어야 한다')
  assert.equal(calls.length, 3, '채원①·아현·민지만 호출되고 채원②는 호출되지 않아야 한다')
  console.log('PASS test5_smallDiffSkipsDesignReviewByDevReportedCount')
}

async function main() {
  await test1_needsApprovalStops()
  await test2_needsApprovalNoneProceedsInParallel()
  await test3_lightRouteSkipsDesigner()
  await test4_retryBranchResumesExistingBranch()
  await test5_smallDiffSkipsDesignReviewByDevReportedCount()
  console.log('전체 통과')
}

main().catch((err) => {
  console.error('FAIL', err)
  process.exit(1)
})
