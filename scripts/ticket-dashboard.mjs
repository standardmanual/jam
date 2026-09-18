#!/usr/bin/env node
// 현황판 생성 — Service Plan/Tickets/의 frontmatter를 훑어 진행 중·대기 티켓 목록을 만든다.
// (티켓 20260918_0421, 근거: JAM-WORK/05_자동화목록.md A3)
// 이어서 docs/agents/orchestrator.md의 "카리나 카드" 절(CARD:START~END 마커 사이)을 그대로
// 잘라 출력한다 — 원본은 orchestrator.md 한 곳에 유지 (티켓 20260918_1146).
//
// 사용법: node scripts/ticket-dashboard.mjs
//   (.claude/settings.json의 SessionStart hook이 세션 시작 시 자동 호출한다)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const TARGET_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'WAITING'])

function findRepoRoot() {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
}

function walkMarkdownFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'Archive') continue // 보관함은 폐기된 기록 — 현황판 대상 아님
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...walkMarkdownFiles(full))
    } else if (entry.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const fm = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) fm[kv[1]] = kv[2].trim()
  }
  return fm
}

function printKarinaCard(repoRoot) {
  const orchestratorPath = join(repoRoot, 'docs', 'agents', 'orchestrator.md')
  let text
  try {
    text = readFileSync(orchestratorPath, 'utf8')
  } catch {
    return // 문서가 없으면 카드 없이 현황판만 출력
  }
  const m = text.match(/<!-- CARD:START -->\n([\s\S]*?)\n<!-- CARD:END -->/)
  if (!m) return
  console.log()
  console.log(m[1].trim())
}

function main() {
  const repoRoot = findRepoRoot()
  const ticketsDir = join(repoRoot, 'Service Plan', 'Tickets')
  const files = walkMarkdownFiles(ticketsDir)

  const rows = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const fm = parseFrontmatter(text)
    if (!fm || !TARGET_STATUSES.has(fm.status)) continue

    const titleMatch = text.match(/^#\s+(.+)$/m)
    rows.push({
      id: fm.id ?? '?',
      status: fm.status,
      priority: fm.priority ?? '?',
      title: titleMatch ? titleMatch[1].trim() : file.replace(repoRoot + '/', ''),
    })
  }

  rows.sort(
    (a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id)
  )

  if (rows.length === 0) {
    console.log('## 티켓 현황판\n진행 중·대기 티켓 없음')
    printKarinaCard(repoRoot)
    return
  }

  console.log(`## 티켓 현황판 (${rows.length}건)`)
  for (const r of rows) {
    console.log(`- [${r.status}] ${r.priority} ${r.id} — ${r.title}`)
  }
  printKarinaCard(repoRoot)
}

main()
