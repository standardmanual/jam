// batch-tickets.mjs 테스트 (티켓 20260921_2305 3차 재작업)
//
// jam-work.js(Workflow 스크립트)는 파일시스템·import()를 쓸 수 없어 하위 티켓 조회 로직
// 전체를 이 일반 Node 스크립트로 옮겼다 — 원래 jam-work.test.mjs에 있던 fs 기반 테스트를
// 여기로 이관한다(옛 test11~test21). scripts/verify.sh의 scripts-test 단계가 이 파일을 돈다.
// 실행: node scripts/batch-tickets.test.mjs

import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseFrontmatterField,
  determineWorkType,
  staticStopReason,
  findSubTickets,
  buildBatchOutput,
} from './batch-tickets.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')

function ticketFixture({ id, parent, status, category, workType, body }) {
  const workTypeLine = workType ? `workType: ${workType}\n` : ''
  return `---\nid: "${id}"\nparent: "${parent}"\nstatus: ${status}\ncategory: ${category}\n${workTypeLine}---\n\n# 픽스처\n${body ?? ''}`
}

async function withTempTicketsDir(files, fn) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'batch-tickets-'))
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(tmp, rel)
      await fsp.mkdir(path.dirname(full), { recursive: true })
      await fsp.writeFile(full, content, 'utf8')
    }
    await fn(path.join(tmp, 'docs/tickets'))
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
}

async function test1_findsOrdersAndKeepsAllStatuses() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/a.md': ticketFixture({ id: '20260921_0100', parent: 'PARENT1', status: 'OPEN', category: 'Infra' }),
    'docs/tickets/p1-high/b.md': ticketFixture({ id: '20260921_0050', parent: 'PARENT1', status: 'CLOSED', category: 'Infra' }),
    'docs/tickets/p2-medium/c.md': ticketFixture({ id: '20260921_0200', parent: 'PARENT1', status: 'OPEN', category: 'UI' }),
    'docs/tickets/p1-high/other.md': ticketFixture({ id: '20260921_9999', parent: 'OTHER', status: 'OPEN', category: 'Infra' }),
  }, async (root) => {
    const found = await findSubTickets('PARENT1', root)
    assert.deepEqual(found.map((t) => t.id), ['20260921_0050', '20260921_0100', '20260921_0200'], '부모 필드가 일치하는 티켓만, 생성 시각 순으로 조회돼야 한다')
    assert.deepEqual(found.map((t) => t.status), ['CLOSED', 'OPEN', 'OPEN'], 'CLOSED 티켓도 조회 결과에는 포함돼야 한다')
  })
  console.log('PASS test1_findsOrdersAndKeepsAllStatuses')
}

async function test2_buildBatchOutputShape() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/a.md': ticketFixture({ id: '20260921_0100', parent: 'PARENT2', status: 'OPEN', category: 'Infra' }),
    'docs/tickets/p1-high/b.md': ticketFixture({ id: '20260921_0200', parent: 'PARENT2', status: 'OPEN', category: 'UI' }),
  }, async (root) => {
    const found = await findSubTickets('PARENT2', root)
    const out = buildBatchOutput('PARENT2', found)
    assert.equal(out.parentTicket, 'PARENT2')
    assert.deepEqual(
      out.subTickets.map((t) => [t.id, t.status, t.category, t.workType, t.sequence]),
      [
        ['20260921_0100', 'OPEN', 'Infra', 'infra', 1],
        ['20260921_0200', 'OPEN', 'UI', 'ui', 2],
      ],
    )
    assert.equal(out.plannedStopAt, null)
  })
  console.log('PASS test2_buildBatchOutputShape')
}

async function test3_plannedStopAtDbEngineOrUnmapped() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/engine.md': ticketFixture({ id: '20260921_0100', parent: 'PARENT3', status: 'OPEN', category: 'BadgeEngine' }),
    'docs/tickets/p1-high/after.md': ticketFixture({ id: '20260921_0200', parent: 'PARENT3', status: 'OPEN', category: 'UI' }),
  }, async (root) => {
    const found = await findSubTickets('PARENT3', root)
    const out = buildBatchOutput('PARENT3', found)
    assert.equal(out.plannedStopAt?.ticketId, '20260921_0100')
    assert.ok(out.plannedStopAt.reason.includes("'engine'"))
    assert.equal(out.subTickets.length, 2, '정지 지점 이후 티켓도 목록에는 그대로 담겨야 한다')
  })

  await withTempTicketsDir({
    'docs/tickets/p1-high/ambiguous.md': ticketFixture({ id: '20260921_0300', parent: 'PARENT4', status: 'OPEN', category: 'Feature' }),
  }, async (root) => {
    const found = await findSubTickets('PARENT4', root)
    const out = buildBatchOutput('PARENT4', found)
    assert.equal(out.plannedStopAt?.ticketId, '20260921_0300')
    assert.ok(out.plannedStopAt.reason.includes('유형을 자동으로 정할 수 없음'))
  })
  console.log('PASS test3_plannedStopAtDbEngineOrUnmapped')
}

async function test4_nonOpenTicketsDoNotTriggerPlannedStop() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/engine.md': ticketFixture({ id: '20260921_0100', parent: 'PARENT5', status: 'CLOSED', category: 'BadgeEngine' }),
  }, async (root) => {
    const found = await findSubTickets('PARENT5', root)
    const out = buildBatchOutput('PARENT5', found)
    assert.equal(out.plannedStopAt, null, 'CLOSED 티켓은 정지 조건을 계산할 때 건너뛰어야 한다')
  })
  console.log('PASS test4_nonOpenTicketsDoNotTriggerPlannedStop')
}

async function test5_withNoMatchingSubTickets() {
  await withTempTicketsDir({
    'docs/tickets/p1-high/unrelated.md': ticketFixture({ id: '20260921_0100', parent: 'OTHER-PARENT', status: 'OPEN', category: 'Infra' }),
  }, async (root) => {
    const found = await findSubTickets('NO-SUCH-PARENT', root)
    assert.deepEqual(found, [])
    const out = buildBatchOutput('NO-SUCH-PARENT', found)
    assert.deepEqual(out.subTickets, [])
    assert.equal(out.plannedStopAt, null)
  })
  console.log('PASS test5_withNoMatchingSubTickets')
}

// ── Infra 카테고리의 db/infra 판정(티켓 20260921_2305 재작업) ─────────────────────────────────
function test6_infraWithDbClueBecomesDb() {
  const t = { workType: determineWorkType({ category: 'Infra', explicitWorkType: '', fullText: '컬럼 정리를 위한 마이그레이션 파일을 작성한다.' }), category: 'Infra' }
  assert.equal(t.workType, 'db')
  const reason = staticStopReason(t)
  assert.ok(reason && reason.includes("'db'"))
  console.log('PASS test6_infraWithDbClueBecomesDb')
}

function test7_infraWithoutDbClueStaysInfra() {
  const workType = determineWorkType({ category: 'Infra', explicitWorkType: '', fullText: '배포 스크립트에 게이트 검사를 추가한다.' })
  assert.equal(workType, 'infra')
  assert.equal(staticStopReason({ workType, category: 'Infra' }), null)
  console.log('PASS test7_infraWithoutDbClueStaysInfra')
}

function test8_explicitWorkTypeFieldOverridesCategory() {
  const workType = determineWorkType({ category: 'Infra', explicitWorkType: 'infra', fullText: '마이그레이션 SQL을 포함하지만 워크플로 스크립트만 고친다.' })
  assert.equal(workType, 'infra', '본문에 DB 단서가 있어도 명시 필드가 최우선이어야 한다')
  console.log('PASS test8_explicitWorkTypeFieldOverridesCategory')
}

// ── 실제 티켓 3건 회귀 확인(민지 게이트 FAIL 지적 사례 + 티켓 20260922_1055 오판정 사례) ─────────
async function test9_realInfraTicketsClassifyAsDb() {
  const realTicketCases = [
    { path: 'docs/tickets/p3-low/20260909_1045_Infra_today_cards_created_by_FK_ON_DELETE_NO_ACTION.md', expected: 'db' },
    { path: 'docs/tickets/p3-low/20260914_1751_Infra_deactivated_by_item_book_id-죽은컬럼-정리.md', expected: 'db' },
    { path: 'docs/tickets/p2-normal/20260921_2307_Infra_게이트만-재실행-경로-gateOnly.md', expected: 'infra' },
  ]
  for (const { path: p, expected } of realTicketCases) {
    const text = await fsp.readFile(path.join(REPO_ROOT, p), 'utf8')
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, '')
    const workType = determineWorkType({ category: 'Infra', explicitWorkType: '', fullText: body })
    assert.equal(workType, expected, `${p}는 ${expected}로 판정돼야 한다`)
  }
  console.log('PASS test9_realInfraTicketsClassifyAsDb')
}

async function main() {
  await test1_findsOrdersAndKeepsAllStatuses()
  await test2_buildBatchOutputShape()
  await test3_plannedStopAtDbEngineOrUnmapped()
  await test4_nonOpenTicketsDoNotTriggerPlannedStop()
  await test5_withNoMatchingSubTickets()
  test6_infraWithDbClueBecomesDb()
  test7_infraWithoutDbClueStaysInfra()
  test8_explicitWorkTypeFieldOverridesCategory()
  await test9_realInfraTicketsClassifyAsDb()
  console.log('batch-tickets.test.mjs 통과')
}

main().catch((err) => {
  console.error('FAIL', err)
  process.exit(1)
})
