#!/usr/bin/env node
// check-skills — .claude/skills/*/SKILL.md와 .claude/agents/*.md의 frontmatter 구조를 검사한다
// (티켓 20260922_1523, agent-skills 플러그인 evals Tier 1 이식).
//
// 검사 대상은 세 가지다.
//   1. .claude/skills/*/SKILL.md — frontmatter에 name·description이 있는가, description에
//      트리거 문구 예시("..." 로 감싼 실제 요청 문장)가 있는가
//   2. .claude/agents/*.md — frontmatter에 name·description·tools·model이 있는가, description에
//      호출 표시용 한글 이름이 괄호로 있는가 (gen-team-doc.mjs가 이 값을 그대로 쓴다)
//   3. docs/agents/contract.json의 agents._order와 .claude/agents/*.md 실제 파일 목록이
//      일치하는가 — 한쪽에만 있으면 등록 누락이거나 유령 항목이다
//
// 라우팅 평가(의미 판단, agent-skills Tier 2에 해당)는 scripts/skill-eval.mjs가 별도로 한다.
// 여기는 기계로 셀 수 있는 구조만 본다 — 행동 평가(Tier 3)는 채택하지 않았다.
//
// 사용법: node scripts/check-skills.mjs
//   종료 코드 0 = 통과, 1 = 구조 위반 발견

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function parseFrontmatter(src) {
  if (!src.startsWith('---')) return null
  const end = src.indexOf('\n---', 3)
  if (end === -1) return null
  const out = {}
  // CRLF 파일(예: 외부 출처 스킬)도 읽을 수 있게 줄 끝의 \r을 버리고 판정한다.
  for (const line of src.slice(4, end).split('\n')) {
    const m = line.replace(/\r$/, '').match(/^([a-zA-Z_]+):\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

// description 안에 실제 요청 문장을 따옴표로 예시한 것이 있는지 본다 — "배포해줘" 같은 형태.
const HAS_TRIGGER_EXAMPLE = /"[^"]+"/
// 에이전트 description 안의 호출 표시용 한글 이름: "JAM! ... agent (채원)." 형태.
const HAS_KOREAN_CALLSIGN = /\([가-힣]+\)/

export function checkSkillFile(name, src) {
  const problems = []
  const fm = parseFrontmatter(src)
  if (!fm) {
    problems.push(`${name}/SKILL.md: frontmatter가 없습니다 (--- 로 시작하는 YAML 머리말 필요)`)
    return problems
  }
  if (!fm.name) problems.push(`${name}/SKILL.md: frontmatter에 name이 없습니다`)
  if (!fm.description) {
    problems.push(`${name}/SKILL.md: frontmatter에 description이 없습니다`)
  } else if (!HAS_TRIGGER_EXAMPLE.test(fm.description)) {
    problems.push(`${name}/SKILL.md: description에 트리거 문구 예시("...")가 없습니다`)
  }
  return problems
}

export function checkAgentFile(name, src) {
  const problems = []
  const fm = parseFrontmatter(src)
  if (!fm) {
    problems.push(`${name}.md: frontmatter가 없습니다 (--- 로 시작하는 YAML 머리말 필요)`)
    return problems
  }
  for (const key of ['name', 'description', 'tools', 'model']) {
    if (!fm[key]) problems.push(`${name}.md: frontmatter에 ${key}가 없습니다`)
  }
  if (fm.description && !HAS_KOREAN_CALLSIGN.test(fm.description)) {
    problems.push(`${name}.md: description에 호출 표시용 한글 이름이 괄호로 없습니다`)
  }
  return problems
}

export function checkAgentsOrder(orderNames, actualNames) {
  const problems = []
  const orderSet = new Set(orderNames)
  const actualSet = new Set(actualNames)
  for (const n of orderNames) {
    if (!actualSet.has(n)) {
      problems.push(`contract.json agents._order에 ${n}이 있지만 .claude/agents/${n}.md가 없습니다`)
    }
  }
  for (const n of actualNames) {
    if (!orderSet.has(n)) {
      problems.push(`.claude/agents/${n}.md가 있지만 contract.json agents._order에 없습니다`)
    }
  }
  return problems
}

function main() {
  const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const problems = []

  const skillsDir = path.join(REPO, '.claude/skills')
  const skillNames = existsSync(skillsDir) ? readdirSync(skillsDir).sort() : []
  for (const name of skillNames) {
    const file = path.join(skillsDir, name, 'SKILL.md')
    if (!existsSync(file)) continue
    problems.push(...checkSkillFile(name, readFileSync(file, 'utf8')))
  }

  const agentsDir = path.join(REPO, '.claude/agents')
  const agentFiles = existsSync(agentsDir)
    ? readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort()
    : []
  const agentNames = agentFiles.map((f) => f.replace(/\.md$/, ''))
  for (const f of agentFiles) {
    problems.push(...checkAgentFile(f.replace(/\.md$/, ''), readFileSync(path.join(agentsDir, f), 'utf8')))
  }

  const contractPath = path.join(REPO, 'docs/agents/contract.json')
  if (existsSync(contractPath)) {
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
    const order = contract.agents?._order ?? []
    problems.push(...checkAgentsOrder(order, agentNames))
  }

  if (problems.length === 0) {
    console.log(`구조 평가 통과 (스킬 ${skillNames.length}개 · 에이전트 ${agentFiles.length}개)`)
    process.exit(0)
  }

  console.error(`구조 평가 실패: ${problems.length}건`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
