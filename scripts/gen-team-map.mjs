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
const ORCH = { id: 'orchestrator', name: '카리나', role: '오케스트레이터 (메인 세션)', presence: '항상', model: '세션 설정', tools: ['전부'], canWrite: true, file: 'docs/agents/orchestrator.md' }

function table(t, cls = '') {
  if (!t) return '<p class="muted">(team-operations.md에서 표를 찾지 못했다)</p>'
  const th = t.header.map((h) => `<th>${mdInline(h)}</th>`).join('')
  const tr = t.rows.map((r) => `<tr>${r.map((c) => `<td>${mdInline(c)}</td>`).join('')}</tr>`).join('\n')
  return `<div class="tw"><table class="${cls}"><thead><tr>${th}</tr></thead><tbody>\n${tr}\n</tbody></table></div>`
}

function chip(text, cls = '') { return `<span class="chip ${cls}">${esc(text)}</span>` }

function agentCard(a, d) {
  const isPipeline = d.calls.some((c) => c.agentType === a.id)
  const isRoutine = d.routineAgents.includes(a.name)
  const isolated = d.worktreeIsolated.includes(a.id)
  const skills = d.skills.filter((s) => s.agents.includes(a.id)).map((s) => `/${s.name}`)
  const group = a.id === 'orchestrator' ? 'hub' : isPipeline ? 'pipe' : isRoutine ? 'routine' : 'call'
  return `
<article class="card ${group}" id="agent-${esc(a.id)}">
  <header>
    <div class="name">${esc(a.name)}</div>
    <code class="callsign">${a.id === 'orchestrator' ? '메인 세션' : esc(a.id)}</code>
  </header>
  <div class="role">${esc(a.role)}</div>
  <dl>
    <dt>모델</dt><dd>${esc(a.model)}</dd>
    <dt>도구</dt><dd>${a.tools.map((t) => chip(t, ['Write', 'Edit'].includes(t) ? 'warn' : '')).join(' ')}</dd>
    <dt>쓰기</dt><dd>${a.canWrite ? chip('있음', 'warn') : chip('없음')}</dd>
    <dt>관여</dt><dd>${esc(a.presence)}</dd>
    ${isolated ? `<dt>실행 위치</dt><dd>${chip('격리 워크트리', 'accent')}</dd>` : ''}
    ${skills.length ? `<dt>스킬</dt><dd>${skills.map((s) => `<code>${esc(s)}</code>`).join(' ')}</dd>` : ''}
  </dl>
  <footer><code>${esc(a.file)}</code></footer>
</article>`
}

// 허브형 호출 관계도 — 카리나를 가운데 두고 나머지 8인을 원 위에 놓는다. 서브에이전트끼리의
// 간선은 그리지 않는다(서로를 부를 도구가 없다). 예약 루틴의 "담당 A → B"만 점선으로 잇는다.
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
  const group = (a) => (d.calls.some((c) => c.agentType === a.id) ? 'pipe' : d.routineAgents.includes(a.name) ? 'routine' : 'call')

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
    <rect x="-72" y="-36" width="144" height="72" rx="12"/>
    <text class="nname" y="-13">${esc(name)}</text>
    <text class="nsub" y="5">${esc(sub)}</text>
    <text class="nrole" y="23">${esc(role)}</text>
  </a>
</g>`

  const nodes = d.agents.map((a) => {
    const p = pos[a.id]
    const sub = `${a.id}${d.worktreeIsolated.includes(a.id) ? ' · 격리' : ''}`
    return node(a.id, a.name, sub, a.role, p.x, p.y, group(a))
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
    return `<div class="phase"><div class="ptitle">${esc(ph)}</div>${items || '<div class="step empty">(호출 없음)</div>'}</div>`
  })
  const tail = `<div class="phase after"><div class="ptitle">승인 · 머지</div>
<div class="step"><div class="who"><a href="#agent-orchestrator">카리나</a></div><div class="notes"><span>결과 해석 · 승인 요청</span></div></div>
<div class="step"><div class="who">사용자</div><div class="notes"><span>머지 승인</span></div></div>
<div class="step"><div class="who">staging</div><div class="notes"><span>카리나가 머지·push</span></div></div>
</div>`
  return `<div class="pipeline">${cols.join('<div class="arrow">→</div>')}<div class="arrow">→</div>${tail}</div>`
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
    <div class="lt">메인 작업 폴더 <code>JAM!/</code> — <code>staging</code> 체크아웃</div>
    <div class="box">카리나(메인 세션)${others.length ? ` · 읽기만 하는 에이전트: ${esc(others.join('·'))}` : ''}</div>
    <div class="box dim">jam-web/node_modules 실체 · 시크릿 파일(.env.local 등)</div>
    <div class="box dim">세션 시작 훅: <ul class="hooks">${hooks}</ul></div>
  </div>
  <div class="lane iso">
    <div class="lt">격리 워크트리 <code>.claude/worktrees/wf_*</code> — ${esc(isolatedNames.join('·') || '(없음)')} 전용</div>
    ${d.firstCommand ? `<div class="box">첫 명령: <code>git fetch origin staging</code> → <code>git checkout --detach origin/staging</code> → <code>workspace-setup.sh link</code></div>` : ''}
    <div class="box">브랜치 <code>claude/jamwork-{ticket}-{slug}</code>에 커밋 → 리뷰 브랜치로만 push</div>
    <div class="box dim">jam-web/node_modules → 메인 폴더로 향하는 심볼릭 링크 · 시크릿 없음 · <code>jam-doc/</code>는 실제 폴더로 따라옴</div>
  </div>
  <div class="lane remote">
    <div class="lt">GitHub · Vercel</div>
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
:root{--bg:#f7f7f5;--fg:#1c1c1a;--muted:#6b6b66;--line:#dcdcd6;--card:#ffffff;--code:#efefea;
--hub:#1c1c1a;--pipe:#2f6fdc;--routine:#2a8f6a;--call:#8a63c9;--warn:#c7532b;--accent:#2f6fdc;
--pipe-bg:#e9f0fc;--routine-bg:#e6f4ee;--call-bg:#efe9f8;--iso-bg:#fff6ea;--iso:#c98a2a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#141413;--fg:#ececea;--muted:#a0a09a;--line:#33332f;--card:#1e1e1c;--code:#2a2a27;
--hub:#ececea;--pipe:#7aa6f5;--routine:#6fcf9f;--call:#b696ec;--warn:#f08a5f;--accent:#7aa6f5;
--pipe-bg:#1b2a44;--routine-bg:#183429;--call-bg:#2a2140;--iso-bg:#3a2d16;--iso:#e2ac52}}
:root[data-theme="dark"]{--bg:#141413;--fg:#ececea;--muted:#a0a09a;--line:#33332f;--card:#1e1e1c;--code:#2a2a27;
--hub:#ececea;--pipe:#7aa6f5;--routine:#6fcf9f;--call:#b696ec;--warn:#f08a5f;--accent:#7aa6f5;
--pipe-bg:#1b2a44;--routine-bg:#183429;--call-bg:#2a2140;--iso-bg:#3a2d16;--iso:#e2ac52}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,"Apple SD Gothic Neo",Pretendard,"Noto Sans KR",system-ui,sans-serif}
a{color:inherit}
code{font:0.88em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:1px 5px;border-radius:5px}
main{max-width:1180px;margin:0 auto;padding:0 16px 64px}
h1{font-size:26px;margin:28px 0 4px}
h2{font-size:20px;margin:48px 0 12px;padding-top:8px;border-top:1px solid var(--line)}
h3{font-size:16px;margin:24px 0 8px}
.sub{color:var(--muted);margin:0 0 10px}
.muted{color:var(--muted)}
nav.top{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 0;margin:0 -16px;padding-left:16px;padding-right:16px;display:flex;gap:6px;flex-wrap:wrap}
nav.top a{text-decoration:none;font-size:13px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:var(--card)}
.legend{display:flex;gap:10px;flex-wrap:wrap;font-size:13px;margin:8px 0 16px}
.legend span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;background:var(--c)}
.chip{display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;background:var(--code);margin:1px 0}
.chip.warn{background:var(--warn);color:#fff}
.chip.accent{background:var(--iso);color:#fff}
.sources{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 0}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--c,var(--line));border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.card.hub{--c:var(--hub)} .card.pipe{--c:var(--pipe)} .card.routine{--c:var(--routine)} .card.call{--c:var(--call)}
.card header{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.card .name{font-size:19px;font-weight:700}
.card .callsign{font-size:12px}
.card .role{font-weight:600}
.card dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:4px 0 0;font-size:13.5px}
.card dt{color:var(--muted)} .card dd{margin:0}
.card footer{margin-top:auto;font-size:12px;color:var(--muted)}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card)}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--code);font-weight:600}
svg.hub{width:100%;height:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}
svg.hub text{font:13px -apple-system,"Apple SD Gothic Neo",Pretendard,"Noto Sans KR",system-ui,sans-serif;fill:var(--fg);text-anchor:middle}
svg.hub .edge{stroke:var(--line);stroke-width:1.5;fill:none}
svg.hub .edge.write{stroke:var(--warn);stroke-width:3}
svg.hub .edge.routine{stroke:var(--routine);stroke-width:1.5;stroke-dasharray:5 4;marker-end:url(#arr)}
svg.hub .edge.user-edge{stroke:var(--fg);stroke-width:2;marker-end:url(#arr)}
svg.hub marker path{fill:var(--fg)}
svg.hub .elabel{font-size:11px;fill:var(--muted)}
svg.hub .node rect{fill:var(--card);stroke:var(--c);stroke-width:2}
svg.hub .node.hub rect{fill:var(--hub);stroke:var(--hub)}
svg.hub .node.hub text{fill:var(--bg)}
svg.hub .node.pipe{--c:var(--pipe)} svg.hub .node.routine{--c:var(--routine)} svg.hub .node.call{--c:var(--call)}
svg.hub .nname{font-weight:700;font-size:15px}
svg.hub .nsub{font-size:11px;fill:var(--muted)}
svg.hub .nrole{font-size:11.5px;fill:var(--fg)}
svg.hub .node.hub .nsub,svg.hub .node.hub .nrole{fill:var(--bg)}
svg.hub .user rect{fill:var(--code);stroke:var(--line)}
.pipeline{display:flex;gap:6px;align-items:stretch;overflow-x:auto;padding:4px 0}
.phase{flex:1 1 0;min-width:170px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}
.phase.after{background:transparent;border-style:dashed}
.ptitle{font-weight:700;font-size:13px;color:var(--muted);text-transform:none}
.step{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--bg)}
.step.isolated{border-color:var(--iso);background:var(--iso-bg)}
.step.empty{color:var(--muted);font-size:13px}
.step .who{font-weight:700;font-size:15px}
.step .who a{text-decoration:none}
.step .notes{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.step .notes span{font-size:11.5px;color:var(--muted);background:var(--code);padding:1px 7px;border-radius:999px}
.arrow{align-self:center;color:var(--muted);font-size:20px;flex:0 0 auto}
.wt{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
.lane{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--card);display:flex;flex-direction:column;gap:8px}
.lane.iso{background:var(--iso-bg);border-color:var(--iso)}
.lt{font-weight:700;font-size:14px}
.box{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--bg);font-size:13.5px}
.box.dim{color:var(--muted)}
ul.hooks{margin:4px 0 0;padding-left:18px}
.foot{margin-top:40px;font-size:13px;color:var(--muted);border-top:1px solid var(--line);padding-top:12px}
@media (max-width:640px){h1{font-size:22px}.card .name{font-size:17px}}
</style>
</head>
<body>
<main>
<h1>JAM! 에이전트 팀 지도</h1>
<p class="sub">누가 어떤 콜사인으로 불리고, 누가 누구를 부르며, 어디서 도는가. <strong>자동 생성</strong> — 손으로 고치지 않는다.
근거 파일을 고친 뒤 <code>node scripts/gen-team-map.mjs</code>를 실행한다. 산문과 사고 이력은 <code>docs/agents/team-operations.md</code>에 있다.</p>
<div class="sources">${sources.map((s) => `<code>${esc(s)}</code>`).join('')}</div>

<nav class="top">
  <a href="#team">팀</a><a href="#graph">호출 관계</a><a href="#pipeline">파이프라인</a><a href="#worktree">워크트리</a>
  <a href="#skills">스킬 콜사인</a><a href="#access">접근 범위</a><a href="#routines">예약 루틴</a>
</nav>

<h2 id="team">1. 팀 — ${all.length}인</h2>
<div class="legend">
  <span style="--c:var(--hub)">오케스트레이터</span>
  <span style="--c:var(--pipe)">표준 파이프라인(<code>/jam-work</code>)에서 호출</span>
  <span style="--c:var(--routine)">예약 루틴 담당</span>
  <span style="--c:var(--call)">필요할 때 호출</span>
  <span style="--c:var(--warn)">쓰기 권한</span>
  <span style="--c:var(--iso)">격리 워크트리</span>
</div>
<div class="cards">
${all.map((a) => agentCard(a, d)).join('\n')}
</div>

<h2 id="graph">2. 호출 관계 — 모든 위임은 카리나를 거친다</h2>
<p class="sub">서브에이전트는 다른 서브에이전트를 부르는 도구가 없다. 실선은 카리나의 호출, 굵은 선은 쓰기 권한이 있는 대상, 점선은 예약 루틴에서 산출물이 넘어가는 순서다.</p>
${hubSvg(d)}

<h2 id="pipeline">3. 표준 파이프라인 <code>/jam-work</code></h2>
<p class="sub">칸의 순서는 <code>.claude/workflows/jam-work.js</code>의 <code>meta.phases</code>, 칸 안의 호출은 같은 파일의 <code>agent()</code> 호출에서 읽었다.</p>
${pipelineHtml(d)}
<h3>경로 3단 분기</h3>
${table(d.routes)}

<h2 id="worktree">4. 워크트리 · 브랜치 — 누가 어디서 도는가</h2>
<p class="sub">격리 대상은 <code>jam-work.js</code>의 <code>isolation: 'worktree'</code>, 차단 장치는 <code>.githooks/</code>에서 읽었다.</p>
${worktreeHtml(d)}
<h3>머지와 배포의 경계</h3>
${table(d.boundary)}

<h2 id="skills">5. 스킬 콜사인 <code>/jam-*</code></h2>
<p class="sub">카리나(메인 세션)가 부른다. 「부르는 에이전트」는 각 <code>SKILL.md</code>가 이름으로 언급하는 서브에이전트다.</p>
${skillsHtml(d)}

<h2 id="access">6. 접근 범위 — 각자 어디를 보는가</h2>
${table(d.access)}

<h2 id="routines">7. 예약 자동화 루틴</h2>
<p class="sub">클라우드 예약 작업에서 돈다. 원문 스펙은 <code>.claude/skills/jam-work/references/scheduled-jobs.md</code>.</p>
${table(d.routines)}

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
