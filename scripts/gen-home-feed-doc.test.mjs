// gen-home-feed-doc.mjs 테스트 (티켓 20260927_2036)
// 실행: node scripts/gen-home-feed-doc.test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCodePaths, isTestFile, underCodePaths, DOC_PATH, TODAY_SECTIONS_PATH } from './gen-home-feed-doc.mjs'

// 훅(pre-push -> verify.sh) 안에서 도는 경우 git이 GIT_DIR 등을 물려준다. 임시 저장소 명령이
// 실제 저장소 설정을 건드리지 않도록 물려받은 GIT_*를 버린다(티켓 20260921_1116 사고).
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k]

const GEN = join(dirname(fileURLToPath(import.meta.url)), 'gen-home-feed-doc.mjs')

// ── 순수 함수 단위 테스트 ────────────────────────────────────────────────────
{
  const doc = [
    '---',
    'type: prd',
    'status: draft',
    'code:',
    '  - "jam-web/src/lib/today"',
    '  - "jam-web/src/app/api/today"',
    'description: 테스트',
    '---',
    '',
  ].join('\n')
  assert.deepEqual(parseCodePaths(doc), ['jam-web/src/lib/today', 'jam-web/src/app/api/today'])
  assert.deepEqual(parseCodePaths('본문만 있고 frontmatter가 없다'), [])
}

assert.equal(isTestFile('jam-web/src/lib/today/__tests__/cards.test.ts'), true)
assert.equal(isTestFile('jam-web/src/lib/today/cards.test.ts'), true)
assert.equal(isTestFile('jam-web/src/lib/today/cards.ts'), false)

assert.equal(underCodePaths('jam-web/src/lib/today/cards.ts', ['jam-web/src/lib/today']), true)
assert.equal(underCodePaths('jam-web/src/lib/today', ['jam-web/src/lib/today']), true)
assert.equal(underCodePaths('jam-web/src/lib/todayX/cards.ts', ['jam-web/src/lib/today']), false)
assert.equal(underCodePaths('jam-web/src/app/api/other/route.ts', ['jam-web/src/lib/today']), false)

// ── ① --check: 저장소의 실제 문서가 today-sections.ts·targetHref.ts와 같은 최신본인지 ────
// (완료 조건: "today-sections.ts의 라벨 하나를 임시로 바꾸면 1이 된다", 실제 파일을 잠깐
//  고쳤다가 되돌린다 — 이 저장소 안의 실제 문서·소스로 검증한다)
{
  const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const runReal = (args) => spawnSync('node', [GEN, ...args], { cwd: REPO_ROOT, encoding: 'utf8' })
  const sectionsFile = join(REPO_ROOT, TODAY_SECTIONS_PATH)

  assert.equal(runReal(['--check']).status, 0)

  const original = readFileSync(sectionsFile, 'utf8')
  const label = '배지 소개 (badge_spotlight)'
  assert.ok(original.includes(label), '테스트가 가정한 라벨이 today-sections.ts에 있어야 한다')
  try {
    writeFileSync(sectionsFile, original.replace(label, '배지 소개 임시테스트 (badge_spotlight)'))
    const result = runReal(['--check'])
    assert.equal(result.status, 1)
    assert.ok(result.stderr.includes('다릅니다'))
  } finally {
    writeFileSync(sectionsFile, original)
  }
  assert.equal(runReal(['--check']).status, 0) // 되돌리면 다시 통과
}

// ── ② --staged: 스테이지된 홈피드 코드에 문서가 함께 스테이지됐는지 ──────────────────────
const dir = mkdtempSync(join(tmpdir(), 'gen-home-feed-doc-'))
const run = (args) => spawnSync('node', [GEN, ...args], { cwd: dir, encoding: 'utf8' })
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' })
const write = (rel, body) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), body)
}
try {
  sh('git', ['init', '-q'])
  sh('git', ['config', 'user.email', 'test@example.com'])
  sh('git', ['config', 'user.name', 'test'])

  write(
    DOC_PATH,
    ['---', 'type: prd', 'status: draft', 'description: 테스트', 'code:', '  - "jam-web/src/lib/today"', '---', ''].join('\n')
  )
  write('jam-web/src/lib/today/cards.ts', '// 원본\n')
  sh('git', ['add', '-A'])
  sh('git', ['commit', '-q', '-m', 'init'])

  // 1) 홈피드 코드만 스테이지 → 차단
  write('jam-web/src/lib/today/cards.ts', '// 변경\n')
  sh('git', ['add', '--', 'jam-web/src/lib/today/cards.ts'])
  {
    const r = run(['--staged'])
    assert.equal(r.status, 1)
    assert.ok(r.stderr.includes('차단'))
    assert.ok(r.stderr.includes('cards.ts'))
  }

  // 2) 문서도 함께 스테이지 → 통과
  write(DOC_PATH, readFileSync(join(dir, DOC_PATH), 'utf8') + '\n<!-- 수정 -->\n')
  sh('git', ['add', '--', DOC_PATH])
  assert.equal(run(['--staged']).status, 0)
  sh('git', ['commit', '-q', '-m', 'code + doc'])

  // 3) __tests__ 아래 파일만 스테이지 → 통과(테스트 파일은 제외)
  write('jam-web/src/lib/today/__tests__/cards.test.ts', '// 테스트\n')
  sh('git', ['add', '--', 'jam-web/src/lib/today/__tests__/cards.test.ts'])
  assert.equal(run(['--staged']).status, 0)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('gen-home-feed-doc 테스트 통과')
