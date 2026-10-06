#!/usr/bin/env node
// gen-home-feed-doc — docs/specs/prd/home-feed/PRD.md의 생성 구간(노출 태그·템플릿·컨텐츠
// 유형·레이아웃·카드 모양 목록·옛 값 → 새 모양 대응표·이동 목적지 표)을 코드 상수·순수 함수에서 만든다 (티켓 20260927_2036, 20261001_2244).
//
// 배경: 홈피드 기능 정의가 여러 문서에 흩어져 있고 코드가 바뀌어도 문서가 따라오지 않아
// 여러 건이 낡았다. 표 부분은 손으로 옮겨 적지 않고 원천(today-sections.ts·targetHref.ts)에서
// 매번 다시 만든다. 문서의 서술(생성 구간 밖 본문)은 사람이 쓴다.
//
// 이 스크립트가 두 가지 검사를 겸한다.
//   ① 생성 구간이 코드와 같은 최신본인지 (--check)
//   ② 스테이지된 홈피드 코드 변경에 문서(code: 목록 아래 경로)가 함께 스테이지됐는지 (--staged)
// 머지 커밋은 pre-commit을 거치지 않는다(이 저장소에 pre-merge-commit 훅 없음, 2026-09-27
// .githooks/ 확인) — staging으로 머지될 때는 이 스크립트가 돌지 않는다.
//
// today-sections.ts·targetHref.ts·shape.ts는 Node의 .ts 직접 import(타입 제거)로 읽는다. 세 파일이
// `import type`만 쓰기 때문에 가능하다(값 import가 섞이면 이 방식이 깨진다, 확인 2026-09-27).
// shape.ts는 사전·서버 모듈을 값으로 가져오지 않는 순수 파일이다(티켓 20261001_2244).
// 타입 제거는 Node 22.18 이상에서 플래그 없이 동작한다(실측 v22.22.2, CI는
// .github/workflows/verify.yml 기준 Node 24).
//
// 사용법:
//   node scripts/gen-home-feed-doc.mjs           생성 구간을 갱신한다
//   node scripts/gen-home-feed-doc.mjs --check   생성 구간이 최신인지만 판정한다 (다르면 종료 코드 1)
//   node scripts/gen-home-feed-doc.mjs --staged  스테이지된 홈피드 코드에 문서가 함께 있는지 검사한다

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const DOC_PATH = 'docs/specs/prd/home-feed/PRD.md'
export const TODAY_SECTIONS_PATH = 'jam-web/src/lib/admin/today-sections.ts'
export const TARGET_HREF_PATH = 'jam-web/src/lib/today/targetHref.ts'
export const SHAPE_PATH = 'jam-web/src/lib/today/shape.ts'

const BLOCK_ORDER = [
  'exposure-tags',
  'templates',
  'content-types',
  'layouts',
  'card-shapes',
  'legacy-shape-map',
  'destinations',
]

// ── 대표 입력 카드 ──────────────────────────────────────────────────────────
// resolveTargetHref·resolveArticleCtaTarget는 TodayCardRow 하나를 받는다. 여기서는 그 타입을
// import하지 않고(타입은 런타임에 없다) 필드 이름이 같은 평범한 객체를 만든다. id류 값은
// 표에 그대로 보여도 되는 자리표시 문자열(`{id}`)로 고정한다.
function fakeCard(overrides = {}) {
  return {
    id: '{id}',
    template_type: 'badge_spotlight',
    layout_type: 'other',
    title: '',
    subtitle: null,
    cover_image_url: null,
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: [],
    starts_at: '',
    ends_at: '',
    sort_order: 0,
    is_active: true,
    created_at: '',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: null,
    image_source: null,
    ...overrides,
  }
}

// ── 생성 ① 노출 태그 ────────────────────────────────────────────────────────
export function genExposureTags(sections) {
  const rows = ['| 값 | 라벨 |', '|---|---|']
  for (const { value, label } of sections.TODAY_EXPOSURE_TAG_OPTIONS) {
    rows.push(`| \`${value}\` | ${label} |`)
  }
  return rows.join('\n')
}

// ── 생성 ② 템플릿 ──────────────────────────────────────────────────────────
const FIELD_LABELS = {
  badges: '배지',
  mission: '미션',
  itemBook: '컬렉션',
  region: '지역',
  body: '본문',
  description: '설명문',
  rankingMode: '랭킹모드',
  recipe: '레시피',
  targetHref: '이동경로(target_href)',
}

export function genTemplates(sections) {
  const { TODAY_TEMPLATE_OPTIONS, SUGGESTED_LAYOUT_FOR, TODAY_LAYOUT_OPTIONS, TODAY_FIELDS_FOR } = sections
  const layoutLabel = (value) => TODAY_LAYOUT_OPTIONS.find((o) => o.value === value)?.label ?? value
  const rows = ['| 값 | 라벨 | 추천 레이아웃 | 입력 필드 |', '|---|---|---|---|']
  for (const { value, label } of TODAY_TEMPLATE_OPTIONS) {
    const suggested = layoutLabel(SUGGESTED_LAYOUT_FOR[value])
    const used = Object.entries(TODAY_FIELDS_FOR[value] ?? {})
      .filter(([, on]) => on)
      .map(([key]) => FIELD_LABELS[key] ?? key)
    rows.push(`| \`${value}\` | ${label} | ${suggested} | ${used.length > 0 ? used.join('·') : '없음'} |`)
  }
  return rows.join('\n')
}

// ── 생성 ③ 컨텐츠 유형 카탈로그 ─────────────────────────────────────────────
export function genContentTypes(sections) {
  const rows = ['| 값 | 라벨 |', '|---|---|']
  for (const { value, label } of sections.TODAY_CONTENT_TYPE_OPTIONS) {
    rows.push(`| \`${value}\` | ${label} |`)
  }
  return rows.join('\n')
}

// ── 생성 ④ 레이아웃 ────────────────────────────────────────────────────────
export function genLayouts(sections) {
  const rows = ['| 값 | 라벨 |', '|---|---|']
  for (const { value, label } of sections.TODAY_LAYOUT_OPTIONS) {
    rows.push(`| \`${value}\` | ${label} |`)
  }
  return rows.join('\n')
}

// ── 생성 ④-1 카드 모양 목록 (티켓 20261001_2244) ──────────────────────────────
// 모양 값은 `CARD_SHAPES`(마이그레이션 206 today_cards_shape_check와 같은 목록), 이미지가 있는 모양은 `isImageShape`(이미지 제작 필요 신호의 단일 원천)다.
export function genCardShapes(shapeMod) {
  const { CARD_SHAPES, isImageShape } = shapeMod
  const rows = ['| 값 | 이미지 |', '|---|---|']
  for (const value of CARD_SHAPES) {
    rows.push(`| \`${value}\` | ${isImageShape(value) ? '있음 (이미지 제작 필요)' : '없음'} |`)
  }
  return rows.join('\n')
}

// ── 생성 ④-2 옛 값 → 새 모양 대응표 (티켓 20261001_2244) ───────────────────────
// `shape`가 없는 옛 카드의 모양을 `resolveShape`에 대표 입력(`fakeCard`)을 넣어 돌려 만든다 — 사람이 표를 따로 쓰지 않는다. 입력 조건은 이 함수가 정하고(예외 행 포함),
// 결과 칸만 코드가 채운다. `list`는 타일형·행형(`isRankingRows`)을 가르고, 타일이 0개인 타일형은 `fallbackEmptyTileShape`가 `brief`로 바꾼다.
const COVER = '{cover}'
const LAYOUT_CASES = {
  large_thumbnail: [
    ['커버 있음', { cover_image_url: COVER }],
    ['미션 소개 카드(`mission_spotlight`)', { template_type: 'mission_spotlight', cover_image_url: COVER }],
    ['커버 없음 · 배지가 걸려 있음(배지 그림이 있는지는 보지 않는다)', { badge_ids: ['{id}'] }],
    ['커버 없음 · 배지 없음', {}],
  ],
  badge_gallery: [
    ['배지가 1개 이상', { badge_ids: ['{id}'] }],
    ['배지가 0개(타일이 없다)', {}],
  ],
  shortcut: [['입력과 무관', {}]],
  banner: [
    ['커버 있음', { cover_image_url: COVER }],
    ['커버 없음', {}],
  ],
  other: [['입력과 무관', {}]],
  ranking_list: [['랭킹보드(`ranking_board`)', { template_type: 'ranking_board' }]],
}

export function genLegacyShapeMap(shapeMod, sections) {
  const { resolveShape, resourceOfTemplate, fallbackEmptyTileShape, isRankingRows } = shapeMod
  const labelOf = (value) => (sections.TODAY_LAYOUT_OPTIONS.find((o) => o.value === value)?.label ?? value).split(' — ')[0]

  const shapeOf = (card) => {
    const resource = resourceOfTemplate(card.template_type)
    const shape = fallbackEmptyTileShape(resolveShape(card), resource, card.badge_ids.length)
    if (shape !== 'list') return `\`${shape}\``
    return isRankingRows(resource) ? '`list` 행형' : '`list` 타일형'
  }

  const rows = ['| 옛 레이아웃 | 조건 | 새 모양 |', '|---|---|---|']
  const add = (layout, condition, fields) => {
    const card = fakeCard({ layout_type: layout, ...fields })
    rows.push(`| \`${layout}\` (${labelOf(layout)}) | ${condition} | ${shapeOf(card)} |`)
  }
  for (const { value: layout } of sections.TODAY_LAYOUT_OPTIONS) {
    for (const [condition, fields] of LAYOUT_CASES[layout] ?? [['입력과 무관', {}]]) add(layout, condition, fields)
  }

  // 레이아웃과 상관없는 예외 — 기사·저장된 모양·알 수 없는 값
  const other = (label, card) => rows.push(`| 모든 레이아웃 | ${label} | ${shapeOf(card)} |`)
  other('기사(`editorial_article`)는 레이아웃과 상관없이', fakeCard({ template_type: 'editorial_article', layout_type: 'shortcut' }))
  other('저장된 `shape`가 모양 값이면 옛 값과 상관없이 그 값(예: `poster`)', fakeCard({ shape: 'poster', layout_type: 'shortcut' }))
  other('목록에 없는 레이아웃 값은 큰 썸네일형으로 본다', fakeCard({ layout_type: '{unknown}', cover_image_url: COVER }))

  return rows.join('\n')
}

// ── 생성 ⑤ 이동 목적지 ─────────────────────────────────────────────────────
export function genDestinations(targetHrefMod) {
  const { resolveTargetHref, resolveArticleCtaTarget } = targetHrefMod

  const rows = [
    '카드 자신의 이동 경로(피드에서 카드를 눌렀을 때 이동하는 곳, `resolveTargetHref`) — 템플릿별 대표 입력:',
    '',
    '| 템플릿 | 입력 | 결과 href |',
    '|---|---|---|',
  ]
  const add = (template, desc, cardFields = {}, ctx = {}) => {
    const href = resolveTargetHref(fakeCard({ template_type: template, ...cardFields }), ctx)
    rows.push(`| \`${template}\` | ${desc} | \`${href}\` |`)
  }

  for (const template of ['badge_spotlight', 'location_trend']) {
    add(template, '배지 0개', {})
    add(template, '배지 1개', { badge_ids: ['{id}'] })
    add(template, '배지 여러 개', { badge_ids: ['{id-1}', '{id-2}'] })
    add(template, 'target_href 명시', { target_href: '{target_href}' })
  }

  add('progress_nudge', '배지 0개 · 미션 없음', {})
  add('progress_nudge', '배지 0개 · 미션 있음', { mission_id: '{id}' })
  add('progress_nudge', '배지 1개 이상(미션 유무와 무관, 배지 우선)', { badge_ids: ['{id}'], mission_id: '{id}' })
  add('progress_nudge', 'target_href 명시', { target_href: '{target_href}' })

  add('mission_spotlight', '미션 없음', {})
  add('mission_spotlight', '미션 있음', { mission_id: '{id}' })
  add('mission_spotlight', 'target_href 명시', { target_href: '{target_href}' })

  add('itembook_milestone', '컬렉션 없음', {})
  add('itembook_milestone', '컬렉션 있음', { item_book_id: '{id}' })
  add('itembook_milestone', 'target_href 명시', { target_href: '{target_href}' })

  add('drop_alert', '입력과 무관(고정)', {})

  add('recipe_reveal', '레시피 유무와 무관(공개 전·후 같다, 레시피별 주소는 없다)', { recipe_id: '{id}' })
  add('recipe_reveal', 'target_href 명시', { target_href: '{target_href}' })

  add('ranking_board', '미션 참가자 대상 맥락 있음', {}, { rankingModeTargetMissionId: '{id}' })
  add('ranking_board', '미션 참가자 대상 맥락 없음(수동 지정 유저 대상)', {}, {})
  add('ranking_board', 'target_href 명시', { target_href: '{target_href}' })

  add(
    'editorial_article',
    '입력과 무관(카드 자신의 id로 고정, target_href·미션·컬렉션 입력은 무시)',
    { target_href: '{target_href}', mission_id: '{id}', item_book_id: '{id}' }
  )

  rows.push('')
  rows.push('기사 본문 CTA 버튼의 목적지(`editorial_article` 전용, `resolveArticleCtaTarget`) — 우선순위:')
  rows.push('')
  rows.push('| 조건 | href | kind |')
  rows.push('|---|---|---|')
  const ctaRow = (desc, cardFields) => {
    const result = resolveArticleCtaTarget(fakeCard({ template_type: 'editorial_article', ...cardFields }))
    rows.push(`| ${desc} | ${result ? `\`${result.href}\`` : '(CTA 없음)'} | ${result ? `\`${result.kind}\`` : '-'} |`)
  }
  ctaRow('target_href 명시', { target_href: '{target_href}' })
  ctaRow('target_href 없음 · 컬렉션 있음', { item_book_id: '{id}' })
  ctaRow('target_href·컬렉션 없음 · 미션 있음', { mission_id: '{id}' })
  ctaRow('셋 다 없음', {})

  return rows.join('\n')
}

// ── frontmatter의 code: 목록 파싱 (스칼라만 다루는 gen-team-doc.mjs의 parseFrontmatter로는
//    목록 값을 못 읽어 전용 파서를 둔다) ──────────────────────────────────────
export function parseCodePaths(docText) {
  if (!docText.startsWith('---')) return []
  const end = docText.indexOf('\n---', 3)
  if (end === -1) return []
  const lines = docText.slice(4, end).split('\n')
  const out = []
  let inCode = false
  for (const line of lines) {
    if (/^code:\s*$/.test(line)) {
      inCode = true
      continue
    }
    if (!inCode) continue
    const item = line.match(/^\s*-\s*"?([^"]+?)"?\s*$/)
    if (item) {
      out.push(item[1])
      continue
    }
    if (/^\S/.test(line)) inCode = false // 들여쓰기 없는 다음 키를 만나면 code: 목록이 끝난다
  }
  return out
}

export function isTestFile(filePath) {
  return /(^|\/)__tests__\//.test(filePath) || /\.test\.[^/.]+$/.test(filePath)
}

export function underCodePaths(filePath, codePaths) {
  return codePaths.some((c) => filePath === c || filePath.startsWith(`${c}/`))
}

// ── 진입점 ───────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const MODE_CHECK = process.argv.includes('--check')
  const MODE_STAGED = process.argv.includes('--staged')
  const docFile = path.join(REPO, DOC_PATH)

  if (MODE_STAGED) {
    runStagedCheck(REPO, docFile)
  } else {
    await runGenerate(REPO, docFile, MODE_CHECK)
  }
}

function runStagedCheck(repo, docFile) {
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8', cwd: repo })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  if (staged.includes(DOC_PATH)) process.exit(0)
  if (!existsSync(docFile)) process.exit(0) // 문서가 아직 없으면(이 티켓 병합 전) 검사할 게 없다

  const codePaths = parseCodePaths(readFileSync(docFile, 'utf8'))
  const hits = staged.filter((f) => underCodePaths(f, codePaths) && !isTestFile(f))
  if (hits.length === 0) process.exit(0)

  console.error('')
  console.error('차단(pre-commit): 홈피드 코드가 스테이지됐는데 기능 정의 문서가 함께 스테이지되지 않았습니다.')
  console.error('  홈피드 코드로 판정된 파일:')
  for (const f of hits) console.error(`    - ${f}`)
  console.error(`  고칠 문서: ${DOC_PATH}`)
  console.error('  4·5·6·7절 표(노출 태그·템플릿·레이아웃·이동 목적지)가 바뀌었다면:')
  console.error('    node scripts/gen-home-feed-doc.mjs')
  console.error('  그 외 서술이 바뀌었다면 해당 절을 직접 고쳐서 함께 스테이지하세요.')
  console.error('  동작이 바뀌지 않은 변경(리팩터링 등)이면 JAM_SKIP_DOCLINT=1로 우회하고')
  console.error('  커밋 메시지에 사유를 남기세요.')
  process.exit(1)
}

function checkNodeVersionOrExit() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major > 22 || (major === 22 && minor >= 18)) return
  console.error('gen-home-feed-doc: 이 스크립트는 .ts 파일을 타입 제거로 직접 import합니다.')
  console.error(`  Node 22.18 이상이 필요합니다 (현재: v${process.versions.node}).`)
  process.exit(2)
}

async function loadCodeModules(repo) {
  checkNodeVersionOrExit()
  // today-sections.ts·targetHref.ts를 값으로 import하면 Node 로더가 "type 필드 없는
  // package.json" 경고를 stderr에 직접 찍는다(실측: process.on('warning', ...)로 잡히지 않고
  // 로더가 별도로 출력한다). jam-web/package.json에 "type": "module"을 추가하는 것은 이
  // 티켓의 범위 밖이라 억제하지 않는다 — 종료 코드에는 영향 없는 경고성 출력이다.
  const [sections, targetHref, shape] = await Promise.all([
    import(pathToFileURL(path.join(repo, TODAY_SECTIONS_PATH)).href),
    import(pathToFileURL(path.join(repo, TARGET_HREF_PATH)).href),
    import(pathToFileURL(path.join(repo, SHAPE_PATH)).href),
  ])
  return { sections, targetHref, shape }
}

async function runGenerate(repo, docFile, checkOnly) {
  if (!existsSync(docFile)) {
    console.error(`gen-home-feed-doc: 문서가 없습니다: ${DOC_PATH}`)
    process.exit(2)
  }

  const { sections, targetHref, shape } = await loadCodeModules(repo)
  const blocks = {
    'exposure-tags': genExposureTags(sections),
    templates: genTemplates(sections),
    'content-types': genContentTypes(sections),
    layouts: genLayouts(sections),
    'card-shapes': genCardShapes(shape),
    'legacy-shape-map': genLegacyShapeMap(shape, sections),
    destinations: genDestinations(targetHref),
  }

  let doc = readFileSync(docFile, 'utf8')
  const original = doc
  const missing = []

  for (const name of BLOCK_ORDER) {
    const begin = `<!-- BEGIN generated: ${name} -->`
    const end = `<!-- END generated: ${name} -->`
    const b = doc.indexOf(begin)
    const e = doc.indexOf(end)
    if (b === -1 || e === -1 || e < b) {
      missing.push(name)
      continue
    }
    const before = doc.slice(0, b + begin.length)
    const after = doc.slice(e)
    doc = `${before}\n${blocks[name]}\n${after}`
  }

  if (missing.length > 0) {
    console.error(`gen-home-feed-doc: 생성 구간 표시가 없습니다: ${missing.join(', ')}`)
    console.error(`  ${DOC_PATH}에 <!-- BEGIN generated: 이름 --> 와 <!-- END generated: 이름 --> 를 넣으세요.`)
    process.exit(2)
  }

  if (checkOnly) {
    if (doc === original) {
      console.log('home-feed PRD 생성 구간이 최신입니다.')
      process.exit(0)
    }
    console.error('')
    console.error(`${DOC_PATH}의 생성 구간이 today-sections.ts·targetHref.ts·shape.ts와 다릅니다.`)
    console.error('  표를 손으로 고치지 말고 아래를 실행하세요:')
    console.error('')
    console.error('    node scripts/gen-home-feed-doc.mjs')
    console.error('')
    process.exit(1)
  }

  if (doc === original) {
    console.log('home-feed PRD 생성 구간이 이미 최신입니다.')
  } else {
    writeFileSync(docFile, doc)
    console.log('home-feed PRD 생성 구간을 갱신했습니다.')
  }
}
