// gen-doc-index.mjs 테스트 (티켓 20260921_1400)
// 실행: node scripts/gen-doc-index.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isIndexTarget, renderIndex } from './gen-doc-index.mjs'
import { findOrphans, normalizeConfig } from './doc-check.mjs'

// 훅(pre-push -> verify.sh) 안에서 도는 경우 git이 GIT_DIR 등을 물려준다. 임시 저장소 명령이
// 실제 저장소 설정을 건드리지 않도록 물려받은 GIT_*를 버린다(티켓 20260921_1116 사고).
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k]

const GEN =join(dirname(fileURLToPath(import.meta.url)), 'gen-doc-index.mjs')

// 대상 판정
assert.equal(isIndexTarget('docs/specs/A.md'), true)
assert.equal(isIndexTarget('jam-doc/planning/content/T.md'), true)
assert.equal(isIndexTarget('docs/specs/INDEX.md'), false)
assert.equal(isIndexTarget('docs/tickets/p1-high/x.md'), false)
assert.equal(isIndexTarget('jam-doc/archive/x.md'), false)
assert.equal(isIndexTarget('jam-doc/operations/reports/x.md'), false)
assert.equal(isIndexTarget('jam-doc/assets/x.md'), false)
assert.equal(isIndexTarget('docs/specs/x.txt'), false)

// 렌더링은 입력 순서와 무관하고 반복해도 같다
const a = { file: 'docs/specs/B.md', description: '둘째\n설명' }
const b = { file: 'docs/specs/A.md', description: '첫째' }
const c = { file: 'jam-doc/planning/x/C.md', description: '' }
const r1 = renderIndex([a, b, c])
assert.equal(r1, renderIndex([c, b, a]))
assert.equal(r1, renderIndex([a, b, c]))
assert.ok(r1.indexOf('[A.md]') < r1.indexOf('[B.md]'))
assert.ok(r1.includes('- [B.md](B.md) — 둘째 설명'))
assert.ok(r1.includes('(../../jam-doc/planning/x/C.md) — (description 없음)'))
assert.ok(r1.startsWith('---\ntype: index\n'))

// 임시 저장소: 생성 -> --check 통과 -> 문서 추가 후 --check 실패
const dir = mkdtempSync(join(tmpdir(), 'gen-doc-index-'))
const run = (args) => spawnSync('node', [GEN, ...args], { cwd: dir, encoding: 'utf8' })
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' })
try {
  sh('git', ['init', '-q'])
  mkdirSync(join(dir, 'docs/specs'), { recursive: true })
  writeFileSync(join(dir, 'docs/specs/A.md'), '---\ntype: guideline\ndescription: 가 문서\n---\n')
  sh('git', ['add', '-A'])
  assert.equal(run(['--check']).status, 1)
  assert.equal(run([]).status, 0)
  sh('git', ['add', '-A'])
  assert.equal(run(['--check']).status, 0)
  writeFileSync(join(dir, 'docs/specs/B.md'), '---\ntype: guideline\ndescription: 나 문서\n---\n')
  sh('git', ['add', '-A'])
  assert.equal(run(['--check']).status, 1)
  assert.equal(run([]).status, 0)
  sh('git', ['add', '-A'])
  assert.equal(run(['--check']).status, 0)

  // INDEX가 링크 출처로 세어지지 않는다: INDEX만 링크한 문서는 여전히 고아
  const cfg = normalizeConfig({
    scope: { include: ['docs/'], exclude: [] },
    orphans: { excludeTypes: [], excludeSources: ['docs/specs/INDEX.md'] },
  })
  const orphans = findOrphans(cfg, dir)
  assert.ok(orphans.includes('docs/specs/A.md'))
  assert.ok(orphans.includes('docs/specs/B.md'))
  assert.ok(!orphans.includes('docs/specs/INDEX.md'))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log('gen-doc-index 테스트 통과')
