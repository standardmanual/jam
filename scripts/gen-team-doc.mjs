#!/usr/bin/env node
// gen-team-doc — docs/agents/team-operations.md의 사실 표를 실제 설정에서 생성한다
// (티켓 20260920_1907).
//
// 배경: 손으로 쓴 표는 반드시 낡는다. 에이전트의 도구·모델은 .claude/agents/*.md의
// frontmatter에, 워크트리 격리 대상은 .claude/workflows/jam-work.js에, 훅은
// .claude/settings.json에 있다. 표는 그 값을 옮겨 적은 사본일 뿐이므로 손으로 쓰지 않는다.
//
// 사실(무엇이 그런가)만 생성하고, 산문(왜 그런가)은 사람이 쓴다. 생성 구간은
// <!-- BEGIN generated: 이름 --> 와 <!-- END generated: 이름 --> 사이다.
//
// 사용법:
//   node scripts/gen-team-doc.mjs          생성 구간을 갱신한다
//   node scripts/gen-team-doc.mjs --check  최신인지만 판정한다 (다르면 종료 코드 1)

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const DOC = path.join(REPO, 'docs/agents/team-operations.md')
const CONTRACT = path.join(REPO, 'docs/agents/contract.json')
const CHECK_ONLY = process.argv.includes('--check')

function parseFrontmatter(file) {
  const src = readFileSync(file, 'utf8')
  if (!src.startsWith('---')) return null
  const end = src.indexOf('\n---', 3)
  if (end === -1) return null
  const out = {}
  for (const line of src.slice(4, end).split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

// description의 괄호 안 한국어 이름을 뽑는다: "JAM! design agent (채원). ..." → "채원"
function koreanName(description) {
  const m = (description ?? '').match(/\(([가-힣]+)\)/)
  return m ? m[1] : '?'
}

const contract = JSON.parse(readFileSync(CONTRACT, 'utf8'))
const order = contract.agents?._order ?? Object.keys(contract.agents ?? {}).filter((k) => !k.startsWith('_'))

// ── 생성 ① 에이전트 표 ────────────────────────────────────────────────────────
function genAgentTable() {
  const rows = [
    '| 이름 | 역할 | 정의 파일 | 기본 모델 | 도구 | 쓰기 권한 | 평소 관여 |',
    '|---|---|---|---|---|---|---|',
    '| 카리나 | 오케스트레이터 (메인 대화) | `docs/agents/orchestrator.md` | 세션 설정 | 전부 | **있음** | 항상 |',
  ]
  for (const name of order) {
    const file = path.join(REPO, '.claude/agents', `${name}.md`)
    if (!existsSync(file)) continue
    const fm = parseFrontmatter(file) ?? {}
    const decl = contract.agents[name] ?? {}
    const tools = (fm.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean)
    const canWrite = tools.includes('Write') || tools.includes('Edit')
    const model = (fm.model ?? '?').replace(/^sonnet$/, 'Sonnet').replace(/^haiku$/, 'Haiku')
    rows.push(
      `| ${koreanName(fm.description)} | ${decl.role ?? '?'} | \`.claude/agents/${name}.md\` | ` +
      `${model} | ${tools.join('·')} | ${canWrite ? '**있음**' : '없음'} | ${decl.presence ?? '?'} |`
    )
  }
  return rows.join('\n')
}

// ── 생성 ② 워크트리 격리 대상 ─────────────────────────────────────────────────
function genWorktreeIsolation() {
  const wf = path.join(REPO, '.claude/workflows/jam-work.js')
  const src = existsSync(wf) ? readFileSync(wf, 'utf8') : ''
  const isolated = []
  const re = /agentType:\s*'([^']+)'[^}]*isolation:\s*'worktree'/g
  let m
  while ((m = re.exec(src)) !== null) if (!isolated.includes(m[1])) isolated.push(m[1])

  const names = isolated.map((n) => {
    const f = path.join(REPO, '.claude/agents', `${n}.md`)
    return existsSync(f) ? `${koreanName(parseFrontmatter(f)?.description)}(\`${n}\`)` : `\`${n}\``
  })

  if (names.length === 0) return '격리 워크트리에서 도는 에이전트가 없다.'
  return `격리 워크트리에서 도는 에이전트는 **${names.join(' · ')}** 뿐이다. ` +
    `나머지 에이전트는 메인 작업 폴더에서 읽는다.`
}

// ── 생성 ③ 세션 시작 훅 ───────────────────────────────────────────────────────
function genSessionHooks() {
  const file = path.join(REPO, '.claude/settings.json')
  if (!existsSync(file)) return '(설정 파일을 읽지 못했다)'
  let cfg
  try {
    cfg = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return '(설정 파일이 올바른 JSON이 아니다)'
  }
  const groups = cfg.hooks?.SessionStart ?? []
  const commands = groups.flatMap((g) => (g.hooks ?? []).map((h) => h.command ?? '')).filter(Boolean)
  if (commands.length === 0) return '세션 시작 시 자동으로 도는 것이 없다.'

  const rows = ['| 실행 | 하는 일 |', '|---|---|']
  const explain = {
    'ticket-dashboard': '열려 있는 티켓 현황판과 오케스트레이터 카드를 출력한다',
    'check-routine-reports': '예정 시각이 지났는데 예약 리포트가 없으면 경고한다',
    'workspace-setup': 'staging에 머지된 격리 워크트리와 연결 워크트리 없는 브랜치를 정리한다',
    'ensure-hooks-path': '이 클론의 core.hooksPath가 이 저장소의 .githooks로 해석되지 않으면 .githooks로 맞춘다',
    'ensure-session-author': '조건(사람이 붙은 클라우드 세션, 예약 작업이 시작하지 않음, 세션 소유자 일치, 허용 진입점)을 모두 만족하면 이 클론의 git 작성자를 사용자 계정으로 맞춘다',
  }
  for (const c of commands) {
    const key = Object.keys(explain).find((k) => c.includes(k))
    // 명령 전문 대신 스크립트 경로만 보여 준다 — 파이프(|)가 섞이면 마크다운 표가 깨지고,
    // 표가 알려야 하는 것은 '무엇이 도는가'이지 셸 문법이 아니다.
    const m = c.match(/scripts\/[A-Za-z0-9._-]+/)
    const shown = m ? m[0] : c.replace(/\|/g, '\\|')
    rows.push(`| \`${shown}\` | ${key ? explain[key] : '(설명 미등록 — 생성기의 explain 표에 추가하세요)'} |`)
  }
  return rows.join('\n')
}

const BLOCKS = {
  'agent-table': genAgentTable,
  'worktree-isolation': genWorktreeIsolation,
  'session-hooks': genSessionHooks,
}

// ── 치환 ──────────────────────────────────────────────────────────────────────
let doc = readFileSync(DOC, 'utf8')
const original = doc
const missing = []

for (const [name, gen] of Object.entries(BLOCKS)) {
  const begin = `<!-- BEGIN generated: ${name} -->`
  const end = `<!-- END generated: ${name} -->`
  const b = doc.indexOf(begin)
  const e = doc.indexOf(end)
  if (b === -1 || e === -1 || e < b) {
    missing.push(name)
    continue
  }
  const before = doc.slice(0, b + begin.length)
  const after = doc.slice(e)
  doc = `${before}\n${gen()}\n${after}`
}

if (missing.length > 0) {
  console.error(`gen-team-doc: 생성 구간 표시가 없습니다: ${missing.join(', ')}`)
  console.error(`  team-operations.md에 <!-- BEGIN generated: 이름 --> 와 <!-- END generated: 이름 --> 를 넣으세요.`)
  process.exit(2)
}

if (CHECK_ONLY) {
  if (doc === original) {
    console.log('team-operations.md 생성 구간이 최신입니다.')
    process.exit(0)
  }
  console.error('')
  console.error('team-operations.md의 생성 구간이 실제 설정과 다릅니다.')
  console.error('  표를 손으로 고치지 말고 아래를 실행하세요:')
  console.error('')
  console.error('    node scripts/gen-team-doc.mjs')
  console.error('')
  console.error('  (표의 근거는 .claude/agents/*.md의 frontmatter, .claude/workflows/jam-work.js,')
  console.error('   .claude/settings.json입니다. 표가 아니라 그쪽을 고쳐야 합니다.)')
  process.exit(1)
}

if (doc === original) {
  console.log('team-operations.md 생성 구간이 이미 최신입니다.')
} else {
  writeFileSync(DOC, doc)
  console.log('team-operations.md 생성 구간을 갱신했습니다.')
}
