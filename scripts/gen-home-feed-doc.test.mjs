// gen-home-feed-doc.mjs 테스트 (티켓 20260927_2036)
// 실행: node scripts/gen-home-feed-doc.test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  parseCodePaths,
  isTestFile,
  underCodePaths,
  genCardShapes,
  genLegacyShapeMap,
  DOC_PATH,
  TODAY_SECTIONS_PATH,
  TARGET_HREF_PATH,
  SHAPE_PATH,
} from './gen-home-feed-doc.mjs'

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

// ── 모양 생성 구간(티켓 20261001_2244): 모양 목록과 옛 값 → 새 모양 대응표 ─────────────────
// 실제 shape.ts·today-sections.ts를 읽어 만든 결과로 확인한다(대응표 결과 칸은 코드가 채운다)
{
  const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const shape = await import(pathToFileURL(join(REPO, SHAPE_PATH)).href)
  const sections = await import(pathToFileURL(join(REPO, TODAY_SECTIONS_PATH)).href)

  const shapes = genCardShapes(shape)
  for (const value of ['hero', 'poster', 'square']) {
    assert.ok(shapes.includes(`| \`${value}\` | 있음 (이미지 제작 필요) |`), `${value}는 이미지가 있는 모양이다`)
  }
  for (const value of ['brief', 'list']) {
    assert.ok(shapes.includes(`| \`${value}\` | 없음 |`), `${value}는 이미지가 없는 모양이다`)
  }
  assert.equal(shapes.split('\n').length, 2 + shape.CARD_SHAPES.length) // 헤더 2줄 + 모양마다 한 줄

  const map = genLegacyShapeMap(shape, sections)
  const row = (layout, condition, result) =>
    assert.ok(
      map
        .split('\n')
        .some(
          (line) =>
            (line.includes(`\`${layout}\``) || line.startsWith(`| ${layout} |`)) &&
            line.includes(condition) &&
            line.endsWith(`| ${result} |`)
        ),
      `${layout} · ${condition} → ${result} 행이 있어야 한다`
    )
  // 옛 레이아웃 6종과 예외 행
  row('large_thumbnail', '커버 있음', '`hero`')
  row('large_thumbnail', '미션 소개 카드', '`square`')
  row('large_thumbnail', '커버 없음 · 배지가 걸려 있음', '`square`')
  row('large_thumbnail', '커버 없음 · 배지 없음', '`hero`')
  row('badge_gallery', '배지가 1개 이상', '`list` 타일형')
  row('badge_gallery', '배지가 0개', '`brief`')
  row('shortcut', '입력과 무관', '`brief`')
  row('banner', '커버 있음', '`poster`')
  row('banner', '커버 없음', '`brief`')
  row('other', '입력과 무관', '`brief`')
  row('ranking_list', '랭킹보드', '`list` 행형')
  row('모든 레이아웃', '기사', '`hero`')
  row('모든 레이아웃', '저장된 `shape`', '`poster`')
  row('모든 레이아웃', '목록에 없는 레이아웃 값', '`hero`')
  // 모든 결과 칸의 모양은 모양 목록 안에 있다
  for (const line of map.split('\n').slice(2)) {
    const result = line.match(/\| `(\w+)`(?: [^|]*)? \|$/)?.[1]
    assert.ok(shape.CARD_SHAPES.includes(result), `결과 칸이 모양이어야 한다: ${line}`)
  }
}

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

// ── ③ --staged: 문서 파일이 아직 없을 때(이 티켓 병합 전 상태) → 검사할 게 없어 통과 ───────────
// (티켓 20260927_2153: gen-home-feed-doc.mjs 240행 `if (!existsSync(docFile)) process.exit(0)` 경로)
{
  const dir2 = mkdtempSync(join(tmpdir(), 'gen-home-feed-doc-nodoc-'))
  const run2 = (args) => spawnSync('node', [GEN, ...args], { cwd: dir2, encoding: 'utf8' })
  const sh2 = (cmd, args) => spawnSync(cmd, args, { cwd: dir2, encoding: 'utf8' })
  const write2 = (rel, body) => {
    mkdirSync(dirname(join(dir2, rel)), { recursive: true })
    writeFileSync(join(dir2, rel), body)
  }
  try {
    sh2('git', ['init', '-q'])
    sh2('git', ['config', 'user.email', 'test@example.com'])
    sh2('git', ['config', 'user.name', 'test'])

    write2('jam-web/src/lib/today/cards.ts', '// 원본\n')
    sh2('git', ['add', '-A'])
    sh2('git', ['commit', '-q', '-m', 'init'])

    // DOC_PATH는 커밋에도 없고 디스크에도 없다 — 홈피드 코드만 스테이지한다
    write2('jam-web/src/lib/today/cards.ts', '// 변경\n')
    sh2('git', ['add', '--', 'jam-web/src/lib/today/cards.ts'])

    const r = run2(['--staged'])
    assert.equal(r.status, 0)
  } finally {
    rmSync(dir2, { recursive: true, force: true })
  }
}

// ── ④ 기본 모드: 문서에 생성 구간 표식이 없을 때 → process.exit(2) ──────────────────────────
// (티켓 20260927_2153: gen-home-feed-doc.mjs 313~317행 `missing.length > 0` 경로.
//  runGenerate는 표식 검사 전에 블록 생성 함수를 먼저 호출하므로(287~293행) today-sections.ts·
//  targetHref.ts 자리에 형태만 맞춘 최소 모듈을 둔다 — 실제 코드가 아니라 자리표시다)
{
  const dir3 = mkdtempSync(join(tmpdir(), 'gen-home-feed-doc-nomarker-'))
  const write3 = (rel, body) => {
    mkdirSync(dirname(join(dir3, rel)), { recursive: true })
    writeFileSync(join(dir3, rel), body)
  }
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir3 })

    write3(
      TODAY_SECTIONS_PATH,
      [
        'export const TODAY_EXPOSURE_TAG_OPTIONS = [{ value: "v", label: "L" }]',
        'export const TODAY_TEMPLATE_OPTIONS = [{ value: "badge_spotlight", label: "L" }]',
        'export const SUGGESTED_LAYOUT_FOR = { badge_spotlight: "other" }',
        'export const TODAY_LAYOUT_OPTIONS = [{ value: "other", label: "L" }]',
        'export const TODAY_FIELDS_FOR = { badge_spotlight: {} }',
        'export const TODAY_CONTENT_TYPE_OPTIONS = [{ value: "v", label: "L" }]',
        '',
      ].join('\n')
    )
    write3(
      TARGET_HREF_PATH,
      ['export function resolveTargetHref() { return "/x" }', 'export function resolveArticleCtaTarget() { return null }', ''].join(
        '\n'
      )
    )
    write3(
      SHAPE_PATH,
      [
        'export const CARD_SHAPES = ["hero", "brief"]',
        'export const isImageShape = (v) => v === "hero"',
        'export const resolveShape = () => "hero"',
        'export const resourceOfTemplate = () => "badge"',
        'export const fallbackEmptyTileShape = (shape) => shape',
        'export const isRankingRows = () => false',
        '',
      ].join('\n')
    )
    // 생성 구간 표식(<!-- BEGIN/END generated: ... -->)이 전혀 없는 문서
    write3(DOC_PATH, ['---', 'type: prd', 'status: draft', 'description: 테스트', '---', '', '# 홈피드', ''].join('\n'))

    const r = spawnSync('node', [GEN], { cwd: dir3, encoding: 'utf8' })
    assert.equal(r.status, 2)
    assert.ok(r.stderr.includes('생성 구간 표시가 없습니다'))
    for (const name of ['exposure-tags', 'templates', 'content-types', 'layouts', 'card-shapes', 'legacy-shape-map', 'destinations']) {
      assert.ok(r.stderr.includes(name), `${name}이 오류 메시지에 있어야 한다`)
    }
  } finally {
    rmSync(dir3, { recursive: true, force: true })
  }
}

console.log('gen-home-feed-doc 테스트 통과')
