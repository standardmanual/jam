#!/usr/bin/env node
/**
 * JAM 2.0 새 액티비티 배지 계열 시드 SQL 생성기 (티켓 20261018_1816 3회)
 *
 * 원고 `docs/plan/jam2/tribe-rethink/manuscript/06 액티비티 배지.md`의 2절(계열 표), 4절(종목별 값), 11절(이름·설명·조건 표기)을
 * 파싱해 마이그레이션 `245_seed_new_activity_badge_families.sql`을 만든다. 이 스크립트는 DB에 접속하지 않는다.
 * SQL의 실행은 사용자 승인과 롤백 실측 뒤 카리나가 한다.
 *
 * 사용법 (jam-web 폴더에서)
 *   node scripts/gen-new-activity-badge-families.mjs                 # 기본 경로에 쓴다
 *   node scripts/gen-new-activity-badge-families.mjs --out <경로>    # 다른 곳에 쓴다
 *   node scripts/gen-new-activity-badge-families.mjs --stdout        # 파일 대신 표준출력
 *   node scripts/gen-new-activity-badge-families.mjs --include-held  # 보류 계열(3-2)까지 넣어 만든다(기본은 뺀다)
 *
 * 입력 대상 15계열 가운데 3-2는 기본으로 뺀다(HELD_FAMILIES). 사유는 그 상수에 적었다.
 *
 * 번호 대조(verifyNumbering): 계열마다 아래 셋이 어긋나면 던진다. 어긋난 채 SQL을 만들지 않는다.
 *   ① 원고 2절의 조건·종류·단계 수 ↔ 11절 제목·표 머리·행 수 ↔ 11절 조건 표기의 숫자
 *   ② 2절의 «단계(임시 값)»에 숫자가 있으면 11절 조건 표기의 숫자와 같은지
 *   ③ 재활용 후보 문서 2절의 분류가 «새로 만듦»이고 조건 이름이 같은지
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')

export const MANUSCRIPT_PATH = path.join(REPO_ROOT, 'docs/plan/jam2/tribe-rethink/manuscript/06 액티비티 배지.md')
export const RECYCLE_PATH = path.join(REPO_ROOT, 'docs/plan/jam2/service-redesign/액티비티 배지 재활용 후보.md')
export const CHECK_MIGRATION_PATH = path.join(HERE, '..', 'supabase/migrations/242_condition_json_new_jam_keys.sql')
export const DEFAULT_OUT_PATH = path.join(HERE, '..', 'supabase/migrations/245_seed_new_activity_badge_families.sql')

export const MIGRATION_FILE_NAME = '245_seed_new_activity_badge_families.sql'

/**
 * @typedef {object} FamilyDef
 * @property {string} key condition_json의 측정 키
 * @property {'int'|'km'|'minutes'} parse 11절 조건 표기에서 값을 읽는 방식
 * @property {'walking'|'sports'|'jam'} scope
 * @property {string} branch branch_key
 * @property {Record<string, unknown>} [extra] 모든 단계에 같이 들어가는 고정 조건(3-2의 시간대)
 * @property {string | Record<string, string>} image 이미지를 복사할 기존 family_key(종목별이면 종목마다)
 *
 * @typedef {object} SeedRow
 * @property {string} number 원고 번호
 * @property {string} name
 * @property {string} description
 * @property {'activity'} type
 * @property {'common'|'rare'|'epic'|'mystic'|null} rarity
 * @property {number|null} level
 * @property {string} family_key
 * @property {number} sort_order
 * @property {Record<string, unknown>} condition_json
 * @property {string[]} activity_types
 * @property {number} point_reward
 * @property {boolean} is_hidden
 * @property {string} branch_key
 * @property {string|null} admin_category
 * @property {{src_family_key: string, pos: number, total: number}} image
 */

// ── 규칙 상수 ──────────────────────────────────────────────────────────────

/** 등급형 포인트(티켓 사용자 결정·묶음 7 일괄 값). 레벨형은 레벨마다 10, 숨김은 0이다 */
/** @type {Record<'common'|'rare'|'epic'|'mystic', number>} */
export const RARITY_POINTS = { common: 10, rare: 20, epic: 50, mystic: 100 }
export const LEVEL_POINT = 10

/** 등급형·구간 계열의 단계 수 → 등급(앞에서부터) */
/** @type {Record<number, ('common'|'rare'|'epic'|'mystic')[]>} */
const RARITIES_BY_COUNT = {
  3: ['common', 'rare', 'epic'],
  4: ['common', 'rare', 'epic', 'mystic'],
}

const SPORTS = ['walking', 'running', 'trail_running', 'cycling', 'hiking']

/**
 * 입력 대상 15계열(원고 번호). 사용자 결정 3(2026-10-19): 엔진 판정이 없는 12계열은 이번에 넣지 않으므로
 * 판정 키가 이미 있는 8계열(3-2, 6-1, 6-2, 8-3, 8-6, 8-7, 8-11, 8-12)과 4-4가 더한 키로 판정되는 7계열이 남는다.
 */
export const TARGET_NUMBERS = [
  '3-2', '6-1', '6-2', '7-1', '7-2', '8-1', '8-2', '8-3', '8-6', '8-7', '8-8', '8-9', '8-10', '8-11', '8-12',
]

/**
 * 기본으로 뺀 계열과 사유. `--include-held`를 주면 넣어서 만든다.
 *
 * 3-2(저녁 활동): 원고가 종목마다 값만 다르고 «이름은 하나»인 종목별 등급형이다. 종목마다 따로 세려면 종목별 계열 5개가 필요한데,
 * 메인 엔진의 등급형 후보 선정이 «이름»으로 묶는다(`index.ts` `badgesByName`·`highestOwnedTierByName`, `usageBadges.ts` `gradedByName`).
 * 이름이 같은 5계열은 한 묶음이 되어 두 종목을 함께 하는 유저는 한 종목의 상위 등급이 다른 종목의 낮은 등급을 영영 막고,
 * 한 번에 최상위 1개만 발급된다. 계열 키를 나눠도 이 묶음은 풀리지 않는다. 이름을 종목마다 다르게 하거나 엔진을 계열 키로
 * 묶게 고치는 일은 이 티켓 범위 밖의 결정이라 입력하지 않고 보고한다.
 */
/** @type {Record<string, string>} */
export const HELD_FAMILIES = {
  '3-2': '종목별 등급형인데 이름이 하나라, 엔진이 등급형을 이름으로 묶는 탓에 종목 사이에 상위 등급이 하위 등급을 막는다',
}

/**
 * 계열별 입력 정의. 이름·설명·값은 원고에서 읽고, 여기에는 원고에 없는 매핑(조건 키, 가지, 계열 키, 이미지 원본)만 둔다.
 *  - key: condition_json의 측정 키. parse: 11절 «조건 표기»에서 값을 읽는 방식
 *  - scope: 'walking'(걷기 한 번의 활동), 'sports'(종목별), 'jam'(JAM! 지표, activity_types 빈 배열 + admin_category 'jam')
 *  - image: 이미지를 복사할 기존 배지의 family_key(종목별 계열은 종목마다)
 */
/** @type {Record<string, FamilyDef>} */
export const FAMILY_DEFS = {
  '3-2': {
    key: 'total_count', parse: 'int', scope: 'sports', branch: 'time_season',
    extra: { time_range: { start: '18:00', end: '22:00' } },
    image: {
      walking: 'walking:A8', running: 'running:T1', trail_running: 'trail_running:T1', cycling: 'cycling:D1', hiking: 'hiking:D1',
    },
  },
  '6-1': { key: 'single_distance_km', parse: 'km', scope: 'walking', branch: 'attribute', image: 'walking:K1' },
  '6-2': { key: 'duration_minutes', parse: 'minutes', scope: 'walking', branch: 'attribute', image: 'walking:P1' },
  '7-1': { key: 'jam_total_earned', parse: 'int', scope: 'jam', branch: 'milestone', image: 'walking:K1' },
  '7-2': { key: 'jam_weekly_earned', parse: 'int', scope: 'jam', branch: 'milestone', image: 'walking:P2' },
  '8-1': { key: 'capsule_open_count', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:K3' },
  '8-2': { key: 'locked_item_open_count', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:P1' },
  '8-3': { key: 'combine_success_count', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:S1' },
  '8-6': { key: 'collection_complete_count', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:K1' },
  '8-7': { key: 'mission_complete_count', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:K3' },
  '8-8': { key: 'chapter_reached', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:A8' },
  '8-9': { key: 'other_tribe_item_kinds_count', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:K1' },
  '8-10': { key: 'cross_tribe_combine_success_count', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:A6' },
  '8-11': { key: 'follower_count', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:K3' },
  '8-12': { key: 'following_count', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:K1' },
}

/** 가지 번호(원고 번호의 앞자리) → branch_key. 마이그레이션 243 제약의 값과 같다 */
/** @type {Record<number, string>} */
export const BRANCH_OF_NUMBER = {
  1: 'rhythm', 2: 'recovery', 3: 'time_season', 5: 'explore', 6: 'attribute', 7: 'milestone', 8: 'jam_activity',
}

// ── 원고 파싱 ──────────────────────────────────────────────────────────────

function splitRow(line) {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  return cells.map((c) => c.trim())
}

function sectionBetween(text, startRe, endRe) {
  const start = text.search(startRe)
  if (start < 0) throw new Error(`원고에서 구간 시작을 찾지 못했다: ${startRe}`)
  const rest = text.slice(start)
  const endRel = rest.slice(1).search(endRe)
  return endRel < 0 ? rest : rest.slice(0, endRel + 1)
}

/** 2절 계열 표: 번호 → { condition, kindText, steps, sports } */
export function parseFamilyList(manuscript) {
  const section = sectionBetween(manuscript, /^## 2\. 계열 목록/m, /^## 3\. /m)
  const out = new Map()
  for (const line of section.split('\n')) {
    const m = line.match(/^\| (\d+-\d+) \|/)
    if (!m) continue
    const cells = splitRow(line)
    // 번호 | 조건 | 종류 | 단계(임시 값) | 종목 | 메모 | 상태 | 의견
    out.set(cells[0], { number: cells[0], condition: cells[1], kindText: cells[2], stepsText: cells[3], sportsText: cells[4] })
  }
  return out
}

/** 4절 «기준 사다리 | 걷기, 러닝, 자전거 | 트레일러닝 | 등산» 표 → [{ base, byGroup }] */
export function parseSportLadders(manuscript) {
  const section = sectionBetween(manuscript, /^## 4\. 종목별 값의 임시 기준/m, /^## 5\. /m)
  const ladders = []
  for (const line of section.split('\n')) {
    if (!/^\| \d+(·\d+)+ \|/.test(line)) continue
    const cells = splitRow(line)
    const nums = (s) => s.split('·').map((x) => Number(x.replace(/,/g, '')))
    ladders.push({ base: nums(cells[0]), walkRunCycle: nums(cells[1]), trail: nums(cells[2]), hiking: nums(cells[3]) })
  }
  return ladders
}

/** 11절 계열 소절: 번호 → { number, title, name(레벨형 제목의 이름), narrative, header, rows } */
export function parseNamesAndDescriptions(manuscript) {
  const section = sectionBetween(manuscript, /^## 11\. 이름과 설명/m, /^### 11\.9 /m)
  const lines = section.split('\n')
  const out = new Map()
  let current = null
  for (const line of lines) {
    const h = line.match(/^#### (\d+-\d+)\. (.+)$/)
    if (h) {
      const [titlePart, namePart] = h[2].split(' · 이름: ')
      current = { number: h[1], title: titlePart.trim(), name: namePart ? namePart.trim() : null, narrative: '', header: null, rows: [] }
      out.set(current.number, current)
      continue
    }
    if (!current) continue
    if (line.startsWith('> 서사:')) {
      current.narrative = line.replace(/^> 서사:\s*/, '').trim()
      continue
    }
    if (line.startsWith('|')) {
      const cells = splitRow(line)
      if (!current.header) current.header = cells
      else if (/^-+$/.test(cells[0].replace(/:/g, ''))) continue
      else current.rows.push(cells)
    }
  }
  return out
}

/** 재활용 후보 문서 2절 대조표: 번호 → { condition, category } */
export function parseRecycleTable(recycleText) {
  const section = sectionBetween(recycleText, /^## 2\. 대조표/m, /^## 3\. /m)
  const out = new Map()
  for (const line of section.split('\n')) {
    const m = line.match(/^\| (\d+-\d+) \|/)
    if (!m) continue
    const cells = splitRow(line)
    out.set(cells[0], { number: cells[0], condition: cells[1], category: cells[2] })
  }
  return out
}

// ── 값 읽기 ────────────────────────────────────────────────────────────────

function numbersIn(text) {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((s) => Number(s.replace(/,/g, '')))
}

/** 11절 조건 표기에서 값을 읽는다. 읽은 값이 정확히 하나가 아니면 던진다 */
export function parseThreshold(text, mode, ctx) {
  if (mode === 'km') {
    const m = text.match(/(\d[\d,]*(?:\.\d+)?)\s*km/)
    if (!m) throw new Error(`${ctx}: km 값을 읽지 못했다 («${text}»)`)
    return Number(m[1].replace(/,/g, ''))
  }
  if (mode === 'minutes') {
    const h = text.match(/(\d+)\s*시간/)
    const mi = text.match(/(\d+)\s*분/)
    if (!h && !mi) throw new Error(`${ctx}: 시간·분 값을 읽지 못했다 («${text}»)`)
    return (h ? Number(h[1]) * 60 : 0) + (mi ? Number(mi[1]) : 0)
  }
  const nums = numbersIn(text)
  if (nums.length !== 1) throw new Error(`${ctx}: 조건 표기에서 숫자 하나를 기대했지만 ${nums.length}개다 («${text}»)`)
  return nums[0]
}

/** 2절 «단계(임시 값)»의 숫자 목록. 숫자가 없으면(예: «걷기 경계값») null */
function stepsFromList(stepsText) {
  const pieces = stepsText.split('·')
  const nums = []
  for (const p of pieces) {
    const n = numbersIn(p)
    if (n.length !== 1) return null
    nums.push(n[0])
  }
  return nums
}

function kindFromList(kindText) {
  const m = kindText.match(/^(등급형|구간|레벨형) (\d+)(?:단|레벨)$/)
  if (!m) throw new Error(`지원하지 않는 종류 표기: «${kindText}»`)
  return { kind: m[1] === '레벨형' ? 'leveled' : 'graded', interval: m[1] === '구간', count: Number(m[2]) }
}

// ── 번호 대조 ──────────────────────────────────────────────────────────────

/**
 * 15계열의 원고 번호 대조. 통과하면 계열마다 읽은 값(thresholds)과 종류를 돌려준다.
 * @returns {Map<string, {number: string, title: string, kind: 'graded'|'leveled', interval: boolean, count: number, thresholds: number[], names: string[], descriptions: string[]}>}
 */
export function verifyNumbering({ manuscript, recycle, numbers = TARGET_NUMBERS }) {
  const list = parseFamilyList(manuscript)
  const sections = parseNamesAndDescriptions(manuscript)
  const recycleTable = parseRecycleTable(recycle)
  const result = new Map()

  for (const number of numbers) {
    const def = FAMILY_DEFS[number]
    if (!def) throw new Error(`${number}: FAMILY_DEFS에 정의가 없다`)
    const ctx = `번호 대조 ${number}`
    const row = list.get(number)
    if (!row) throw new Error(`${ctx}: 원고 2절 계열 표에 없다`)
    const sec = sections.get(number)
    if (!sec) throw new Error(`${ctx}: 원고 11절에 소절이 없다`)
    const recycleRow = recycleTable.get(number)
    if (!recycleRow) throw new Error(`${ctx}: 재활용 후보 문서 2절에 없다`)

    // ① 2절 ↔ 11절
    if (sec.title !== row.condition) {
      throw new Error(`${ctx}: 2절 조건 «${row.condition}»과 11절 제목 «${sec.title}»이 다르다`)
    }
    const { kind, interval, count } = kindFromList(row.kindText)
    if (sec.rows.length !== count) {
      throw new Error(`${ctx}: 2절은 ${count}단인데 11절 표는 ${sec.rows.length}행이다`)
    }
    const expectedHeader = kind === 'leveled' ? ['레벨', '조건 표기', '설명'] : ['등급', interval ? '구간 이름' : '이름', '조건 표기', '설명']
    if (JSON.stringify(sec.header) !== JSON.stringify(expectedHeader)) {
      throw new Error(`${ctx}: 11절 표 머리 «${sec.header?.join('|')}»가 기대 «${expectedHeader.join('|')}»와 다르다`)
    }
    if (kind === 'leveled' && !sec.name) throw new Error(`${ctx}: 레벨형인데 11절 제목에 «이름:»이 없다`)
    if (kind === 'graded') {
      const wantLabels = ['Common', 'Rare', 'Epic', 'Mystic'].slice(0, count)
      const gotLabels = sec.rows.map((r) => r[0])
      if (JSON.stringify(gotLabels) !== JSON.stringify(wantLabels)) {
        throw new Error(`${ctx}: 11절 등급 순서 ${gotLabels.join('·')}가 ${wantLabels.join('·')}가 아니다`)
      }
    } else {
      const gotLabels = sec.rows.map((r) => r[0])
      const wantLabels = Array.from({ length: count }, (_, i) => `Lv.${i + 1}`)
      if (JSON.stringify(gotLabels) !== JSON.stringify(wantLabels)) {
        throw new Error(`${ctx}: 11절 레벨 순서 ${gotLabels.join('·')}가 ${wantLabels.join('·')}가 아니다`)
      }
    }

    // 11절 조건 표기에서 값 읽기 (3-2는 종목마다 값이 달라 표기를 기준 사다리로만 읽는다)
    const notationIdx = kind === 'leveled' ? 1 : 2
    const descIdx = kind === 'leveled' ? 2 : 3
    const thresholds = sec.rows.map((r) => parseThreshold(r[notationIdx], def.parse, `${ctx} ${r[0]}`))
    for (let i = 1; i < thresholds.length; i += 1) {
      if (!(thresholds[i] > thresholds[i - 1])) {
        throw new Error(`${ctx}: 값이 오름차순이 아니다 (${thresholds.join(', ')})`)
      }
    }

    // ② 2절 단계 값과 대조 (숫자가 있을 때만)
    const listSteps = stepsFromList(row.stepsText)
    if (listSteps) {
      if (JSON.stringify(listSteps) !== JSON.stringify(thresholds)) {
        throw new Error(`${ctx}: 2절 단계 값 ${listSteps.join('·')}와 11절 조건 표기 값 ${thresholds.join('·')}가 다르다`)
      }
    }

    // ③ 재활용 후보 문서: «새로 만듦»이고 조건 이름이 같다
    if (recycleRow.category !== '새로 만듦') {
      throw new Error(`${ctx}: 재활용 후보 문서의 분류가 «${recycleRow.category}»다(새로 만듦이어야 한다)`)
    }
    const recycleHead = recycleRow.condition.split('(')[0]
    const listHead = row.condition.split('(')[0]
    if (recycleHead !== listHead) {
      throw new Error(`${ctx}: 재활용 후보 문서의 조건 «${recycleHead}»과 원고 2절 «${listHead}»이 다르다`)
    }

    // 종목 칸 대조: 걷기 계열은 걷기, 3-2는 종목별
    if (def.scope === 'walking' && row.sportsText !== '걷기') throw new Error(`${ctx}: 2절 종목이 «${row.sportsText}»인데 정의는 걷기다`)
    if (def.scope === 'sports' && row.sportsText !== '종목별') throw new Error(`${ctx}: 2절 종목이 «${row.sportsText}»인데 정의는 종목별이다`)
    if (def.scope === 'jam' && row.sportsText !== '합산') throw new Error(`${ctx}: 2절 종목이 «${row.sportsText}»인데 정의는 JAM! 지표(합산)다`)

    // 가지: 번호 앞자리가 정의의 가지와 같다
    const branchNo = Number(number.split('-')[0])
    if (BRANCH_OF_NUMBER[branchNo] !== def.branch) {
      throw new Error(`${ctx}: 번호 앞자리 ${branchNo}의 가지는 ${BRANCH_OF_NUMBER[branchNo]}인데 정의는 ${def.branch}다`)
    }

    const names = kind === 'leveled' ? sec.rows.map(() => sec.name) : sec.rows.map((r) => r[1])
    const descriptions = sec.rows.map((r) => r[descIdx])
    if (names.some((n) => !n) || descriptions.some((d) => !d)) throw new Error(`${ctx}: 이름이나 설명이 빈 행이 있다`)

    result.set(number, { number, title: sec.title, kind, interval, count, thresholds, names, descriptions, narrative: sec.narrative })
  }
  return result
}

// ── 행 만들기 ──────────────────────────────────────────────────────────────

/** 4절 사다리로 종목별 값 만들기 (3-2). 기준 사다리가 11절 표기 값과 같은 줄을 찾는다 */
function perSportThresholds(baseThresholds, ladders, number) {
  const ladder = ladders.find((l) => JSON.stringify(l.base) === JSON.stringify(baseThresholds))
  if (!ladder) throw new Error(`${number}: 4절에서 기준 사다리 ${baseThresholds.join('·')}를 찾지 못했다`)
  return {
    walking: ladder.walkRunCycle, running: ladder.walkRunCycle, cycling: ladder.walkRunCycle,
    trail_running: ladder.trail, hiking: ladder.hiking,
  }
}

function familyKeyOf(number, def, sport) {
  const code = `J${number}`
  if (def.scope === 'jam') return `jam:${code}`
  return `${sport}:${code}`
}

/**
 * 15계열(또는 보류를 뺀 계열)의 배지 행을 만든다. 행 하나가 badges 한 행이다.
 * @param {{manuscript?: string, recycle?: string, includeHeld?: boolean}} [opts]
 * @returns {SeedRow[]}
 */
export function buildRows(opts = {}) {
  const manuscript = opts.manuscript ?? fs.readFileSync(MANUSCRIPT_PATH, 'utf8')
  const recycle = opts.recycle ?? fs.readFileSync(RECYCLE_PATH, 'utf8')
  const includeHeld = opts.includeHeld ?? false
  const numbers = TARGET_NUMBERS.filter((n) => includeHeld || !(n in HELD_FAMILIES))
  const verified = verifyNumbering({ manuscript, recycle, numbers })
  const ladders = parseSportLadders(manuscript)

  /** @type {SeedRow[]} */
  const rows = []
  for (const number of numbers) {
    const def = FAMILY_DEFS[number]
    const v = verified.get(number)
    const branchNo = Number(number.split('-')[0])
    const itemNo = Number(number.split('-')[1])
    const sortOrder = branchNo * 100 + itemNo

    const sportList = def.scope === 'sports' ? SPORTS : [def.scope === 'walking' ? 'walking' : null]
    const sportThresholds = def.scope === 'sports' ? perSportThresholds(v.thresholds, ladders, number) : null

    for (const sport of sportList) {
      const thresholds = sportThresholds ? sportThresholds[sport] : v.thresholds
      const imageFamily = def.scope === 'sports' ? def.image[sport] : def.image
      for (let i = 0; i < v.count; i += 1) {
        const rarity = v.kind === 'graded' ? RARITIES_BY_COUNT[v.count][i] : null
        const level = v.kind === 'leveled' ? i + 1 : null
        const condition_json = {}
        if (sport) condition_json.activity_type = sport
        if (def.extra) Object.assign(condition_json, structuredClone(def.extra))
        condition_json[def.key] = thresholds[i]
        rows.push({
          number,
          name: v.names[i],
          description: v.descriptions[i],
          type: 'activity',
          rarity,
          level,
          family_key: familyKeyOf(number, def, sport),
          sort_order: sortOrder,
          condition_json,
          activity_types: sport ? [sport] : [],
          point_reward: rarity ? RARITY_POINTS[rarity] : LEVEL_POINT,
          is_hidden: false,
          branch_key: def.branch,
          admin_category: def.scope === 'jam' ? 'jam' : null,
          image: { src_family_key: imageFamily, pos: i + 1, total: v.count },
        })
      }
    }
  }
  return rows
}

// ── SQL 만들기 ─────────────────────────────────────────────────────────────

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

function sqlNullable(v) {
  return v === null || v === undefined ? 'NULL' : sqlStr(v)
}

function sqlTextArray(arr) {
  return arr.length === 0 ? 'ARRAY[]::text[]' : `ARRAY[${arr.map(sqlStr).join(', ')}]::text[]`
}

function jsonLiteral(obj) {
  return `${sqlStr(JSON.stringify(obj))}::jsonb`
}

/** 242 파일 CHECK 배열의 허용 키 목록(주석 줄을 뺀 따옴표 문자열). 개수는 호출부가 확인한다 */
export function readAllowedConditionKeys(migrationText) {
  const body = migrationText.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  const start = body.indexOf('condition_json - ARRAY[')
  const end = body.indexOf(']::text[]', start)
  if (start < 0 || end < 0) throw new Error('242 파일에서 CHECK 허용 키 배열을 찾지 못했다')
  const keys = [...body.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  return keys
}

function familySummary(rows) {
  const fams = new Map()
  for (const r of rows) {
    if (!fams.has(r.family_key)) fams.set(r.family_key, { family_key: r.family_key, number: r.number, rows: [] })
    fams.get(r.family_key).rows.push(r)
  }
  return [...fams.values()]
}

/** 시드 SQL 전체 본문 */
export function renderSql(rows, { allowedKeys }) {
  const fams = familySummary(rows)
  const famKeys = fams.map((f) => f.family_key)
  const srcKeys = [...new Set(rows.map((r) => r.image.src_family_key))]
  const names = [...new Set(rows.map((r) => r.name))]
  const numbersUsed = [...new Set(rows.map((r) => r.number))]
  const totalPoints = rows.reduce((s, r) => s + r.point_reward, 0)
  const keysList = allowedKeys.map(sqlStr).join(', ')
  const familyList = famKeys.map(sqlStr).join(', ')
  const heldNumbers = Object.keys(HELD_FAMILIES).filter((n) => !numbersUsed.includes(n))

  const valuesRows = rows.map((r) => {
    return `    (${[
      sqlStr(r.name), sqlStr(r.description), sqlStr(r.type), sqlNullable(r.rarity), r.level === null ? 'NULL' : String(r.level),
      sqlStr(r.family_key), String(r.sort_order), jsonLiteral(r.condition_json), sqlTextArray(r.activity_types),
      String(r.point_reward), sqlStr(r.branch_key), sqlNullable(r.admin_category),
      sqlStr(r.image.src_family_key), String(r.image.pos), String(r.image.total),
    ].join(', ')})`
  })

  const imageTable = fams.map((f) => {
    const r0 = f.rows[0]
    return `--   ${f.family_key.padEnd(24)} ${r0.number.padEnd(5)} ${r0.name.padEnd(14)} ← ${r0.image.src_family_key} (${f.rows.length}행 ← 원본 단계를 비례로 대응)`
  })

  const checkValues = rows.map((r) => {
    const label = `${r.family_key}/${r.rarity ?? `Lv${r.level}`}`
    return `--     (${sqlStr(label)}, ${jsonLiteral(r.condition_json)})`
  })

  const lines = []
  const push = (s = '') => lines.push(s)

  push(`-- ${MIGRATION_FILE_NAME}`)
  push('-- JAM 2.0 액티비티 배지: 새 계열 입력 (티켓 20261018_1816 3회, 상위 20261018_1811. 사용자 결정 3·4·5 = 2026-10-19 질문창 답)')
  push('--')
  push('-- 작성만 하고 실행하지 않았다. 실행은 사용자 승인과 롤백 실측 뒤 카리나가 한다. 새 칸·새 제약·새 함수는 없고 badges에 새 행만 넣는다(옛 행은 바꾸지 않는다).')
  push(`-- 생성: jam-web/scripts/gen-new-activity-badge-families.mjs (원고 06 액티비티 배지.md 2·4·11절 + 재활용 후보 문서 2절). 손으로 고치지 말고 스크립트를 고쳐 다시 만든다.`)
  push('--')
  push('-- ⚠️ 공용 DB 영향: Supabase는 staging과 프로덕션이 한 DB를 쓰므로, 적용하는 순간 옛 프로덕션 코드에도 바로 반영된다.')
  push(`--    넣는 행: ${fams.length}계열 ${rows.length}행(활동 배지). 옛 프로덕션의 배지함·배지 트리·목록·어드민 배지 목록에 새 배지가 나타나고, 조건을 이미 채운 유저는`)
  push('--    다음 판정(동기화·믹스·캡슐 열기·팔로우 등)에서 이 배지를 받는다(소급 발급은 따로 돌리지 않는다). 받으면 point_reward만큼 포인트가 지급된다.')
  push('--    옛 프로덕션 코드가 새 JAM! 지표 키(잼·캡슐·챕터 등)를 판정하는지는 이 파일에서 확인하지 않았다(판정 코드는 이 브랜치의 badge-engine에 있다). 판정하지 못하는 코드가 도는 동안에는 이 배지가 보이기만 하고 발급되지 않는다.')
  push('--')
  push('-- ⚠️ 적용 순서: 마이그레이션 244(재활용 후보 밖 활동 배지를 끄는 SQL)를 «먼저» 적용하고 이 파일을 «나중에» 적용한다.')
  push('--    244의 끄기 대상은 «type=activity이고 family_key가 유지 61계열 목록에 없는 배지 전부»라서, 이 파일의 새 행을 먼저 넣고 244를 돌리면 새 행이 전부 꺼진다.')
  push('--    244를 이미 적용했다면 문제없다. 244의 기대값(활성 634 → 270 등)은 이 파일을 넣기 «전» 숫자이므로 244의 드라이런·사후 검증도 이 파일 앞에서 돌린다.')
  push('--')
  push('-- 규칙')
  push(`--   ① 넣는 계열(원고 번호): ${numbersUsed.join(', ')} (${numbersUsed.length}개 번호, family_key ${fams.length}개).`)
  push('--      원고 11절의 이름·설명·조건 표기를 그대로 쓴다. 등급형·구간 계열은 rarity(Common·Rare·Epic·Mystic), 레벨형은 level(1~)이고 등급(rarity)은 NULL이다(130 제약 badges_rarity_level_exclusive).')
  push('--   ② point_reward: 등급형 Common 10·Rare 20·Epic 50·Mystic 100, 레벨형은 레벨마다 10. 숨김은 이번에 넣는 계열에 없다(is_hidden 전부 false).')
  push('--   ③ condition_json: conditionRegistry.ts의 허용 키만 쓴다(CHECK badges_condition_json_known_keys 80개, 242). 걷기 계열은 activity_type=walking, JAM! 지표 계열은 activity_type 없이 지표 키 하나.')
  push('--      JAM! 지표 계열(원고 7·8갈래, 12계열)은 기존 JAM! 배지 관례대로 activity_types=\'{}\' 이고 admin_category=\'jam\' 이다(배지 화면의 JAM! 필터가 admin_category로 거른다).')
  push('--      7·8갈래의 판정은 엔진 밖 파이프라인이 한다(jamActionBadges.ts, usageBadges.ts). 메인 엔진은 이 키만 든 조건을 항상 fail 처리한다.')
  push('--   ④ family_key: 종목 계열은 `<종목>:J<원고 번호>`, JAM! 지표 계열은 `jam:J<원고 번호>`다. 기존 코드는 종목+영문 한 글자+숫자(walking:K1)였고 J는 쓰이지 않았다.')
  push('--      적용 전에 같은 family_key가 이미 있으면 아래 가드가 예외를 던져 전체를 되돌린다(기존 행을 건너뛰지 않는다. 되돌림 SQL이 family_key로 지우므로 남의 행이 섞이면 안 된다).')
  push('--   ⑤ branch_key: 243의 가지 일곱 중 하나(time_season·attribute·milestone·jam_activity). sort_order = 가지 번호×100 + 계열 번호(예: 6-1 → 601). 공개 기간(valid_from·valid_until)은 두지 않는다.')
  push('--   ⑥ image_url: 가장 가까운 기존 배지(재활용 후보)의 image_url을 복사한다(사용자 결정 4, 임시). 대응표는 아래. 원본 계열의 단계 수와 다르면 비례로 맞춘다(원본 n단, 새 m단이면 새 i번째는 원본 ceil(i×n/m)번째).')
  push('--      이미지 파일은 원본 배지와 같은 파일을 가리킨다(복사가 아니라 같은 주소). 어드민 이미지 생성기로 새 배지에 이미지를 만들면 이 주소가 바뀐다.')
  push('--      원본에 image_url이 없으면 새 행도 NULL이다(INSERT는 통과한다). 드라이런 ③으로 원본에 이미지가 있는지 먼저 본다.')
  push('--   ⑦ 트리거 badges_family_consistency(140·134): 등급형은 같은 family_key 안에서 측정 조건 키 집합이 같아야 한다. 이 파일의 등급형은 단계마다 같은 키 하나라 통과한다. 레벨형은 검사 대상이 아니다.')
  push('--   받은 기록·유저·포인트 원장·미션은 바꾸지 않는다.')
  push('--')
  push(`-- 이번에 넣지 않는 계열: 사용자 결정 3의 12계열(1-4, 2-2, 3-4, 3-5, 5-1, 5-2, 5-4, 5-5, 8-4, 8-5, 7-3, 7-4)은 엔진 판정이 없어 후속 티켓에서 넣는다. 5-6은 원고에 이름·설명이 없다.`)
  if (heldNumbers.length > 0) {
    for (const n of heldNumbers) push(`--   ${n}도 이번 SQL에서 뺐다: ${HELD_FAMILIES[n]}. 결정이 나면 스크립트에 --include-held를 주어 다시 만든다.`)
  }
  push('--')
  push('-- 이미지 대응표 (새 family_key → 이미지를 복사할 기존 family_key)')
  for (const l of imageTable) push(l)
  push('--')
  push('-- 되돌림 방법과 사후 확인은 파일 끝에 있다.')
  push('')
  push('-- ═══════════════════════════════════════════════════════════════════════════')
  push('-- 드라이런 (읽기 전용 SELECT — 적용 전에 돌려서 «기대값»과 맞는지 본다. 데이터를 바꾸지 않는다)')
  push('-- ═══════════════════════════════════════════════════════════════════════════')
  push('--')
  push(`-- 기대값: ① 0행 ② 0행 ③ 줄마다 이미지있음 = 행수(모자라면 그 계열을 원본으로 삼은 새 행의 image_url이 NULL이 된다) ④ 위반 0 ⑤ 적용 전 기준값`)
  push('--')
  push('-- ① 같은 family_key가 이미 있는가 (0행이어야 한다)')
  push(`--   SELECT family_key, count(*) FROM public.badges WHERE family_key IN (${familyList}) GROUP BY family_key;`)
  push('--')
  push('-- ② 같은 이름이 살아 있는 배지에 이미 있는가 (0행이어야 한다. 등급형은 같은 이름이 한 계열 안에서만 반복된다)')
  push(`--   SELECT name, type, family_key FROM public.badges WHERE deleted_at IS NULL AND name IN (${names.map(sqlStr).join(', ')});`)
  push('--')
  push('-- ③ 이미지 원본: 계열마다 행 수와 image_url이 있는 행 수')
  push(`--   SELECT family_key, count(*) AS 행수, count(image_url) AS 이미지있음 FROM public.badges WHERE family_key IN (${srcKeys.map(sqlStr).join(', ')}) GROUP BY family_key ORDER BY family_key;`)
  push('--')
  push(`-- ④ 새 행의 condition_json이 허용 키 ${allowedKeys.length}개 CHECK를 통과하는지 (위반 행이 0이어야 한다. CHECK 식과 같은 식이다)`)
  push('--   WITH allowed AS (SELECT array_agg(k) AS keys FROM unnest(ARRAY[' + keysList + ']::text[]) AS k),')
  push('--   rows(label, condition_json) AS (VALUES')
  push(checkValues.join(',\n'))
  push('--   )')
  push("--   SELECT count(*) FILTER (WHERE r.condition_json - a.keys <> '{}'::jsonb) AS 위반, count(*) AS 전체 FROM rows r, allowed a;")
  push('--')
  push('-- ⑤ 현재 활동 배지 수(적용 전 기준값. 적용 뒤에는 이 값 + 새 행 수가 된다)')
  push("--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;")
  push('--')
  push('-- 롤백 실측: 아래 BEGIN 이후 본문(가드 DO 블록, INSERT, 사후 확인 DO 블록)을 한 트랜잭션으로 실행하고 COMMIT 대신 ROLLBACK 한다.')
  push('--   트랜잭션을 못 쓰는 도구(MCP)에서는 본문을 DO 블록 하나로 감싸 마지막에 RAISE EXCEPTION으로 되돌린다(CHECK·트리거·가드 통과를 실측한다).')
  push('')
  push('BEGIN;')
  push('')
  push('-- 가드: 같은 family_key가 이미 있으면 멈춘다 (되돌림 SQL이 family_key로 지우므로 남의 행이 섞이면 안 된다)')
  push('DO $guard$')
  push('BEGIN')
  push(`  IF EXISTS (SELECT 1 FROM public.badges WHERE family_key IN (${familyList})) THEN`)
  push(`    RAISE EXCEPTION '${MIGRATION_FILE_NAME}: 이미 같은 family_key를 가진 배지가 있다. 드라이런 ①로 확인한다';`)
  push('  END IF;')
  push('END')
  push('$guard$;')
  push('')
  push(`-- ${rows.length}행 입력 (${fams.length}계열)`)
  push('WITH new_rows (name, description, type, rarity, level, family_key, sort_order, condition_json, activity_types, point_reward, branch_key, admin_category, src_family_key, pos, total) AS (')
  push('  VALUES')
  push(valuesRows.join(',\n'))
  push('),')
  push('src AS (')
  push('  SELECT family_key AS src_family_key, image_url,')
  push("         row_number() OVER (PARTITION BY family_key ORDER BY COALESCE(level, CASE rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'mystic' THEN 4 END), id) AS rn,")
  push('         count(*) OVER (PARTITION BY family_key) AS n')
  push('    FROM public.badges')
  push(`   WHERE family_key IN (${srcKeys.map(sqlStr).join(', ')})`)
  push(')')
  push('INSERT INTO public.badges (')
  push('  name, description, type, rarity, level, family_key, sort_order, condition_json, activity_types,')
  push('  patch_available, point_reward, is_hidden, branch_key, admin_category, image_url')
  push(')')
  push('SELECT r.name, r.description, r.type::badge_type, r.rarity::badge_rarity, r.level, r.family_key, r.sort_order, r.condition_json, r.activity_types,')
  push('       false, r.point_reward, false, r.branch_key, r.admin_category, s.image_url')
  push('  FROM new_rows r')
  push('  LEFT JOIN src s ON s.src_family_key = r.src_family_key AND s.rn = ceil(r.pos::numeric * s.n / r.total)::int;')
  push('')
  push('-- 사후 확인(같은 트랜잭션 안): 어긋나면 예외로 전체를 되돌린다')
  push('DO $verify$')
  push('DECLARE')
  push('  v_rows int; v_fams int; v_points int; v_hidden int; v_ungrouped int;')
  push('BEGIN')
  push(`  SELECT count(*), count(DISTINCT family_key), COALESCE(sum(point_reward), 0), count(*) FILTER (WHERE is_hidden)`)
  push('    INTO v_rows, v_fams, v_points, v_hidden')
  push(`    FROM public.badges WHERE family_key IN (${familyList}) AND deleted_at IS NULL;`)
  push(`  IF v_rows <> ${rows.length} OR v_fams <> ${fams.length} OR v_points <> ${totalPoints} OR v_hidden <> 0 THEN`)
  push(`    RAISE EXCEPTION '${MIGRATION_FILE_NAME}: 사후 확인 실패 (행 %, 계열 %, 포인트 합 %, 숨김 %) — 기대값 ${rows.length} / ${fams.length} / ${totalPoints} / 0', v_rows, v_fams, v_points, v_hidden;`)
  push('  END IF;')
  push(`  SELECT count(*) INTO v_ungrouped FROM public.badges WHERE family_key IN (${familyList}) AND ((rarity IS NULL) = (level IS NULL));`)
  push('  IF v_ungrouped <> 0 THEN')
  push(`    RAISE EXCEPTION '${MIGRATION_FILE_NAME}: 등급과 레벨이 둘 다 있거나 둘 다 없는 행이 % 개 있다', v_ungrouped;`)
  push('  END IF;')
  push('END')
  push('$verify$;')
  push('')
  push('COMMIT;')
  push('')
  push('-- ═══════════════════════════════════════════════════════════════════════════')
  push('-- 사후 검증 (적용 뒤 읽기 전용 SELECT)')
  push('-- ═══════════════════════════════════════════════════════════════════════════')
  push('--')
  push(`-- ① 새 행 ${rows.length}, 계열 ${fams.length}, 포인트 합 ${totalPoints}, 숨김 0`)
  push(`--   SELECT count(*) AS 행수, count(DISTINCT family_key) AS 계열수, sum(point_reward) AS 포인트합, count(*) FILTER (WHERE is_hidden) AS 숨김 FROM public.badges WHERE family_key IN (${familyList});`)
  push('-- ② 가지별·종류별 행 수')
  push(`--   SELECT branch_key, count(*) FILTER (WHERE rarity IS NOT NULL) AS 등급형, count(*) FILTER (WHERE level IS NOT NULL) AS 레벨형 FROM public.badges WHERE family_key IN (${familyList}) GROUP BY branch_key ORDER BY branch_key;`)
  push('-- ③ 이미지가 비어 있는 새 행 (원본에 이미지가 없었다면 있을 수 있다)')
  push(`--   SELECT family_key, count(*) FROM public.badges WHERE family_key IN (${familyList}) AND image_url IS NULL GROUP BY family_key ORDER BY family_key;`)
  push('-- ④ 활동 배지 전체 수 = 적용 전 값 + 새 행 수')
  push("--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;")
  push('-- ⑤ 계열마다 단계 값이 오름차순인지(눈으로 확인)')
  push(`--   SELECT family_key, rarity, level, condition_json FROM public.badges WHERE family_key IN (${familyList}) ORDER BY family_key, COALESCE(level, CASE rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'mystic' THEN 4 END);`)
  push('')
  push('-- 되돌림 SQL')
  push('-- 이번에 넣은 행을 family_key 목록으로 지운다. 먼저 받은 기록이 0건인지 확인한다(0이 아니면 아래 소프트 삭제를 쓴다):')
  push(`-- SELECT count(*) FROM public.user_activity_badges WHERE badge_id IN (SELECT id FROM public.badges WHERE family_key IN (${familyList}));`)
  push(`-- DELETE FROM public.badges WHERE family_key IN (${familyList});`)
  push('-- 받은 기록이 있어 지울 수 없으면 지우지 말고 끈다(받은 기록은 남는다):')
  push(`-- UPDATE public.badges SET deleted_at = now() WHERE family_key IN (${familyList}) AND deleted_at IS NULL;`)
  push('-- 이 파일은 새 칸·새 제약을 만들지 않으므로 그 밖에 되돌릴 객체는 없다.')
  push('')
  return lines.join('\n')
}

// ── CLI ────────────────────────────────────────────────────────────────────

export function generate({ includeHeld = false } = {}) {
  const rows = buildRows({ includeHeld })
  const allowedKeys = readAllowedConditionKeys(fs.readFileSync(CHECK_MIGRATION_PATH, 'utf8'))
  return { rows, sql: renderSql(rows, { allowedKeys }), allowedKeys }
}

function main(argv) {
  const includeHeld = argv.includes('--include-held')
  const outIdx = argv.indexOf('--out')
  const outPath = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : DEFAULT_OUT_PATH
  const { rows, sql } = generate({ includeHeld })
  if (argv.includes('--stdout')) {
    process.stdout.write(sql)
    return
  }
  fs.writeFileSync(outPath, sql, 'utf8')
  const fams = new Set(rows.map((r) => r.family_key))
  console.log(`${path.relative(process.cwd(), outPath)}: ${fams.size}계열 ${rows.length}행`)
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2))
}
