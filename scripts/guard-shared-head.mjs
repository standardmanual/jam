#!/usr/bin/env node
// guard-shared-head — 공유 작업 폴더(메인 워크트리)의 HEAD·브랜치·작업 트리를 바꾸는 git 명령을 막는다
// (티켓 20261002_1905, 같은 위험의 첫 사고 20260926_0121).
//
// 민지(jam-reviewer)·채원(jam-designer) 정의의 frontmatter `hooks.PreToolUse`(matcher `Bash`)에
// 걸려 그 서브에이전트가 도는 동안에만 적용된다. 메인 세션(카리나)의 명령은 막지 않는다.
//
// 판정 조건 (모두 만족하면 막는다):
//   1. 명령에 HEAD·작업 트리를 바꾸는 git 하위 명령(BLOCKED_SUBCOMMANDS)이 있고
//   2. cwd가 메인 워크트리(`--git-dir`과 `--git-common-dir`이 같음)이며
//   3. 그 명령이 `.claude/worktrees/` 아래 경로로 옮겨 실행되지 않는다
//      (`cd <경로>`나 `git -C <경로>`가 그 아래가 아님).
//
// 막는 방식: 종료 코드 0 + `hookSpecificOutput.permissionDecision: "deny"` JSON(사유는 모델이 본다).
// 입력을 읽지 못하거나 git 판정이 실패하면 막지 않고 stderr에만 남긴다 — 판정 실패로 읽기
// 명령까지 막히는 일을 피한다(2026-10-02 두 번째 발생 때 거부 뒤 읽기까지 막혔다).
//
// 사용법: 훅 입력(stdin JSON)을 받는다. node "$CLAUDE_PROJECT_DIR/scripts/guard-shared-head.mjs"

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const BLOCKED_SUBCOMMANDS = new Set([
  'checkout', 'switch', 'reset', 'rebase', 'merge', 'pull', 'cherry-pick', 'revert',
  'stash', 'restore', 'clean', 'commit', 'am',
])

const UNKNOWN_DIR = '?'                       // cd 대상을 정적으로 알 수 없을 때
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash'])
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', '}', 'time'])
const WRAPPERS = new Set(['command', 'builtin', 'exec', 'env', 'nohup', 'sudo'])
// 값을 다음 인자로 받는 git 전역 옵션(`-C`는 따로 다룬다).
const GIT_OPTIONS_WITH_VALUE = new Set(['-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix'])
const MAX_DEPTH = 5

// ── 셸 명령 분해 ──────────────────────────────────────────────────────────────

// `(`가 열린 자리(open)에서 짝이 맞는 `)`의 위치를 돌려준다. 없으면 문자열 끝.
function matchParen(src, open) {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && --depth === 0) return i
  }
  return src.length
}

// 명령 문자열을 구분자(&& || ; | & 줄바꿈 괄호)로 나눈 단어 목록(segments)과,
// 명령 치환($(…)·`…`) 안의 문자열(nested)로 분해한다. 따옴표·주석·heredoc 본문은 명령으로 보지 않는다.
export function scan(src) {
  const segments = []
  const nested = []
  const heredocs = []
  let words = []
  let word = null                              // null = 단어 아님, '' = 빈 따옴표 단어

  const pushWord = () => { if (word !== null) { words.push(word); word = null } }
  const pushSegment = () => { pushWord(); if (words.length) segments.push(words); words = [] }

  let i = 0
  while (i < src.length) {
    const c = src[i]

    if (c === "'") {
      const close = src.indexOf("'", i + 1)
      const end = close === -1 ? src.length : close
      word = (word ?? '') + src.slice(i + 1, end)
      i = end + 1
      continue
    }

    if (c === '"') {
      let j = i + 1
      let buf = ''
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) { buf += src[j + 1]; j += 2; continue }
        if (src[j] === '$' && src[j + 1] === '(') {
          const end = matchParen(src, j + 1)
          nested.push(src.slice(j + 2, end))
          buf += src.slice(j, end + 1)
          j = end + 1
          continue
        }
        if (src[j] === '`') {
          const end = src.indexOf('`', j + 1)
          const stop = end === -1 ? src.length : end
          nested.push(src.slice(j + 1, stop))
          buf += src.slice(j, stop + 1)
          j = stop + 1
          continue
        }
        buf += src[j]
        j++
      }
      word = (word ?? '') + buf
      i = j + 1
      continue
    }

    if (c === '$' && src[i + 1] === '(') {
      const end = matchParen(src, i + 1)
      nested.push(src.slice(i + 2, end))
      word = (word ?? '') + src.slice(i, end + 1)
      i = end + 1
      continue
    }

    if (c === '`') {
      const end = src.indexOf('`', i + 1)
      const stop = end === -1 ? src.length : end
      nested.push(src.slice(i + 1, stop))
      word = (word ?? '') + src.slice(i, stop + 1)
      i = stop + 1
      continue
    }

    if (c === '\\') {
      if (src[i + 1] === '\n') { i += 2; continue }          // 줄 잇기
      if (i + 1 < src.length) word = (word ?? '') + src[i + 1]
      i += 2
      continue
    }

    if (c === '#' && word === null) {                         // 주석
      const nl = src.indexOf('\n', i)
      i = nl === -1 ? src.length : nl
      continue
    }

    if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
      const m = src.slice(i + 2).match(/^-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/)
      if (m) {
        heredocs.push(m[2])
        i += 2 + m[0].length
        continue
      }
    }

    if (c === '\n') {
      pushSegment()
      i++
      while (heredocs.length) {                               // heredoc 본문은 건너뛴다
        const delim = heredocs.shift()
        while (i < src.length) {
          const nl = src.indexOf('\n', i)
          const line = src.slice(i, nl === -1 ? src.length : nl)
          i = nl === -1 ? src.length : nl + 1
          if (line.trim() === delim) break
        }
      }
      continue
    }

    if (c === ';' || c === '|' || c === '&' || c === '(' || c === ')') {
      pushSegment()
      i++
      continue
    }

    if (c === ' ' || c === '\t' || c === '\r') {
      pushWord()
      i++
      continue
    }

    word = (word ?? '') + c
    i++
  }
  pushSegment()
  return { segments, nested }
}

// 접두 키워드·환경변수 대입·래퍼(`env`, `command` …)를 건너뛴 실제 명령 단어의 위치. 없으면 -1.
function commandIndex(words) {
  let afterWrapper = false
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (KEYWORDS.has(w)) continue
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) continue
    if (WRAPPERS.has(w)) { afterWrapper = true; continue }
    if (afterWrapper && w.startsWith('-')) continue
    return i
  }
  return -1
}

// ── 경로 판정 ─────────────────────────────────────────────────────────────────

// 경로가 `.claude/worktrees/<이름>` 아래인가.
export function isUnderWorktrees(dir) {
  return typeof dir === 'string' && /(^|\/)\.claude\/worktrees\/[^/]/.test(dir)
}

// `cd`·`git -C`의 대상을 현재 폴더(dir) 기준 경로로 푼다. 변수·`~`·`-`처럼 정적으로 알 수 없으면
// UNKNOWN_DIR — 다만 `.claude/worktrees/<이름>`이 글자 그대로 들어 있으면 그 아래로 본다.
function resolveTarget(dir, target) {
  if (!target) return UNKNOWN_DIR
  if (target === '-' || target.startsWith('~') || target.includes('$')) {
    const at = target.indexOf('.claude/worktrees/')
    return at !== -1 && /^\.claude\/worktrees\/[^/]/.test(target.slice(at)) ? `/${target.slice(at)}` : UNKNOWN_DIR
  }
  if (path.isAbsolute(target)) return path.resolve(target)
  return dir === UNKNOWN_DIR ? UNKNOWN_DIR : path.resolve(dir, target)
}

// ── git 하위 명령 판정 ────────────────────────────────────────────────────────

// `git` 뒤의 인자에서 전역 옵션을 건너뛰고 하위 명령과, `-C`를 반영한 실행 폴더를 돌려준다.
function parseGit(args, dir) {
  let cur = dir
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-C') { cur = resolveTarget(cur, args[i + 1]); i++; continue }
    if (GIT_OPTIONS_WITH_VALUE.has(a)) { i++; continue }
    if (a.startsWith('-')) continue
    return { subcommand: a, rest: args.slice(i + 1), dir: cur }
  }
  return null
}

function isBlockedGit({ subcommand, rest }) {
  if (!BLOCKED_SUBCOMMANDS.has(subcommand)) return false
  if (subcommand === 'stash') {
    const sub = rest.find((a) => !a.startsWith('-'))
    if (sub === 'list' || sub === 'show') return false      // 읽기 전용
  }
  return true
}

// 명령 문자열에서 "공유 폴더를 옮기는 git 하위 명령"을 찾아 이름 목록을 돌려준다.
// cwd는 메인 워크트리라고 가정한다(그 판정은 호출부). `.claude/worktrees/` 아래로 옮겨 실행되는
// 명령은 제외한다.
export function findViolations(command, cwd, depth = 0) {
  const found = []
  if (typeof command !== 'string' || depth > MAX_DEPTH) return found
  const { segments, nested } = scan(command)
  let dir = path.resolve(cwd)

  for (const words of segments) {
    const idx = commandIndex(words)
    if (idx === -1) continue
    const name = path.basename(words[idx])
    const args = words.slice(idx + 1)

    if (name === 'cd' || name === 'pushd') {
      dir = resolveTarget(dir, args.find((a) => !a.startsWith('-')))
    } else if (name === 'git') {
      const g = parseGit(args, dir)
      if (g && isBlockedGit(g) && !isUnderWorktrees(g.dir)) found.push(g.subcommand)
    } else if (SHELLS.has(name)) {
      const c = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a))
      if (c !== -1 && args[c + 1] !== undefined) found.push(...findViolations(args[c + 1], dir, depth + 1))
    } else if (name === 'eval') {
      found.push(...findViolations(args.join(' '), dir, depth + 1))
    }
  }
  for (const inner of nested) found.push(...findViolations(inner, cwd, depth + 1))
  return found
}

// cwd가 메인 워크트리인가. true/false, 판정할 수 없으면 null.
export function isMainWorktree(cwd) {
  try {
    const git = (flag) => execFileSync('git', ['rev-parse', '--path-format=absolute', flag], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    return path.resolve(cwd, git('--git-dir')) === path.resolve(cwd, git('--git-common-dir'))
  } catch (e) {
    console.error(`guard-shared-head: 메인 워크트리 판정 실패 (${cwd}) — ${String(e.message).split('\n')[0]}`)
    return null
  }
}

export function denyReason(subcommands) {
  const names = [...new Set(subcommands)].map((s) => `git ${s}`).join('·')
  return (
    `공유 작업 폴더에서 ${names}(으)로 HEAD·브랜치·작업 트리를 옮길 수 없다. 이 폴더는 카리나와 병렬 세션이 ` +
    `함께 쓰므로 브랜치가 옮겨지면 다음 커밋이 도달 불가가 되거나 push가 조용히 무효가 된다. ` +
    `특정 커밋을 재현하거나 그 시점의 코드를 실행해야 하면 ` +
    `\`git worktree add --detach .claude/worktrees/gate-<짧은-sha> <sha>\`로 별도 폴더를 만들고 ` +
    `\`cd .claude/worktrees/gate-<짧은-sha>\` 안에서 실행한 뒤 \`git worktree remove\`로 지워라. ` +
    `git show·diff·log·cat-file·status·fetch 같은 읽기 명령은 이 폴더에서 그대로 쓸 수 있다.`
  )
}

// 훅 입력(객체)을 판정한다. { block: false } 또는 { block: true, reason }.
export function decide(input, isMain = isMainWorktree) {
  if (!input || typeof input !== 'object') return { block: false }
  if (input.tool_name && input.tool_name !== 'Bash') return { block: false }
  const command = input.tool_input?.command
  if (typeof command !== 'string') return { block: false }
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd()

  const violations = findViolations(command, cwd)
  if (violations.length === 0) return { block: false }          // git을 부르지 않고 끝낸다
  if (isMain(cwd) !== true) return { block: false }              // 격리 워크트리거나 판정 불가
  return { block: true, reason: denyReason(violations) }
}

function main() {
  let input
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch (e) {
    console.error(`guard-shared-head: 훅 입력을 읽지 못했습니다 — ${e.message}`)
    return
  }
  const verdict = decide(input)
  if (!verdict.block) return
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: verdict.reason,
    },
  }) + '\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
}
