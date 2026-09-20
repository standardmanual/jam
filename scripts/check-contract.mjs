#!/usr/bin/env node
// check-contract — 문서가 환경에 대해 주장하는 사실을 실제 환경과 대조한다 (티켓 20260920_1907).
//
// 배경: 에이전트 정의(.claude/agents/*.md)와 스킬 문서는 프롬프트로 들어갈 뿐 실행되지 않는다.
// 그래서 "워크트리에 jam-doc이 링크로 있다" 같은 서술이 거짓이 되어도 어떤 검사에도 걸리지
// 않았다. 실제로 jam-developer.md 규칙 9와 jam-work/SKILL.md 227행이 정면으로 모순된 채
// 방치됐고, 같은 종류의 드리프트가 하루 조사에서 네 건 나왔다(티켓 20260920_1412·1907).
//
// 코드는 lint·typecheck·test·ds:check로 4중 검사를 받는데 문서는 링크와 frontmatter 형식만
// 검사받는다. 그런데 에이전트에게 정의 문서는 코드와 똑같은 구속력을 갖는다. 이 비대칭을
// 좁히는 것이 이 스크립트의 목적이다.
//
// 선언은 docs/agents/contract.json에 있다. 환경을 바꿨으면 그 파일도 같은 커밋에서 고친다.
//
// 사용법: node scripts/check-contract.mjs
//   종료 코드 0 = 통과, 1 = 어긋남 발견, 2 = 검사기 자체 오류

import { existsSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const CONTRACT = path.join(REPO, 'docs/agents/contract.json')

const violations = []
const notes = []

function violate(rule, message, fix) {
  violations.push({ rule, message, fix })
}

function readContract() {
  if (!existsSync(CONTRACT)) {
    console.error(`check-contract: 선언 파일이 없습니다: docs/agents/contract.json`)
    process.exit(2)
  }
  try {
    return JSON.parse(readFileSync(CONTRACT, 'utf8'))
  } catch (e) {
    console.error(`check-contract: 선언 파일이 올바른 JSON이 아닙니다 — ${e.message}`)
    process.exit(2)
  }
}

// ── ① 존재해야 할 경로 ────────────────────────────────────────────────────────
function checkPathsExist(c) {
  for (const p of c.paths_exist?.paths ?? []) {
    if (!existsSync(path.join(REPO, p))) {
      violate('paths_exist', `있어야 할 경로가 없습니다: ${p}`,
        `파일을 되살리거나, 의도한 삭제라면 contract.json의 paths_exist에서 이 줄을 지우고 이 경로를 가리키는 문서도 함께 고치세요.`)
    }
  }
}

// ── ② 없어야 할 경로 ──────────────────────────────────────────────────────────
function checkPathsAbsent(c) {
  for (const p of c.paths_absent?.paths ?? []) {
    if (existsSync(path.join(REPO, p))) {
      violate('paths_absent', `없어야 할 경로가 다시 생겼습니다: ${p}`,
        `${c.paths_absent._why ?? ''} 의도한 변경이라면 contract.json을 먼저 고치세요.`)
    }
  }
}

// ── ③ .gitignore가 jam-doc을 다시 무시하지 않는가 ─────────────────────────────
function checkGitignore(c) {
  const spec = c.gitignore_absent
  if (!spec) return
  const file = path.join(REPO, '.gitignore')
  if (!existsSync(file)) return
  const lines = readFileSync(file, 'utf8').split('\n').map((l) => l.trim())
  for (const pattern of spec.patterns ?? []) {
    if (lines.includes(pattern)) {
      violate('gitignore_absent', `.gitignore가 '${pattern}'을 무시하고 있습니다`,
        spec._why ?? '')
    }
  }
}

// ── ④ 에이전트 frontmatter의 도구·모델 ────────────────────────────────────────
function parseFrontmatter(file) {
  const src = readFileSync(file, 'utf8')
  if (!src.startsWith('---')) return null
  const end = src.indexOf('\n---', 3)
  if (end === -1) return null
  const body = src.slice(4, end)
  const out = {}
  for (const line of body.split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function checkAgents(c) {
  for (const [name, expected] of Object.entries(c.agents ?? {})) {
    if (name.startsWith('_')) continue
    const file = path.join(REPO, '.claude/agents', `${name}.md`)
    if (!existsSync(file)) {
      violate('agents', `에이전트 정의가 없습니다: .claude/agents/${name}.md`,
        `에이전트를 지웠다면 contract.json의 agents에서도 지우고, team-operations.md를 다시 생성하세요.`)
      continue
    }
    const fm = parseFrontmatter(file)
    if (!fm) {
      violate('agents', `${name}.md의 frontmatter를 읽지 못했습니다`, `--- 로 시작하는 YAML 머리말이 필요합니다.`)
      continue
    }

    const actualTools = (fm.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean)
    const want = expected.tools ?? []
    const missing = want.filter((t) => !actualTools.includes(t))
    const extra = actualTools.filter((t) => !want.includes(t))
    if (missing.length || extra.length) {
      violate('agents',
        `${name}의 도구 목록이 선언과 다릅니다 (없음: ${missing.join('·') || '-'} / 선언에 없는 것: ${extra.join('·') || '-'})`,
        `도구를 바꾼 것이 의도라면 contract.json을 고치고 node scripts/gen-team-doc.mjs 를 실행하세요.`)
    }

    if (expected.model && fm.model !== expected.model) {
      violate('agents', `${name}의 모델이 선언과 다릅니다 (선언 ${expected.model} · 실제 ${fm.model})`,
        `모델 변경이 의도라면 contract.json을 고치고 team-operations.md를 다시 생성하세요.`)
    }
  }
}

// ── ⑤ 쓰기 도구를 가진 에이전트가 선언과 일치하는가 ───────────────────────────
function checkWriteCapable(c) {
  const declared = new Set(c.write_capable_agents?.agents ?? [])
  const actual = new Set()
  for (const name of Object.keys(c.agents ?? {})) {
    if (name.startsWith('_')) continue
    const file = path.join(REPO, '.claude/agents', `${name}.md`)
    if (!existsSync(file)) continue
    const fm = parseFrontmatter(file)
    const tools = (fm?.tools ?? '').split(',').map((t) => t.trim())
    if (tools.includes('Write') || tools.includes('Edit')) actual.add(name)
  }
  for (const a of actual) {
    if (!declared.has(a)) {
      violate('write_capable_agents', `${a}가 쓰기 도구를 갖게 됐는데 선언에 없습니다`,
        `${c.write_capable_agents?._why ?? ''} 의도한 변경이면 contract.json에 추가하세요.`)
    }
  }
  for (const a of declared) {
    if (!actual.has(a)) {
      violate('write_capable_agents', `${a}가 쓰기 도구를 잃었는데 선언에 남아 있습니다`, `contract.json을 고치세요.`)
    }
  }
}

// ── ⑥ 워크트리 격리 대상 ──────────────────────────────────────────────────────
function checkWorktreeIsolation(c) {
  const wf = path.join(REPO, '.claude/workflows/jam-work.js')
  if (!existsSync(wf)) return
  const src = readFileSync(wf, 'utf8')
  // 주석이 아닌 실제 호출만 센다: agentType과 isolation이 같은 객체 리터럴에 있는 경우.
  const actual = new Set()
  const re = /agentType:\s*'([^']+)'[^}]*isolation:\s*'worktree'/g
  let m
  while ((m = re.exec(src)) !== null) actual.add(m[1])

  const declared = new Set(c.worktree_isolated_agents?.agents ?? [])
  for (const a of actual) {
    if (!declared.has(a)) {
      violate('worktree_isolated_agents', `${a}가 격리 워크트리에서 돌게 됐는데 선언에 없습니다`,
        `team-operations.md의 워크트리 절도 함께 고쳐야 합니다.`)
    }
  }
  for (const a of declared) {
    if (!actual.has(a)) {
      violate('worktree_isolated_agents', `${a}가 선언에는 격리 대상인데 jam-work.js에서 그렇지 않습니다`,
        `${c.worktree_isolated_agents?._why ?? ''}`)
    }
  }
}

// ── ⑦ 워크트리에 필요한 파일이 추적되는가 ─────────────────────────────────────
function checkWorktreeContains(c) {
  const paths = c.worktree_contains?.tracked_paths ?? []
  if (paths.length === 0) return
  let tracked
  try {
    tracked = new Set(
      execFileSync('git', ['ls-files', '--', ...paths], { cwd: REPO, encoding: 'utf8' })
        .split('\n').filter(Boolean)
    )
  } catch {
    notes.push('git ls-files를 실행하지 못해 워크트리 추적 검사를 건너뜁니다.')
    return
  }
  for (const p of paths) {
    if (!tracked.has(p)) {
      violate('worktree_contains', `${p}가 git에 추적되지 않아 격리 워크트리에 따라오지 않습니다`,
        `${c.worktree_contains._why ?? ''}`)
    }
  }
}

// ── ⑧ 훅 구성 ─────────────────────────────────────────────────────────────────
function checkHooks(c) {
  const spec = c.hooks
  if (!spec) return
  const file = path.join(REPO, '.claude/settings.json')
  if (!existsSync(file)) {
    notes.push('.claude/settings.json이 없어 훅 검사를 건너뜁니다.')
    return
  }
  let cfg
  try {
    cfg = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    violate('hooks', `.claude/settings.json이 올바른 JSON이 아닙니다 — ${e.message}`,
      `JSON이 깨지면 이 파일의 설정 전체가 조용히 무시됩니다.`)
    return
  }
  for (const [event, wanted] of Object.entries(spec)) {
    if (event.startsWith('_')) continue
    const groups = cfg.hooks?.[event] ?? []
    const commands = groups.flatMap((g) => (g.hooks ?? []).map((h) => h.command ?? ''))
    const joined = commands.join('\n')
    for (const w of wanted) {
      if (!joined.includes(w)) {
        violate('hooks', `${event} 훅에 ${w}가 없습니다`,
          `문서가 이 훅의 존재를 전제하고 있습니다. 훅을 추가하거나 contract.json과 문서를 함께 고치세요.`)
      }
    }
  }
}

// ── ⑨ 낡은 문구가 되살아나지 않았는가 ─────────────────────────────────────────
function listFiles(dir, acc = []) {
  const entries = execFileSync('git', ['ls-files', '--', dir], { cwd: REPO, encoding: 'utf8' })
    .split('\n').filter(Boolean)
  acc.push(...entries)
  return acc
}

function checkStalePhrases(c) {
  const spec = c.stale_phrases
  if (!spec) return
  const files = new Set()
  for (const scope of spec.scope ?? []) {
    try {
      for (const f of listFiles(scope)) files.add(f)
    } catch { /* 경로가 비어 있으면 건너뛴다 */ }
  }
  const excluded = (f) => (spec.exclude ?? []).some((e) => f.startsWith(e))

  for (const f of files) {
    if (excluded(f)) continue
    if (f === 'docs/agents/contract.json') continue   // 선언 파일 자신은 문구를 담고 있으므로 제외
    const abs = path.join(REPO, f)
    if (!existsSync(abs) || statSync(abs).isDirectory()) continue
    let src
    try {
      src = readFileSync(abs, 'utf8')
    } catch { continue }
    if (src.includes('\u0000')) continue  // 바이너리

    for (const { text, reason, allow_in } of spec.phrases ?? []) {
      // 낡은 문구를 '쓰지 말라'고 지시하는 문서는 그 문구를 인용할 수밖에 없다.
      // allow_in에 적힌 파일에서는 등장을 허용한다.
      if ((allow_in ?? []).some((a) => f === a || f.startsWith(a))) continue
      const idx = src.indexOf(text)
      if (idx === -1) continue
      const line = src.slice(0, idx).split('\n').length
      violate('stale_phrases', `${f}:${line} 낡은 문구 "${text}"`, reason)
    }
  }
}

// ── ⑩ 이 클론의 저장소 설정 ───────────────────────────────────────────────────
// 다른 검사는 추적되는 파일을 대조하지만 이 검사는 저장소 설정의 실효값을 읽는다. 값이 비면
// .githooks/pre-commit 자체가 돌지 않으므로 커밋 훅으로는 잡을 수 없다. 그 자리는 세션 시작
// 스크립트(scripts/ensure-hooks-path.sh)와 verify.sh가 맡는다 (티켓 20260921_0841).
function readGitConfig(key) {
  try {
    return execFileSync('git', ['config', '--get', key], {
      cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).replace(/\n$/, '')
  } catch (e) {
    if (e.status === 1) return null   // 종료 코드 1 = 설정 없음
    console.error(`check-contract: git config --get ${key} 를 실행하지 못했습니다 — ${e.message}`)
    process.exit(2)
  }
}

function checkGitConfig(c) {
  const spec = c.git_config
  if (!spec) return
  for (const [key, want] of Object.entries(spec.values ?? {})) {
    const actual = readGitConfig(key)
    if (actual === want) continue
    const fix = `git config ${key} ${want} 를 직접 실행하거나, 다음 Claude Code 세션이 시작될 때 scripts/ensure-hooks-path.sh가 자동으로 맞춥니다.`
    const hooks = key === 'core.hooksPath'
    if (actual === null || actual === '') {
      violate('git_config', `${key}가 비어 있습니다 (선언 ${want})`,
        `${hooks ? '이 클론에서는 pre-commit·pre-push가 돌지 않습니다. ' : ''}${fix}`)
    } else if (path.isAbsolute(actual)) {
      violate('git_config', `${key}가 절대경로입니다 (선언 ${want} · 실제 ${actual})`,
        `${hooks ? '워크트리에서 커밋해도 이 경로에 있는 훅이 실행됩니다. 메인 체크아웃의 훅을 고치는 작업은 자기 커밋에 적용되지 않습니다. ' : ''}${fix}`)
    } else {
      violate('git_config', `${key}가 선언과 다릅니다 (선언 ${want} · 실제 ${actual})`, fix)
    }
  }
}

// ── 실행 ──────────────────────────────────────────────────────────────────────
const contract = readContract()
checkPathsExist(contract)
checkPathsAbsent(contract)
checkGitignore(contract)
checkAgents(contract)
checkWriteCapable(contract)
checkWorktreeIsolation(contract)
checkWorktreeContains(contract)
checkHooks(contract)
checkStalePhrases(contract)
checkGitConfig(contract)

for (const n of notes) console.log(`참고: ${n}`)

if (violations.length === 0) {
  console.log('정합성 검사 통과 (docs/agents/contract.json 기준)')
  process.exit(0)
}

console.error('')
console.error(`정합성 검사 실패: 문서의 환경 서술과 실제가 ${violations.length}곳 어긋납니다.`)
console.error('')
const byRule = {}
for (const v of violations) (byRule[v.rule] ??= []).push(v)
for (const [rule, list] of Object.entries(byRule)) {
  console.error(`  [${rule}]`)
  for (const v of list) {
    console.error(`    - ${v.message}`)
    if (v.fix) console.error(`      → ${v.fix}`)
  }
}
console.error('')
console.error('  환경을 바꿨다면 docs/agents/contract.json을 같은 커밋에서 함께 고치세요.')
console.error('  그 파일을 고치지 않고 이 검사를 통과시킬 방법은 없습니다 — 그게 이 검사의 목적입니다.')
process.exit(1)
