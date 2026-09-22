// gen-team-map.mjs 테스트 (티켓 20260922_2242)
// 실행: node scripts/gen-team-map.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collect, extractTable, mdInline, parseAgentCalls, parseConstList, parsePhases, renderHtml,
} from './gen-team-map.mjs'

// 훅(pre-push -> verify.sh) 안에서 도는 경우 git이 GIT_DIR 등을 물려준다. 임시 저장소 명령이
// 실제 저장소 설정을 건드리지 않도록 물려받은 GIT_*를 버린다(티켓 20260921_1116 사고).
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k]

const GEN = join(dirname(fileURLToPath(import.meta.url)), 'gen-team-map.mjs')

// ── 순수 함수 ───────────────────────────────────────────────────────────────
// 표 셀 인라인: 코드·굵게만 옮기고 나머지는 이스케이프한다
assert.equal(mdInline('a `b<c` **d** <e>'), 'a <code>b&lt;c</code> <strong>d</strong> &lt;e&gt;')

// 제목 아래 첫 표를 읽는다. 제목이 없거나 다음 제목 전에 표가 없으면 null
const md = [
  '## 5. 접근', '', '설명 한 줄', '', '| 이름 | 읽는 곳 |', '|---|---|', '| 아현 | 전부 |', '| 민지 | diff |', '',
  '## 6. 루틴', '', '표가 없다', '', '## 7. 끝', '| 엉뚱 | 표 |', '|---|---|', '| x | y |',
].join('\n')
assert.deepEqual(extractTable(md, '## 5.'), { header: ['이름', '읽는 곳'], rows: [['아현', '전부'], ['민지', 'diff']] })
assert.equal(extractTable(md, '## 6.'), null)
assert.equal(extractTable(md, '## 99.'), null)

// jam-work.js 모양의 소스에서 단계·호출·병렬·격리·모델 덮어쓰기를 읽는다
const wf = `
export const meta = { name: 'x', phases: [ { title: '사전' }, { title: '구현' }, { title: '게이트' }, { title: '사후' } ] }
const DESIGN_TYPES = ['ui', 'ds']
const SMALL_DIFF_LINE_THRESHOLD = 15
async function gate() {
  phase('게이트')
  const [a, b] = await parallel([
    () => agent('p', { agentType: 'jam-reviewer', label: 'jam-reviewer', schema: V }),
    () => cond ? agent('p', {
        agentType: 'jam-designer',
        label: 'jam-designer-post',
        phase: '사후',
        ...(t === 'ds' ? {} : { model: 'claude-haiku-4-5-20251001' }),
      }) : Promise.resolve(null),
  ])
}
async function run() {
  phase('사전')
  const d = await agent('p', { agentType: 'jam-designer', label: 'jam-designer-pre', schema: P })
  phase('구현')
  const r = await agent('p', { agentType: 'jam-developer', label: 'jam-developer', isolation: 'worktree', schema: D })
}
`
assert.deepEqual(parsePhases(wf), ['사전', '구현', '게이트', '사후'])
assert.deepEqual(parseConstList(wf, 'DESIGN_TYPES'), ['ui', 'ds'])
const calls = parseAgentCalls(wf)
assert.deepEqual(calls.map((c) => [c.label, c.phase, c.isolation, c.modelOverride, c.parallelGroup]), [
  ['jam-reviewer', '게이트', null, null, 0],
  ['jam-designer-post', '사후', null, 'claude-haiku-4-5-20251001', 0],
  ['jam-designer-pre', '사전', null, null, null],
  ['jam-developer', '구현', 'worktree', null, null],
])

// ── 임시 저장소: 생성 → --check 통과 → 정의 변경 → --check 실패 → 재생성 통과 ───────────
const dir = mkdtempSync(join(tmpdir(), 'gen-team-map-'))
const run = (args) => spawnSync('node', [GEN, ...args], { cwd: dir, encoding: 'utf8' })
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' })
const w = (rel, body) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), body) }
try {
  sh('git', ['init', '-q'])
  w('.claude/agents/jam-developer.md', '---\nname: jam-developer\ndescription: JAM! implementation agent (아현). x\ntools: Read, Write, Edit, Bash\nmodel: sonnet\n---\n')
  w('.claude/agents/jam-reviewer.md', '---\nname: jam-reviewer\ndescription: JAM! reviewer (민지). <script>alert(1)</script>\ntools: Read, Grep\nmodel: sonnet\n---\n')
  w('.claude/agents/jam-guide.md', '---\nname: jam-guide\ndescription: JAM! docs (하니). x\ntools: Read\nmodel: haiku\n---\n')
  w('docs/agents/contract.json', JSON.stringify({
    agents: {
      _order: ['jam-developer', 'jam-reviewer', 'jam-guide'],
      'jam-developer': { role: '구현', presence: '항상' },
      'jam-reviewer': { role: '게이트', presence: '항상' },
      'jam-guide': { role: '문서', presence: '월간' },
    },
    write_capable_agents: { agents: ['jam-developer'] },
    worktree_isolated_agents: { agents: ['jam-developer'] },
  }))
  w('.claude/workflows/jam-work.js', wf)
  w('.claude/skills/jam-work/SKILL.md', '---\nname: jam-work\ndescription: 표준 워크플로우. "고쳐줘"\n---\n아현(`jam-developer`)과 민지(`jam-reviewer`). 규칙은 `jam-guide.md` 참고.\n')
  w('.claude/skills/jam-sync/SKILL.md', '---\nname: jam-sync\ndescription: 동기화. "동기화해줘"\n---\n카리나 직접.\n')
  w('.claude/settings.json', JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node "$D/scripts/ticket-dashboard.mjs"' }] }] } }))
  w('.githooks/pre-push', '# JAM_SHIP=1\n  wf_*) [ x ] && is_wf_worktree=1 ;;\n block_reason="wf"\n claude/jamwork-*) block_reason="rb" ;;\n scripts/verify.sh\n')
  w('.githooks/pre-commit', "grep -qE '^\\+status: CLOSED\\b'\n")
  w('docs/agents/team-operations.md', [
    '# 지도', '## 3. 경로', '| 경로 | 조건 |', '|---|---|', '| ① | 작음 |',
    '### 머지와 배포의 경계', '| 대상 | 누가 |', '|---|---|', '| main | 카리나 |',
    '## 5. 접근', '| 에이전트 | 읽는 곳 |', '|---|---|', '| 아현 | 워크트리 |',
    '## 6. 루틴', '| 루틴 | 주기 | 담당 |', '|---|---|---|', '| 월간 점검 | 1일 | 민지 → 하니 |', '',
  ].join('\n'))
  sh('git', ['add', '-A'])

  // 아직 HTML이 없으면 --check는 실패, 생성 후 통과
  assert.equal(run(['--check']).status, 1)
  assert.equal(run([]).status, 0)
  assert.equal(run(['--check']).status, 0)

  const html = readFileSync(join(dir, 'docs/agents/team-map.html'), 'utf8')
  // 정의의 위험 문자열은 이스케이프된다
  assert.ok(!html.includes('<script>alert'))
  // 콜사인·격리·병렬·차단 장치·루틴 간선·스킬 대응이 실린다
  for (const needle of ['jam-developer', '격리 워크트리', 'isolation: worktree', '병렬', 'main 직접 push 차단',
    'CLOSED 커밋 차단', 'class="edge routine"', '월간 점검', '/jam-work', 'ui·ds 유형만', 'diff 15줄 미만이면 생략']) {
    assert.ok(html.includes(needle), `HTML에 있어야 함: ${needle}`)
  }
  // 정의 파일 참조(`jam-guide.md`)는 호출로 세지 않는다 — jam-work 행에 하니가 없다
  const data = collect(dir)
  assert.deepEqual(data.skills.find((s) => s.name === 'jam-work').agents, ['jam-developer', 'jam-reviewer'])
  assert.deepEqual(data.skills.find((s) => s.name === 'jam-sync').agents, [])
  // 같은 입력이면 같은 출력
  assert.equal(renderHtml(data), renderHtml(collect(dir)))

  // 정의를 바꾸면 --check가 잡는다
  w('.claude/agents/jam-reviewer.md', '---\nname: jam-reviewer\ndescription: JAM! reviewer (민지). x\ntools: Read, Grep, Bash\nmodel: haiku\n---\n')
  assert.equal(run(['--check']).status, 1)
  assert.equal(run([]).status, 0)
  assert.equal(run(['--check']).status, 0)
  assert.ok(readFileSync(join(dir, 'docs/agents/team-map.html'), 'utf8').includes('Haiku'))

  // team-operations.md의 표 제목이 사라지면 생성기 오류(종료 코드 2)
  w('docs/agents/team-operations.md', '# 지도\n')
  assert.equal(run(['--check']).status, 2)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log('gen-team-map 테스트 통과')
