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
import fsp from 'node:fs/promises'
import os from 'node:os'
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

// ── 묶음 실행(batch, 티켓 20260921_2305) ──────────────────────────────────────────────────────
// jam-work.js의 batch 분기는 docs/tickets/를 실제 fs로 읽으므로(Workflow 도구가 fs 전용 전역을
// 주입하지 않아 스크립트가 Node 동적 import로 직접 읽는다), 테스트는 임시 디렉터리에 가짜
// docs/tickets/를 만들고 그 안으로 잠깐 cwd를 옮겨 실행한 뒤 되돌린다 — 실제 저장소 티켓은
// 건드리지 않는다.
function ticketFixture({ id, parent, status, category, workType, body }) {
  const workTypeLine = workType ? `workType: ${workType}\n` : ''
  return `---\nid: "${id}"\nparent: "${parent}"\nstatus: ${status}\ncategory: ${category}\n${workTypeLine}---\n\n# 픽스처\n${body ?? ''}`
}
// 저장소 루트 — 실제 티켓 파일을 읽어 그 본문 그대로 임시 픽스처에 담을 때 쓴다(test21).
const REPO_ROOT = path.join(__dirname, '..', '..')
async function withTempTicketsDir(files, fn) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'jam-work-batch-'))
  const prevCwd = process.cwd()
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(tmp, rel)
      await fsp.mkdir(path.dirname(full), { recursive: true })
      await fsp.writeFile(full, content, 'utf8')
    }
    process.chdir(tmp)
    await fn()
  } finally {
    process.chdir(prevCwd)
    await fsp.rm(tmp, { recursive: true, force: true })
  }
}

async function test11_batchFindsOrdersAndSkipsNonOpen() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/a.md': ticketFixture({ id: '20260921_0100', parent: 'PARENT1', status: 'OPEN', category: 'Infra' }),
    'docs/tickets/p1-high/b.md': ticketFixture({ id: '20260921_0050', parent: 'PARENT1', status: 'CLOSED', category: 'Infra' }),
    'docs/tickets/p2-medium/c.md': ticketFixture({ id: '20260921_0200', parent: 'PARENT1', status: 'OPEN', category: 'UI' }),
    'docs/tickets/p1-high/other.md': ticketFixture({ id: '20260921_9999', parent: 'OTHER', status: 'OPEN', category: 'Infra' }),
  }, async () => {
    const { run } = makeRunner({
      agentImpl: (prompt, opts) => {
        if (opts.label === 'jam-designer-pre') return { decision: '재사용', needsApproval: false }
        if (opts.label === 'jam-developer') return { status: 'done', summary: 'ok', diffLineCount: 3 }
        if (opts.label === 'jam-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 3 }
        throw new Error(`예상치 못한 호출: ${opts.label}`)
      },
    })
    const result = await run({ batch: 'PARENT1' })
    assert.deepEqual(result.order, ['20260921_0050', '20260921_0100', '20260921_0200'], '부모 필드가 일치하는 티켓만, 생성 시각 순으로 조회돼야 한다')
    assert.deepEqual(Object.keys(result.results), ['20260921_0100', '20260921_0200'], 'CLOSED 티켓은 조회는 되지만 실행에서 제외돼야 한다')
    assert.equal(result.stoppedBatchAt, null)
  })
  console.log('PASS test11_batchFindsOrdersAndSkipsNonOpen')
}

async function test12_batchStopsAtPlanOnlyAndSkipsRest() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/a.md': ticketFixture({ id: '20260921_0100', parent: 'PARENT2', status: 'OPEN', category: 'Infra' }),
    'docs/tickets/p1-high/b.md': ticketFixture({ id: '20260921_0200', parent: 'PARENT2', status: 'OPEN', category: 'Infra' }),
    'docs/tickets/p1-high/c.md': ticketFixture({ id: '20260921_0300', parent: 'PARENT2', status: 'OPEN', category: 'Infra' }),
  }, async () => {
    const { run } = makeRunner({
      agentImpl: (prompt, opts) => {
        if (opts.label === 'jam-developer' && prompt.includes('docs/tickets/p1-high/a.md')) return { status: 'done', summary: 'ok', diffLineCount: 3 }
        if (opts.label === 'jam-developer' && prompt.includes('docs/tickets/p1-high/b.md')) return { status: 'plan_only', summary: '계획', diffLineCount: 0 }
        if (opts.label === 'jam-reviewer' && prompt.includes('docs/tickets/p1-high/a.md')) return { verdict: 'PASS', reasons: [], diffLineCount: 3 }
        throw new Error(`정지 조건 이후 티켓 c는 호출되면 안 된다: ${opts.label} / ${prompt.slice(0, 40)}`)
      },
    })
    const result = await run({ batch: 'PARENT2' })
    assert.deepEqual(result.order, ['20260921_0100', '20260921_0200', '20260921_0300'])
    assert.deepEqual(Object.keys(result.results), ['20260921_0100', '20260921_0200'], '정지된 티켓 이후(c)는 실행되지 않아야 한다')
    assert.equal(result.stoppedBatchAt?.ticketId, '20260921_0200')
    assert.equal(result.stoppedBatchAt?.reason, 'plan_only')
  })
  console.log('PASS test12_batchStopsAtPlanOnlyAndSkipsRest')
}

async function test13_batchStopsBeforeEngineOrUnmappedCategory() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/engine.md': ticketFixture({ id: '20260921_0100', parent: 'PARENT3', status: 'OPEN', category: 'BadgeEngine' }),
  }, async () => {
    const { run, calls } = makeRunner({ agentImpl: () => { throw new Error('db·engine 진입 티켓은 호출되면 안 된다') } })
    const result = await run({ batch: 'PARENT3' })
    assert.equal(calls.length, 0, '진입 전에 멈춰야 하므로 agent 호출이 없어야 한다')
    assert.equal(result.stoppedBatchAt?.ticketId, '20260921_0100')
    assert.ok(result.stoppedBatchAt.reason.includes('engine'))
    assert.deepEqual(result.results, {})
  })
  await withTempTicketsDir({
    'docs/tickets/p1-high/ambiguous.md': ticketFixture({ id: '20260921_0200', parent: 'PARENT4', status: 'OPEN', category: 'Feature' }),
  }, async () => {
    const { run, calls } = makeRunner({ agentImpl: () => { throw new Error('유형을 정할 수 없는 티켓은 호출되면 안 된다') } })
    const result = await run({ batch: 'PARENT4' })
    assert.equal(calls.length, 0)
    assert.equal(result.stoppedBatchAt?.ticketId, '20260921_0200')
  })
  console.log('PASS test13_batchStopsBeforeEngineOrUnmappedCategory')
}

async function test14_batchSplitsTokenUsagePerTicket() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/a.md': ticketFixture({ id: '20260921_0100', parent: 'PARENT5', status: 'OPEN', category: 'Infra' }),
    'docs/tickets/p1-high/b.md': ticketFixture({ id: '20260921_0200', parent: 'PARENT5', status: 'OPEN', category: 'Infra' }),
  }, async () => {
    const { run } = makeRunner({
      agentImpl: (prompt, opts) => {
        if (opts.label === 'jam-developer') return { status: 'done', summary: 'ok', diffLineCount: 3 }
        if (opts.label === 'jam-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 3 }
        throw new Error(`예상치 못한 호출: ${opts.label}`)
      },
    })
    const result = await run({ batch: 'PARENT5' })
    assert.ok(result.tokenUsageByTicket['20260921_0100']?.['jam-developer'] > 0)
    assert.ok(result.tokenUsageByTicket['20260921_0200']?.['jam-developer'] > 0)
    assert.equal(Object.keys(result.tokenUsageByTicket).length, 2, '티켓별로 tokenUsage가 나뉘어야 한다')
  })
  console.log('PASS test14_batchSplitsTokenUsagePerTicket')
}

async function test15_batchWithNoMatchingSubTickets() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/unrelated.md': ticketFixture({ id: '20260921_0100', parent: 'OTHER-PARENT', status: 'OPEN', category: 'Infra' }),
  }, async () => {
    const { run, calls } = makeRunner({ agentImpl: () => { throw new Error('일치하는 하위 티켓이 없으면 호출되면 안 된다') } })
    const result = await run({ batch: 'NO-SUCH-PARENT' })
    assert.deepEqual(result.order, [])
    assert.deepEqual(result.results, {})
    assert.equal(result.stoppedBatchAt, null)
    assert.equal(calls.length, 0)
  })
  console.log('PASS test15_batchWithNoMatchingSubTickets')
}

// ── 드라이런(dryRun, 티켓 20260921_2305 재작업) ────────────────────────────────────────────────
// dryRun: true는 에이전트를 하나도 부르지 않고, 조회된 하위 티켓 목록과 정지 예정 지점만
// 반환해야 한다. agentImpl이 호출되면 곧바로 던지게 해서 "정말 안 부르는지"를 확인한다.
async function test16_dryRunListsSubTicketsWithoutCallingAgents() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/a.md': ticketFixture({ id: '20260921_0100', parent: 'PARENT-DRY', status: 'OPEN', category: 'Infra' }),
    'docs/tickets/p1-high/b.md': ticketFixture({ id: '20260921_0050', parent: 'PARENT-DRY', status: 'CLOSED', category: 'Infra' }),
    'docs/tickets/p1-high/c.md': ticketFixture({ id: '20260921_0200', parent: 'PARENT-DRY', status: 'OPEN', category: 'UI' }),
  }, async () => {
    const { run, calls } = makeRunner({ agentImpl: () => { throw new Error('dryRun은 에이전트를 부르면 안 된다') } })
    const result = await run({ batch: 'PARENT-DRY', dryRun: true })
    assert.equal(calls.length, 0)
    assert.equal(result.dryRun, true)
    assert.deepEqual(result.order, ['20260921_0050', '20260921_0100', '20260921_0200'])
    assert.deepEqual(
      result.subTickets.map((t) => [t.id, t.status, t.category, t.workType, t.sequence]),
      [
        ['20260921_0050', 'CLOSED', 'Infra', 'infra', 1],
        ['20260921_0100', 'OPEN', 'Infra', 'infra', 2],
        ['20260921_0200', 'OPEN', 'UI', 'ui', 3],
      ],
    )
    assert.equal(result.plannedStopAt, null)
    assert.equal(result.results, undefined, 'dryRun 결과에는 실행 결과가 없어야 한다')
  })
  console.log('PASS test16_dryRunListsSubTicketsWithoutCallingAgents')
}

async function test17_dryRunReportsPlannedStopAtDbEngineOrUnmapped() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/engine.md': ticketFixture({ id: '20260921_0100', parent: 'PARENT-DRY2', status: 'OPEN', category: 'BadgeEngine' }),
    'docs/tickets/p1-high/after.md': ticketFixture({ id: '20260921_0200', parent: 'PARENT-DRY2', status: 'OPEN', category: 'UI' }),
  }, async () => {
    const { run, calls } = makeRunner({ agentImpl: () => { throw new Error('dryRun은 에이전트를 부르면 안 된다') } })
    const result = await run({ batch: 'PARENT-DRY2', dryRun: true })
    assert.equal(calls.length, 0)
    assert.equal(result.plannedStopAt?.ticketId, '20260921_0100')
    assert.ok(result.plannedStopAt.reason.includes("'engine'"))
    // 실제 실행에서는 정지 지점 이후 티켓이 처리되지 않지만, dryRun의 subTickets 목록에는
    // 조회된 모든 하위 티켓이 그대로 담긴다(어떤 순서로 실행될지 미리 보여주기 위함).
    assert.equal(result.subTickets.length, 2)
  })
  console.log('PASS test17_dryRunReportsPlannedStopAtDbEngineOrUnmapped')
}

// ── Infra 카테고리의 db/infra 판정(티켓 20260921_2305 재작업) ─────────────────────────────────
// Infra 카테고리는 db 유형 티켓도 담는다(SKILL.md 0.2절) — 카테고리만으로 자동 진행하면
// 마이그레이션 티켓이 정지 조건 3번을 건너뛰고 실행될 수 있다(민지 게이트 FAIL 지적).
async function test18_infraWithDbClueBecomesDb() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/a.md': ticketFixture({
      id: '20260921_0100', parent: 'PARENT-DB1', status: 'OPEN', category: 'Infra',
      body: '컬럼 정리를 위한 마이그레이션 파일을 작성한다.',
    }),
  }, async () => {
    const { run, calls } = makeRunner({ agentImpl: () => { throw new Error('db 진입 티켓은 호출되면 안 된다') } })
    const result = await run({ batch: 'PARENT-DB1', dryRun: true })
    assert.equal(calls.length, 0)
    assert.equal(result.subTickets[0].workType, 'db')
    assert.equal(result.plannedStopAt?.ticketId, '20260921_0100')
    assert.ok(result.plannedStopAt.reason.includes("'db'"))
  })
  console.log('PASS test18_infraWithDbClueBecomesDb')
}

async function test19_infraWithoutDbClueStaysInfra() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/a.md': ticketFixture({
      id: '20260921_0100', parent: 'PARENT-DB2', status: 'OPEN', category: 'Infra',
      body: '배포 스크립트에 게이트 검사를 추가한다.',
    }),
  }, async () => {
    const { run } = makeRunner({ agentImpl: () => { throw new Error('dryRun은 에이전트를 부르면 안 된다') } })
    const result = await run({ batch: 'PARENT-DB2', dryRun: true })
    assert.equal(result.subTickets[0].workType, 'infra')
    assert.equal(result.plannedStopAt, null)
  })
  console.log('PASS test19_infraWithoutDbClueStaysInfra')
}

async function test20_explicitWorkTypeFieldOverridesCategory() {
  await withTempTicketsDir({
    // 본문에 DB 단서가 있어도 명시 필드가 있으면 그 값이 최우선이다.
    'docs/tickets/p1-high/a.md': ticketFixture({
      id: '20260921_0100', parent: 'PARENT-DB3', status: 'OPEN', category: 'Infra', workType: 'infra',
      body: '마이그레이션 SQL을 포함하지만 워크플로 스크립트만 고친다.',
    }),
  }, async () => {
    const { run } = makeRunner({
      agentImpl: (prompt, opts) => {
        if (opts.label === 'jam-designer-pre') throw new Error('infra 유형은 채원①을 부르면 안 된다')
        if (opts.label === 'jam-developer') return { status: 'done', summary: 'ok', diffLineCount: 3 }
        if (opts.label === 'jam-reviewer') return { verdict: 'PASS', reasons: [], diffLineCount: 3 }
        throw new Error(`예상치 못한 호출: ${opts.label}`)
      },
    })
    const result = await run({ batch: 'PARENT-DB3' })
    assert.equal(Object.keys(result.results).length, 1)
    assert.equal(result.stoppedBatchAt, null, '명시 workType이 infra이므로 db 정지 조건에 걸리면 안 된다')
  })
  console.log('PASS test20_explicitWorkTypeFieldOverridesCategory')
}

// ── 실제 티켓 2건 회귀 확인(민지 게이트 FAIL 지적 사례) ────────────────────────────────────────
async function test21_realInfraTicketsClassifyAsDb() {
  const realTicketPaths = [
    'docs/tickets/p3-low/20260909_1045_Infra_today_cards_created_by_FK_ON_DELETE_NO_ACTION.md',
    'docs/tickets/p3-low/20260914_1751_Infra_deactivated_by_item_book_id-죽은컬럼-정리.md',
  ]
  const bodies = await Promise.all(
    realTicketPaths.map(async (p) => {
      const text = await fsp.readFile(path.join(REPO_ROOT, p), 'utf8')
      return text.replace(/^---\n[\s\S]*?\n---\n/, '')
    }),
  )
  await withTempTicketsDir({
    'docs/tickets/p3-low/a.md': ticketFixture({ id: '20260909_1045', parent: 'PARENT-REAL', status: 'OPEN', category: 'Infra', body: bodies[0] }),
    'docs/tickets/p3-low/b.md': ticketFixture({ id: '20260914_1751', parent: 'PARENT-REAL', status: 'OPEN', category: 'Infra', body: bodies[1] }),
  }, async () => {
    const { run, calls } = makeRunner({ agentImpl: () => { throw new Error('db 진입 티켓은 호출되면 안 된다') } })
    const result = await run({ batch: 'PARENT-REAL', dryRun: true })
    assert.equal(calls.length, 0)
    assert.equal(result.subTickets.find((t) => t.id === '20260909_1045')?.workType, 'db', '20260909_1045(FK ON DELETE)는 db로 판정돼야 한다')
    assert.equal(result.subTickets.find((t) => t.id === '20260914_1751')?.workType, 'db', '20260914_1751(죽은 컬럼·마이그레이션)는 db로 판정돼야 한다')
    assert.equal(result.plannedStopAt?.ticketId, '20260909_1045', '첫 하위 티켓에서 이미 db 정지 조건에 걸려야 한다')
  })
  console.log('PASS test21_realInfraTicketsClassifyAsDb')
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
  await test11_batchFindsOrdersAndSkipsNonOpen()
  await test12_batchStopsAtPlanOnlyAndSkipsRest()
  await test13_batchStopsBeforeEngineOrUnmappedCategory()
  await test14_batchSplitsTokenUsagePerTicket()
  await test15_batchWithNoMatchingSubTickets()
  await test16_dryRunListsSubTicketsWithoutCallingAgents()
  await test17_dryRunReportsPlannedStopAtDbEngineOrUnmapped()
  await test18_infraWithDbClueBecomesDb()
  await test19_infraWithoutDbClueStaysInfra()
  await test20_explicitWorkTypeFieldOverridesCategory()
  await test21_realInfraTicketsClassifyAsDb()
  console.log('전체 통과')
}

main().catch((err) => {
  console.error('FAIL', err)
  process.exit(1)
})
