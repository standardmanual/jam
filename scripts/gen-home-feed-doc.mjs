#!/usr/bin/env node
// gen-home-feed-doc — docs/service/prd/home-feed/PRD.md의 생성 구간(노출 태그·템플릿·컨텐츠
// 유형·카드 유형 목록·이동 목적지 표)을 코드 상수·순수 함수에서 만든다 (티켓 20260927_2036, 20261001_2244, 옛 7모양 표는 20261122_1328에서 걷고 카드 유형 표로 바꿨다).
//
// 배경: 홈피드 기능 정의가 여러 문서에 흩어져 있고 코드가 바뀌어도 문서가 따라오지 않아
// 여러 건이 낡았다. 표 부분은 손으로 옮겨 적지 않고 원천(today-sections.ts·targetHref.ts)에서
// 매번 다시 만든다. 문서의 서술(생성 구간 밖 본문)은 사람이 쓴다.
//
// 이 스크립트가 두 가지 검사를 겸한다.
//   ① 생성 구간이 코드와 같은 최신본인지 (--check)
//   ② 스테이지된 홈피드 코드 변경에 문서(code: 목록 아래 경로)가 함께 스테이지됐는지 (--staged)
//      시험 파일·스토리 파일(*.stories.*)과, 주석·import·export 표기·공백만 바뀐 파일은 감시에서 뺀다(티켓 20261126_0948)
// 머지 커밋은 pre-commit을 거치지 않는다(이 저장소에 pre-merge-commit 훅 없음, 2026-09-27
// .githooks/ 확인) — staging으로 머지될 때는 이 스크립트가 돌지 않는다.
//
// today-sections.ts·targetHref.ts·feedChipSlots.ts·feedTypeLabels.ts는 Node의 .ts 직접 import(타입 제거)로 읽는다. 네 파일이
// `import type`만 쓰기 때문에 가능하다(값 import가 섞이면 이 방식이 깨진다, 확인 2026-09-27).
// 타입 제거는 Node 22.18 이상에서 플래그 없이 동작한다(실측 v22.22.2, CI는
// .github/workflows/verify.yml 기준 Node 24).
//
// 사용법:
//   node scripts/gen-home-feed-doc.mjs           생성 구간을 갱신한다
//   node scripts/gen-home-feed-doc.mjs --check   생성 구간이 최신인지만 판정한다 (다르면 종료 코드 1)
//   node scripts/gen-home-feed-doc.mjs --staged  스테이지된 홈피드 코드에 문서가 함께 있는지 검사한다
//                                                (스토리 파일과 주석·import·export 표기만 바뀐 파일은 제외)

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const DOC_PATH = 'docs/service/prd/home-feed/PRD.md'
export const TODAY_SECTIONS_PATH = 'jam-web/src/lib/admin/today-sections.ts'
export const TARGET_HREF_PATH = 'jam-web/src/lib/today/targetHref.ts'
export const FEED_CHIP_SLOTS_PATH = 'jam-web/src/lib/today/feedChipSlots.ts'
export const FEED_TYPE_LABELS_PATH = 'jam-web/src/lib/admin/feedTypeLabels.ts'

const BLOCK_ORDER = [
  'exposure-tags',
  'templates',
  'content-types',
  'feed-types',
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
  rankingMode: '랭킹모드',
  recipe: '레시피',
  targetHref: '이동경로(target_href)',
}

export function genTemplates(sections) {
  const { TODAY_TEMPLATE_OPTIONS, TODAY_FIELDS_FOR } = sections
  const rows = ['| 값 | 라벨 | 입력 필드 |', '|---|---|---|']
  for (const { value, label } of TODAY_TEMPLATE_OPTIONS) {
    const used = Object.entries(TODAY_FIELDS_FOR[value] ?? {})
      .filter(([, on]) => on)
      .map(([key]) => FIELD_LABELS[key] ?? key)
    rows.push(`| \`${value}\` | ${label} | ${used.length > 0 ? used.join('·') : '없음'} |`)
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

// ── 생성 ④ 카드 유형 (티켓 20261122_1328) ─────────────────────────────────────
// 유형 값은 `FEED_TYPES`(`today_cards.feed_type`이 받는 값), 이름은 운영자가 보는 `FEED_TYPE_LABELS`다. 옛 7모양 표(모양 목록·옛 값 → 새 모양 대응표)와
// 레이아웃 표는 홈이 옛 모양을 그리지 않게 되어(티켓 20261122_1100) 걷었다.
export function genFeedTypes(feedChipSlotsMod, feedTypeLabelsMod) {
  const { FEED_TYPES } = feedChipSlotsMod
  const { FEED_TYPE_LABELS } = feedTypeLabelsMod
  const rows = ['| 값 | 이름 |', '|---|---|']
  for (const value of FEED_TYPES) {
    rows.push(`| \`${value}\` | ${FEED_TYPE_LABELS[value] ?? value} |`)
  }
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

  add('content_intro', 'target_href 명시(등록 검사가 필수로 요구한다)', { target_href: '{target_href}' })
  add('content_intro', 'target_href 없음(안전망)', {})

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

export function isStoryFile(filePath) {
  return /\.stories\.[^/.]+$/.test(filePath)
}

// 동작 비교용 정규화(티켓 20261126_0948): 주석·import 선언·re-export 줄·선언 앞 export 표기·공백을 걷는다.
export function stripNeutral(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // 블록 주석(JSX {/* */} 포함)
    .replace(/(^|\s)\/\/[^\n]*/g, '$1') // 줄 주석 — 'https://' 처럼 앞이 공백이 아닌 //는 건드리지 않는다
    .replace(/^[ \t]*import\b(?!\s*[(.])[^'"]*?['"][^'"\n]*['"][ \t]*;?/gm, '') // import 선언(여러 줄·type·부수효과)
    .replace(/^[ \t]*export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*['"][^'"\n]*['"][ \t]*;?/gm, '') // re-export
    .replace(/\bexport\s+(?:default\s+)?(?=(?:async\s+function|function|const|let|class|type|interface|enum)\b)/g, '')
    .replace(/\s+/g, '')
}

export function isBehaviorNeutral(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return false
  return stripNeutral(before) === stripNeutral(after)
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

function gitShow(repo, spec) {
  try {
    return execFileSync('git', ['show', spec], { encoding: 'utf8', cwd: repo, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return null
  }
}

// `git diff --cached --name-status -M -z` 출력을 (상태, 옛 경로, 새 경로)로 나눈다.
function parseNameStatus(raw) {
  const tokens = raw.split('\0')
  const out = []
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i]
    if (!status) continue
    if (status[0] === 'R' || status[0] === 'C') {
      out.push({ status: status[0], oldPath: tokens[i + 1], newPath: tokens[i + 2] })
      i += 2
    } else {
      out.push({ status: status[0], oldPath: tokens[i + 1], newPath: tokens[i + 1] })
      i += 1
    }
  }
  return out
}

function runStagedCheck(repo, docFile) {
  const entries = parseNameStatus(
    execFileSync('git', ['diff', '--cached', '--name-status', '-M', '-z'], { encoding: 'utf8', cwd: repo })
  )
  const staged = entries.flatMap((e) => [e.oldPath, e.newPath])

  if (staged.includes(DOC_PATH)) process.exit(0)
  if (!existsSync(docFile)) process.exit(0) // 문서가 아직 없으면(이 티켓 병합 전) 검사할 게 없다

  const codePaths = parseCodePaths(readFileSync(docFile, 'utf8'))
  const candidates = entries.filter((e) => {
    const paths = [e.oldPath, e.newPath]
    if (!paths.some((f) => underCodePaths(f, codePaths))) return false
    return !paths.every((f) => isTestFile(f) || isStoryFile(f))
  })

  const neutral = []
  const hits = []
  for (const e of candidates) {
    const paired = e.status === 'M' || e.status === 'R'
    const before = paired ? gitShow(repo, `HEAD:${e.oldPath}`) : null
    const after = paired ? gitShow(repo, `:${e.newPath}`) : null
    if (isBehaviorNeutral(before, after)) neutral.push(e.newPath)
    else hits.push(e.newPath)
  }

  if (neutral.length > 0) {
    console.error('안내(pre-commit): 주석·import·export 표기만 바뀌어 홈피드 문서 동반을 요구하지 않습니다')
    for (const f of neutral) console.error(`    - ${f}`)
  }
  if (hits.length === 0) process.exit(0)

  console.error('')
  console.error('차단(pre-commit): 홈피드 코드가 스테이지됐는데 기능 정의 문서가 함께 스테이지되지 않았습니다.')
  console.error('  홈피드 코드로 판정된 파일:')
  for (const f of hits) console.error(`    - ${f}`)
  console.error(`  고칠 문서: ${DOC_PATH}`)
  console.error('  4·5·6·7절 표(노출 태그·템플릿·카드 유형·이동 목적지)가 바뀌었다면:')
  console.error('    node scripts/gen-home-feed-doc.mjs')
  console.error('  그 외 서술이 바뀌었다면 해당 절을 직접 고쳐서 함께 스테이지하세요.')
  console.error('  주석·import·export 표기만 바뀐 파일은 자동으로 제외된다. 그 밖의 동작 무변경 리팩터링이면')
  console.error('  JAM_SKIP_DOCLINT=1로 우회하고 커밋 메시지에 사유를 남기세요.')
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
  const [sections, targetHref, feedChipSlots, feedTypeLabels] = await Promise.all([
    import(pathToFileURL(path.join(repo, TODAY_SECTIONS_PATH)).href),
    import(pathToFileURL(path.join(repo, TARGET_HREF_PATH)).href),
    import(pathToFileURL(path.join(repo, FEED_CHIP_SLOTS_PATH)).href),
    import(pathToFileURL(path.join(repo, FEED_TYPE_LABELS_PATH)).href),
  ])
  return { sections, targetHref, feedChipSlots, feedTypeLabels }
}

async function runGenerate(repo, docFile, checkOnly) {
  if (!existsSync(docFile)) {
    console.error(`gen-home-feed-doc: 문서가 없습니다: ${DOC_PATH}`)
    process.exit(2)
  }

  const { sections, targetHref, feedChipSlots, feedTypeLabels } = await loadCodeModules(repo)
  const blocks = {
    'exposure-tags': genExposureTags(sections),
    templates: genTemplates(sections),
    'content-types': genContentTypes(sections),
    'feed-types': genFeedTypes(feedChipSlots, feedTypeLabels),
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
    console.error(`${DOC_PATH}의 생성 구간이 today-sections.ts·targetHref.ts·feedChipSlots.ts·feedTypeLabels.ts와 다릅니다.`)
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
