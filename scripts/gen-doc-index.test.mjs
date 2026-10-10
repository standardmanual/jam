// gen-doc-index.mjs 테스트 (티켓 20260921_1400)
// 실행: node scripts/gen-doc-index.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bucketOf, isIndexTarget, renderIndex } from './gen-doc-index.mjs'
import { findOrphans, normalizeConfig } from './doc-check.mjs'

// 훅(pre-push -> verify.sh) 안에서 도는 경우 git이 GIT_DIR 등을 물려준다. 임시 저장소 명령이
// 실제 저장소 설정을 건드리지 않도록 물려받은 GIT_*를 버린다(티켓 20260921_1116 사고).
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k]

const GEN =join(dirname(fileURLToPath(import.meta.url)), 'gen-doc-index.mjs')

// 대상 판정
assert.equal(isIndexTarget('docs/service/A.md'), true)
assert.equal(isIndexTarget('docs/plan/jam2/T.md'), true)
assert.equal(isIndexTarget('docs/archive/x.md'), true) // 보관 문서는 주제 지도에만 나온다
assert.equal(isIndexTarget('docs/INDEX.md'), false)
assert.equal(isIndexTarget('docs/tickets/p1-high/x.md'), false)
assert.equal(isIndexTarget('docs/operations/reports/x.md'), false)
assert.equal(isIndexTarget('docs/assets/x.md'), false)
assert.equal(isIndexTarget('docs/service/x.txt'), false)
assert.equal(isIndexTarget('jam-web/x.md'), false)

// 묶음: 가장 긴 접두어가 이긴다
assert.equal(bucketOf('docs/service/prd/a.md').key, 'service')
assert.equal(bucketOf('docs/service/content/tribes-history/README.md').key, 'archive')
assert.equal(bucketOf('docs/agents/workflow/a.md').key, 'archive')
assert.equal(bucketOf('docs/agents/orchestrator.md').key, 'agents')
assert.equal(bucketOf('docs/plan/jam2/a.md').key, 'jam2')
assert.equal(bucketOf('docs/DOCUMENT_SCHEMA.md').key, 'docs')

// 렌더링은 입력 순서와 무관하고 반복해도 같다
const a = { file: 'docs/service/B.md', description: '둘째\n설명', tags: ['트라이브'] }
const b = { file: 'docs/service/A.md', description: '첫째', tags: ['트라이브', '배지'] }
const c = { file: 'docs/plan/x/C.md', description: '', tags: undefined }
const vocab = ['배지', '트라이브']
const r1 = renderIndex([a, b, c], vocab)
assert.equal(r1, renderIndex([c, b, a], vocab))
assert.equal(r1, renderIndex([a, b, c], vocab))
assert.ok(r1.indexOf('[A.md]') < r1.indexOf('[B.md]'))
assert.ok(r1.includes('- [B.md](service/B.md) — 둘째 설명'))
assert.ok(r1.includes('(plan/x/C.md) — (description 없음)'))
assert.ok(r1.startsWith('---\ntype: index\n'))

// 주제 지도: 어휘 순서, 한 문서가 여러 주제에, 태그 없는 문서는 「주제 없음」
const mapPart = r1.slice(r1.indexOf('## 주제 지도'), r1.indexOf('## 폴더별 목록'))
assert.ok(mapPart.indexOf('### 배지') < mapPart.indexOf('### 트라이브'))
assert.ok(mapPart.indexOf('### 트라이브') < mapPart.indexOf('### 주제 없음'))
const tribeSection = mapPart.slice(mapPart.indexOf('### 트라이브'), mapPart.indexOf('### 주제 없음'))
assert.ok(tribeSection.includes('[A.md]') && tribeSection.includes('[B.md]'))
const badgeSection = mapPart.slice(mapPart.indexOf('### 배지'), mapPart.indexOf('### 트라이브'))
assert.ok(badgeSection.includes('[A.md]') && !badgeSection.includes('[B.md]'))
assert.ok(mapPart.slice(mapPart.indexOf('### 주제 없음')).includes('[C.md]'))

// 한 주제 안에서 현재(service)·JAM 2.0·보관 순으로 나눠 보인다
const t = renderIndex(
  [
    { file: 'docs/archive/business-plan/old.md', description: '옛', tags: ['트라이브'] },
    { file: 'docs/plan/jam2/new.md', description: '새', tags: ['트라이브'] },
    { file: 'docs/service/content/TRIBES.md', description: '현재', tags: ['트라이브'] },
  ],
  ['트라이브'],
)
const ts = t.slice(t.indexOf('### 트라이브'), t.indexOf('## 폴더별 목록'))
assert.ok(ts.indexOf('[TRIBES.md]') < ts.indexOf('[new.md]'))
assert.ok(ts.indexOf('[new.md]') < ts.indexOf('[old.md]'))
// 보관 문서는 폴더별 목록에 나오지 않는다
assert.ok(!t.slice(t.indexOf('## 폴더별 목록')).includes('old.md'))

// 주제 없음의 보관 문서는 폴더 단위로 접는다
const f = renderIndex(
  [
    { file: 'docs/archive/operations/a.md', description: '', tags: [] },
    { file: 'docs/archive/operations/b.md', description: '', tags: [] },
  ],
  [],
)
assert.ok(f.includes('[docs/archive/operations/](archive/operations/) — 문서 2개'))
assert.ok(!f.includes('[a.md]'))

// 임시 저장소: 생성 -> --check 통과 -> 문서 추가 후 --check 실패
const dir = mkdtempSync(join(tmpdir(), 'gen-doc-index-'))
const run = (args) => spawnSync('node', [GEN, ...args], { cwd: dir, encoding: 'utf8' })
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' })
try {
  sh('git', ['init', '-q'])
  mkdirSync(join(dir, 'docs/service'), { recursive: true })
  writeFileSync(join(dir, 'docs/service/A.md'), '---\ntype: guideline\ndescription: 가 문서\n---\n')
  sh('git', ['add', '-A'])
  assert.equal(run(['--check']).status, 1)
  assert.equal(run([]).status, 0)
  sh('git', ['add', '-A'])
  assert.equal(run(['--check']).status, 0)
  writeFileSync(join(dir, 'docs/service/B.md'), '---\ntype: guideline\ndescription: 나 문서\n---\n')
  sh('git', ['add', '-A'])
  assert.equal(run(['--check']).status, 1)
  assert.equal(run([]).status, 0)
  sh('git', ['add', '-A'])
  assert.equal(run(['--check']).status, 0)

  // INDEX가 링크 출처로 세어지지 않는다: INDEX만 링크한 문서는 여전히 고아
  const cfg = normalizeConfig({
    scope: { include: ['docs/'], exclude: [] },
    orphans: { excludeTypes: [], excludeSources: ['docs/INDEX.md'] },
  })
  const orphans = findOrphans(cfg, dir)
  assert.ok(orphans.includes('docs/service/A.md'))
  assert.ok(orphans.includes('docs/service/B.md'))
  assert.ok(!orphans.includes('docs/INDEX.md'))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log('gen-doc-index 테스트 통과')
