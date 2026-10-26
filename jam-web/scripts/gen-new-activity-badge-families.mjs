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
 * 보류 13계열(티켓 20261019_0542 3회): `--set held`를 주면 보류했던 13계열(HELD_SEED_NUMBERS)을 마이그레이션
 * `248_seed_held_activity_badge_families.sql`로 만든다. 245 출력은 이 확장으로 한 글자도 바뀌지 않는다(시험이 디스크 파일과 대조한다).
 *   node scripts/gen-new-activity-badge-families.mjs --set held            # 248 기본 경로에 쓴다
 *   node scripts/gen-new-activity-badge-families.mjs --set held --stdout   # 표준출력
 *
 * 5-6 한 계열(티켓 20261026_1018): `--set late`를 주면 마이그레이션 `291_seed_activity_badge_family_5_6.sql`을 만든다(원고 11.5절, 혼자들 «채워 둔 세제 칸»).
 * 245·248 출력은 이 확장으로 한 글자도 바뀌지 않는다(시험이 디스크 파일과 대조하고 SHA-256으로도 고정한다).
 *   node scripts/gen-new-activity-badge-families.mjs --set late            # 291 기본 경로에 쓴다
 *   node scripts/gen-new-activity-badge-families.mjs --set late --stdout   # 표준출력
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

/** 보류 13계열 시드(티켓 20261019_0542 3회). 허용 키 목록은 가장 최근에 CHECK를 넓힌 247에서 읽는다(92개) */
export const HELD_CHECK_MIGRATION_PATH = path.join(HERE, '..', 'supabase/migrations/247_condition_json_checkin_drop_jam_keys.sql')
export const HELD_OUT_PATH = path.join(HERE, '..', 'supabase/migrations/248_seed_held_activity_badge_families.sql')
export const HELD_MIGRATION_FILE_NAME = '248_seed_held_activity_badge_families.sql'

/**
 * 5-6 한 계열 시드(티켓 20261026_1018). 허용 키 목록은 248과 같이 가장 최근에 CHECK를 넓힌 247에서 읽는다(92개).
 * 번호는 시작 때 origin/staging의 가장 높은 번호(290)에 하나를 더해 정했다. 적용 직전에 다시 확인한다.
 */
export const LATE_SEED_NUMBERS = ['5-6']
export const LATE_CHECK_MIGRATION_PATH = HELD_CHECK_MIGRATION_PATH
export const LATE_OUT_PATH = path.join(HERE, '..', 'supabase/migrations/291_seed_activity_badge_family_5_6.sql')
export const LATE_MIGRATION_FILE_NAME = '291_seed_activity_badge_family_5_6.sql'

/**
 * 244가 재활용 후보 밖 활동 배지를 끈 뒤 남는 활성 활동 배지 수(244의 «유지 270행», 온보딩 배지 1개 포함).
 * 5-6 시드의 선행 조건 가드(활성 수 = 이 값 + 245의 행 + 248의 행)와 사후 확인(+ 5-6의 행)이 쓴다.
 * 마이그레이션 290의 가드(390)도 같은 값에서 나온다(시험이 290 파일과 대조한다).
 */
export const ACTIVE_ACTIVITY_AFTER_244 = 270

/**
 * @typedef {object} FamilyDef
 * @property {string} key condition_json의 측정 키
 * @property {'int'|'km'|'minutes'|'pattern'|'fixed'} parse 11절 조건 표기에서 값을 읽는 방식
 * @property {'walking'|'sports'|'jam'|'all'} scope walking=걷기 하나, sports=종목별, jam=JAM! 지표(7·8갈래), all=종목과 상관없이 합산(그 밖의 갈래)
 * @property {string} branch branch_key
 * @property {Record<string, unknown>} [extra] 모든 단계에 같이 들어가는 고정 조건(3-2의 시간대)
 * @property {RegExp} [pattern] parse가 'pattern'일 때 11절 조건 표기를 읽는 식. 이름 붙은 묶음 `value`(단계 값)와 `aux`(보조 값)를 쓴다
 * @property {{key: string|null, expected: number, note?: string}} [aux] 11절 조건 표기에 함께 적힌 보조 값. key가 있으면 모든 단계의 condition_json에 같이 넣고,
 *   null이면 조건에 넣지 않고 원고 값이 expected와 같은지만 대조한다(2-2의 «7일 이상 휴식»)
 * @property {number} [fixed] 단일 계열처럼 11절에 값이 없을 때 쓰는 고정 값
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
  2: ['common', 'rare'],
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
 * 보류했다가 마이그레이션 248로 입력하는 13계열(티켓 20261019_0542 사용자 결정 6의 3회, 원고 번호). 5-6은 당시 원고에 이름·설명이 없어 없다(2026-10-25에 생겨 LATE_SEED_NUMBERS로 따로 입력한다).
 * 3-3은 재활용 후보 문서에서 «고쳐서 재활용»이라 기존 행이 있고 이름이 종목마다 달라 입력 대상이 아니다.
 * 3-2는 1회가 등급형 묶음 기준을 이름에서 계열(`family_key`)로 바꿔서 같은 이름의 종목별 계열 5개가 서로 막지 않으므로 여기서 입력한다.
 * 위 TARGET_NUMBERS·HELD_FAMILIES·`--include-held`는 245 출력과 시험을 그대로 두려고 바꾸지 않았다.
 */
export const HELD_SEED_NUMBERS = [
  '1-4', '2-2', '3-2', '3-4', '3-5', '5-1', '5-2', '5-4', '5-5', '7-3', '7-4', '8-4', '8-5',
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

  // ── 보류 13계열(마이그레이션 248). 3-2는 위에 있다. 조건 키는 티켓 20261019_0542 사용자 결정 5가 정했고 1·2회가 판정을 만들었다 ──
  // 합산(scope 'all')은 종목과 상관없이 모든 활동을 센다: activity_types '{}', admin_category NULL(JAM! 필터에 넣지 않는다), family_key `all:J<번호>`
  '1-4': {
    key: 'active_week_streak', parse: 'pattern', scope: 'all', branch: 'rhythm', image: 'walking:P2',
    pattern: /^주 (?<aux>\d+)일 이상 활동 (?<value>\d+)주 연속$/,
    aux: { key: 'active_week_min_days', expected: 3 },
  },
  '2-2': {
    key: 'return_streak_weeks', parse: 'pattern', scope: 'all', branch: 'recovery', image: 'walking:R4',
    pattern: /^(?<aux>\d+)일 이상 휴식 후 매주 활동 (?<value>\d+)주 연속$/,
    // 원고 조건 표기는 «7일 이상 휴식»이고 엔진 상수도 7일이다(사용자 결정 3, RETURN_REST_DAYS, 원고를 2026-10-19에 14일에서 7일로 고침). 조건에는 넣지 않고 원고 값만 대조한다
    aux: { key: null, expected: 7, note: '원고 11절과 엔진 상수 RETURN_REST_DAYS가 모두 7일(사용자 결정 3)' },
  },
  '3-4': { key: 'full_week_count', parse: 'int', scope: 'all', branch: 'time_season', image: 'walking:S2' },
  '3-5': { key: 'full_season_year_count', parse: 'int', scope: 'all', branch: 'time_season', image: 'walking:A6' },
  '5-1': { key: 'new_checkin_badge_count', parse: 'int', scope: 'all', branch: 'explore', image: 'walking:K3' },
  '5-2': { key: 'distinct_activity_type_count', parse: 'int', scope: 'all', branch: 'explore', image: 'walking:P1' },
  '5-4': { key: 'new_checkin_badge_count', parse: 'fixed', fixed: 1, scope: 'all', branch: 'explore', image: 'walking:A9' },
  '5-5': { key: 'checkin_season_year_count', parse: 'int', scope: 'all', branch: 'explore', image: 'walking:A8' },
  // 5-6(마이그레이션 291, 티켓 20261026_1018): 판정 키는 기존 JAM! 지표 same_spot_checkin_days(지점별 서로 다른 체크인 날 수의 최댓값, 203부터 허용).
  // 이미지는 «날을 쌓는» 성격이 가장 가까운 walking:K3(5-3의 원본, 244 유지 목록)를 임시로 복사한다(사용자 결정 4와 같은 방식)
  '5-6': { key: 'same_spot_checkin_days', parse: 'int', scope: 'all', branch: 'explore', image: 'walking:K3' },
  '7-3': {
    key: 'jam_week_count', parse: 'pattern', scope: 'jam', branch: 'milestone', image: 'walking:P2',
    pattern: /^한 주에 모은 잼 (?<aux>\d+) 이상 (?:누적 )?(?<value>\d+)주$/,
    aux: { key: 'jam_week_min_earned', expected: 200 },
  },
  '7-4': {
    key: 'jam_week_streak', parse: 'pattern', scope: 'jam', branch: 'milestone', image: 'walking:S2',
    pattern: /^한 주에 모은 잼 (?<aux>\d+) 이상 (?<value>\d+)주 연속$/,
    aux: { key: 'jam_week_min_earned', expected: 200 },
  },
  '8-4': { key: 'dropped_item_picked_up_count', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:K1' },
  '8-5': { key: 'pickup_item_count', parse: 'int', scope: 'jam', branch: 'jam_activity', image: 'walking:K3' },
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

/**
 * 11절 조건 표기 한 칸에서 단계 값과 보조 값을 읽는다. 보조 값은 같은 칸에 함께 적힌 값(1-4의 «3일 이상», 7-3의 «200 이상»)이다.
 * @returns {{value: number, aux: number | null}}
 */
export function readNotation(def, text, ctx) {
  if (def.parse === 'pattern') {
    const m = def.pattern.exec(text)
    if (!m || !m.groups) throw new Error(`${ctx}: 조건 표기가 기대한 식과 다르다 («${text}»)`)
    return { value: Number(m.groups.value.replace(/,/g, '')), aux: m.groups.aux === undefined ? null : Number(m.groups.aux.replace(/,/g, '')) }
  }
  if (def.parse === 'fixed') {
    if (typeof def.fixed !== 'number') throw new Error(`${ctx}: 고정 값 정의가 없다`)
    return { value: def.fixed, aux: null }
  }
  return { value: parseThreshold(text, def.parse, ctx), aux: null }
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
  // 단일(5-4): 단계 없이 배지 하나. 등급은 Common 하나로 둔다(원고 3-7 숨김 단일도 Common이다)
  if (kindText === '단일') return { kind: 'single', interval: false, count: 1 }
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
    const expectedHeader =
      kind === 'single' ? ['조건 표기', '설명'] : kind === 'leveled' ? ['레벨', '조건 표기', '설명'] : ['등급', interval ? '구간 이름' : '이름', '조건 표기', '설명']
    if (JSON.stringify(sec.header) !== JSON.stringify(expectedHeader)) {
      throw new Error(`${ctx}: 11절 표 머리 «${sec.header?.join('|')}»가 기대 «${expectedHeader.join('|')}»와 다르다`)
    }
    if ((kind === 'leveled' || kind === 'single') && !sec.name) throw new Error(`${ctx}: ${kind === 'single' ? '단일' : '레벨형'}인데 11절 제목에 «이름:»이 없다`)
    if (kind === 'single') {
      // 단계 라벨이 없다. 표는 «조건 표기 | 설명» 한 줄뿐이다
    } else if (kind === 'graded') {
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
    const notationIdx = kind === 'single' ? 0 : kind === 'leveled' ? 1 : 2
    const descIdx = kind === 'single' ? 1 : kind === 'leveled' ? 2 : 3
    const readRows = sec.rows.map((r) => readNotation(def, r[notationIdx], `${ctx} ${r[0]}`))
    const thresholds = readRows.map((x) => x.value)
    // 같은 칸에 적힌 보조 값(1-4의 3일, 7-3·7-4의 200 등)은 모든 단계가 같아야 하고 정의의 기대값과 같아야 한다
    if (def.aux) {
      for (const [i, x] of readRows.entries()) {
        if (x.aux !== def.aux.expected) {
          throw new Error(`${ctx}: 11절 ${sec.rows[i][0]}의 보조 값 ${x.aux}가 정의의 기대값 ${def.aux.expected}와 다르다`)
        }
      }
    }
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
    if (def.scope === 'all' && row.sportsText !== '합산') throw new Error(`${ctx}: 2절 종목이 «${row.sportsText}»인데 정의는 합산이다`)

    // 가지: 번호 앞자리가 정의의 가지와 같다
    const branchNo = Number(number.split('-')[0])
    if (BRANCH_OF_NUMBER[branchNo] !== def.branch) {
      throw new Error(`${ctx}: 번호 앞자리 ${branchNo}의 가지는 ${BRANCH_OF_NUMBER[branchNo]}인데 정의는 ${def.branch}다`)
    }

    const names = kind === 'leveled' || kind === 'single' ? sec.rows.map(() => sec.name) : sec.rows.map((r) => r[1])
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
  if (def.scope === 'all') return `all:${code}`
  return `${sport}:${code}`
}

/**
 * 15계열(또는 보류를 뺀 계열)의 배지 행을 만든다. 행 하나가 badges 한 행이다.
 * @param {{manuscript?: string, recycle?: string, includeHeld?: boolean, numbers?: string[]}} [opts] numbers를 주면 그 번호만 만든다(보류 13계열 248)
 * @returns {SeedRow[]}
 */
export function buildRows(opts = {}) {
  const manuscript = opts.manuscript ?? fs.readFileSync(MANUSCRIPT_PATH, 'utf8')
  const recycle = opts.recycle ?? fs.readFileSync(RECYCLE_PATH, 'utf8')
  const includeHeld = opts.includeHeld ?? false
  const numbers = opts.numbers ?? TARGET_NUMBERS.filter((n) => includeHeld || !(n in HELD_FAMILIES))
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

    const sportList = def.scope === 'sports' ? SPORTS : [def.scope === 'walking' ? 'walking' : null] // jam·all 계열은 종목이 없다
    const sportThresholds = def.scope === 'sports' ? perSportThresholds(v.thresholds, ladders, number) : null

    for (const sport of sportList) {
      const thresholds = sportThresholds ? sportThresholds[sport] : v.thresholds
      const imageFamily = def.scope === 'sports' ? def.image[sport] : def.image
      for (let i = 0; i < v.count; i += 1) {
        const rarity = v.kind === 'single' ? 'common' : v.kind === 'graded' ? RARITIES_BY_COUNT[v.count][i] : null
        const level = v.kind === 'leveled' ? i + 1 : null
        const condition_json = {}
        if (sport) condition_json.activity_type = sport
        if (def.extra) Object.assign(condition_json, structuredClone(def.extra))
        condition_json[def.key] = thresholds[i]
        if (def.aux?.key) condition_json[def.aux.key] = def.aux.expected
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

/** 보류 13계열 시드(248)의 머리 주석. 규칙·영향·적용 순서·알려진 어긋남을 싣는다 */
function pushHeldHeader({ push, rows, fams, numbersUsed, imageTable, fileName }) {
  const sportFams = fams.filter((f) => f.number === '3-2').length
  const kinds = new Map()
  for (const f of fams) {
    const r0 = f.rows[0]
    const kind = f.rows.length === 1 ? '단일' : r0.level !== null ? '레벨형' : '등급형'
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
  }
  const kindText = [...kinds].map(([k, n]) => `${k} ${n}`).join(', ')
  push(`-- ${fileName}`)
  push('-- JAM 2.0 액티비티 배지: 보류했던 13계열 입력 (티켓 20261019_0542 3회, 상위 20261018_1811. 사용자 결정 1~6 = 2026-10-19 질문창 답)')
  push('--')
  push('-- 작성만 하고 실행하지 않았다. 실행은 사용자 승인과 롤백 실측 뒤 카리나가 한다. 새 칸·새 제약·새 함수는 없고 badges에 새 행만 넣는다(옛 행과 245의 행은 바꾸지 않는다).')
  push('-- 생성: jam-web/scripts/gen-new-activity-badge-families.mjs --set held (원고 06 액티비티 배지.md 2·4·11절 + 재활용 후보 문서 2절). 손으로 고치지 말고 스크립트를 고쳐 다시 만든다.')
  push('--')
  push('-- ⚠️ 공용 DB 영향: Supabase는 staging과 프로덕션이 한 DB를 쓰므로, 적용하는 순간 옛 프로덕션 코드에도 바로 반영된다.')
  push(`--    넣는 행: ${fams.length}계열 ${rows.length}행(활동 배지, ${kindText}. 원고 번호 ${numbersUsed.length}개 — 3-2는 종목마다 계열 하나라 ${sportFams}계열). 옛 프로덕션의 배지함·배지 목록·어드민 배지 목록에 새 배지가 나타나고,`)
  push('--    조건을 이미 채운 유저는 다음 판정(동기화·드랍 픽업·잼 정산 등)에서 이 배지를 받는다(소급 발급은 따로 돌리지 않는다). 받으면 point_reward만큼 포인트가 지급된다.')
  push('--    레벨형(5-1·8-4·8-5)은 이미 채운 유저가 첫 판정에서 채운 레벨까지 한꺼번에 받는다(레벨마다 10포인트). 등급형·단일은 채운 가장 높은 단계 하나만 받는다.')
  push('--    옛 프로덕션 코드가 이 파일의 새 조건 키 12개(246·247이 허용한 키)를 판정하는지는 이 파일에서 확인하지 않았다. 판정하지 못하는 코드가 도는 동안에는 이 배지가 보이기만 하고 발급되지 않는다.')
  push('--    그래서 공용 DB인 만큼 오픈 직전에 적용한다(판정 코드가 배포된 뒤).')
  push('--')
  push('-- ⚠️ 적용 순서: 244 → 245 → 248. 둘째 이후는 첫째가 끝난 뒤에 적용한다.')
  push('--    244(재활용 후보 밖 활동 배지를 끄는 SQL)의 끄기 대상은 «type=activity이고 family_key가 유지 61계열 목록에 없는 배지 전부»라서, 이 파일의 새 행을 244보다 먼저 넣고 244를 돌리면 새 행이 전부 꺼진다.')
  push('--    245(14계열 61행)는 이 파일과 family_key가 겹치지 않아 순서가 데이터를 가르지는 않는다. 그래도 245를 먼저 적용한 뒤 이 파일을 적용한다(드라이런 ⑥으로 245가 들어갔는지 확인한다).')
  push('--    244·245의 드라이런·사후 검증 기대값(활성 634 → 270 등)은 이 파일을 넣기 «전» 숫자이므로 그 검증도 이 파일 앞에서 돌린다.')
  push('--    이 파일은 CHECK 제약을 새로 만들지 않는다. 허용 키 92개는 247까지 적용돼 있어야 한다(246: 86개, 247: 92개, 둘 다 적용 완료). 드라이런 ④가 같은 식으로 새 행을 미리 대조한다.')
  push('--')
  push('-- 규칙')
  push(`--   ① 넣는 계열(원고 번호): ${numbersUsed.join(', ')} (${numbersUsed.length}개 번호, family_key ${fams.length}개). 5-6(원고에 이름·설명 없음)과 3-3(고쳐서 재활용, 기존 행 있음)은 넣지 않는다.`)
  push('--      원고 11절의 이름·설명·조건 표기를 그대로 쓴다. 등급형은 rarity(Common·Rare·Epic), 레벨형은 level(1~)이고 등급(rarity)은 NULL이다(130 제약 badges_rarity_level_exclusive).')
  push('--      5-4(가입 뒤 첫 체크인 배지)는 단계 없는 단일이라 rarity=Common 한 행이다(원고 3-7 숨김 단일도 Common이다). 숨김 배지는 이 13계열에 없다(is_hidden 전부 false).')
  push('--   ② point_reward: 등급형 Common 10·Rare 20·Epic 50, 레벨형은 레벨마다 10, 단일(Common)은 10.')
  push('--   ③ condition_json: 단계 값 키 하나(+ 보조 키). 1-4 {active_week_streak:N, active_week_min_days:3}, 2-2 {return_streak_weeks:N}, 3-4 {full_week_count:N}, 3-5 {full_season_year_count:N},')
  push('--      5-1 {new_checkin_badge_count:N}(3·10·25·50·100), 5-2 {distinct_activity_type_count:N}, 5-4 {new_checkin_badge_count:1}, 5-5 {checkin_season_year_count:N},')
  push('--      7-3 {jam_week_count:N, jam_week_min_earned:200}, 7-4 {jam_week_streak:N, jam_week_min_earned:200}, 8-4 {dropped_item_picked_up_count:N}, 8-5 {pickup_item_count:N}(둘 다 1·5·30·50·100).')
  push('--      3-2는 종목마다 계열 하나({activity_type:<종목>, time_range:{start:18:00,end:22:00}, total_count:N}, 값은 원고 4절 종목별 보정: 걷기·러닝·자전거 1·5·20·50, 트레일러닝 1·4·16·40, 등산 1·3·12·30).')
  push('--      판정: 3-2는 메인 엔진(time_range + total_count, 시간대 안에서 활동한 «날»의 수로 센다), 나머지 12계열은 엔진 밖 파이프라인(jamActionBadges.ts)이 한다. 메인 엔진은 새 키만 든 조건을 항상 fail 처리한다.')
  push('--   ④ activity_types·admin_category·family_key: 3-2는 activity_types=[종목]·admin_category NULL·family_key `<종목>:J3-2`.')
  push('--      7·8갈래(7-3·7-4·8-4·8-5)는 245와 같은 JAM! 지표 관례다 — activity_types=\'{}\'·admin_category=\'jam\'·family_key `jam:J<번호>`.')
  push('--      그 밖의 합산 계열(1-4·2-2·3-4·3-5·5-1·5-2·5-4·5-5)은 종목이 없어 activity_types=\'{}\'이고 admin_category는 NULL(JAM! 필터에 넣지 않는다)이며 family_key는 `all:J<번호>`다.')
  push('--      → 이 8계열은 배지 목록의 «전체»에는 나오지만 종목 필터에는 나오지 않고, 배지 트리(종목 첫 칸으로 묶는다)에는 나오지 않는다. 종목을 붙일지는 따로 정한다.')
  push('--      적용 전에 같은 family_key가 이미 있으면 아래 가드가 예외를 던져 전체를 되돌린다(기존 행을 건너뛰지 않는다. 되돌림 SQL이 family_key로 지우므로 남의 행이 섞이면 안 된다).')
  push('--   ⑤ 이름: 같은 원고 번호 안에서만 이름이 겹친다(3-2의 종목별 5계열이 같은 이름). 엔진이 등급형을 이름이 아니라 family_key로 묶으므로(1회) 서로 막지 않는다. 번호가 다른 계열은 이름이 겹치지 않는다.')
  push('--   ⑥ branch_key: 243의 가지 일곱 중 하나(rhythm·recovery·time_season·explore·milestone·jam_activity). sort_order = 가지 번호×100 + 계열 번호(예: 1-4 → 104). 공개 기간(valid_from·valid_until)은 두지 않는다.')
  push('--   ⑦ image_url: 가장 가까운 기존 배지(재활용 후보)의 image_url을 복사한다(사용자 결정 4, 임시). 대응표는 아래. 원본 계열의 단계 수와 다르면 비례로 맞춘다(원본 n단, 새 m단이면 새 i번째는 원본 ceil(i×n/m)번째).')
  push('--      이미지 파일은 원본 배지와 같은 파일을 가리킨다(복사가 아니라 같은 주소). 원본에 image_url이 없으면 새 행도 NULL이다(INSERT는 통과한다). 드라이런 ③으로 원본에 이미지가 있는지 먼저 본다.')
  push('--      단일(5-4)은 1행이라 위 식이 원본의 «마지막 단계» 이미지를 고른다(원본 walking:A9 4행이면 4번째 행).')
  push('--   ⑧ 트리거 badges_family_consistency(140·134): 등급형은 같은 family_key 안에서 측정 조건 키 집합이 같아야 한다. 이 파일의 등급형은 단계마다 같은 키 집합이라 통과한다. 레벨형은 검사 대상이 아니다.')
  push('--   받은 기록·유저·포인트 원장·미션은 바꾸지 않는다.')
  push('--')
  push('-- 알려진 어긋남 (리뷰어·카리나가 알아야 한다)')
  push('--   a. 체크인 «처음 받은 줄»: 5-1·5-4·5-5의 판정(jamActionCheckinMetrics.ts)은 한 유저·한 체크인 배지의 줄 가운데 «활동 시각이 가장 이른 줄»을 새로 받은 배지로 센다.')
  push('--      `record_checkin_earn`(241)이 돌려주는 is_first는 «저장 순서로 처음 들어온 줄»이다. 늦게 동기화된 옛 활동이 나중에 기록되면 두 기준이 갈린다(활동 시각으로는 그 줄이 처음인데 is_first는 false).')
  push('--      그러면 체크인 배지 첫 획득 포인트(is_first 기준)와 이 파일의 5-x 배지 달성(활동 시각 기준)이 서로 다른 줄을 «처음»으로 본다. 이 파일이 넣는 행은 같고 판정할 때 세는 숫자만 갈린다.')
  push('--   b. 2-2: 원고 11절 조건 표기와 엔진 상수(RETURN_REST_DAYS=7)가 모두 «7일 이상 휴식»이다(사용자 결정 3, 원고를 2026-10-19에 14일에서 7일로 고쳤다). condition_json에는 일수를 넣지 않는다.')
  push('--   c. 8-4·8-5: 설명 문구는 «픽업 N회»지만 세는 방식은 서로 다른 아이템 수다(사용자 결정 2, 왕복 부풀림 방지).')
  push('--')
  push('-- 이미지 대응표 (새 family_key → 이미지를 복사할 기존 family_key)')
  for (const l of imageTable) push(l)
  push('--')
  push('-- 되돌림 방법과 사후 확인은 파일 끝에 있다.')
}

/** 숫자 이름 뒤에 붙는 조사(받침 유무). 마지막 숫자 0·1·3·6·7·8(영·일·삼·육·칠·팔)은 받침이 있다 */
function withJosa(label, withBatchim, withoutBatchim) {
  return `${label}${'013678'.includes(label.slice(-1)) ? withBatchim : withoutBatchim}`
}

/**
 * 5-6 한 계열 시드(291)의 머리 주석. 규칙·영향·적용 순서·290과의 관계를 싣는다.
 * @param {{label: string, families: string[], rowCount: number}[]} priorSets 먼저 적용하는 시드(245·248)
 */
function pushLateHeader({ push, rows, fams, imageTable, fileName, priorSets, activeBefore, activeAfter, totalPoints }) {
  const r0 = rows[0]
  const key = FAMILY_DEFS[r0.number].key
  const steps = rows.map((r) => r.condition_json[key])
  const pointText = rows.map((r) => `${r.rarity === 'common' ? 'Common' : r.rarity === 'rare' ? 'Rare' : 'Epic'} ${r.point_reward}`).join('·')
  const priorText = priorSets.map((s) => `${s.label}의 ${s.rowCount}`).join(' + ')
  push(`-- ${fileName}`)
  push('-- JAM 2.0 액티비티 배지: 5-6 계열 «같은 장소에 여러 날 체크인함»(혼자들 «채워 둔 세제 칸») 입력 (티켓 20261026_1018, 상위 20261022_1131. 이름·설명은 2026-10-25 사용자 확정, 원고 11.5절)')
  push('--')
  push('-- 작성만 하고 실행하지 않았다. 실행은 오픈 직전에 사용자 승인과 롤백 실측 뒤 카리나가 한다(오픈 전후 적용 순서 문서 4절). 새 칸·새 제약·새 함수는 없고 badges에 새 행만 넣는다(옛 행과 245·248의 행은 바꾸지 않는다).')
  push('-- 생성: jam-web/scripts/gen-new-activity-badge-families.mjs --set late (원고 06 액티비티 배지.md 2·11절 + 재활용 후보 문서 2절). 손으로 고치지 말고 스크립트를 고쳐 다시 만든다.')
  push('--')
  push('-- ⚠️ 공용 DB 영향: Supabase는 staging과 프로덕션이 한 DB를 쓰므로, 적용하는 순간 옛 프로덕션 코드에도 바로 반영된다.')
  push(`--    넣는 행: ${fams.length}계열 ${rows.length}행(활동 배지, 등급형 ${rows.length}단). 옛 프로덕션의 배지함·배지 목록·어드민 배지 목록에 새 배지가 나타난다.`)
  push(`--    같은 장소에 서로 다른 날 ${steps[0]}일 이상 체크인한 유저는 다음 동기화 끝 판정(JAM_SYNC_TRIGGERS의 ${key})에서 이 배지를 받는다(소급 발급은 따로 돌리지 않는다). 받으면 point_reward만큼 포인트가 지급된다.`)
  push('--    등급형이라 채운 가장 높은 단계 하나만 받는다.')
  push(`--    ${key}는 203이 허용한 기존 JAM! 지표다. 옛 프로덕션 코드가 이 키로 배지를 판정하는지는 이 파일에서 확인하지 않았다(판정 코드는 이 브랜치의 jamActionBadges.ts에 있다). 판정하지 못하는 코드가 도는 동안에는 이 배지가 보이기만 하고 발급되지 않는다.`)
  push('--')
  push('-- ⚠️ 적용 순서: 244 → 245 → 248 → 이 파일. 이 파일은 244·245·248이 모두 적용된 «뒤에» 적용한다.')
  push('--    244(재활용 후보 밖 활동 배지를 끄는 SQL)의 끄기 대상은 «type=activity이고 family_key가 유지 61계열 목록에 없는 배지 전부»라서, 이 파일의 새 행을 244보다 먼저 넣고 244를 돌리면 새 행이 전부 꺼진다.')
  push(`--    아래 가드 ③이 활성 액티비티 배지 수(${ACTIVE_ACTIVITY_AFTER_244} + ${priorText} = ${activeBefore})를 대조해, 244·245·248 적용 전에는 멈춘다.`)
  push('--    245·248의 드라이런·사후 검증 기대값(포인트 합 1410, 1650 등)은 이 파일을 넣기 «전» 숫자이므로 그 검증도 이 파일 앞에서 돌린다.')
  push('--    이 파일은 CHECK 제약을 새로 만들지 않는다. 허용 키 92개는 247까지 적용돼 있어야 한다(246: 86개, 247: 92개, 둘 다 적용 완료). 드라이런 ④가 같은 식으로 새 행을 미리 대조한다.')
  push('--')
  push('-- ⚠️ 마이그레이션 290(기존 액티비티 배지 포인트 일괄 적용)과의 관계 — 활성 액티비티 배지 수가 이 파일로 ' + `${activeBefore} → ${activeAfter}이 된다`)
  push(`--    290의 선행 조건 가드는 «활성 액티비티 배지가 ${activeBefore}개일 때만 진행»이다. 290은 배지 수를 바꾸지 않으므로 이 파일의 가드 ③은 290 앞에서도 뒤에서도 통과한다.`)
  push(`--    (가) 290을 먼저, 이 파일을 나중에: 290은 고치지 않고 통과한다. 다만 이 파일의 포인트는 아래 규칙 ②의 고정값이라, 290 뒤에 배지 포인트 일괄 값(badge_point_policy)을 바꿨다면 이 행은 그 값을 따르지 않는다.`)
  push(`--    (나) 이 파일을 먼저, 290을 나중에: 290의 가드가 ${activeAfter}개를 보고 멈춘다(아무것도 바꾸지 않는다). 이 순서를 쓰려면 290의 가드와 안내 문구의 기대 수를 ${activeBefore}에서 ${activeAfter}(${ACTIVE_ACTIVITY_AFTER_244} + ${priorText} + 이 파일의 ${rows.length})까지 올려 고쳐야 한다.`)
  push('--         이 행들은 290의 범위(삭제되지 않은 숨김 아님 액티비티 배지)에 들어가 정책 표 값으로 다시 쓰인다.')
  push('--    결정(2026-10-26 사용자): (가) 290을 먼저, 이 파일을 나중에 적용한다. 290은 고치지 않는다. 이 파일의 포인트(10·20·50)는 정책 표 기본값과 같으므로 적용 직전에 정책 표가 기본값 그대로인지만 확인한다.')
  push('--')
  push('-- 규칙')
  push(`--   ① 넣는 계열(원고 번호): ${r0.number} (1개 번호, family_key ${fams.length}개). 원고 11.5절의 이름·설명·조건 표기를 한 글자도 바꾸지 않고 쓴다. 트라이브는 혼자들이고 이름 «${r0.name}»은 ${rows.length}단이 같다.`)
  push('--      등급형이라 rarity(Common·Rare·Epic)만 있고 level은 NULL이다(130 제약 badges_rarity_level_exclusive). 숨김 배지는 없다(is_hidden 전부 false).')
  push(`--   ② point_reward: ${pointText}(합 ${totalPoints}). 245·248과 같은 규칙 값이고 배지 포인트 일괄 값(badge_point_policy, 288)의 기본값과 같다. 숨김이 아니라서 badges_hidden_no_points 제약과 부딪히지 않는다.`)
  push(`--   ③ condition_json: {${key}: ${steps.join(' | ')}} (단계마다 키 하나). 지점(poi_id)별로 센 서로 다른 체크인 날(KST) 수의 최댓값이다. 여러 장소의 합이 아니다.`)
  push('--      판정은 엔진 밖 파이프라인(jamActionBadges.ts)이 한다. 메인 엔진은 이 키만 든 조건을 항상 fail 처리한다.')
  push('--   ④ activity_types·admin_category·family_key: 종목과 상관없이 합산하는 계열이라 activity_types=\'{}\'·admin_category NULL(JAM! 필터에 넣지 않는다)·family_key `all:J5-6`이다(248의 합산 계열과 같다).')
  push('--      → 배지 목록의 «전체»에는 나오지만 종목 필터에는 나오지 않는다. 종목을 붙일지는 따로 정한다.')
  push('--      적용 전에 같은 family_key가 이미 있으면 가드 ①이, 같은 이름의 살아 있는 배지가 있으면 가드 ②가 예외를 던져 전체를 되돌린다(되돌림 SQL이 family_key로 지우므로 남의 행이 섞이면 안 된다).')
  push(`--   ⑤ branch_key: ${r0.branch_key}(243의 가지 일곱 중 하나). sort_order = 가지 번호×100 + 계열 번호 = ${r0.sort_order}. 공개 기간(valid_from·valid_until)은 두지 않는다.`)
  push('--   ⑥ image_url: 가장 가까운 기존 배지(재활용 후보)의 image_url을 복사한다(사용자 결정 4, 임시). 대응표는 아래. 원본 n단, 새 m단이면 새 i번째는 원본 ceil(i×n/m)번째다.')
  push('--      이미지 파일은 원본 배지와 같은 파일을 가리킨다(복사가 아니라 같은 주소). 원본에 image_url이 없으면 새 행도 NULL이다(INSERT는 통과한다). 드라이런 ③으로 원본에 이미지가 있는지 먼저 본다.')
  push('--   ⑦ 트리거 badges_family_consistency(140·134): 등급형은 같은 family_key 안에서 측정 조건 키 집합이 같아야 한다. 이 파일은 단계마다 같은 키 하나라 통과한다.')
  push('--   받은 기록·유저·포인트 원장·미션은 바꾸지 않는다.')
  push('--')
  push('-- 이미지 대응표 (새 family_key → 이미지를 복사할 기존 family_key)')
  for (const l of imageTable) push(l)
  push('--')
  push('-- 되돌림 방법과 사후 확인은 파일 끝에 있다.')
}

/** 시드 SQL 전체 본문 */
export function renderSql(rows, { allowedKeys, variant = 'main', priorFamilies = [], priorRowCount = 0, priorSets = [] }) {
  const fileName = variant === 'held' ? HELD_MIGRATION_FILE_NAME : variant === 'late' ? LATE_MIGRATION_FILE_NAME : MIGRATION_FILE_NAME
  const activeBefore = ACTIVE_ACTIVITY_AFTER_244 + priorSets.reduce((s, p) => s + p.rowCount, 0)
  const activeAfter = activeBefore + rows.length
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

  if (variant === 'held') {
    pushHeldHeader({ push, rows, fams, numbersUsed, imageTable, fileName })
  } else if (variant === 'late') {
    pushLateHeader({ push, rows, fams, imageTable, fileName, priorSets, activeBefore, activeAfter, totalPoints })
  } else {
    push(`-- ${fileName}`)
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
  }
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
  if (variant === 'held') {
    push(`-- ⑥ 245가 들어갔는가: 245의 ${priorFamilies.length}계열 ${priorRowCount}행이 있어야 한다(기대값 ${priorFamilies.length} / ${priorRowCount}. 아니면 245를 먼저 적용한다)`)
    push(`--   SELECT count(DISTINCT family_key) AS 계열수, count(*) AS 행수 FROM public.badges WHERE family_key IN (${priorFamilies.map(sqlStr).join(', ')}) AND deleted_at IS NULL;`)
    push('--')
    push('-- ⑦ 244가 들어갔는가: 활성 활동 배지 가운데 새 계열(`:J<번호>` 형식 family_key)이 아닌 것의 수는 244의 «유지 270행»만 남아 있어야 한다')
    push('--   (기대값 270. 244의 기대값과 같은 2026-10-10 조사 기준이라 그 뒤에 옛 형식 배지를 더했다면 달라질 수 있다).')
    push("--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL AND (family_key IS NULL OR family_key !~ ':J[0-9]+-[0-9]+$');")
    push('--')
  } else if (variant === 'late') {
    for (const [i, s] of priorSets.entries()) {
      const mark = ['⑥', '⑦'][i]
      push(`-- ${mark} ${withJosa(s.label, '이', '가')} 들어갔는가: ${s.label}의 ${s.families.length}계열 ${s.rowCount}행이 있어야 한다(기대값 ${s.families.length} / ${s.rowCount}. 아니면 ${withJosa(s.label, '을', '를')} 먼저 적용한다)`)
      push(`--   SELECT count(DISTINCT family_key) AS 계열수, count(*) AS 행수 FROM public.badges WHERE family_key IN (${s.families.map(sqlStr).join(', ')}) AND deleted_at IS NULL;`)
      push('--')
    }
    push('-- ⑧ 244가 들어갔는가: 활성 활동 배지 가운데 새 계열(`:J<번호>` 형식 family_key)이 아닌 것의 수는 244의 «유지 270행»만 남아 있어야 한다')
    push(`--   (기대값 ${ACTIVE_ACTIVITY_AFTER_244}. 244의 기대값과 같은 2026-10-10 조사 기준이라 그 뒤에 옛 형식 배지를 더했다면 달라질 수 있다).`)
    push("--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL AND (family_key IS NULL OR family_key !~ ':J[0-9]+-[0-9]+$');")
    push('--')
    push(`-- ⑨ 가드 ③과 같은 식: 위 ⑤의 활성 활동 배지 수가 ${activeBefore}이어야 이 파일이 통과한다(= ${ACTIVE_ACTIVITY_AFTER_244} + ${priorSets.map((s) => `${s.label}의 ${s.rowCount}`).join(' + ')}. 적용 뒤에는 ${activeAfter}).`)
    push('--   290(기존 액티비티 배지 포인트 일괄 적용)을 이미 적용했는지는 개수에 나타나지 않는다: SELECT to_regclass(\'public.badge_point_backup_290\'); 가 NULL이 아니면 적용했다.')
    push('--')
  }
  push('-- 롤백 실측: 아래 BEGIN 이후 본문(가드 DO 블록, INSERT, 사후 확인 DO 블록)을 한 트랜잭션으로 실행하고 COMMIT 대신 ROLLBACK 한다.')
  push('--   트랜잭션을 못 쓰는 도구(MCP)에서는 본문을 DO 블록 하나로 감싸 마지막에 RAISE EXCEPTION으로 되돌린다(CHECK·트리거·가드 통과를 실측한다).')
  push('')
  push('BEGIN;')
  push('')
  push(`-- 가드${variant === 'late' ? ' ①' : ''}: 같은 family_key가 이미 있으면 멈춘다 (되돌림 SQL이 family_key로 지우므로 남의 행이 섞이면 안 된다)`)
  push('DO $guard$')
  push('BEGIN')
  push(`  IF EXISTS (SELECT 1 FROM public.badges WHERE family_key IN (${familyList})) THEN`)
  push(`    RAISE EXCEPTION '${fileName}: 이미 같은 family_key를 가진 배지가 있다. 드라이런 ①로 확인한다';`)
  push('  END IF;')
  push('END')
  push('$guard$;')
  push('')
  if (variant === 'late') {
    push('-- 가드 ②: 같은 이름의 살아 있는 배지가 이미 있으면 멈춘다 (드라이런 ②와 같은 식)')
    push('DO $guard_name$')
    push('BEGIN')
    push(`  IF EXISTS (SELECT 1 FROM public.badges WHERE deleted_at IS NULL AND name IN (${names.map(sqlStr).join(', ')})) THEN`)
    push(`    RAISE EXCEPTION '${fileName}: 같은 이름의 배지가 이미 있다. 드라이런 ②로 확인한다';`)
    push('  END IF;')
    push('END')
    push('$guard_name$;')
    push('')
    push(`-- 가드 ③: 활성 액티비티 배지 수가 ${activeBefore}개(${ACTIVE_ACTIVITY_AFTER_244} + ${priorSets.map((s) => `${s.label}의 ${s.rowCount}`).join(' + ')})일 때만 진행한다. 244·245·248이 모두 적용된 뒤라는 뜻이다(244가 새 행을 끄는 순서 사고를 막는다)`)
    push('DO $guard_count$')
    push('DECLARE')
    push('  v_active int;')
    push('BEGIN')
    push("  SELECT count(*) INTO v_active FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;")
    push(`  IF v_active <> ${activeBefore} THEN`)
    push(`    RAISE EXCEPTION '${fileName}: 244, 245, 248 적용 전이거나 건수가 계획과 다르다: 활성 액티비티 배지 %개(계획 ${activeBefore}개 = ${ACTIVE_ACTIVITY_AFTER_244} + ${priorSets.map((s) => `${s.label}의 ${s.rowCount}`).join(' + ')}). 아무것도 넣지 않고 멈춘다', v_active;`)
    push('  END IF;')
    push('END')
    push('$guard_count$;')
    push('')
  }
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
  push(variant === 'late' ? '  v_rows int; v_fams int; v_points int; v_hidden int; v_ungrouped int; v_active int;' : '  v_rows int; v_fams int; v_points int; v_hidden int; v_ungrouped int;')
  push('BEGIN')
  push(`  SELECT count(*), count(DISTINCT family_key), COALESCE(sum(point_reward), 0), count(*) FILTER (WHERE is_hidden)`)
  push('    INTO v_rows, v_fams, v_points, v_hidden')
  push(`    FROM public.badges WHERE family_key IN (${familyList}) AND deleted_at IS NULL;`)
  push(`  IF v_rows <> ${rows.length} OR v_fams <> ${fams.length} OR v_points <> ${totalPoints} OR v_hidden <> 0 THEN`)
  push(`    RAISE EXCEPTION '${fileName}: 사후 확인 실패 (행 %, 계열 %, 포인트 합 %, 숨김 %) — 기대값 ${rows.length} / ${fams.length} / ${totalPoints} / 0', v_rows, v_fams, v_points, v_hidden;`)
  push('  END IF;')
  push(`  SELECT count(*) INTO v_ungrouped FROM public.badges WHERE family_key IN (${familyList}) AND ((rarity IS NULL) = (level IS NULL));`)
  push('  IF v_ungrouped <> 0 THEN')
  push(`    RAISE EXCEPTION '${fileName}: 등급과 레벨이 둘 다 있거나 둘 다 없는 행이 % 개 있다', v_ungrouped;`)
  push('  END IF;')
  if (variant === 'late') {
    push("  SELECT count(*) INTO v_active FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;")
    push(`  IF v_active <> ${activeAfter} THEN`)
    push(`    RAISE EXCEPTION '${fileName}: 활성 액티비티 배지 수가 계획과 다르다: %개 — 기대값 ${activeAfter}(= ${activeBefore} + ${rows.length})', v_active;`)
    push('  END IF;')
  }
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

/** 보류 13계열 시드(248). 245의 계열·행 수는 드라이런 ⑥의 기대값으로 싣는다 */
export function generateHeld() {
  const rows = buildRows({ numbers: HELD_SEED_NUMBERS })
  const allowedKeys = readAllowedConditionKeys(fs.readFileSync(HELD_CHECK_MIGRATION_PATH, 'utf8'))
  const prior = buildRows()
  const priorFamilies = [...new Set(prior.map((r) => r.family_key))]
  return { rows, sql: renderSql(rows, { allowedKeys, variant: 'held', priorFamilies, priorRowCount: prior.length }), allowedKeys }
}

/**
 * 5-6 한 계열 시드(291). 245·248의 계열·행 수는 드라이런 ⑥·⑦의 기대값과 선행 조건 가드의 활성 수(270 + 61 + 59)로 싣는다.
 * 앞선 두 시드는 읽기만 하고 그 출력(renderSql 호출)을 바꾸지 않는다.
 */
export function generateLate() {
  const rows = buildRows({ numbers: LATE_SEED_NUMBERS })
  const allowedKeys = readAllowedConditionKeys(fs.readFileSync(LATE_CHECK_MIGRATION_PATH, 'utf8'))
  const priorMain = buildRows()
  const priorHeld = buildRows({ numbers: HELD_SEED_NUMBERS })
  const setOf = (label, list) => ({ label, families: [...new Set(list.map((r) => r.family_key))], rowCount: list.length })
  const priorSets = [setOf('245', priorMain), setOf('248', priorHeld)]
  return { rows, sql: renderSql(rows, { allowedKeys, variant: 'late', priorSets }), allowedKeys, priorSets }
}

function main(argv) {
  const setIdx = argv.indexOf('--set')
  const set = setIdx >= 0 ? argv[setIdx + 1] : 'main'
  if (set !== 'main' && set !== 'held' && set !== 'late') throw new Error(`--set은 main, held, late 중 하나다 («${set}»)`)
  const held = set === 'held'
  const late = set === 'late'
  const includeHeld = argv.includes('--include-held')
  const outIdx = argv.indexOf('--out')
  const outPath = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : late ? LATE_OUT_PATH : held ? HELD_OUT_PATH : DEFAULT_OUT_PATH
  const { rows, sql } = late ? generateLate() : held ? generateHeld() : generate({ includeHeld })
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
