// migrate-doc-tree.mjs 테스트 (티켓 20261010_1214)
// 실행: node scripts/migrate-doc-tree.test.mjs
import assert from 'node:assert/strict'
import {
  isNoRewrite,
  mapPath,
  plan,
  rewriteContent,
  rewriteLinkTarget,
  rewritePrefixes,
} from './migrate-doc-tree.mjs'

// 경로 매핑: 파일 항목은 정확히 일치, 폴더 항목은 접두어
assert.equal(mapPath('docs/specs/UX_WRITING_GUIDELINE.md'), 'docs/service/writing/UX_WRITING_GUIDELINE.md')
assert.equal(mapPath('docs/specs/INDEX.md'), 'docs/INDEX.md')
assert.equal(mapPath('docs/specs/prd/01_PRD.md'), 'docs/service/prd/01_PRD.md')
assert.equal(mapPath('jam-doc/planning/business-plan/04 JAM! 트라이브.md'), 'docs/plan/vision/04 JAM! 트라이브.md')
assert.equal(mapPath('jam-doc/planning/content/tribes-history/a.md'), 'docs/service/content/tribes-history/a.md')
assert.equal(mapPath('jam-doc/inbox/trends/a.md'), 'docs/operations/inbox/trends/a.md')
assert.equal(mapPath('docs/tickets/p1-high/a.md'), 'docs/tickets/p1-high/a.md')
// 폴더 이름이 앞부분만 같은 경로는 건드리지 않는다
assert.equal(mapPath('docs/specs/prd-extra/a.md'), 'docs/specs/prd-extra/a.md')

// 접두어 치환: 긴 것이 먼저 맞고, 앞뒤가 경로 문자면 건드리지 않는다
assert.equal(
  rewritePrefixes('`jam-doc/operations/reports/w.md`와 `jam-doc/operations/x.md`'),
  '`docs/operations/reports/w.md`와 `docs/operations/x.md`',
)
assert.equal(rewritePrefixes('`jam-doc/inbox/trends/a.md`'), '`docs/operations/inbox/trends/a.md`')
assert.equal(rewritePrefixes('../jam-doc/assets/a.png'), '../jam-doc/assets/a.png')
assert.equal(rewritePrefixes('xjam-doc/assets/a.png'), 'xjam-doc/assets/a.png')
assert.equal(rewritePrefixes('docs/specs/prd/a.md, docs/specs/INDEX.md'), 'docs/service/prd/a.md, docs/INDEX.md')

// 상대 링크: 원본만 이동 (docs/specs/INDEX.md -> docs/INDEX.md, 대상 docs/tickets는 그대로)
assert.equal(
  rewriteLinkTarget('../tickets/p1-high/a.md', 'docs/specs/INDEX.md', 'docs/INDEX.md'),
  'tickets/p1-high/a.md',
)
// 대상만 이동 (docs/tickets/ 문서에서 docs/specs/prd 로)
assert.equal(
  rewriteLinkTarget('../../specs/prd/01_PRD.md', 'docs/tickets/p1-high/a.md', 'docs/tickets/p1-high/a.md'),
  '../../service/prd/01_PRD.md',
)
// 둘 다 이동 (같이 움직이면 상대 경로가 그대로)
assert.equal(
  rewriteLinkTarget('../content/TRIBES.md', 'jam-doc/planning/business-plan/a.md', 'docs/plan/vision/a.md'),
  '../../service/content/TRIBES.md',
)
assert.equal(
  rewriteLinkTarget('../b/c.md', 'jam-doc/planning/jam2-redesign/a/x.md', 'docs/plan/jam2/a/x.md'),
  '../b/c.md',
)
// 둘 다 이동하고 깊이도 같을 때 jam-web 같은 안 움직이는 대상은 그대로 맞는다
assert.equal(
  rewriteLinkTarget('../../../jam-web/src/a.ts', 'jam-doc/planning/content/X.md', 'docs/service/content/X.md'),
  '../../../jam-web/src/a.ts',
)
// 이동과 무관한 링크·외부 링크·앵커는 그대로
assert.equal(rewriteLinkTarget('./b.md', 'docs/tickets/a.md', 'docs/tickets/a.md'), './b.md')
assert.equal(rewriteLinkTarget('https://example.com/jam-doc/a', 'docs/specs/INDEX.md', 'docs/INDEX.md'), 'https://example.com/jam-doc/a')
assert.equal(rewriteLinkTarget('#절', 'docs/specs/INDEX.md', 'docs/INDEX.md'), '#절')
// 앵커·인코딩·꺾쇠 보존
assert.equal(
  rewriteLinkTarget('../planning/business-plan/04%20JAM!%20%ED%8A%B8.md#절', 'jam-doc/marketing/a.md', 'docs/marketing/a.md'),
  '../plan/vision/04%20JAM!%20%ED%8A%B8.md#절',
)
assert.equal(
  rewriteLinkTarget('<../prd/x y.md>', 'docs/specs/prd/a.md', 'docs/service/prd/a.md'),
  '<x y.md>',
)

// 본문: 링크·코드 스팬·펜스 처리
const body = [
  '[지도](../tickets/p1-high/a.md) 와 `docs/specs/prd/01_PRD.md`',
  '```',
  '[예시](../tickets/p1-high/a.md)',
  'docs/specs/prd/01_PRD.md',
  '```',
  '코드 스팬 안의 `[x](../tickets/a.md)` 는 링크가 아니다',
].join('\n')
const out = rewriteContent(body, 'docs/specs/INDEX.md', 'docs/INDEX.md').split('\n')
assert.equal(out[0], '[지도](tickets/p1-high/a.md) 와 `docs/service/prd/01_PRD.md`')
assert.equal(out[2], '[예시](../tickets/p1-high/a.md)') // 펜스 안 링크는 그대로
assert.equal(out[3], 'docs/service/prd/01_PRD.md') // 펜스 안 경로 문자열은 고친다
assert.equal(out[5], '코드 스팬 안의 `[x](../tickets/a.md)` 는 링크가 아니다')

// 참조 정의 링크
assert.equal(
  rewriteContent('[a]: ../tickets/x.md', 'docs/specs/INDEX.md', 'docs/INDEX.md'),
  '[a]: tickets/x.md',
)

// 제외 경로
assert.equal(isNoRewrite('jam-doc/archive/x.md'), true)
assert.equal(isNoRewrite('docs/archive/x.md'), true)
assert.equal(isNoRewrite('docs/agents/workflow/x.md'), true)
assert.equal(isNoRewrite('.claude/worktrees/a/b.md'), true)
assert.equal(isNoRewrite('jam-web/node_modules/a/b.js'), true)
assert.equal(isNoRewrite('docs/tickets/p1-high/20261010_1214_Infra_x.md'), true)
assert.equal(isNoRewrite('docs/tickets/p1-high/20261010_1215_Infra_x.md'), false)
assert.equal(isNoRewrite('docs/agents/team-operations.md'), false)

// 이동 계획: 새 경로가 같은 파일은 계획에 없다
const planned = plan(['docs/tickets/a.md', 'docs/specs/prd/a.md', 'jam-doc/README.md'])
assert.deepEqual(planned, [
  ['docs/specs/prd/a.md', 'docs/service/prd/a.md'],
  ['jam-doc/README.md', 'docs/README.md'],
])

console.log('migrate-doc-tree: 통과')
