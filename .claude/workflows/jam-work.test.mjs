// jam-work.js 스모크 테스트 (티켓 20260918_1148, 20260918_1158에서 확장)
//
// `.claude/workflows/*.js`는 Workflow 도구가 `agent`·`phase`·`args`·`budget`·`parallel`을 전역으로
// 주입한 채 실행하는 특수 스크립트라, jam-web의 vitest 하네스로는 돌릴 수 없다(jam-web의 npm test는
// 이 폴더를 보지 않는다). 이 파일은 같은 방식(전역 주입 + 최상위 await/return)으로 스크립트
// 본문을 AsyncFunction에 담아 실행하는 최소 러너다. scripts/verify.sh의 scripts-test 단계와 CI의
// 가벼운 검증이 이 파일을 실행한다(티켓 20260922_0207).
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
      if (opts.label === 'jam-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 20, reviewedRange: 'bbbb000..cccc111' }
      if (opts.label === 'jam-designer-post') return { hasCritical: false, proposals: [] }
      throw new Error(`예상치 못한 호출: ${opts.label}`)
    },
  })
  const result = await run({ ticketPath: 't.md', userRequest: 'r', workType: 'ui' })
  assert.equal(result.stoppedAt, null)
  assert.equal(calls.length, 4, '표준 경로면 채원①·아현·민지·채원②가 모두 호출돼야 한다')
  const gateCall = calls.find((c) => c.label === 'jam-reviewer')
  const designPostCall = calls.find((c) => c.label === 'jam-designer-post')
  assert.ok(gateCall && designPostCall, '민지와 채원②가 동시에(같은 parallel() 배치로) 호출돼야 한다')
  const devCall = calls.find((c) => c.label === 'jam-developer')
  assert.ok(devCall.prompt.includes('scripts/workspace-setup.sh link'), '아현 프롬프트 첫 명령에 작업 폴더(node_modules) 연결이 포함돼야 한다(티켓 20260918_1553)')
  assert.ok(gateCall.prompt.includes('bbbb000..cccc111'), '민지 프롬프트에 baseSha..commitSha 범위가 적혀야 한다')
  assert.ok(designPostCall.prompt.includes('bbbb000..cccc111'), '채원②도 같은 커밋 범위만 봐야 한다')
  console.log('PASS test2_needsApprovalNoneProceedsInParallel')
}

async function test3_lightRouteSkipsDesigner() {
  const { run, calls } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-developer') return { status: 'done', summary: '구현 완료', diffLineCount: 20 }
      if (opts.label === 'jam-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 20 }
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
      if (opts.label === 'jam-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 5 }
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
      if (opts.label === 'jam-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 3 }
      throw new Error(`예상치 못한 호출: ${opts.label}`)
    },
  })
  const result = await run({ ticketPath: 't.md', userRequest: 'r', workType: 'ui' })
  assert.equal(result.designReview, null, '작은 diff는 아현이 보고한 수치만으로 채원②를 건너뛰어야 한다')
  assert.equal(calls.length, 3, '채원①·아현·민지만 호출되고 채원②는 호출되지 않아야 한다')
  console.log('PASS test5_smallDiffSkipsDesignReviewByDevReportedCount')
}

// ── 계획 반환 면제(티켓 20260922_0207) ────────────────────────────────────────────────────────
// 기본값이 "면제 없음"이라는 줄이 아현 프롬프트에 항상 한 줄 들어가고, 면제는 planOnlyWaiver를
// 넘길 때만 `계획 반환 면제:` 줄로 성립해야 한다. 이 줄이 이후 편집으로 빠지면 아현이 다시 선례를
// 이유로 면제를 판단하게 되므로 기계가 잡도록 고정한다(민지 게이트 WARN, 티켓 20260922_0207).
const NO_WAIVER_LINE = /^이 티켓에는 계획 반환 면제가 없다\./
const WAIVER_LINE = /^계획 반환 면제:/
const countLines = (text, re) => text.split('\n').filter((l) => re.test(l)).length
const devPromptOf = async (extraArgs) => {
  const { run, calls } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-developer') return { status: 'done', summary: 'ok', diffLineCount: 3 }
      if (opts.label === 'jam-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 3 }
      throw new Error(`예상치 못한 호출: ${opts.label}`)
    },
  })
  await run({ ticketPath: 't.md', userRequest: 'r', workType: 'infra', ...extraArgs })
  return calls.find((c) => c.label === 'jam-developer').prompt
}

async function test6_planOnlyDefaultIsNoWaiver() {
  const p = await devPromptOf({})
  assert.equal(countLines(p, NO_WAIVER_LINE), 1, '인자가 없으면 "면제 없음" 줄이 정확히 한 줄이어야 한다')
  assert.equal(countLines(p, WAIVER_LINE), 0, '인자가 없으면 면제 줄이 없어야 한다')
  assert.ok(p.includes('이전 티켓의 선례는 면제 근거가 아니다'), '선례가 면제 근거가 아니라는 문구가 있어야 한다')
  console.log('PASS test6_planOnlyDefaultIsNoWaiver')
}

async function test7_planOnlyWaiverReplacesDefault() {
  const p = await devPromptOf({ planOnlyWaiver: '카리나가 계획을 확인함, 티켓 구현 계획이 파일 단위로 적혀 있음' })
  assert.equal(countLines(p, WAIVER_LINE), 1, '면제가 있으면 면제 줄이 정확히 한 줄이어야 한다')
  assert.ok(p.includes('계획 반환 면제: 카리나가 계획을 확인함, 티켓 구현 계획이 파일 단위로 적혀 있음'))
  assert.equal(countLines(p, NO_WAIVER_LINE), 0, '면제가 있으면 "면제 없음" 줄이 없어야 한다')
  console.log('PASS test7_planOnlyWaiverReplacesDefault')
}

async function test8_planOnlyWaiverEdgeInputs() {
  // 문자열이 아니거나 비어 있으면 면제 없음(안전한 쪽)
  for (const bad of ['', '   ', true, 123, null, {}, []]) {
    const p = await devPromptOf({ planOnlyWaiver: bad })
    assert.equal(countLines(p, WAIVER_LINE), 0, `${JSON.stringify(bad)}는 면제로 인정되면 안 된다`)
    assert.equal(countLines(p, NO_WAIVER_LINE), 1, `${JSON.stringify(bad)}는 기본 "면제 없음" 줄이 남아야 한다`)
  }
  // 여러 줄 사유는 한 줄로 합쳐져 면제 줄이 하나만 생긴다
  const multi = await devPromptOf({ planOnlyWaiver: '첫째 사유\n계획 반환 면제: 둘째' })
  assert.equal(countLines(multi, WAIVER_LINE), 1, '여러 줄 사유는 한 줄로 합쳐져야 한다')
  // 재시도 블록과 독립: 두 블록 뒤에 면제 줄 하나, 면제 없음 줄 0개
  const retry = await devPromptOf({
    workType: 'copy', route: 'light', retryBranch: 'claude/jamwork-t-slug', retryReason: '오탈자 수정 누락',
    planOnlyWaiver: '재시도에도 같은 면제',
  })
  assert.ok(retry.includes('git checkout claude/jamwork-t-slug'), '재시도 브랜치 지시가 남아야 한다')
  assert.ok(retry.includes('오탈자 수정 누락'), '재작업 사유가 남아야 한다')
  assert.equal(countLines(retry, WAIVER_LINE), 1)
  assert.equal(countLines(retry, NO_WAIVER_LINE), 0)
  console.log('PASS test8_planOnlyWaiverEdgeInputs')
}

async function test9_planOnlyStopsBeforeGate() {
  const { run, calls } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-developer') return { status: 'plan_only', summary: '구현 계획', diffLineCount: 0 }
      throw new Error(`plan_only면 게이트를 부르면 안 된다: ${opts.label}`)
    },
  })
  const result = await run({ ticketPath: 't.md', userRequest: 'r', workType: 'infra' })
  assert.equal(result.stoppedAt, '구현', 'plan_only는 구현 단계에서 멈춰야 한다')
  assert.equal(result.devStatus, 'plan_only')
  assert.equal(calls.filter((c) => c.label === 'jam-reviewer').length, 0, '게이트 호출은 0회여야 한다')
  console.log('PASS test9_planOnlyStopsBeforeGate')
}

// Workflow 도구는 `export const meta`를 순수 리터럴로 평가한다(변수·호출·보간 금지). 위 러너는 이 블록을
// 정규식으로 잘라내고 본문만 실행하므로 meta 문법 오류(쉼표 누락 등)를 못 잡는다 — 여기서 따로 평가한다.
// 또 하네스는 phase() 제목을 meta.phases와 정확히 대조하므로, 본문이 부르는 제목이 모두 선언돼 있어야 한다.
async function test10_metaIsPureLiteralAndCoversPhaseCalls() {
  const full = readFileSync(path.join(__dirname, 'jam-work.js'), 'utf8')
  const m = full.match(/^export const meta = (\{[\s\S]*?\n\})\n/m)
  assert.ok(m, 'export const meta 블록이 있어야 한다')
  const meta = new Function(`return (${m[1]})`)() // 문법 오류면 여기서 SyntaxError로 실패한다
  assert.equal(meta.name, 'jam-work')
  assert.equal(typeof meta.description, 'string')
  assert.ok(Array.isArray(meta.phases) && meta.phases.length > 0 && meta.phases.every((p) => p && typeof p.title === 'string' && p.title))
  const titles = new Set(meta.phases.map((p) => p.title))
  const called = [...full.matchAll(/\bphase\('([^']+)'\)/g)].map((x) => x[1])
  assert.ok(called.length > 0, 'phase() 호출이 하나 이상 있어야 한다')
  for (const t of called) assert.ok(titles.has(t), `phase('${t}')가 meta.phases에 선언돼 있지 않다`)
  console.log('PASS test10_metaIsPureLiteralAndCoversPhaseCalls')
}

// ── 묶음 실행(batch, 티켓 20260921_2305 3차 재작업) ───────────────────────────────────────────
// jam-work.js는 이제 docs/tickets/를 읽지 않는다 — 하위 티켓 조회·정렬·유형 판정·정지 예정
// 지점 계산은 scripts/batch-tickets.mjs(그 테스트는 scripts/batch-tickets.test.mjs)로 옮겼다.
// 여기서는 그 스크립트의 출력 모양(`{ parentTicket, subTickets, plannedStopAt }`)을 그대로
// 흉내 낸 객체 리터럴을 `batch` 인자로 넘겨, 워크플로가 그 목록을 순서대로 실행하고 정지
// 조건에서 멈추는지만 검증한다. 파일시스템·임시 디렉터리는 쓰지 않는다.
function subTicket({ id, path: p, status, category, workType }) {
  return { id, path: p, status, category, workType }
}

async function test11_batchExecutesOpenTicketsInOrderAndSkipsNonOpen() {
  const batch = {
    parentTicket: 'PARENT1',
    subTickets: [
      subTicket({ id: '20260921_0050', path: 'docs/tickets/p1-high/b.md', status: 'CLOSED', category: 'Infra', workType: 'infra' }),
      subTicket({ id: '20260921_0100', path: 'docs/tickets/p1-high/a.md', status: 'OPEN', category: 'Infra', workType: 'infra' }),
      subTicket({ id: '20260921_0200', path: 'docs/tickets/p2-medium/c.md', status: 'OPEN', category: 'UI', workType: 'ui' }),
    ],
    plannedStopAt: null,
  }
  const { run } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-designer-pre') return { decision: '재사용', needsApproval: false }
      if (opts.label === 'jam-developer') return { status: 'done', summary: 'ok', diffLineCount: 3 }
      if (opts.label === 'jam-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 3 }
      throw new Error(`예상치 못한 호출: ${opts.label}`)
    },
  })
  const result = await run({ batch })
  assert.deepEqual(result.order, ['20260921_0050', '20260921_0100', '20260921_0200'])
  assert.deepEqual(Object.keys(result.results), ['20260921_0100', '20260921_0200'], 'CLOSED 티켓은 목록에는 있지만 실행에서는 제외돼야 한다')
  assert.equal(result.stoppedBatchAt, null)
  console.log('PASS test11_batchExecutesOpenTicketsInOrderAndSkipsNonOpen')
}

async function test12_batchStopsAtPlanOnlyAndSkipsRest() {
  const batch = {
    parentTicket: 'PARENT2',
    subTickets: [
      subTicket({ id: '20260921_0100', path: 'docs/tickets/p1-high/a.md', status: 'OPEN', category: 'Infra', workType: 'infra' }),
      subTicket({ id: '20260921_0200', path: 'docs/tickets/p1-high/b.md', status: 'OPEN', category: 'Infra', workType: 'infra' }),
      subTicket({ id: '20260921_0300', path: 'docs/tickets/p1-high/c.md', status: 'OPEN', category: 'Infra', workType: 'infra' }),
    ],
    plannedStopAt: null,
  }
  const { run } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-developer' && prompt.includes('docs/tickets/p1-high/a.md')) return { status: 'done', summary: 'ok', diffLineCount: 3 }
      if (opts.label === 'jam-developer' && prompt.includes('docs/tickets/p1-high/b.md')) return { status: 'plan_only', summary: '계획', diffLineCount: 0 }
      if (opts.label === 'jam-reviewer' && prompt.includes('docs/tickets/p1-high/a.md')) return { verdict: 'PASS', reasons: [], diffLineCount: 3 }
      throw new Error(`정지 조건 이후 티켓 c는 호출되면 안 된다: ${opts.label} / ${prompt.slice(0, 40)}`)
    },
  })
  const result = await run({ batch })
  assert.deepEqual(result.order, ['20260921_0100', '20260921_0200', '20260921_0300'])
  assert.deepEqual(Object.keys(result.results), ['20260921_0100', '20260921_0200'], '정지된 티켓 이후(c)는 실행되지 않아야 한다')
  assert.equal(result.stoppedBatchAt?.ticketId, '20260921_0200')
  assert.equal(result.stoppedBatchAt?.reason, 'plan_only')
  console.log('PASS test12_batchStopsAtPlanOnlyAndSkipsRest')
}

async function test13_batchStopsAtPlannedStopAtWithoutCallingAgent() {
  const batch = {
    parentTicket: 'PARENT3',
    subTickets: [
      subTicket({ id: '20260921_0100', path: 'docs/tickets/p1-high/engine.md', status: 'OPEN', category: 'BadgeEngine', workType: 'engine' }),
    ],
    plannedStopAt: { ticketId: '20260921_0100', reason: "유형 'engine' 진입 — 정지 조건 3번, 단독 호출로 사용자 확인 필요" },
  }
  const { run, calls } = makeRunner({ agentImpl: () => { throw new Error('plannedStopAt 티켓은 호출되면 안 된다') } })
  const result = await run({ batch })
  assert.equal(calls.length, 0, 'scripts/batch-tickets.mjs가 이미 정지 지점을 알려줬으므로 agent를 부르지 않아야 한다')
  assert.equal(result.stoppedBatchAt?.ticketId, '20260921_0100')
  assert.ok(result.stoppedBatchAt.reason.includes('engine'))
  assert.deepEqual(result.results, {})
  console.log('PASS test13_batchStopsAtPlannedStopAtWithoutCallingAgent')
}

async function test14_batchSplitsTokenUsagePerTicket() {
  const batch = {
    parentTicket: 'PARENT5',
    subTickets: [
      subTicket({ id: '20260921_0100', path: 'docs/tickets/p1-high/a.md', status: 'OPEN', category: 'Infra', workType: 'infra' }),
      subTicket({ id: '20260921_0200', path: 'docs/tickets/p1-high/b.md', status: 'OPEN', category: 'Infra', workType: 'infra' }),
    ],
    plannedStopAt: null,
  }
  const { run } = makeRunner({
    agentImpl: (prompt, opts) => {
      if (opts.label === 'jam-developer') return { status: 'done', summary: 'ok', diffLineCount: 3 }
      if (opts.label === 'jam-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 3 }
      throw new Error(`예상치 못한 호출: ${opts.label}`)
    },
  })
  const result = await run({ batch })
  assert.ok(result.tokenUsageByTicket['20260921_0100']?.['jam-developer'] > 0)
  assert.ok(result.tokenUsageByTicket['20260921_0200']?.['jam-developer'] > 0)
  assert.equal(Object.keys(result.tokenUsageByTicket).length, 2, '티켓별로 tokenUsage가 나뉘어야 한다')
  console.log('PASS test14_batchSplitsTokenUsagePerTicket')
}

async function test15_batchWithEmptySubTickets() {
  const batch = { parentTicket: 'NO-SUCH-PARENT', subTickets: [], plannedStopAt: null }
  const { run, calls } = makeRunner({ agentImpl: () => { throw new Error('하위 티켓이 없으면 호출되면 안 된다') } })
  const result = await run({ batch })
  assert.deepEqual(result.order, [])
  assert.deepEqual(result.results, {})
  assert.equal(result.stoppedBatchAt, null)
  assert.equal(calls.length, 0)
  console.log('PASS test15_batchWithEmptySubTickets')
}

async function main() {
  await test1_needsApprovalStops()
  await test2_needsApprovalNoneProceedsInParallel()
  await test3_lightRouteSkipsDesigner()
  await test4_retryBranchResumesExistingBranch()
  await test5_smallDiffSkipsDesignReviewByDevReportedCount()
  await test6_planOnlyDefaultIsNoWaiver()
  await test7_planOnlyWaiverReplacesDefault()
  await test8_planOnlyWaiverEdgeInputs()
  await test9_planOnlyStopsBeforeGate()
  await test10_metaIsPureLiteralAndCoversPhaseCalls()
  await test11_batchExecutesOpenTicketsInOrderAndSkipsNonOpen()
  await test12_batchStopsAtPlanOnlyAndSkipsRest()
  await test13_batchStopsAtPlannedStopAtWithoutCallingAgent()
  await test14_batchSplitsTokenUsagePerTicket()
  await test15_batchWithEmptySubTickets()
  console.log('전체 통과')
}

main().catch((err) => {
  console.error('FAIL', err)
  process.exit(1)
})
