// check-skills.mjs 테스트 (티켓 20260922_1523)
// 실행: node scripts/check-skills.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkAgentFile, checkAgentsOrder, checkSkillFile, parseFrontmatter } from './check-skills.mjs'

// 훅(pre-push -> verify.sh) 안에서 도는 경우 git이 GIT_DIR 등을 물려준다. 임시 저장소 명령이
// 실제 저장소 설정을 건드리지 않도록 물려받은 GIT_*를 버린다(티켓 20260921_1116 사고, 가드레일
// 패턴 15).
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k]

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-skills.mjs')

// ── parseFrontmatter ────────────────────────────────────────────────────────
assert.deepEqual(parseFrontmatter('본문만 있고 frontmatter 없음'), null)
assert.deepEqual(
  parseFrontmatter('---\nname: jam-x\ndescription: 설명\n---\n\n본문'),
  { name: 'jam-x', description: '설명' },
)

// ── checkSkillFile ───────────────────────────────────────────────────────────
assert.deepEqual(checkSkillFile('ok', '---\nname: ok\ndescription: "해줘" 같은 요청에 사용.\n---\n'), [])
assert.ok(checkSkillFile('no-fm', '# 제목만').some((p) => p.includes('frontmatter가 없습니다')))
assert.ok(
  checkSkillFile('no-desc', '---\nname: x\n---\n').some((p) => p.includes('description이 없습니다')),
)
assert.ok(
  checkSkillFile('no-trigger', '---\nname: x\ndescription: 트리거 예시가 없는 설명\n---\n').some((p) =>
    p.includes('트리거 문구 예시'),
  ),
)

// ── checkAgentFile ───────────────────────────────────────────────────────────
assert.deepEqual(
  checkAgentFile('jam-x', '---\nname: jam-x\ndescription: JAM! agent (아무개).\ntools: Read\nmodel: sonnet\n---\n'),
  [],
)
assert.ok(
  checkAgentFile('jam-x', '---\nname: jam-x\ndescription: 설명\ntools: Read\nmodel: sonnet\n---\n').some((p) =>
    p.includes('한글 이름'),
  ),
)
const missingFields = checkAgentFile('jam-x', '---\nname: jam-x\n---\n')
assert.ok(missingFields.some((p) => p.includes('description')))
assert.ok(missingFields.some((p) => p.includes('tools')))
assert.ok(missingFields.some((p) => p.includes('model')))

// ── checkAgentsOrder ─────────────────────────────────────────────────────────
assert.deepEqual(checkAgentsOrder(['a', 'b'], ['a', 'b']), [])
assert.ok(checkAgentsOrder(['a', 'b'], ['a']).some((p) => p.includes('b.md가 없습니다')))
assert.ok(checkAgentsOrder(['a'], ['a', 'b']).some((p) => p.includes('b.md가 있지만')))

// ── 임시 저장소: 정상 상태는 통과, description을 뺀 스킬은 실패를 재현한다 ───────
const dir = mkdtempSync(join(tmpdir(), 'check-skills-'))
const run = () => spawnSync('node', [CHECK], { cwd: dir, encoding: 'utf8' })
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' })
try {
  sh('git', ['init', '-q'])

  mkdirSync(join(dir, '.claude/skills/jam-x'), { recursive: true })
  writeFileSync(
    join(dir, '.claude/skills/jam-x/SKILL.md'),
    '---\nname: jam-x\ndescription: 설명. "이거 해줘" 같은 요청에 사용.\n---\n',
  )
  mkdirSync(join(dir, '.claude/agents'), { recursive: true })
  writeFileSync(
    join(dir, '.claude/agents/jam-x.md'),
    '---\nname: jam-x\ndescription: JAM! agent (아무개).\ntools: Read\nmodel: sonnet\n---\n',
  )
  mkdirSync(join(dir, 'docs/agents'), { recursive: true })
  writeFileSync(
    join(dir, 'docs/agents/contract.json'),
    JSON.stringify({ agents: { _order: ['jam-x'] } }),
  )

  const passing = run()
  assert.equal(passing.status, 0, `정상 상태에서 통과해야 한다:\n${passing.stdout}${passing.stderr}`)

  // 일부러 description을 뺀 임시 스킬로 실패를 재현한다 (요구사항 4).
  writeFileSync(join(dir, '.claude/skills/jam-x/SKILL.md'), '---\nname: jam-x\n---\n')
  const failing = run()
  assert.equal(failing.status, 1, 'description을 빼면 실패해야 한다')
  assert.match(failing.stderr, /description이 없습니다/)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('check-skills 테스트 통과')
