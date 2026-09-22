#!/usr/bin/env node
// 상위 티켓의 하위 티켓 목록·순서·유형 판정을 조회해 JSON으로 출력한다.
//
// 티켓 20260921_2305 3차 재작업 배경: Workflow 스크립트(.claude/workflows/*.js)는
// 파일시스템·Node API·`import()`를 쓸 수 없다 — 실제 하네스가 시작 단계에서
// "SyntaxError: import() is not available in workflow scripts"로 거부한다(2026-09-22 카리나
// 실측). 그래서 "jam-work.js가 docs/tickets/를 직접 읽어 하위 티켓을 찾는다"는 원래 설계는
// 실행 불가능했다. 하위 티켓 조회·정렬·유형 판정을 이 일반 Node 스크립트로 옮기고,
// 워크플로(jam-work.js)는 이 스크립트의 출력을 `batch` 인자로 그대로 받아 순서대로 실행만 한다.
//
// 사용법: node scripts/batch-tickets.mjs <상위 티켓 ID>
//   출력(stdout, JSON): { parentTicket, subTickets: [{id,path,status,category,workType,sequence}], plannedStopAt }
//   그대로 Workflow(name: 'jam-work', args: { batch: <이 출력 객체> })에 넘긴다
//   (`.claude/skills/jam-work/SKILL.md` 2절).

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 티켓 카테고리(문서 분류 키) → `/jam-work` 유형(파이프라인 라우팅 키) 매핑. 두 축이 1:1이
// 아니므로(`SKILL.md` 0.2절 하단 참고) 애매한 카테고리(Service·Feature 등)는 일부러 매핑하지
// 않는다 — 잘못 추측해 엉뚱한 파이프라인으로 보내는 대신, 매핑이 없으면 그 티켓에서 멈추고
// 사람이 유형을 정하게 한다.
export const CATEGORY_TO_WORKTYPE = {
  Infra: 'infra',
  UI: 'ui',
  API: 'api',
  Content: 'content',
  BadgeEngine: 'engine',
  Admin: 'admin',
}

// `Infra` 카테고리는 db 유형(마이그레이션·스키마 변경) 티켓도 함께 담는다(SKILL.md 0.2절 —
// 카테고리와 workType 두 축이 1:1이 아니다). 카테고리만으로는 db와 infra를 가를 수 없으므로,
// 본문에 DB 단서가 있으면 db로 판정해 정지 조건 3번(db·engine 진입)에 걸리게 한다. 놓치면
// 마이그레이션 티켓이 infra로 자동 실행될 수 있다(티켓 20260921_2305 재작업, 민지 게이트 FAIL —
// 실제 사례 20260909_1045·20260914_1751 두 건 모두 Infra 카테고리이면서 마이그레이션 작업이었다).
export const DB_CLUE_RE = /마이그레이션|migration|SQL|스키마|column|FK/i

export function parseFrontmatterField(block, key) {
  const m = block.match(new RegExp(`^${key}:\\s*"?([^"\\n]*?)"?\\s*$`, 'm'))
  return m ? m[1].trim() : ''
}

// 티켓 frontmatter의 명시적 `workType:` 필드가 최우선이다 — 선택 필드라 없어도 되고, 있어도
// 티켓 frontmatter 검사(`.githooks/pre-commit`의 status 검사, 첫 8줄 안 `status:`만 본다)를
// 막지 않는다. 명시 필드가 없으면 카테고리로 추정하되, Infra는 본문의 DB 단서 유무로
// db/infra를 가른다.
export function determineWorkType({ category, explicitWorkType, fullText }) {
  if (explicitWorkType) return explicitWorkType
  if (category === 'Infra' && DB_CLUE_RE.test(fullText)) return 'db'
  return CATEGORY_TO_WORKTYPE[category] ?? null
}

// 정지 조건 3번(단일 원천: .claude/skills/jam-work/references/stop-conditions.md) — db·engine
// 유형, 또는 유형 미매핑은 에이전트를 부르기 전에 이미 알 수 있는 정적 정지 지점이다.
export function staticStopReason(t) {
  if (t.workType === 'db' || t.workType === 'engine') {
    return `유형 '${t.workType}' 진입 — 정지 조건 3번, 단독 호출로 사용자 확인 필요`
  }
  if (!t.workType) {
    return `카테고리 '${t.category}'는 유형을 자동으로 정할 수 없음 — 사람 확인 필요`
  }
  return null
}

// `docs/tickets/`를 재귀로 훑어 `parent:`가 parentId와 같은 티켓을 찾는다. 티켓 ID(생성 시각)
// 순으로 정렬해 반환한다 — 상태(OPEN/CLOSED 등)는 걸러내지 않고 그대로 담는다. 워크플로가
// 실행 시 `status: 'OPEN'`만 골라 쓴다.
export async function findSubTickets(parentId, root = 'docs/tickets') {
  const found = []
  async function walk(dir) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (!entry.name.endsWith('.md') || entry.name === '_TEMPLATE.md') continue
      const text = await readFile(full, 'utf8')
      const fm = text.match(/^---\n([\s\S]*?)\n---/)
      if (!fm) continue
      const block = fm[1]
      if (parseFrontmatterField(block, 'parent') !== parentId) continue
      const category = parseFrontmatterField(block, 'category')
      const explicitWorkType = parseFrontmatterField(block, 'workType')
      found.push({
        id: parseFrontmatterField(block, 'id'),
        path: full,
        status: parseFrontmatterField(block, 'status'),
        category,
        workType: determineWorkType({ category, explicitWorkType, fullText: text }),
      })
    }
  }
  await walk(root)
  found.sort((a, b) => a.id.localeCompare(b.id))
  return found
}

// 조회된 하위 티켓 목록을 Workflow의 `batch` 인자 형태로 조립한다. 상태가 OPEN인 티켓 중
// 정적 정지 조건(db·engine 진입, 유형 미매핑)에 처음 걸리는 지점을 `plannedStopAt`으로 미리
// 알려준다 — 워크플로는 이 필드를 그대로 신뢰해 그 티켓 앞에서 멈추고, 정지 사유 판정 로직을
// 다시 계산하지 않는다(단일 원천, 이 스크립트에만 있다).
export function buildBatchOutput(parentId, subTickets) {
  let plannedStopAt = null
  for (const t of subTickets) {
    if (t.status !== 'OPEN') continue
    const reason = staticStopReason(t)
    if (reason) {
      plannedStopAt = { ticketId: t.id, reason }
      break
    }
  }
  return {
    parentTicket: parentId,
    subTickets: subTickets.map((t, i) => ({
      id: t.id,
      path: t.path,
      status: t.status,
      category: t.category,
      workType: t.workType,
      sequence: i + 1,
    })),
    plannedStopAt,
  }
}

async function main() {
  const parentId = process.argv[2]
  if (!parentId) {
    console.error('사용법: node scripts/batch-tickets.mjs <상위 티켓 ID>')
    process.exit(1)
  }
  const subTickets = await findSubTickets(parentId)
  const output = buildBatchOutput(parentId, subTickets)
  console.log(JSON.stringify(output, null, 2))
}

// 테스트에서 이 모듈을 import할 때는 실행하지 않는다.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
}
