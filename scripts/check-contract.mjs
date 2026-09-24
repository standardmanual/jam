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
import { homedir } from 'node:os'
import path from 'node:path'
import { checkWrapperSource, moduleSpecifierFor, WRAPPER_AUTH_CALLS } from './deploy-gate-wrapper.mjs'

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const CONTRACT = path.join(REPO, 'docs/agents/contract.json')

const violations = []
const notes = []
const warnings = []   // 통과는 시키되 사람이 보게 하는 경고

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

// ── ⑩ 품질 기준(quality_bar) ──────────────────────────────────────────────────
// package.json의 --max-warnings 값과 .githooks/pre-push가 실제로 막는 패턴이 선언(quality_bar)과
// 일치하는가 (티켓 20260921_2304). 훅 쪽은 셸 스크립트의 정규식 이스케이프(예: it\.skip\() 때문에
// 백슬래시를 지운 뒤 비교한다 — 선언은 백슬래시 없는 사람이 읽는 형태(it.skip()로 적는다.
function checkQualityBar(c) {
  const spec = c.quality_bar
  if (!spec) return

  const pkgPath = path.join(REPO, 'jam-web/package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      const lintCi = pkg.scripts?.['lint:ci'] ?? ''
      const m = lintCi.match(/--max-warnings\s+(\d+)/)
      if (!m) {
        violate('quality_bar', `jam-web/package.json의 lint:ci에 --max-warnings 값이 없습니다`,
          `선언값(${spec.lint_max_warnings})을 lint:ci 스크립트에 추가하세요.`)
      } else if (Number(m[1]) !== spec.lint_max_warnings) {
        violate('quality_bar', `jam-web/package.json의 --max-warnings가 선언과 다릅니다 (선언 ${spec.lint_max_warnings} · 실제 ${m[1]})`,
          `둘 중 의도한 값으로 맞추세요. 낮추는 방향이 아니라면 이유를 커밋 메시지에 남기세요.`)
      }
    } catch (e) {
      violate('quality_bar', `jam-web/package.json을 읽지 못했습니다 — ${e.message}`, `JSON 형식을 확인하세요.`)
    }
  }

  const hookPath = path.join(REPO, '.githooks/pre-push')
  if (existsSync(hookPath)) {
    const hookFlat = readFileSync(hookPath, 'utf8').replace(/\\/g, '')
    for (const pattern of spec.guard_patterns ?? []) {
      if (!hookFlat.includes(pattern)) {
        violate('quality_bar', `.githooks/pre-push에 선언된 기준 방어 패턴이 없습니다: ${pattern}`,
          `패턴을 훅에 추가하거나, 더 이상 막지 않는 것이 의도라면 contract.json의 guard_patterns에서 지우세요.`)
      }
    }
  }
}

// ── ⑪ 이 클론의 저장소 설정 ───────────────────────────────────────────────────
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

// core.hooksPath처럼 값이 경로인 키의 정상 판정 (scripts/ensure-hooks-path.sh 의
// resolves_to_repo_hooks 와 같은 규칙이다). 값이 비어 있지 않고, 존재하는 디렉터리이며, 현재
// 워크트리 루트 또는 메인 체크아웃 루트(git 공용 디렉터리의 상위)의 선언 경로(want)와 같은 곳이면
// 참이다. 상대경로는 현재 워크트리 루트 기준으로 풀고 절대경로는 그대로 쓴다. 상대·절대 형식은
// 따지지 않는다. git이 경로형 설정으로 읽어 펼치는 `~`·`~/...`는 홈 디렉터리 기준으로 펼쳐서 같은
// 규칙을 적용한다(티켓 20260921_0923, `~사용자` 형식은 다루지 않는다).
// "같은 곳"은 경로 문자열이 아니라 디바이스·아이노드로 가린다. 한글 폴더명이 든 경로는 설정에는
// NFC로, git이 알려주는 경로는 NFD로 적혀 문자열로는 같은 폴더를 다르다고 판정한다.
function sameDir(a, b) {
  try {
    const x = statSync(a, { bigint: true })
    const y = statSync(b, { bigint: true })
    return x.dev === y.dev && x.ino === y.ino
  } catch {
    return false
  }
}

function resolvesToRepoDir(value, want) {
  if (!value) return false
  const expanded = value === '~' ? homedir() : value.startsWith('~/') ? path.join(homedir(), value.slice(2)) : value
  const dir = path.isAbsolute(expanded) ? expanded : path.join(REPO, expanded)
  try {
    if (!statSync(dir).isDirectory()) return false
  } catch {
    return false
  }
  const roots = [REPO]
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (common) roots.push(path.dirname(path.resolve(REPO, common)))
  } catch { /* 공용 디렉터리를 못 구하면 현재 워크트리만 기준으로 본다 */ }
  return roots.some((root) => sameDir(dir, path.join(root, want)))
}

function checkGitConfig(c) {
  const spec = c.git_config
  if (!spec) return
  for (const [key, want] of Object.entries(spec.values ?? {})) {
    const actual = readGitConfig(key)
    const hooks = key === 'core.hooksPath'
    if (hooks ? resolvesToRepoDir(actual, want) : actual === want) continue
    const fix = `git config ${key} ${want} 를 직접 실행하거나, 다음 Claude Code 세션이 시작될 때 scripts/ensure-hooks-path.sh가 자동으로 맞춥니다.`
    if (actual === null || actual === '') {
      violate('git_config', `${key}가 비어 있습니다 (선언 ${want})`,
        `${hooks ? '이 클론에서는 pre-commit·pre-push가 돌지 않습니다. ' : ''}${fix}`)
    } else if (hooks && path.isAbsolute(actual)) {
      violate('git_config', `${key}가 이 저장소의 ${want}가 아닌 절대경로입니다 (선언 ${want} · 실제 ${actual})`,
        `다른 곳(또는 폴더를 옮기기 전 옛 위치)을 가리켜 이 저장소의 훅은 돌지 않습니다. ${fix}`)
    } else {
      violate('git_config', `${key}가 선언과 다릅니다 (선언 ${want} · 실제 ${actual})`, fix)
    }
  }
}

// ── ⑫ 배포 게이트 선언 ────────────────────────────────────────────────────────
// scripts/deploy-gate.mjs가 읽는 선언(deploy_gate)과 실제의 대조 (티켓 20260922_0001). 스크립트와
// 선언은 한 쌍이다. 선언이 없으면 게이트가 실행 오류로 끝나 배포가 막히고, 스크립트가 없으면
// 선언이 아무도 읽지 않는 낡은 값이 된다. public_routes의 각 항목에는 실제 route.ts가 있어야 한다
// (라우트를 지웠는데 목록에 남으면 같은 이름의 새 라우트가 인증 확인 없이 통과한다).
function checkDeployGate(c) {
  const script = 'scripts/deploy-gate.mjs'
  const scriptExists = existsSync(path.join(REPO, script))
  const spec = c.deploy_gate
  if (!spec) {
    if (scriptExists) {
      violate('deploy_gate', `${script}가 있는데 contract.json에 deploy_gate 선언이 없습니다`,
        `스크립트는 이 선언(rollback_sql_required_from·public_routes)을 읽고, 없으면 실행 오류로 끝나 배포를 막습니다.`)
    }
    return
  }
  if (!scriptExists) {
    violate('deploy_gate', `deploy_gate가 선언돼 있는데 ${script}가 없습니다`,
      `스크립트를 되살리거나, 게이트를 없애는 것이 의도라면 선언과 이 게이트를 가리키는 문서(/jam-ship·scheduled-jobs.md)를 함께 고치세요.`)
  }
  if (!Number.isInteger(spec.rollback_sql_required_from) || spec.rollback_sql_required_from < 1) {
    violate('deploy_gate', `deploy_gate.rollback_sql_required_from이 1 이상의 정수가 아닙니다 (실제 ${JSON.stringify(spec.rollback_sql_required_from)})`,
      `되돌림 SQL을 요구하기 시작하는 마이그레이션 번호를 정수로 적으세요.`)
  }
  if (!Array.isArray(spec.public_routes) || spec.public_routes.some((r) => typeof r !== 'string')) {
    violate('deploy_gate', `deploy_gate.public_routes가 문자열 배열이 아닙니다`,
      `jam-web/src/app/api/ 아래 경로를 문자열로 나열하세요(예: "strava/callback").`)
    return
  }
  for (const route of spec.public_routes) {
    const rel = path.join('jam-web/src/app/api', route.replace(/^\/+|\/+$/g, ''), 'route.ts')
    if (!existsSync(path.join(REPO, rel))) {
      violate('deploy_gate', `public_routes의 "${route}"에 해당하는 라우트가 없습니다 (${rel})`,
        `라우트를 지웠거나 이름을 바꿨다면 이 항목도 지우거나 고치세요. 남겨 두면 같은 경로에 새로 생기는 라우트가 인증 확인 없이 통과합니다.`)
    }
  }
  checkAuthWrappers(spec.auth_wrappers)
}

// auth_wrappers(티켓 20260924_1555): 라우트가 인증을 맡기는 공용 함수의 선언. 게이트가 배포 때 head에서 하는
// 무결성 검증(파일 존재·함수 내보내기·인증 호출)을 커밋마다 미리 한다. 판정 코드는 deploy-gate-wrapper.mjs
// 한 곳이라 게이트와 이 검사가 갈라지지 않는다.
function checkAuthWrappers(wrappers) {
  if (wrappers === undefined) return
  const shapeFix = `{ "file": "jam-web/src/ 아래 .ts 경로", "call": "내보내는 함수 이름" } 객체의 배열로 적으세요.`
  if (!Array.isArray(wrappers)) {
    violate('deploy_gate', `deploy_gate.auth_wrappers가 배열이 아닙니다`, shapeFix)
    return
  }
  for (const w of wrappers) {
    const okShape =
      w && typeof w === 'object' && typeof w.file === 'string' && moduleSpecifierFor(w.file) !== null &&
      typeof w.call === 'string' && /^[A-Za-z_$][\w$]*$/.test(w.call)
    if (!okShape) {
      violate('deploy_gate', `auth_wrappers 항목의 모양이 잘못됐습니다 (${JSON.stringify(w)})`, shapeFix)
      continue
    }
    const abs = path.join(REPO, w.file)
    if (!existsSync(abs)) {
      violate('deploy_gate', `auth_wrappers의 래퍼 파일이 없습니다 (${w.file})`,
        `파일을 지웠거나 옮겼다면 이 선언도 고치세요. 게이트는 래퍼가 없으면 그 래퍼를 쓰는 라우트를 모두 차단합니다.`)
      continue
    }
    for (const problem of checkWrapperSource(readFileSync(abs, 'utf8'), w.call)) {
      if (problem === 'no_export') {
        violate('deploy_gate', `${w.file}가 선언된 함수 ${w.call}를 내보내지 않습니다`,
          `함수 이름을 바꿨다면 auth_wrappers의 call도 고치세요.`)
      } else {
        violate('deploy_gate', `${w.file}에 auth 모듈의 인증 함수(${WRAPPER_AUTH_CALLS.join('·')}) 호출이 없습니다`,
          `래퍼가 인증을 하지 않으면 그것을 쓰는 라우트가 인증 없이 열립니다. 래퍼에 인증을 되살리세요.`)
      }
    }
  }
}

// ── ⑬ 무인 루틴 커밋 경로 제한(routine_commit_restriction) ───────────────────────
// .githooks/pre-commit이 예약 루틴 작성자의 커밋을 리포트 폴더 안으로 제한하는 근거
// (티켓 20260921_2306). 선언된 이메일·허용 경로 문자열이 실제 훅 안에 있는지만 본다 —
// quality_bar의 guard_patterns와 같은 방식으로 문자열 존재만 대조한다.
function checkRoutineCommitRestriction(c) {
  const spec = c.routine_commit_restriction
  if (!spec) return

  const hookPath = path.join(REPO, '.githooks/pre-commit')
  if (!existsSync(hookPath)) {
    violate('routine_commit_restriction', `routine_commit_restriction이 선언돼 있는데 .githooks/pre-commit이 없습니다`,
      `훅 파일을 되살리거나 선언을 지우세요.`)
    return
  }
  const hook = readFileSync(hookPath, 'utf8')
  if (!spec.author_email || !hook.includes(spec.author_email)) {
    violate('routine_commit_restriction', `.githooks/pre-commit에 선언된 작성자 이메일이 없습니다: ${spec.author_email}`,
      `훅에 이 이메일 검사를 추가하거나, 실제 예약 작업 커밋 작성자가 바뀌었다면 contract.json도 함께 고치세요.`)
  }
  if (!spec.allowed_prefix || !hook.includes(spec.allowed_prefix)) {
    violate('routine_commit_restriction', `.githooks/pre-commit에 선언된 허용 경로가 없습니다: ${spec.allowed_prefix}`,
      `훅에 이 경로 제한을 추가하거나, 경로가 바뀌었다면 contract.json도 함께 고치세요.`)
  }
}

// ── ⑭ 설계 원본 폴더 동결(workflow_freeze) ────────────────────────────────────
// docs/agents/workflow/ 는 2026-09-22 동결된 기록이다(티켓 20260921_2311). 이 동결이
// .githooks/pre-commit에 실제로 걸려 있는지만 본다 — routine_commit_restriction과 같은
// 방식으로 선언된 문자열이 훅 안에 있는지 대조한다.
function checkWorkflowFreeze(c) {
  const spec = c.workflow_freeze
  if (!spec) return

  const hookPath = path.join(REPO, '.githooks/pre-commit')
  if (!existsSync(hookPath)) {
    violate('workflow_freeze', `workflow_freeze가 선언돼 있는데 .githooks/pre-commit이 없습니다`,
      `훅 파일을 되살리거나 선언을 지우세요.`)
    return
  }
  const hook = readFileSync(hookPath, 'utf8')
  if (!spec.frozen_prefix || !hook.includes(spec.frozen_prefix)) {
    violate('workflow_freeze', `.githooks/pre-commit에 선언된 동결 대상 경로가 없습니다: ${spec.frozen_prefix}`,
      `훅에 이 경로 동결 검사를 추가하거나, 경로가 바뀌었다면 contract.json도 함께 고치세요.`)
  }
  if (!spec.exempt_file || !hook.includes(spec.exempt_file)) {
    violate('workflow_freeze', `.githooks/pre-commit에 선언된 예외 파일이 없습니다: ${spec.exempt_file}`,
      `훅에 이 예외 파일 처리를 추가하거나, 예외 파일이 바뀌었다면 contract.json도 함께 고치세요.`)
  }
}

// ── ⑮ 메인 세션 자동 허용 목록(settings_permissions) ──────────────────────────
// 프로덕션 DB 쓰기 도구가 자동 허용이라는 사실을 문서(orchestrator.md 4절)가 전제한다
// (티켓 20260924_0625). 선언한 도구가 permissions.allow에 실제로 있는지만 본다.
function checkSettingsPermissions(c) {
  const spec = c.settings_permissions
  if (!spec) return
  const file = path.join(REPO, '.claude/settings.json')
  if (!existsSync(file)) {
    notes.push('.claude/settings.json이 없어 자동 허용 검사를 건너뜁니다.')
    return
  }
  let cfg
  try {
    cfg = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return   // JSON 오류는 checkHooks가 이미 보고한다
  }
  const allow = cfg.permissions?.allow ?? []
  for (const tool of spec.allow_contains ?? []) {
    if (!allow.includes(tool)) {
      violate('settings_permissions', `.claude/settings.json의 permissions.allow에 ${tool}가 없습니다`,
        `자동 허용을 뺐다면 orchestrator.md 4절의 서술과 contract.json을 함께 고치세요. 빼려던 것이 아니라면 다시 추가하세요.`)
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
checkQualityBar(contract)
checkGitConfig(contract)
checkDeployGate(contract)
checkRoutineCommitRestriction(contract)
checkWorkflowFreeze(contract)
checkSettingsPermissions(contract)

for (const n of notes) console.log(`참고: ${n}`)
for (const w of warnings) console.log(`경고: ${w}`)

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
