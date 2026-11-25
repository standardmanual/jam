// PreToolUse 훅: 서비스 화면 파일을 Write·Edit·MultiEdit로 쓰기 직전에 새 내용을 scripts/check-ui-rules.mjs로 판정해
// DS 밖 값이 늘면 쓰기를 거절한다 (티켓 20261125_2050). 종료 코드 0 허용 / 2 거절 / 1 검사기 고장(차단하지 않는 경고).
// 저장소 루트는 $CLAUDE_PROJECT_DIR이 아니라 편집 대상 파일에서 위로 올라가며 찾는다(서브에이전트의 워크트리 기준 판정).

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const TOOLS = new Set(['Write', 'Edit', 'MultiEdit'])
const REJECT =
  '이 편집은 거절됐습니다. 정본 컴포넌트(`jam-web/src/components/ui/`)와 DS 토큰으로 다시 쓰세요. ' +
  '기준선을 올리거나 `ui-allow`를 붙여 피하지 말고, 맞는 컴포넌트·토큰이 없으면 멈추고 카리나에게 승인을 요청하세요.'

function findRoot(file) {
  let dir = dirname(file)
  for (;;) {
    if (existsSync(join(dir, 'scripts', 'check-ui-rules.mjs'))) return dir
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

function applyEdit(text, edit) {
  const { old_string: from, new_string: to, replace_all: all } = edit ?? {}
  if (typeof from !== 'string' || typeof to !== 'string' || from === '' || !text.includes(from)) return null
  return all ? text.split(from).join(to) : text.replace(from, () => to)
}

function main() {
  let input
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return 0
  }
  if (!input || !TOOLS.has(input.tool_name)) return 0
  const ti = input.tool_input ?? {}
  const file = ti.file_path
  if (typeof file !== 'string' || !file.startsWith('/')) return 0
  const root = findRoot(file)
  if (!root) return 0

  let next
  if (input.tool_name === 'Write') {
    if (typeof ti.content !== 'string') return 0
    next = ti.content
  } else {
    if (!existsSync(file)) return 0
    next = readFileSync(file, 'utf8')
    const edits = input.tool_name === 'Edit' ? [ti] : Array.isArray(ti.edits) ? ti.edits : []
    for (const e of edits) {
      next = applyEdit(next, e)
      if (next === null) return 0
    }
  }

  const rel = relative(root, file)
  const r = spawnSync(process.execPath, [realpathSync(join(root, 'scripts', 'check-ui-rules.mjs')), '--stdin-file', rel], {
    cwd: root,
    input: next,
    encoding: 'utf8',
  })
  if (r.error || (r.status !== 0 && r.status !== 1)) {
    console.error(`ui-guard: 규칙 엔진 실행에 실패해 검사를 건너뜁니다 (${r.error?.message ?? `종료 코드 ${r.status}`})`)
    return 1
  }
  if (r.status === 0) return 0
  console.error(`${r.stderr}${r.stdout}`.trimEnd())
  console.error(REJECT)
  return 2
}

process.exit(main())
