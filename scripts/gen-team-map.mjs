#!/usr/bin/env node
// gen-team-map — docs/agents/team-map.html(팀 지도 시각화)을 실제 설정에서 생성한다
// (티켓 20260922_2242).
//
// 배경: 에이전트 9인의 역할·콜사인·호출 관계·워크트리 구조를 한 화면에서 보는 시각화가
// 필요했다. 손으로 그린 그림은 정의가 바뀌는 순간 낡으므로, gen-team-doc.mjs와 같은 원칙으로
// 근거 파일에서 생성한다. 사실(무엇이 그런가)은 아래 근거에서 읽고, 화면 구성만 이 파일이 정한다.
//
//   에이전트 이름·도구·모델      .claude/agents/*.md frontmatter
//   역할·평소 관여·정렬 순서      docs/agents/contract.json agents
//   파이프라인 단계·호출 순서·격리 .claude/workflows/jam-work.js (meta.phases, agent() 호출)
//   스킬 콜사인과 부르는 에이전트  .claude/skills/jam-*/SKILL.md
//   세션 시작 훅                 .claude/settings.json
//   push 차단 장치               .githooks/pre-push, .githooks/pre-commit
//   경로·접근 범위·예약 루틴 표    docs/agents/team-operations.md (사람이 관리하는 표를 그대로 옮긴다)
//
// 시각·난수를 넣지 않아 같은 저장소 상태에서는 항상 같은 결과가 나온다. 그래서 --check가 성립한다.
//
// 사용법:
//   node scripts/gen-team-map.mjs          team-map.html을 갱신한다
//   node scripts/gen-team-map.mjs --check  최신인지만 판정한다 (다르면 종료 코드 1)
//   node scripts/gen-team-map.mjs --open   갱신한 뒤 기본 브라우저로 연다 (macOS `open`)

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const OUTPUT = 'docs/agents/team-map.html'

// ── 공통 유틸 ────────────────────────────────────────────────────────────────
export function parseFrontmatter(src) {
  if (!src.startsWith('---')) return null
  const end = src.indexOf('\n---', 3)
  if (end === -1) return null
  const out = {}
  for (const line of src.slice(4, end).split('\n')) {
    const m = line.replace(/\r$/, '').match(/^([a-zA-Z_]+):\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

// description의 괄호 안 한국어 이름: "JAM! design agent (채원). ..." → "채원"
export function koreanName(description) {
  const m = (description ?? '').match(/\(([가-힣]+)\)/)
  return m ? m[1] : '?'
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// 마크다운 표 셀의 인라인 표기(`코드`·**굵게**)만 HTML로 옮긴다. 나머지는 전부 이스케이프한다.
export function mdInline(s) {
  const parts = []
  let rest = String(s ?? '')
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/
  while (rest.length > 0) {
    const m = rest.match(re)
    if (!m) { parts.push(esc(rest)); break }
    parts.push(esc(rest.slice(0, m.index)))
    const tok = m[0]
    if (tok.startsWith('`')) parts.push(`<code>${esc(tok.slice(1, -1))}</code>`)
    else parts.push(`<strong>${esc(tok.slice(2, -2))}</strong>`)
    rest = rest.slice(m.index + tok.length)
  }
  return parts.join('')
}

// 제목(접두 일치) 다음에 처음 나오는 마크다운 표를 { header, rows }로 돌려준다. 없으면 null.
export function extractTable(md, headingPrefix) {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.startsWith(headingPrefix))
  if (start === -1) return null
  let i = start + 1
  while (i < lines.length && !lines[i].trim().startsWith('|')) {
    if (/^#{1,6}\s/.test(lines[i])) return null // 다음 제목까지 표가 없다
    i++
  }
  const block = []
  while (i < lines.length && lines[i].trim().startsWith('|')) block.push(lines[i++])
  if (block.length < 2) return null
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  const header = cells(block[0])
  const rows = block.slice(2).map(cells).filter((r) => r.some((c) => c.length > 0))
  return { header, rows }
}

// ── 근거 ① 에이전트 ──────────────────────────────────────────────────────────
export function collectAgents(repo, contract) {
  const order = contract.agents?._order ?? Object.keys(contract.agents ?? {}).filter((k) => !k.startsWith('_'))
  const out = []
  for (const id of order) {
    const file = path.join(repo, '.claude/agents', `${id}.md`)
    if (!existsSync(file)) continue
    const fm = parseFrontmatter(readFileSync(file, 'utf8')) ?? {}
    const decl = contract.agents?.[id] ?? {}
    const tools = (fm.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean)
    out.push({
      id,
      name: koreanName(fm.description),
      role: decl.role ?? '?',
      presence: decl.presence ?? '?',
      model: (fm.model ?? '?').replace(/^sonnet$/, 'Sonnet').replace(/^haiku$/, 'Haiku'),
      tools,
      canWrite: tools.includes('Write') || tools.includes('Edit'),
      description: fm.description ?? '',
      file: `.claude/agents/${id}.md`,
    })
  }
  return out
}

// ── 근거 ② 파이프라인 — jam-work.js의 phase 목록과 agent() 호출 ───────────────
export function parsePhases(src) {
  const m = src.match(/phases:\s*\[([\s\S]*?)\]/)
  if (!m) return []
  return [...m[1].matchAll(/title:\s*'([^']+)'/g)].map((x) => x[1])
}

// agentType: '…' 가 들어 있는 옵션 객체를 중괄호 짝으로 잘라 label·phase·isolation·model을 읽는다.
// parallel([ … ]) 안에 있으면 같은 group 번호를 붙인다 — 병렬 호출은 한 칸에 나란히 그린다.
export function parseAgentCalls(src) {
  const calls = []
  const parallelSpans = []
  {
    const re = /parallel\(\s*\[/g
    let m
    while ((m = re.exec(src)) !== null) {
      const open = m.index + m[0].length - 1
      let depth = 0
      for (let i = open; i < src.length; i++) {
        if (src[i] === '[') depth++
        else if (src[i] === ']') { depth--; if (depth === 0) { parallelSpans.push([open, i]); break } }
      }
    }
  }
  const phaseCalls = [...src.matchAll(/phase\(\s*'([^']+)'\s*\)/g)].map((m) => ({ at: m.index, title: m[1] }))

  const re = /agentType:\s*'([^']+)'/g
  let m
  while ((m = re.exec(src)) !== null) {
    let open = m.index
    while (open > 0 && src[open] !== '{') open--
    let depth = 0, close = open
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') { depth--; if (depth === 0) { close = i; break } }
    }
    const opts = src.slice(open, close + 1)
    const label = opts.match(/label:\s*'([^']+)'/)?.[1] ?? m[1]
    const explicitPhase = opts.match(/phase:\s*'([^']+)'/)?.[1]
    const preceding = phaseCalls.filter((p) => p.at < m.index).pop()
    const groupIdx = parallelSpans.findIndex(([a, b]) => m.index > a && m.index < b)
    calls.push({
      agentType: m[1],
      label,
      phase: explicitPhase ?? preceding?.title ?? '?',
      isolation: opts.match(/isolation:\s*'([^']+)'/)?.[1] ?? null,
      modelOverride: opts.match(/model:\s*'([^']+)'/)?.[1] ?? null,
      parallelGroup: groupIdx === -1 ? null : groupIdx,
    })
  }
  return calls
}

export function parseConstList(src, name) {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`))
  if (!m) return []
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

// ── 근거 ③ 스킬 콜사인 ───────────────────────────────────────────────────────
export function collectSkills(repo, agentIds) {
  const dir = path.join(repo, '.claude/skills')
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir).sort()) {
    if (!name.startsWith('jam-')) continue
    const file = path.join(dir, name, 'SKILL.md')
    if (!existsSync(file)) continue
    const src = readFileSync(file, 'utf8')
    const fm = parseFrontmatter(src) ?? {}
    // `jam-developer.md`처럼 정의 파일을 가리키는 언급은 호출이 아니므로 세지 않는다.
    const agents = agentIds.filter((id) => new RegExp(`\\b${id}\\b(?!\\.md)`).test(src))
    out.push({ name: fm.name ?? name, description: fm.description ?? '', agents })
  }
  return out
}

// ── 근거 ④ 세션 훅 ───────────────────────────────────────────────────────────
export function collectSessionHooks(repo) {
  const file = path.join(repo, '.claude/settings.json')
  if (!existsSync(file)) return []
  let cfg
  try { cfg = JSON.parse(readFileSync(file, 'utf8')) } catch { return [] }
  const groups = cfg.hooks?.SessionStart ?? []
  return groups.flatMap((g) => (g.hooks ?? []).map((h) => h.command ?? ''))
    .map((c) => c.match(/scripts\/[A-Za-z0-9._-]+/)?.[0]).filter(Boolean)
}

// ── 근거 ⑤ 훅이 실제로 막는 것 ───────────────────────────────────────────────
export function collectGuards(prePush, preCommit) {
  const g = []
  if (/JAM_SHIP/.test(prePush)) g.push({ where: 'pre-push', what: 'main 직접 push 차단', how: 'JAM_SHIP=1(/jam-ship)만 통과' })
  if (/wf_\*\)/.test(prePush) && /block_reason/.test(prePush)) g.push({ where: 'pre-push', what: '에이전트 워크트리(wf_*)에서 staging push 차단', how: '우회 변수 없음' })
  if (/claude\/jamwork-\*\)\s*block_reason/.test(prePush)) g.push({ where: 'pre-push', what: '리뷰 브랜치(claude/jamwork-*)에서 staging push 차단', how: '우회 변수 없음' })
  if (/verify\.sh/.test(prePush)) g.push({ where: 'pre-push', what: '리뷰 브랜치 push 시 verify 게이트', how: '메인 트리·wf_ 아닌 워크트리에서 실행, wf_*는 CI에 맡김' })
  if (/status: CLOSED/.test(preCommit)) g.push({ where: 'pre-commit', what: '리뷰 브랜치에서 티켓 CLOSED 커밋 차단', how: '아현은 티켓을 닫지 못한다' })
  if (/gen-team-map\.mjs --check/.test(preCommit)) g.push({ where: 'pre-commit', what: '이 지도(team-map.html)가 낡으면 커밋 차단', how: 'node scripts/gen-team-map.mjs' })
  return g
}

// ── 자료 수집 ────────────────────────────────────────────────────────────────
export function collect(repo) {
  const read = (p) => (existsSync(path.join(repo, p)) ? readFileSync(path.join(repo, p), 'utf8') : '')
  const contract = JSON.parse(read('docs/agents/contract.json') || '{}')
  const agents = collectAgents(repo, contract)
  const wf = read('.claude/workflows/jam-work.js')
  const teamOps = read('docs/agents/team-operations.md')
  const routines = extractTable(teamOps, '## 6.')
  const routineAgents = new Set()
  for (const r of routines?.rows ?? []) {
    for (const n of (r[2] ?? '').split(/→|·/).map((x) => x.trim()).filter(Boolean)) routineAgents.add(n)
  }
  return {
    agents,
    writeCapable: contract.write_capable_agents?.agents ?? [],
    worktreeIsolated: contract.worktree_isolated_agents?.agents ?? [],
    phases: parsePhases(wf),
    calls: parseAgentCalls(wf),
    designTypes: parseConstList(wf, 'DESIGN_TYPES'),
    smallDiff: wf.match(/const SMALL_DIFF_LINE_THRESHOLD\s*=\s*(\d+)/)?.[1] ?? null,
    firstCommand: /git checkout --detach/.test(wf) && /workspace-setup\.sh link/.test(wf),
    skills: collectSkills(repo, agents.map((a) => a.id)),
    hooks: collectSessionHooks(repo),
    guards: collectGuards(read('.githooks/pre-push'), read('.githooks/pre-commit')),
    routes: extractTable(teamOps, '## 3.'),
    boundary: extractTable(teamOps, '### 머지와 배포의 경계'),
    access: extractTable(teamOps, '## 5.'),
    routines,
    routineAgents: [...routineAgents],
  }
}

// ── 렌더링 ───────────────────────────────────────────────────────────────────
// 스타일은 사용자가 준 디자인 레퍼런스(웜 크림 에디토리얼: 에그셸 → 웜 토프 → 스톤 3단 표면,
// 잉크 검정 하나의 대비, 32px 이상 제목은 300 웨이트에 -0.02em 자간, 필(9999px) 태그·버튼,
// 바이올렛·오렌지 스파크는 UI가 아닌 장식 비주얼에만)를 따른다. 사실을 그리는 방식은 바꾸지 않는다.
const ORCH = { id: 'orchestrator', name: '카리나', role: '오케스트레이터 (메인 세션)', presence: '항상', model: '세션 설정', tools: ['전부'], canWrite: true, file: 'docs/agents/orchestrator.md' }

function table(t, cls = '') {
  if (!t) return '<p class="muted">(team-operations.md에서 표를 찾지 못했다)</p>'
  const th = t.header.map((h) => `<th>${mdInline(h)}</th>`).join('')
  const tr = t.rows.map((r) => `<tr>${r.map((c) => `<td>${mdInline(c)}</td>`).join('')}</tr>`).join('\n')
  return `<div class="tw"><table class="${cls}"><thead><tr>${th}</tr></thead><tbody>\n${tr}\n</tbody></table></div>`
}

function chip(text, cls = '') { return `<span class="chip ${cls}">${esc(text)}</span>` }

// 에이전트의 관여 부류 — 색이 아니라 선의 종류로 구분한다(레퍼런스는 97% 무채색).
function groupOf(a, d) {
  if (a.id === 'orchestrator') return 'hub'
  if (d.calls.some((c) => c.agentType === a.id)) return 'pipe'
  if (d.routineAgents.includes(a.name)) return 'routine'
  return 'call'
}
const GROUP_LABEL = { hub: '오케스트레이터', pipe: '표준 파이프라인', routine: '예약 루틴', call: '필요할 때 호출' }

function agentCard(a, d) {
  const group = groupOf(a, d)
  const isolated = d.worktreeIsolated.includes(a.id)
  const skills = d.skills.filter((s) => s.agents.includes(a.id)).map((s) => `/${s.name}`)
  return `
<article class="card ${group}" id="agent-${esc(a.id)}">
  <p class="eyebrow">${esc(GROUP_LABEL[group])}</p>
  <header>
    <h3 class="name">${esc(a.name)}</h3>
    <code class="callsign">${a.id === 'orchestrator' ? '메인 세션' : esc(a.id)}</code>
  </header>
  <p class="role">${esc(a.role)}</p>
  <dl>
    <dt>모델</dt><dd>${esc(a.model)}</dd>
    <dt>도구</dt><dd>${a.tools.map((t) => chip(t, ['Write', 'Edit'].includes(t) ? 'ink' : '')).join(' ')}</dd>
    <dt>쓰기</dt><dd>${a.canWrite ? chip('있음', 'ink') : chip('없음')}</dd>
    <dt>관여</dt><dd>${esc(a.presence)}</dd>
    ${isolated ? `<dt>실행 위치</dt><dd>${chip('격리 워크트리', 'dashed')}</dd>` : ''}
    ${skills.length ? `<dt>스킬</dt><dd>${skills.map((s) => `<code>${esc(s)}</code>`).join(' ')}</dd>` : ''}
  </dl>
  <footer><code>${esc(a.file)}</code></footer>
</article>`
}

// 허브형 호출 관계도 — 카리나를 가운데 두고 나머지를 원 위에 놓는다. 서브에이전트끼리의 간선은
// 그리지 않는다(서로를 부를 도구가 없다). 예약 루틴의 "담당 A → B"만 점선으로 잇는다.
function hubSvg(d) {
  const W = 960, H = 680, cx = W / 2, cy = H / 2 + 28, R = 245
  const n = d.agents.length
  const pos = {}
  // 첫 노드를 -90°에서 반 칸 비켜 놓아 정수리(사용자 자리)를 비운다.
  d.agents.forEach((a, i) => {
    const ang = -Math.PI / 2 + Math.PI / n + (2 * Math.PI * i) / n
    pos[a.id] = { x: +(cx + R * Math.cos(ang)).toFixed(1), y: +(cy + R * Math.sin(ang)).toFixed(1) }
  })
  const byName = Object.fromEntries(d.agents.map((a) => [a.name, a]))

  const edges = d.agents.map((a) => {
    const p = pos[a.id]
    const thick = d.writeCapable.includes(a.id)
    return `<line class="edge ${thick ? 'write' : ''}" x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}"/>`
  }).join('\n')

  // 루틴 간선: 담당 셀 "카즈하 → 윤진", "윈터·윤진 → 하니". 가운데를 가로지르지 않도록
  // 중심 반대쪽으로 볼록한 곡선으로 그린다.
  const routineEdges = []
  for (const r of d.routines?.rows ?? []) {
    const parts = (r[2] ?? '').split('→').map((x) => x.trim())
    if (parts.length < 2) continue
    const froms = parts[0].split('·').map((x) => x.trim())
    const to = byName[parts[1]]
    if (!to) continue
    for (const f of froms) {
      const from = byName[f]
      if (!from) continue
      const a = pos[from.id], b = pos[to.id]
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      const dx = mx - cx, dy = my - cy, len = Math.hypot(dx, dy) || 1
      const k = 110
      const c = { x: +(mx + (dx / len) * k).toFixed(1), y: +(my + (dy / len) * k).toFixed(1) }
      const lx = (0.25 * a.x + 0.5 * c.x + 0.25 * b.x).toFixed(1)
      const ly = (0.25 * a.y + 0.5 * c.y + 0.25 * b.y - 6).toFixed(1)
      routineEdges.push(`<path class="edge routine" d="M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}"/>` +
        `<text class="elabel" x="${lx}" y="${ly}">${esc(r[0])}</text>`)
    }
  }

  const node = (id, name, sub, role, x, y, cls) => `
<g class="node ${cls}" transform="translate(${x},${y})">
  <a href="#agent-${esc(id)}">
    <rect x="-72" y="-36" width="144" height="72" rx="20"/>
    <text class="nname" y="-13">${esc(name)}</text>
    <text class="nsub" y="5">${esc(sub)}</text>
    <text class="nrole" y="23">${esc(role)}</text>
  </a>
</g>`

  const nodes = d.agents.map((a) => {
    const p = pos[a.id]
    const sub = `${a.id}${d.worktreeIsolated.includes(a.id) ? ' · 격리' : ''}`
    return node(a.id, a.name, sub, a.role, p.x, p.y, groupOf(a, d))
  }).join('\n')

  return `<svg class="hub" viewBox="0 0 ${W} ${H}" role="img" aria-label="카리나를 중심으로 한 에이전트 호출 관계도">
<defs>
  <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>
</defs>
<g class="user"><rect x="${cx - 44}" y="10" width="88" height="34" rx="17"/><text x="${cx}" y="32">사용자</text></g>
<line class="edge user-edge" x1="${cx}" y1="44" x2="${cx}" y2="${cy - 40}"/>
<text class="elabel" x="${cx + 10}" y="78" text-anchor="start">지시 · 승인 · 배포 결정</text>
${edges}
${routineEdges.join('\n')}
${nodes}
${node('orchestrator', ORCH.name, '메인 세션', '오케스트레이터', cx, cy, 'hub')}
</svg>`
}

// 표준 파이프라인 — meta.phases 순서대로 칸을 만들고, 각 칸에 그 단계의 agent() 호출을 넣는다.
function pipelineHtml(d) {
  const byLabel = (c) => d.agents.find((a) => a.id === c.agentType)
  const cols = d.phases.map((ph) => {
    const calls = d.calls.filter((c) => c.phase === ph)
    const items = calls.map((c) => {
      const a = byLabel(c)
      const notes = []
      if (c.agentType === 'jam-designer' && d.designTypes.length) notes.push(`${d.designTypes.join('·')} 유형만`)
      if (c.label.endsWith('-post') && d.smallDiff) notes.push(`diff ${d.smallDiff}줄 미만이면 생략`)
      if (c.isolation) notes.push(`isolation: ${c.isolation}`)
      if (c.modelOverride) notes.push(`기본 외 모델: ${c.modelOverride.replace(/^claude-/, '').replace(/-\d{8}$/, '')}`)
      if (c.parallelGroup !== null) notes.push('병렬')
      return `<div class="step ${c.isolation ? 'isolated' : ''}">
  <div class="who"><a href="#agent-${esc(c.agentType)}">${esc(a?.name ?? c.agentType)}</a></div>
  <code class="lbl">${esc(c.label)}</code>
  ${notes.length ? `<div class="notes">${notes.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
</div>`
    }).join('\n')
    return `<div class="phase"><p class="ptitle">${esc(ph)}</p>${items || '<div class="step empty">(호출 없음)</div>'}</div>`
  })
  const tail = `<div class="phase after"><p class="ptitle">승인 · 머지</p>
<div class="step"><div class="who"><a href="#agent-orchestrator">카리나</a></div><div class="notes"><span>결과 해석 · 승인 요청</span></div></div>
<div class="step"><div class="who">사용자</div><div class="notes"><span>머지 승인</span></div></div>
<div class="step"><div class="who">staging</div><div class="notes"><span>카리나가 머지·push</span></div></div>
</div>`
  return `<div class="pipeline">${cols.join('<div class="arrow" aria-hidden="true">→</div>')}<div class="arrow" aria-hidden="true">→</div>${tail}</div>`
}

// 워크트리·브랜치 구조 — 근거는 jam-work.js의 isolation, 아현 첫 명령, 훅 차단 목록, 세션 훅.
function worktreeHtml(d) {
  const isolatedNames = d.worktreeIsolated.map((id) => d.agents.find((a) => a.id === id)?.name ?? id)
  const others = d.agents.filter((a) => !d.worktreeIsolated.includes(a.id)).map((a) => a.name)
  const guards = d.guards.map((g) => `<tr><td><code>${esc(g.where)}</code></td><td>${esc(g.what)}</td><td>${esc(g.how)}</td></tr>`).join('\n')
  const hooks = d.hooks.map((h) => `<li><code>${esc(h)}</code></li>`).join('')
  return `
<div class="wt">
  <div class="lane main">
    <p class="lt">메인 작업 폴더 <code>JAM!/</code> — <code>staging</code> 체크아웃</p>
    <div class="box">카리나(메인 세션)${others.length ? ` · 읽기만 하는 에이전트: ${esc(others.join('·'))}` : ''}</div>
    <div class="box dim">jam-web/node_modules 실체 · 시크릿 파일(.env.local 등)</div>
    <div class="box dim">세션 시작 훅: <ul class="hooks">${hooks}</ul></div>
  </div>
  <div class="lane iso">
    <p class="lt">격리 워크트리 <code>.claude/worktrees/wf_*</code> — ${esc(isolatedNames.join('·') || '(없음)')} 전용</p>
    ${d.firstCommand ? `<div class="box">첫 명령: <code>git fetch origin staging</code> → <code>git checkout --detach origin/staging</code> → <code>workspace-setup.sh link</code></div>` : ''}
    <div class="box">브랜치 <code>claude/jamwork-{ticket}-{slug}</code>에 커밋 → 리뷰 브랜치로만 push</div>
    <div class="box dim">jam-web/node_modules → 메인 폴더로 향하는 심볼릭 링크 · 시크릿 없음 · <code>docs/</code>는 실제 폴더로 따라옴</div>
  </div>
  <div class="lane remote">
    <p class="lt">GitHub · Vercel</p>
    <div class="box"><code>claude/jamwork-*</code> push → CI <code>verify</code>가 커밋 상태(도장)를 남김 → 민지가 도장을 읽음</div>
    <div class="box"><code>staging</code> ← 카리나가 사용자 승인 후 머지·push (CI 없음)</div>
    <div class="box"><code>main</code> ← <code>/jam-ship</code>(<code>JAM_SHIP=1</code>)만 → Vercel 프로덕션</div>
  </div>
</div>
<h3>훅이 실제로 막는 것</h3>
<div class="tw"><table><thead><tr><th>어디서</th><th>무엇을</th><th>어떻게</th></tr></thead><tbody>
${guards || '<tr><td colspan="3">(훅에서 차단 장치를 찾지 못했다)</td></tr>'}
</tbody></table></div>`
}

function skillsHtml(d) {
  const rows = d.skills.map((s) => {
    const agents = s.agents.map((id) => {
      const a = d.agents.find((x) => x.id === id)
      return `<a href="#agent-${esc(id)}">${esc(a?.name ?? id)}</a> <code>${esc(id)}</code>`
    })
    return `<tr><td><code>/${esc(s.name)}</code></td><td>${agents.length ? agents.join('<br>') : '<span class="muted">카리나 직접</span>'}</td><td>${esc(s.description)}</td></tr>`
  }).join('\n')
  return `<div class="tw"><table class="skills"><thead><tr><th>콜사인</th><th>부르는 에이전트</th><th>용도</th></tr></thead><tbody>\n${rows}\n</tbody></table></div>`
}

// 범례 — 색 견본 대신 실제로 쓰는 선·면의 견본을 그린다.
function legendHtml() {
  const sw = (inner) => `<svg class="sw" viewBox="0 0 56 24" aria-hidden="true">${inner}</svg>`
  const items = [
    [sw('<rect x="2" y="2" width="52" height="20" rx="10" class="k-hub"/>'), '오케스트레이터 (잉크 채움)'],
    [sw('<rect x="2" y="2" width="52" height="20" rx="10" class="k-pipe"/>'), '표준 파이프라인(<code>/jam-work</code>)에서 호출'],
    [sw('<rect x="2" y="2" width="52" height="20" rx="10" class="k-routine"/>'), '예약 루틴 담당 (점선 테두리)'],
    [sw('<rect x="2" y="2" width="52" height="20" rx="10" class="k-call"/>'), '필요할 때 호출 (연한 테두리)'],
    [sw('<line x1="4" y1="12" x2="52" y2="12" class="k-write"/>'), '쓰기 권한이 있는 대상 (굵은 선)'],
    [sw('<path d="M4,18 Q28,-6 52,18" class="k-rline"/>'), '예약 루틴에서 산출물이 넘어가는 순서'],
  ]
  return `<ul class="legend">${items.map(([s, t]) => `<li>${s}<span>${t}</span></li>`).join('')}</ul>`
}

export function renderHtml(d) {
  const all = [ORCH, ...d.agents]
  const sources = [
    '.claude/agents/*.md', 'docs/agents/contract.json', '.claude/workflows/jam-work.js',
    '.claude/skills/jam-*/SKILL.md', '.claude/settings.json', '.githooks/pre-push', '.githooks/pre-commit',
    'docs/agents/team-operations.md',
  ]
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JAM! 팀 지도</title>
<meta name="description" content="에이전트 역할·콜사인·호출 관계·워크트리 구조를 한 화면에 모은 자동 생성 지도">
<style>
/* 디자인 토큰 — 사용자가 준 레퍼런스의 Quick Start 값 그대로 */
:root{
  color-scheme:light;
  --color-eggshell:#fdfcfc;--color-warm-taupe:#f5f3f1;--color-stone:#ebe8e4;
  --color-ink:#000000;--color-graphite:#44403b;--color-smoke:#777169;--color-ash:#a59f97;
  --color-violet-spark:#0447ff;--color-ember-orange:#ff4704;
  --color-button-border:#e5e5e5;
  --font-display:'Inter',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI",Roboto,sans-serif;
  --font-inter:'Inter',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI",Roboto,sans-serif;
  --font-geist-mono:'Geist Mono','JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
  --text-caption:10px;--leading-caption:1.6;
  --text-body-sm:14px;--leading-body-sm:1.5;--tracking-body-sm:0.14px;
  --text-body:16px;--leading-body:1.5;--tracking-body:0.16px;
  --text-subheading:18px;--leading-subheading:1.6;
  --text-body-lg:20px;--leading-body-lg:1.35;
  --text-heading-sm:32px;--leading-heading-sm:1.13;--tracking-heading-sm:-0.64px;
  --text-heading:36px;--leading-heading:1.17;--tracking-heading:-0.72px;
  --text-display:48px;--leading-display:1.08;--tracking-display:-0.96px;
  --font-weight-light:300;--font-weight-regular:400;--font-weight-medium:500;
  --spacing-4:4px;--spacing-8:8px;--spacing-12:12px;--spacing-16:16px;--spacing-20:20px;--spacing-24:24px;
  --spacing-32:32px;--spacing-40:40px;--spacing-48:48px;--spacing-64:64px;--spacing-96:96px;
  --page-max-width:1280px;--card-padding:32px;
  --radius-md:4px;--radius-lg:10px;--radius-cards:20px;--radius-large-cards:24px;--radius-full:9999px;
  --shadow-subtle:rgba(0,0,0,0.4) 0px 0px 1px 0px,rgba(0,0,0,0.04) 0px 1px 1px 0px,rgba(0,0,0,0.04) 0px 2px 4px 0px;
  --shadow-subtle-2:rgba(0,0,0,0.075) 0px 0px 0px 0.5px inset;
  --shadow-subtle-7:rgb(235,232,228) 0px 0px 0px 0.5px inset;
}
*{box-sizing:border-box}
html{background:var(--color-eggshell)}
body{margin:0;background:var(--color-eggshell);color:var(--color-ink);
  font:var(--font-weight-regular) var(--text-body)/var(--leading-body) var(--font-inter);letter-spacing:var(--tracking-body);
  -webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
code{font:var(--font-weight-regular) 13px/1.69 var(--font-geist-mono);letter-spacing:0;background:var(--color-stone);color:var(--color-graphite);padding:1px 6px;border-radius:var(--radius-md)}
main{max-width:var(--page-max-width);margin:0 auto;padding:0 var(--spacing-64) var(--spacing-96)}
h1{font:var(--font-weight-light) var(--text-display)/var(--leading-display) var(--font-display);letter-spacing:var(--tracking-display);margin:0}
h2{font:var(--font-weight-light) var(--text-heading)/var(--leading-heading) var(--font-display);letter-spacing:var(--tracking-heading);margin:0 0 var(--spacing-16)}
h3{font:var(--font-weight-regular) var(--text-body-lg)/var(--leading-body-lg) var(--font-inter);letter-spacing:0;margin:var(--spacing-40) 0 var(--spacing-12)}
h2 code,h1 code{font-size:0.62em;vertical-align:middle;background:transparent;padding:0;color:var(--color-graphite)}
section{padding-top:var(--spacing-64);margin-top:var(--spacing-64);border-top:1px solid var(--color-stone)}
.sub{color:var(--color-smoke);margin:0 0 var(--spacing-24);max-width:72ch}
.muted{color:var(--color-ash)}
.eyebrow{font-size:12px;line-height:1.6;letter-spacing:0.02em;color:var(--color-ash);margin:0 0 var(--spacing-8)}

/* 히어로 — 왼쪽 정렬 제목, 오른쪽 설명, 유일한 색 스파크(장식 구체) */
.hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,0.9fr) auto;gap:var(--spacing-40);align-items:end;padding:var(--spacing-64) 0 var(--spacing-40)}
.hero .lede{color:var(--color-smoke);margin:0 0 var(--spacing-16)}
.sources{display:flex;gap:var(--spacing-8);flex-wrap:wrap}
.sources code{background:var(--color-eggshell);box-shadow:var(--shadow-subtle-2);border-radius:var(--radius-full);padding:2px 10px;font-size:12px;color:var(--color-smoke)}
.sphere{width:112px;height:112px;border-radius:var(--radius-full);
  background:radial-gradient(circle at 34% 30%,#ffd1dc 0%,var(--color-ember-orange) 36%,var(--color-violet-spark) 78%,#0b2a9a 100%);
  box-shadow:var(--shadow-subtle);justify-self:end}

/* 상단 내비 — 고스트 필 링크 */
nav.top{position:sticky;top:0;z-index:5;background:var(--color-eggshell);border-bottom:1px solid var(--color-stone);
  padding:var(--spacing-12) 0;display:flex;gap:var(--spacing-8);flex-wrap:wrap}
nav.top a{font:var(--font-weight-medium) var(--text-body-sm)/1.2 var(--font-inter);letter-spacing:var(--tracking-body-sm);
  padding:8px 14px;border:1px solid var(--color-button-border);border-radius:var(--radius-full);background:transparent;color:var(--color-ink)}
nav.top a:hover{background:var(--color-warm-taupe);text-decoration:none}

/* 범례 */
.legend{list-style:none;margin:0 0 var(--spacing-24);padding:0;display:flex;gap:var(--spacing-8) var(--spacing-24);flex-wrap:wrap;font-size:var(--text-body-sm);color:var(--color-smoke);letter-spacing:var(--tracking-body-sm)}
.legend li{display:flex;align-items:center;gap:var(--spacing-8)}
.legend .sw{width:56px;height:24px;flex:0 0 auto}
.k-hub{fill:var(--color-ink)} .k-pipe{fill:var(--color-eggshell);stroke:var(--color-ink);stroke-width:1.5}
.k-routine{fill:var(--color-eggshell);stroke:var(--color-graphite);stroke-width:1.5;stroke-dasharray:4 3}
.k-call{fill:var(--color-eggshell);stroke:var(--color-ash);stroke-width:1.5}
.k-write{stroke:var(--color-ink);stroke-width:3} .k-rline{fill:none;stroke:var(--color-graphite);stroke-width:1.5;stroke-dasharray:4 3}

/* 태그·칩 — 전부 필 */
.chip{display:inline-block;font-size:12px;line-height:1.6;padding:1px 10px;border-radius:var(--radius-full);background:var(--color-eggshell);color:var(--color-graphite);box-shadow:var(--shadow-subtle-2);margin:1px 0}
.chip.ink{background:var(--color-ink);color:var(--color-eggshell);box-shadow:none}
.chip.dashed{background:transparent;box-shadow:none;border:1px dashed var(--color-graphite)}

/* 에이전트 카드 — 웜 토프 피처 카드, 카리나만 에그셸 + 속삭임 그림자로 한 단 띄운다 */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--spacing-16)}
.card{background:var(--color-warm-taupe);border-radius:var(--radius-cards);padding:var(--spacing-24) var(--card-padding) var(--spacing-20);display:flex;flex-direction:column;gap:var(--spacing-8)}
.card.hub{background:var(--color-eggshell);box-shadow:var(--shadow-subtle)}
.card header{display:flex;align-items:baseline;justify-content:space-between;gap:var(--spacing-8)}
.card .name{font:var(--font-weight-regular) var(--text-body-lg)/var(--leading-body-lg) var(--font-inter);letter-spacing:0;margin:0}
.card .callsign{background:transparent;padding:0;font-size:12px;color:var(--color-smoke)}
.card .role{margin:0;color:var(--color-ink)}
.card dl{display:grid;grid-template-columns:auto 1fr;gap:var(--spacing-4) var(--spacing-12);margin:var(--spacing-4) 0 0;font-size:var(--text-body-sm);letter-spacing:var(--tracking-body-sm)}
.card dt{color:var(--color-ash)} .card dd{margin:0;color:var(--color-graphite)}
.card footer{margin-top:auto;padding-top:var(--spacing-8)}
.card footer code{background:transparent;padding:0;font-size:12px;color:var(--color-ash)}

/* 표 — 헤어라인 스톤 경계 */
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:var(--text-body-sm);letter-spacing:var(--tracking-body-sm);background:var(--color-eggshell)}
th,td{border:1px solid var(--color-stone);padding:10px 14px;text-align:left;vertical-align:top}
th{background:var(--color-warm-taupe);font-weight:var(--font-weight-regular);font-size:12px;color:var(--color-graphite);letter-spacing:0.02em}
td{color:var(--color-smoke)} td:first-child{color:var(--color-ink)}
table strong{font-weight:var(--font-weight-medium);color:var(--color-ink)}

/* 호출 관계도 — 무채색, 선의 종류로 구분 */
svg.hub{width:100%;height:auto;background:var(--color-eggshell);border:1px solid var(--color-stone);border-radius:var(--radius-cards)}
svg.hub text{font:var(--font-weight-regular) 13px var(--font-inter);fill:var(--color-ink);text-anchor:middle}
svg.hub .edge{stroke:var(--color-stone);stroke-width:1.5;fill:none}
svg.hub .edge.write{stroke:var(--color-ink);stroke-width:3}
svg.hub .edge.routine{stroke:var(--color-graphite);stroke-width:1.5;stroke-dasharray:5 4;marker-end:url(#arr)}
svg.hub .edge.user-edge{stroke:var(--color-ink);stroke-width:1.5;marker-end:url(#arr)}
svg.hub marker path{fill:var(--color-ink)}
svg.hub .elabel{font-size:11px;fill:var(--color-smoke)}
svg.hub .node rect{fill:var(--color-eggshell);stroke:var(--color-ash);stroke-width:1.5}
svg.hub .node.pipe rect{stroke:var(--color-ink)}
svg.hub .node.routine rect{stroke:var(--color-graphite);stroke-dasharray:5 4}
svg.hub .node.hub rect{fill:var(--color-ink);stroke:var(--color-ink)}
svg.hub .node.hub text{fill:var(--color-eggshell)}
svg.hub .nname{font-size:15px}
svg.hub .nsub{font-size:11px;fill:var(--color-smoke);font-family:var(--font-geist-mono)}
svg.hub .nrole{font-size:11.5px;fill:var(--color-graphite)}
svg.hub .node.hub .nsub,svg.hub .node.hub .nrole{fill:var(--color-eggshell)}
svg.hub .user rect{fill:var(--color-eggshell);stroke:var(--color-button-border)}
svg.hub .node a:hover rect{fill:var(--color-warm-taupe)} svg.hub .node.hub a:hover rect{fill:var(--color-graphite)}

/* 파이프라인 — 토프 칸 안에 에그셸 단계 카드 */
.pipeline{display:flex;gap:var(--spacing-8);align-items:stretch;overflow-x:auto;padding:var(--spacing-4) 0}
.phase{flex:1 1 0;min-width:190px;background:var(--color-warm-taupe);border-radius:var(--radius-cards);padding:var(--spacing-20);display:flex;flex-direction:column;gap:var(--spacing-8)}
.phase.after{background:transparent;border:1px dashed var(--color-stone)}
.ptitle{margin:0 0 var(--spacing-4);font-size:12px;line-height:1.6;letter-spacing:0.02em;color:var(--color-ash)}
.step{border-radius:var(--radius-lg);padding:var(--spacing-12) var(--spacing-16);background:var(--color-eggshell);box-shadow:var(--shadow-subtle)}
.step.isolated{background:var(--color-stone);box-shadow:none;border:1px dashed var(--color-graphite)}
.step.empty{color:var(--color-ash);font-size:var(--text-body-sm);box-shadow:none;background:transparent}
.step .who{font-size:var(--text-body);color:var(--color-ink)}
.step .lbl{display:inline-block;margin-top:2px;font-size:12px;background:transparent;padding:0;color:var(--color-smoke)}
.step .notes{display:flex;flex-wrap:wrap;gap:var(--spacing-4);margin-top:var(--spacing-8)}
.step .notes span{font-size:11.5px;line-height:1.6;color:var(--color-graphite);background:var(--color-eggshell);box-shadow:var(--shadow-subtle-2);padding:0 8px;border-radius:var(--radius-full)}
.step.isolated .notes span{background:var(--color-eggshell)}
.arrow{align-self:center;color:var(--color-ash);font-size:20px;flex:0 0 auto}

/* 워크트리 레인 — 에그셸 → 토프 → 스톤 순서로 깊어진다 */
.wt{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:var(--spacing-16)}
.lane{border-radius:var(--radius-cards);padding:var(--spacing-20) var(--spacing-24);background:var(--color-warm-taupe);display:flex;flex-direction:column;gap:var(--spacing-8)}
.lane.iso{background:var(--color-stone)}
.lt{margin:0 0 var(--spacing-4);font-size:var(--text-body-sm);letter-spacing:var(--tracking-body-sm);color:var(--color-ink)}
.lt code{background:var(--color-eggshell)}
.box{border-radius:var(--radius-lg);padding:var(--spacing-8) var(--spacing-12);background:var(--color-eggshell);box-shadow:var(--shadow-subtle-2);font-size:var(--text-body-sm);letter-spacing:var(--tracking-body-sm);color:var(--color-graphite)}
.box.dim{color:var(--color-smoke)}
ul.hooks{margin:var(--spacing-4) 0 0;padding-left:18px}

.foot{margin-top:var(--spacing-96);font-size:var(--text-body-sm);letter-spacing:var(--tracking-body-sm);color:var(--color-smoke);border-top:1px solid var(--color-stone);padding-top:var(--spacing-24);max-width:80ch}

@media (max-width:900px){.hero{grid-template-columns:1fr;align-items:start}.sphere{justify-self:start;width:80px;height:80px}}
@media (max-width:640px){
  main{padding:0 16px var(--spacing-64)}
  h1{font-size:var(--text-heading);letter-spacing:var(--tracking-heading)}
  h2{font-size:var(--text-heading-sm);letter-spacing:var(--tracking-heading-sm)}
  section{padding-top:var(--spacing-40);margin-top:var(--spacing-40)}
  .card{padding:var(--spacing-20) var(--spacing-24)}
}
</style>
</head>
<body>
<main>
<header class="hero">
  <div>
    <p class="eyebrow">docs/agents · 자동 생성</p>
    <h1>JAM! 에이전트 팀 지도</h1>
  </div>
  <div>
    <p class="lede">누가 어떤 콜사인으로 불리고, 누가 누구를 부르며, 어디서 도는가. 손으로 고치지 않는다.
    근거 파일을 고친 뒤 <code>node scripts/gen-team-map.mjs</code>를 실행한다. 산문과 사고 이력은 <code>docs/agents/team-operations.md</code>에 있다.</p>
    <div class="sources">${sources.map((s) => `<code>${esc(s)}</code>`).join('')}</div>
  </div>
  <div class="sphere" aria-hidden="true"></div>
</header>

<nav class="top">
  <a href="#team">팀</a><a href="#graph">호출 관계</a><a href="#pipeline">파이프라인</a><a href="#worktree">워크트리</a>
  <a href="#skills">스킬 콜사인</a><a href="#access">접근 범위</a><a href="#routines">예약 루틴</a>
</nav>

<section id="team">
<h2>1. 팀 — ${all.length}인</h2>
${legendHtml()}
<div class="cards">
${all.map((a) => agentCard(a, d)).join('\n')}
</div>
</section>

<section id="graph">
<h2>2. 호출 관계 — 모든 위임은 카리나를 거친다</h2>
<p class="sub">서브에이전트는 다른 서브에이전트를 부르는 도구가 없다. 실선은 카리나의 호출, 굵은 선은 쓰기 권한이 있는 대상, 점선은 예약 루틴에서 산출물이 넘어가는 순서다.</p>
${hubSvg(d)}
</section>

<section id="pipeline">
<h2>3. 표준 파이프라인 <code>/jam-work</code></h2>
<p class="sub">칸의 순서는 <code>.claude/workflows/jam-work.js</code>의 <code>meta.phases</code>, 칸 안의 호출은 같은 파일의 <code>agent()</code> 호출에서 읽었다.</p>
${pipelineHtml(d)}
<h3>경로 3단 분기</h3>
${table(d.routes)}
</section>

<section id="worktree">
<h2>4. 워크트리 · 브랜치 — 누가 어디서 도는가</h2>
<p class="sub">격리 대상은 <code>jam-work.js</code>의 <code>isolation: 'worktree'</code>, 차단 장치는 <code>.githooks/</code>에서 읽었다.</p>
${worktreeHtml(d)}
<h3>머지와 배포의 경계</h3>
${table(d.boundary)}
</section>

<section id="skills">
<h2>5. 스킬 콜사인 <code>/jam-*</code></h2>
<p class="sub">카리나(메인 세션)가 부른다. 「부르는 에이전트」는 각 <code>SKILL.md</code>가 이름으로 언급하는 서브에이전트다.</p>
${skillsHtml(d)}
</section>

<section id="access">
<h2>6. 접근 범위 — 각자 어디를 보는가</h2>
${table(d.access)}
</section>

<section id="routines">
<h2>7. 예약 자동화 루틴</h2>
<p class="sub">클라우드 예약 작업에서 돈다. 원문 스펙은 <code>.claude/skills/jam-work/references/scheduled-jobs.md</code>.</p>
${table(d.routines)}
</section>

<p class="foot">이 파일은 <code>scripts/gen-team-map.mjs</code>가 만든다. 낡으면 pre-commit·<code>verify.sh</code>·CI가 커밋을 막는다.
새 에이전트를 만들면 <code>.claude/agents/</code>에 정의를 두고 <code>docs/agents/contract.json</code>의 <code>agents</code>에 역할·관여를 등록한 뒤 생성기를 돌린다.</p>
</main>
</body>
</html>
`
}

// ── 진입점 ───────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const CHECK_ONLY = process.argv.includes('--check')
  const OPEN = process.argv.includes('--open')
  const out = path.join(REPO, OUTPUT)

  const data = collect(REPO)
  const missing = [['routes', '## 3.'], ['boundary', '### 머지와 배포의 경계'], ['access', '## 5.'], ['routines', '## 6.']]
    .filter(([k]) => !data[k]).map(([, h]) => h)
  if (missing.length > 0) {
    console.error(`gen-team-map: docs/agents/team-operations.md에서 표를 찾지 못했습니다: ${missing.join(', ')}`)
    console.error('  제목 아래 첫 표를 읽습니다. 제목을 바꿨다면 scripts/gen-team-map.mjs의 collect()도 함께 고치세요.')
    process.exit(2)
  }
  if (data.agents.length === 0) {
    console.error('gen-team-map: 에이전트 정의를 하나도 읽지 못했습니다 (.claude/agents/*.md, contract.json agents._order).')
    process.exit(2)
  }

  const html = renderHtml(data)
  const current = existsSync(out) ? readFileSync(out, 'utf8') : null

  if (CHECK_ONLY) {
    if (current === html) {
      console.log('team-map.html이 최신입니다.')
      process.exit(0)
    }
    console.error('')
    console.error('docs/agents/team-map.html이 실제 설정과 다릅니다.')
    console.error('  HTML을 손으로 고치지 말고 아래를 실행하세요:')
    console.error('')
    console.error('    node scripts/gen-team-map.mjs')
    console.error('')
    console.error('  (근거는 .claude/agents/*.md, contract.json, jam-work.js, SKILL.md, settings.json, .githooks/, team-operations.md의 표입니다.)')
    process.exit(1)
  }

  if (current === html) {
    console.log('team-map.html이 이미 최신입니다.')
  } else {
    writeFileSync(out, html)
    console.log('team-map.html을 갱신했습니다.')
  }
  if (OPEN) {
    const r = spawnSync('open', [out], { stdio: 'ignore' })
    if (r.status !== 0) console.error(`열지 못했습니다: ${out}`)
  }
}
