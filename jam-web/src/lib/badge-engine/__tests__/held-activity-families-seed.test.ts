/**
 * JAM 2.0 보류 13계열 시드(마이그레이션 248) — 생성기와 엔진 평가 가능성 (티켓 20261019_0542 3회)
 *
 * 검증 대상:
 *  ① 생성기(`scripts/gen-new-activity-badge-families.mjs --set held`): 번호 대조, 행 수·포인트·종류 규칙, 번호·값이 어긋나면 던지는지,
 *     디스크의 248 파일이 생성기 출력과 같은지(손으로 고친 흔적·낡은 파일 방지), 245 출력이 이 확장으로 바뀌지 않았는지,
 *     SQL 본문에 쓰기 문장이 INSERT뿐인지
 *  ② DB 제약 쪽: 조건 키가 247의 CHECK 허용 키(92개)와 레지스트리에 있고 값이 레지스트리 스키마를 지키는지, 계열 정합성 트리거(140)와 같은 규칙
 *  ③ 이름: 같은 원고 번호 안에서만 겹치고(3-2의 종목별 5계열), 245의 행·기존 v5 시드·3-3과 겹치지 않는지
 *  ④ 엔진이 새 계열을 평가하는지: 3-2는 `evaluateConditionDetailed`와 계열 묶음 발급, 나머지 12계열은 실제 발급 경로
 *     (`evaluateJamActionBadges` → `issueQualifyingBadges`)에 생성한 행을 그대로 넣어 단계별 발급을 본다
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/held-activity-families-seed.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeCondition, BadgeRow } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'

// ── 모킹 (new-activity-families-seed.test.ts·jam-action-*-evaluate.test.ts와 같은 자리) ────────────
const mocks = vi.hoisted(() => ({
  awardPoints: vi.fn(async () => null),
  recordFeedEvent: vi.fn(async () => {}),
  computers: {
    countReturnStreakWeeks: vi.fn(),
    countFullWeekCount: vi.fn(),
    countFullSeasonYearCount: vi.fn(),
    countDistinctActivityTypeCount: vi.fn(),
    countNewCheckinBadgeCount: vi.fn(),
    countCheckinSeasonYearCount: vi.fn(),
    countDroppedItemPickedUpCount: vi.fn(),
    countPickedUpItems: vi.fn(),
  },
  fetchRecognizedActivities: vi.fn(),
  fetchDailyEarnedRows: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: mocks.recordFeedEvent }))
vi.mock('@/lib/points', () => ({ awardPoints: mocks.awardPoints }))
// 계산 모듈은 이 시험이 쓰는 값만 대체하고 순수 함수(activeWeekStreak·countJamWeeks 등)는 원본을 둔다
vi.mock('../jamActionActivityMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jamActionActivityMetrics')>()),
  fetchRecognizedActivities: mocks.fetchRecognizedActivities,
  countReturnStreakWeeks: mocks.computers.countReturnStreakWeeks,
  countFullWeekCount: mocks.computers.countFullWeekCount,
  countFullSeasonYearCount: mocks.computers.countFullSeasonYearCount,
  countDistinctActivityTypeCount: mocks.computers.countDistinctActivityTypeCount,
}))
vi.mock('../jamActionCheckinMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jamActionCheckinMetrics')>()),
  countNewCheckinBadgeCount: mocks.computers.countNewCheckinBadgeCount,
  countCheckinSeasonYearCount: mocks.computers.countCheckinSeasonYearCount,
}))
vi.mock('../jamActionDropMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jamActionDropMetrics')>()),
  countDroppedItemPickedUpCount: mocks.computers.countDroppedItemPickedUpCount,
  countPickedUpItems: mocks.computers.countPickedUpItems,
}))
vi.mock('../jamActionJamMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jamActionJamMetrics')>()),
  fetchDailyEarnedRows: mocks.fetchDailyEarnedRows,
}))

import {
  BRANCH_OF_NUMBER,
  CHECK_MIGRATION_PATH,
  DEFAULT_OUT_PATH,
  FAMILY_DEFS,
  HELD_CHECK_MIGRATION_PATH,
  HELD_MIGRATION_FILE_NAME,
  HELD_OUT_PATH,
  HELD_SEED_NUMBERS,
  LEVEL_POINT,
  MANUSCRIPT_PATH,
  RARITY_POINTS,
  RECYCLE_PATH,
  buildRows,
  generate,
  generateHeld,
  parseNamesAndDescriptions,
  readAllowedConditionKeys,
  verifyNumbering,
} from '../../../../scripts/gen-new-activity-badge-families.mjs'
import { evaluateConditionDetailed } from '../index'
import { evaluateJamActionBadges, JAM_ACTION_CONDITION_KEYS, JAM_ACTION_MODIFIER_KEYS } from '../jamActionBadges'
import { issueQualifyingBadges } from '../usageBadges'
import { badgeKindOf } from '../badgeKind'
import { RETURN_REST_DAYS } from '../jamActionActivityMetrics'
import {
  ALL_CONDITION_KEYS,
  MEASURABLE_CONDITION_KEYS,
  findBlockingConditionKeys,
  getConditionField,
} from '../conditionRegistry'

type SeedRow = ReturnType<typeof buildRows>[number]

const manuscript = fs.readFileSync(MANUSCRIPT_PATH, 'utf8')
const recycle = fs.readFileSync(RECYCLE_PATH, 'utf8')
const rows: SeedRow[] = buildRows({ numbers: HELD_SEED_NUMBERS })
const priorRows: SeedRow[] = buildRows()
const MIGRATIONS_DIR = path.dirname(HELD_OUT_PATH)
const SEED_JSON = path.resolve(MIGRATIONS_DIR, '..', '..', '..', 'docs/assets/content-seed/seed_v5_activity_badges.rows.json')

const SPORTS = ['walking', 'running', 'trail_running', 'cycling', 'hiking']

function families(list: SeedRow[]): Map<string, SeedRow[]> {
  const m = new Map<string, SeedRow[]>()
  for (const r of list) m.set(r.family_key, [...(m.get(r.family_key) ?? []), r])
  return m
}

/** 계열 안에서 단계 순서(등급 서열 또는 레벨)로 정렬 */
function ordered(list: SeedRow[]): SeedRow[] {
  const tier = { common: 1, rare: 2, epic: 3, mystic: 4 } as const
  return [...list].sort((a, b) => (a.level ?? tier[a.rarity as keyof typeof tier]) - (b.level ?? tier[b.rarity as keyof typeof tier]))
}

function thresholdOf(r: SeedRow): number {
  const field = FAMILY_DEFS[r.number].key as string
  return (r.condition_json as Record<string, number>)[field]
}

function valuesOf(number: string, sport?: string): number[] {
  const list = rows.filter((r) => r.number === number && (sport === undefined || r.activity_types[0] === sport))
  return ordered(list).map(thresholdOf)
}

// ═══════════════════════════════════════════════════════════════════════
// ① 생성기
// ═══════════════════════════════════════════════════════════════════════

describe('생성기 — 보류 13계열의 번호 대조와 행 규칙', () => {
  it('13개 번호, 3-2는 종목마다 계열 하나라 17계열 59행이다 (5-6·3-3은 없다)', () => {
    expect(HELD_SEED_NUMBERS).toEqual(['1-4', '2-2', '3-2', '3-4', '3-5', '5-1', '5-2', '5-4', '5-5', '7-3', '7-4', '8-4', '8-5'])
    expect(new Set(rows.map((r) => r.number))).toEqual(new Set(HELD_SEED_NUMBERS))
    expect(families(rows).size).toBe(17)
    expect(rows).toHaveLength(59)
    const perNumber = new Map<string, number>()
    for (const r of rows) perNumber.set(r.number, (perNumber.get(r.number) ?? 0) + 1)
    expect(Object.fromEntries(perNumber)).toEqual({
      '1-4': 3, '2-2': 2, '3-2': 20, '3-4': 3, '3-5': 3, '5-1': 5, '5-2': 3, '5-4': 1, '5-5': 3, '7-3': 3, '7-4': 3, '8-4': 5, '8-5': 5,
    })
  })

  it('종류와 포인트: 등급형 10·20·50, 레벨형은 레벨마다 10, 단일은 Common 10이고 숨김은 없다 (포인트 합 1650)', () => {
    for (const r of rows) {
      expect(r.type).toBe('activity')
      expect((r.rarity === null) !== (r.level === null)).toBe(true) // 마이그레이션 130 제약과 같다
      expect(r.point_reward).toBe(r.rarity ? RARITY_POINTS[r.rarity as keyof typeof RARITY_POINTS] : LEVEL_POINT)
      expect(r.is_hidden).toBe(false)
      expect(Object.values(BRANCH_OF_NUMBER)).toContain(r.branch_key)
      expect(r.description.length).toBeGreaterThan(0)
      expect(r.name.length).toBeGreaterThan(0)
    }
    expect(rows.reduce((s, r) => s + r.point_reward, 0)).toBe(1650)
  })

  it('원고 번호별 단계 수와 값이 2절·4절·11절과 같다', () => {
    const expected: Record<string, number[]> = {
      '1-4': [2, 3, 4],
      '2-2': [2, 4],
      '3-4': [1, 3, 10],
      '3-5': [1, 3, 10],
      '5-1': [3, 10, 25, 50, 100],
      '5-2': [2, 3, 5],
      '5-4': [1],
      '5-5': [1, 3, 10],
      '7-3': [1, 5, 20],
      '7-4': [2, 3, 4],
      '8-4': [1, 5, 30, 50, 100],
      '8-5': [1, 5, 30, 50, 100],
    }
    for (const [number, values] of Object.entries(expected)) {
      expect(valuesOf(number), number).toEqual(values)
    }
    // 3-2는 4절 종목별 보정: 걷기·러닝·자전거 1·5·20·50, 트레일러닝 1·4·16·40, 등산 1·3·12·30
    expect(valuesOf('3-2', 'walking')).toEqual([1, 5, 20, 50])
    expect(valuesOf('3-2', 'running')).toEqual([1, 5, 20, 50])
    expect(valuesOf('3-2', 'cycling')).toEqual([1, 5, 20, 50])
    expect(valuesOf('3-2', 'trail_running')).toEqual([1, 4, 16, 40])
    expect(valuesOf('3-2', 'hiking')).toEqual([1, 3, 12, 30])
  })

  it('조건 키와 보조 키가 티켓 사용자 결정 5와 같다', () => {
    const keysOf = (number: string) => [...new Set(rows.filter((r) => r.number === number).map((r) => Object.keys(r.condition_json).join(',')))]
    expect(keysOf('1-4')).toEqual(['active_week_streak,active_week_min_days'])
    expect(keysOf('2-2')).toEqual(['return_streak_weeks'])
    expect(keysOf('3-4')).toEqual(['full_week_count'])
    expect(keysOf('3-5')).toEqual(['full_season_year_count'])
    expect(keysOf('5-1')).toEqual(['new_checkin_badge_count'])
    expect(keysOf('5-2')).toEqual(['distinct_activity_type_count'])
    expect(keysOf('5-4')).toEqual(['new_checkin_badge_count'])
    expect(keysOf('5-5')).toEqual(['checkin_season_year_count'])
    expect(keysOf('7-3')).toEqual(['jam_week_count,jam_week_min_earned'])
    expect(keysOf('7-4')).toEqual(['jam_week_streak,jam_week_min_earned'])
    expect(keysOf('8-4')).toEqual(['dropped_item_picked_up_count'])
    expect(keysOf('8-5')).toEqual(['pickup_item_count'])
    expect(keysOf('3-2')).toEqual(['activity_type,time_range,total_count'])
    for (const r of rows.filter((x) => x.number === '1-4')) expect((r.condition_json as { active_week_min_days: number }).active_week_min_days).toBe(3)
    for (const r of rows.filter((x) => x.number === '7-3' || x.number === '7-4')) {
      expect((r.condition_json as { jam_week_min_earned: number }).jam_week_min_earned).toBe(200)
    }
    for (const r of rows.filter((x) => x.number === '3-2')) {
      expect((r.condition_json as { time_range: unknown }).time_range).toEqual({ start: '18:00', end: '22:00' })
    }
  })

  it('5-4는 단계 없는 단일이라 Common 한 행이고 값은 1이다', () => {
    const single = rows.filter((r) => r.number === '5-4')
    expect(single).toHaveLength(1)
    expect(single[0].rarity).toBe('common')
    expect(single[0].level).toBeNull()
    expect(single[0].name).toBe('벼룩시장 건너편')
    expect(single[0].point_reward).toBe(10)
    expect(single[0].condition_json).toEqual({ new_checkin_badge_count: 1 })
  })

  it('종목·분류 규칙: 3-2는 종목마다 계열, 7·8갈래는 JAM! 관례, 나머지 합산은 종목 없음·admin_category NULL·all: 접두어', () => {
    for (const r of rows) {
      const scope = FAMILY_DEFS[r.number].scope
      if (scope === 'sports') {
        expect(SPORTS).toContain(r.activity_types[0])
        expect(r.activity_types).toHaveLength(1)
        expect(r.admin_category).toBeNull()
        expect(r.family_key).toBe(`${r.activity_types[0]}:J3-2`)
        expect((r.condition_json as { activity_type: string }).activity_type).toBe(r.activity_types[0])
      } else if (scope === 'jam') {
        expect(r.number.startsWith('7-') || r.number.startsWith('8-')).toBe(true)
        expect(r.activity_types).toEqual([])
        expect(r.admin_category).toBe('jam')
        expect(r.family_key).toBe(`jam:J${r.number}`)
      } else {
        expect(scope).toBe('all')
        expect(r.activity_types).toEqual([])
        expect(r.admin_category).toBeNull()
        expect(r.family_key).toBe(`all:J${r.number}`)
        expect('activity_type' in r.condition_json).toBe(false)
      }
    }
    expect(new Set(rows.filter((r) => FAMILY_DEFS[r.number].scope === 'all').map((r) => r.number))).toEqual(
      new Set(['1-4', '2-2', '3-4', '3-5', '5-1', '5-2', '5-4', '5-5'])
    )
  })

  it('가지·sort_order는 원고 번호에서 정한다 (번호 앞자리 = 가지, 앞자리×100 + 뒷자리)', () => {
    for (const r of rows) {
      const [head, tail] = r.number.split('-').map(Number)
      expect(r.branch_key).toBe(BRANCH_OF_NUMBER[head])
      expect(r.sort_order).toBe(head * 100 + tail)
    }
  })

  it('family_key는 새 형식이고 245의 계열·기존 v5 시드의 family_key와 겹치지 않는다', () => {
    const keys = [...families(rows).keys()]
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^(walking|running|trail_running|cycling|hiking|jam|all):J\d+-\d+$/)
    const prior = new Set(priorRows.map((r) => r.family_key))
    for (const k of keys) expect(prior.has(k), `245와 겹친다: ${k}`).toBe(false)
    const seed = JSON.parse(fs.readFileSync(SEED_JSON, 'utf8')) as { family_key: string }[]
    const existing = new Set(seed.map((s) => s.family_key))
    for (const k of keys) expect(existing.has(k)).toBe(false)
  })

  it('이미지 원본은 재활용 후보 계열(244 유지 목록)에서만 고른다', () => {
    const sql244 = fs.readFileSync(path.join(MIGRATIONS_DIR, '244_deactivate_activity_badges_outside_recycle.sql'), 'utf8')
    for (const src of new Set(rows.map((r) => r.image.src_family_key))) {
      expect(sql244, src).toContain(`'${src}'`)
    }
  })

  it('번호 대조는 13계열 전부를 통과한다', () => {
    const verified = verifyNumbering({ manuscript, recycle, numbers: HELD_SEED_NUMBERS })
    expect([...verified.keys()]).toEqual(HELD_SEED_NUMBERS)
  })

  it('원고의 번호·단계·값이 어긋나면 번호 대조가 던진다', () => {
    const build = (m: string, r = recycle) => () => buildRows({ numbers: HELD_SEED_NUMBERS, manuscript: m, recycle: r })
    // 11절 단계 값이 2절과 다르다
    const brokenValue = manuscript.replace('| Epic | 카메라 좌판 | 주 3일 이상 활동 4주 연속 |', '| Epic | 카메라 좌판 | 주 3일 이상 활동 5주 연속 |')
    expect(brokenValue).not.toBe(manuscript)
    expect(build(brokenValue)).toThrow(/번호 대조 1-4/)
    // 같은 칸의 보조 값(3일)이 정의와 다르다
    const brokenAux = manuscript.replace('| Common | 카메라 좌판 | 주 3일 이상 활동 2주 연속 |', '| Common | 카메라 좌판 | 주 4일 이상 활동 2주 연속 |')
    expect(brokenAux).not.toBe(manuscript)
    expect(build(brokenAux)).toThrow(/번호 대조 1-4.*보조 값/)
    // 7-3의 «200 이상»이 바뀐다
    const brokenJam = manuscript.replace('한 주에 모은 잼 200 이상 1주', '한 주에 모은 잼 300 이상 1주')
    expect(brokenJam).not.toBe(manuscript)
    expect(build(brokenJam)).toThrow(/번호 대조 7-3.*보조 값/)
    // 2-2의 «14일 이상 휴식»이 바뀌면 엔진 상수(7일)와의 어긋남을 다시 판단하도록 던진다
    const brokenRest = manuscript.replace('14일 이상 휴식 후 매주 활동 2주 연속', '7일 이상 휴식 후 매주 활동 2주 연속')
    expect(brokenRest).not.toBe(manuscript)
    expect(build(brokenRest)).toThrow(/번호 대조 2-2.*보조 값/)
    // 2절 단계 값이 다르다 (5-1 레벨형)
    const brokenSteps = manuscript.replace('| 3·10·25·50·100곳 |', '| 3·10·25·50·200곳 |')
    expect(brokenSteps).not.toBe(manuscript)
    expect(build(brokenSteps)).toThrow(/번호 대조 5-1/)
    // 단일이 등급형으로 바뀌었다
    const brokenKind = manuscript.replace('| 5-4 | 가입 뒤 첫 체크인 배지 | 단일 |', '| 5-4 | 가입 뒤 첫 체크인 배지 | 등급형 3단 |')
    expect(brokenKind).not.toBe(manuscript)
    expect(build(brokenKind)).toThrow(/번호 대조 5-4/)
    // 단계 수가 다르다
    const brokenCount = manuscript.replace('| 2-2 | 돌아온 뒤 이어서 움직인 주 | 등급형 2단 |', '| 2-2 | 돌아온 뒤 이어서 움직인 주 | 등급형 3단 |')
    expect(brokenCount).not.toBe(manuscript)
    expect(build(brokenCount)).toThrow(/번호 대조 2-2/)
    // 종목 칸이 합산이 아니다
    const brokenSport = manuscript.replace('| 3-4 | 일곱 요일을 모두 채움 | 등급형 3단 | 1·3·10회 | 합산 |', '| 3-4 | 일곱 요일을 모두 채움 | 등급형 3단 | 1·3·10회 | 종목별 |')
    expect(brokenSport).not.toBe(manuscript)
    expect(build(brokenSport)).toThrow(/번호 대조 3-4/)
    // 재활용 후보 문서에서 분류가 새로 만듦이 아니다
    const brokenRecycle = recycle.replace(/^\| 8-5 \| ([^|]+)\| 새로 만듦 \|/m, '| 8-5 | $1| 그대로 재활용 |')
    expect(brokenRecycle).not.toBe(recycle)
    expect(build(manuscript, brokenRecycle)).toThrow(/번호 대조 8-5/)
  })
})

describe('생성기 — SQL 파일', () => {
  const { sql, allowedKeys } = generateHeld()
  const body = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

  it('디스크의 248 파일은 생성기 출력과 같다', () => {
    expect(path.basename(HELD_OUT_PATH)).toBe(HELD_MIGRATION_FILE_NAME)
    expect(fs.readFileSync(HELD_OUT_PATH, 'utf8')).toBe(sql)
  })

  it('245 파일은 이 확장 뒤에도 생성기 출력과 같고 14계열 61행이다', () => {
    const out = generate()
    expect(out.rows).toHaveLength(61)
    expect(families(out.rows).size).toBe(14)
    expect(fs.readFileSync(DEFAULT_OUT_PATH, 'utf8')).toBe(out.sql)
  })

  it('248 번호의 마이그레이션 파일은 하나뿐이다', () => {
    const same = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.startsWith('248_'))
    expect(same).toEqual(['248_seed_held_activity_badge_families.sql'])
  })

  it('쓰기 문장은 badges INSERT 하나뿐이고 옛 객체를 바꾸지 않는다', () => {
    expect(body).not.toMatch(/\b(UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i)
    expect(body.match(/\bINSERT INTO\b/g)).toHaveLength(1)
    expect(body).toContain('INSERT INTO public.badges')
    expect(body).toMatch(/^BEGIN;$/m)
    expect(body).toMatch(/^COMMIT;$/m)
  })

  it('CHECK 제약을 만드는 파일이 아니라서 조건 레지스트리 시험이 보는 «가장 큰 번호의 CHECK 파일»은 247 그대로다', () => {
    expect(sql).not.toContain('ADD CONSTRAINT badges_condition_json_known_keys')
    const checkFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .filter((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8').includes('ADD CONSTRAINT badges_condition_json_known_keys'))
      .sort()
    expect(checkFiles[checkFiles.length - 1]).toBe('247_condition_json_checkin_drop_jam_keys.sql')
  })

  it('머리에 규칙·영향·적용 순서·알려진 어긋남이, 끝에 되돌림 SQL·드라이런·사후 검증이 있다', () => {
    expect(sql).toMatch(/^-- 되돌림 SQL$/m)
    expect(sql).toContain('드라이런')
    expect(sql).toContain('사후 검증')
    expect(sql).toContain('이미지 대응표')
    expect(sql).toContain('적용 순서: 244 → 245 → 248')
    expect(sql).toContain('둘째 이후는 첫째가 끝난 뒤에 적용')
    expect(sql).toContain('오픈 직전에 적용')
    expect(sql).toContain('공용 DB 영향')
    expect(sql).toContain('활동 시각이 가장 이른 줄')
    expect(sql).toContain('is_first')
    expect(sql).toContain('RETURN_REST_DAYS=7')
    expect(sql).toMatch(/^-- DELETE FROM public\.badges WHERE family_key IN \(/m)
    // 245가 들어갔는지 확인하는 드라이런이 245의 14계열 61행을 기대값으로 쓴다
    expect(sql).toContain('245의 14계열 61행')
  })

  it('INSERT 행 수·계열 수·포인트 합이 사후 확인 DO 블록의 기대값과 같다', () => {
    const points = rows.reduce((s, r) => s + r.point_reward, 0)
    expect(sql).toContain(`v_rows <> ${rows.length} OR v_fams <> ${families(rows).size} OR v_points <> ${points}`)
    const valueLines = body.split('\n').filter((l) => /^ {4}\('.*\)[,]?$/.test(l))
    expect(valueLines).toHaveLength(rows.length)
  })

  it('CHECK 허용 키는 247 파일에서 92개를 읽고, 이 파일의 모든 조건 키가 그 안에 있다', () => {
    expect(allowedKeys).toHaveLength(92)
    expect(new Set(allowedKeys).size).toBe(92)
    expect(readAllowedConditionKeys(fs.readFileSync(HELD_CHECK_MIGRATION_PATH, 'utf8'))).toEqual(allowedKeys)
    // 245 시험이 읽는 242의 80개는 그대로다
    expect(readAllowedConditionKeys(fs.readFileSync(CHECK_MIGRATION_PATH, 'utf8'))).toHaveLength(80)
    const allowed = new Set(allowedKeys)
    for (const r of rows) for (const k of Object.keys(r.condition_json)) expect(allowed.has(k), `${r.family_key} ${k}`).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② DB 제약 쪽 (CHECK 허용 키 · 값 스키마 · 계열 정합성 트리거)
// ═══════════════════════════════════════════════════════════════════════

describe('조건 키와 값 — 레지스트리·계열 정합성 트리거', () => {
  const registry = new Set<string>(ALL_CONDITION_KEYS)
  const measurable = new Set<string>(MEASURABLE_CONDITION_KEYS)

  it('모든 행의 condition_json 키가 레지스트리에 있다', () => {
    for (const r of rows) {
      for (const k of Object.keys(r.condition_json)) expect(registry.has(k), `${r.family_key} ${k}: 레지스트리 밖`).toBe(true)
    }
  })

  it('값은 레지스트리의 범위·정수 규칙을 지키고, pending·알 수 없는 키·짝 누락이 없다', () => {
    for (const r of rows) {
      for (const [key, v] of Object.entries(r.condition_json as Record<string, unknown>)) {
        if (key === 'activity_type' || key === 'time_range') continue
        const field = getConditionField(key)!
        expect(typeof v, `${r.family_key} ${key}`).toBe('number')
        expect(v as number).toBeGreaterThanOrEqual(field.min ?? -Infinity)
        expect(v as number).toBeLessThanOrEqual(field.max ?? Infinity)
        if (field.input === 'integer') expect(Number.isInteger(v), `${r.family_key} ${key}=${v}`).toBe(true)
      }
      const blocking = findBlockingConditionKeys(r.condition_json as BadgeCondition)
      expect(blocking.unknown, r.family_key).toEqual([])
      expect(blocking.pending, r.family_key).toEqual([])
      expect(blocking.unpaired, r.family_key).toEqual([])
    }
  })

  it('계열 정합성(140): 등급형은 계열 안에서 측정 키 집합이 같고, 레벨은 1부터 이어지며 값이 오름차순이다', () => {
    for (const [fk, list] of families(rows)) {
      const sorted = ordered(list)
      const keySets = new Set(sorted.map((r) => JSON.stringify(Object.keys(r.condition_json).filter((k) => measurable.has(k)).sort())))
      if (list[0].level === null) expect(keySets.size, `${fk}: 측정 키 집합이 단계마다 다르다`).toBe(1)
      sorted.forEach((r, i) => {
        if (r.level !== null) expect(r.level).toBe(i + 1)
        if (i > 0) expect(thresholdOf(r)).toBeGreaterThan(thresholdOf(sorted[i - 1]))
      })
      expect(new Set(list.map((r) => `${r.rarity}/${r.level}`)).size).toBe(list.length)
    }
  })

  it('종류 판정: 등급 계열(단일 포함)은 graded, 레벨 계열은 leveled(반복형 없음)', () => {
    for (const r of rows) {
      expect(badgeKindOf({ rarity: r.rarity as never, condition_json: r.condition_json as BadgeCondition })).toBe(
        r.level === null ? 'graded' : 'leveled'
      )
    }
  })

  it('새 키는 JAM! 행동 지표 키(주 키)이거나 보조 키로 등록돼 있고, 3-2의 키는 메인 엔진 키다', () => {
    const mainKeys = ['active_week_streak', 'return_streak_weeks', 'full_week_count', 'full_season_year_count', 'distinct_activity_type_count',
      'new_checkin_badge_count', 'checkin_season_year_count', 'dropped_item_picked_up_count', 'jam_week_count', 'jam_week_streak', 'pickup_item_count']
    for (const k of mainKeys) expect(JAM_ACTION_CONDITION_KEYS as readonly string[], k).toContain(k)
    for (const k of ['active_week_min_days', 'jam_week_min_earned']) expect(JAM_ACTION_MODIFIER_KEYS as readonly string[], k).toContain(k)
    for (const r of rows.filter((x) => x.number === '3-2')) {
      expect(JAM_ACTION_CONDITION_KEYS as readonly string[]).not.toContain('total_count')
      expect(measurable.has('total_count')).toBe(true)
      expect(measurable.has('time_range')).toBe(true)
      expect(r.condition_json).toHaveProperty('total_count')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ③ 이름 — 같은 번호 안에서만 겹친다
// ═══════════════════════════════════════════════════════════════════════

describe('이름: 같은 원고 번호 안에서만 겹치고 다른 계열과 충돌하지 않는다', () => {
  it('한 이름은 한 원고 번호에만 있다 (3-2의 종목별 5계열만 같은 이름을 나눠 쓴다)', () => {
    const owner = new Map<string, string>()
    for (const r of rows) {
      const prev = owner.get(r.name)
      if (prev !== undefined) expect(prev, `이름 «${r.name}»이 둘 이상의 번호에 있다`).toBe(r.number)
      owner.set(r.name, r.number)
    }
    const threeTwo = rows.filter((r) => r.number === '3-2')
    expect(new Set(threeTwo.map((r) => r.name))).toEqual(new Set(['남은 재료의 저녁']))
    expect(new Set(threeTwo.map((r) => r.family_key)).size).toBe(5)
  })

  it('한 계열 안에서는 이름이 하나다(구간 계열이 없다)', () => {
    for (const [fk, list] of families(rows)) expect(new Set(list.map((r) => r.name)).size, fk).toBe(1)
  })

  it('245의 행·기존 v5 시드 배지·원고 3-3의 이름과 겹치지 않는다', () => {
    const names = new Set(rows.map((r) => r.name))
    for (const r of priorRows) expect(names.has(r.name), `245와 이름이 같다: ${r.name}`).toBe(false)
    const seed = JSON.parse(fs.readFileSync(SEED_JSON, 'utf8')) as { name: string }[]
    for (const s of seed) expect(names.has(s.name), `기존 배지와 이름이 같다: ${s.name}`).toBe(false)
    const threeThree = parseNamesAndDescriptions(manuscript).get('3-3')
    expect(threeThree).toBeTruthy()
    for (const row of threeThree!.rows) expect(names.has(row[1]), `3-3과 이름이 같다: ${row[1]}`).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ④ 엔진이 새 계열을 평가한다
// ═══════════════════════════════════════════════════════════════════════

function toBadgeRow(r: SeedRow): BadgeRow {
  return {
    id: `${r.family_key}#${r.rarity ?? `Lv${r.level}`}`,
    name: r.name,
    description: r.description,
    type: 'activity',
    rarity: r.rarity,
    level: r.level,
    family_key: r.family_key,
    sort_order: r.sort_order,
    image_url: null,
    condition_json: r.condition_json,
    activity_types: r.activity_types,
    admin_category: r.admin_category,
    branch_key: r.branch_key,
    is_hidden: r.is_hidden,
    point_reward: r.point_reward,
    valid_from: null,
    valid_until: null,
    deleted_at: null,
  } as unknown as BadgeRow
}

/** 지금 유저가 갖고 있는 배지 id 집합과 이번에 넣은 행을 돌려주는 supabase 흉내 */
function fakeSupabase(badges: BadgeRow[], owned: string[], inserted: string[]) {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'or', 'in', 'order', 'limit']) builder[m] = () => builder
    builder.insert = (payload: { badge_id: string }) => {
      inserted.push(payload.badge_id)
      owned.push(payload.badge_id)
      return Promise.resolve({ data: null, error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => {
      if (table === 'badges') return Promise.resolve({ data: badges, error: null }).then(resolve)
      if (table === 'user_activity_badges') return Promise.resolve({ data: owned.map((id) => ({ badge_id: id })), error: null }).then(resolve)
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

beforeEach(() => {
  mocks.awardPoints.mockClear()
  mocks.recordFeedEvent.mockClear()
  for (const fn of Object.values(mocks.computers)) fn.mockReset()
  mocks.fetchRecognizedActivities.mockReset()
  mocks.fetchDailyEarnedRows.mockReset()
})

// ── 3-2: 메인 엔진(time_range + total_count)과 종목별 계열 묶음 ──────────────────

/** KST `hour`시에 시작한 활동 한 건. 걷기 게이트(평균 2~8km/h)를 지키도록 5km를 1시간에 간다. dayOffset으로 날짜를 달리한다 */
function activityAt(sport: string, dayOffset: number, hourKst: number): NormalizedActivity {
  const startMs = Date.UTC(2026, 0, 5 + dayOffset, hourKst - 9, 0, 0) // KST = UTC+9
  const iso = new Date(startMs).toISOString()
  return {
    stravaId: dayOffset * 100 + hourKst,
    name: '저녁 활동',
    distanceKm: 5,
    movingTimeSec: 3600,
    elevationGainM: 10,
    jamActivityType: sport,
    startDate: iso,
    startDateLocal: new Date(startMs + 9 * 3600 * 1000).toISOString().replace('Z', ''),
    averageSpeedKmh: 5,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
  } as unknown as NormalizedActivity
}

describe('엔진 평가 — 3-2 저녁 활동(종목별 계열 5개)', () => {
  const threeTwo = rows.filter((r) => r.number === '3-2')

  for (const sport of SPORTS) {
    const list = ordered(threeTwo.filter((r) => r.activity_types[0] === sport))
    it.each(list.map((r) => [`${sport} ${r.rarity}`, r] as const))('%s: 저녁(19시) 활동 N일에서 통과하고 N-1일에서는 떨어진다', (_label, r) => {
      const n = thresholdOf(r)
      const cond = r.condition_json as BadgeCondition
      const days = (count: number) => Array.from({ length: count }, (_, i) => activityAt(sport, i, 19))
      expect(evaluateConditionDetailed(cond, days(n)).pass).toBe(true)
      if (n > 1) expect(evaluateConditionDetailed(cond, days(n - 1)).pass).toBe(false)
      else expect(evaluateConditionDetailed(cond, []).pass).toBe(false)
    })
  }

  it('저녁 시간대 밖(오전 10시, 22시 이후)의 활동은 세지 않고, 같은 날 여러 번은 하루로 센다', () => {
    const r = ordered(threeTwo.filter((x) => x.activity_types[0] === 'running'))[0]
    const cond = r.condition_json as BadgeCondition
    expect(evaluateConditionDetailed(cond, [activityAt('running', 0, 10)]).pass).toBe(false)
    expect(evaluateConditionDetailed(cond, [activityAt('running', 0, 23)]).pass).toBe(false)
    const rare = ordered(threeTwo.filter((x) => x.activity_types[0] === 'running'))[1]
    const sameDay = [19, 19, 20, 21, 18].map((h, i) => ({ ...activityAt('running', 0, h), stravaId: i + 1 }))
    expect(evaluateConditionDetailed(rare.condition_json as BadgeCondition, sameDay).pass).toBe(false) // 5건이어도 하루 = 1일
  })

  it('다른 종목의 저녁 활동은 그 종목 계열을 채우지 않는다', () => {
    const r = ordered(threeTwo.filter((x) => x.activity_types[0] === 'hiking'))[0]
    expect(evaluateConditionDetailed(r.condition_json as BadgeCondition, [activityAt('running', 0, 19)]).pass).toBe(false)
  })

  it('같은 이름의 종목별 5계열이 서로 막지 않는다: 등산 상위 등급을 가진 유저도 걷기 첫 단계를 받고, 두 종목이 한 번에 발급된다', async () => {
    const badges = threeTwo.map(toBadgeRow)
    const valueOfSport: Record<string, number> = { walking: 1, hiking: 12, running: 0, trail_running: 0, cycling: 0 }
    const currentValueOf = (b: BadgeRow) => valueOfSport[b.activity_types[0]]
    const thresholdOfBadge = (b: BadgeRow) => (b.condition_json as { total_count: number }).total_count

    const inserted: string[] = []
    await issueQualifyingBadges(fakeSupabase(badges, [], inserted), 'user-1', badges, thresholdOfBadge, currentValueOf, () => 'test', 'held-3-2')
    expect(inserted.sort()).toEqual(['hiking:J3-2#epic', 'walking:J3-2#common'])

    // 등산 최상위(mystic)를 이미 가진 유저도 걷기 common은 받는다 (이름 묶음이었다면 mystic이 common을 영영 막는다)
    const inserted2: string[] = []
    await issueQualifyingBadges(
      fakeSupabase(badges, ['hiking:J3-2#mystic'], inserted2),
      'user-1',
      badges,
      thresholdOfBadge,
      currentValueOf,
      () => 'test',
      'held-3-2'
    )
    expect(inserted2).toEqual(['walking:J3-2#common'])
  })
})

// ── 나머지 12계열: 실제 발급 경로에 생성한 행을 넣는다 ──────────────────────

const TRIGGER_OF_NUMBER: Record<string, string> = {
  '1-4': 'active_week_streak',
  '2-2': 'return_streak_weeks',
  '3-4': 'full_week_count',
  '3-5': 'full_season_year_count',
  '5-1': 'new_checkin_badge_count',
  '5-2': 'distinct_activity_type_count',
  '5-4': 'new_checkin_badge_count',
  '5-5': 'checkin_season_year_count',
  '7-3': 'jam_week_count',
  '7-4': 'jam_week_streak',
  '8-4': 'dropped_item_picked_up_count',
  '8-5': 'pickup_item_count',
}

const COMPUTER_OF: Record<string, keyof typeof mocks.computers> = {
  return_streak_weeks: 'countReturnStreakWeeks',
  full_week_count: 'countFullWeekCount',
  full_season_year_count: 'countFullSeasonYearCount',
  distinct_activity_type_count: 'countDistinctActivityTypeCount',
  new_checkin_badge_count: 'countNewCheckinBadgeCount',
  checkin_season_year_count: 'countCheckinSeasonYearCount',
  dropped_item_picked_up_count: 'countDroppedItemPickedUpCount',
  pickup_item_count: 'countPickedUpItems',
}

function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const MONDAY = '2026-01-05' // 월요일(KST)

/** 연속 `weeks`주(월요일부터), 주마다 `daysPerWeek`일 활동한 기록 */
function activeWeeksActivities(weeks: number, daysPerWeek: number) {
  const out: { dayKey: string; type: string }[] = []
  for (let w = 0; w < weeks; w += 1) for (let d = 0; d < daysPerWeek; d += 1) out.push({ dayKey: addDays(MONDAY, w * 7 + d), type: 'walking' })
  return out
}

/** 주마다 하루 `amount` 잼. `step`이 1이면 연속 주, 2면 한 주씩 건너뛴 주 */
function jamEarnedRows(weeks: number, amount: number, step: number) {
  return Array.from({ length: weeks }, (_, w) => ({ earned_on: addDays(MONDAY, w * 7 * step + 2), amount }))
}

/** 트리거 한 번을 돌리고 이번에 새로 발급된 행(id)을 돌려준다 */
async function issueFor(trigger: string, owned: string[] = []): Promise<string[]> {
  const badges = rows.map(toBadgeRow)
  const inserted: string[] = []
  await evaluateJamActionBadges('user-1', [trigger as (typeof JAM_ACTION_CONDITION_KEYS)[number]], fakeSupabase(badges, owned, inserted))
  return inserted
}

/** 새 계열 하나에 대해 «현재 값 = value»가 되도록 판정 입력을 준비한다 */
function setMetric(number: string, value: number) {
  const trigger = TRIGGER_OF_NUMBER[number]
  if (trigger === 'active_week_streak') mocks.fetchRecognizedActivities.mockResolvedValue(activeWeeksActivities(value, 3))
  else if (trigger === 'jam_week_count') mocks.fetchDailyEarnedRows.mockResolvedValue(jamEarnedRows(value, 200, 2))
  else if (trigger === 'jam_week_streak') mocks.fetchDailyEarnedRows.mockResolvedValue(jamEarnedRows(value, 200, 1))
  else mocks.computers[COMPUTER_OF[trigger]].mockResolvedValue(value)
}

const idsOf = (list: SeedRow[]) => list.map((r) => toBadgeRow(r).id)

describe('엔진 평가 — 활동·체크인·드랍·잼 12계열(실제 발급 경로)', () => {
  for (const number of Object.keys(TRIGGER_OF_NUMBER)) {
    const sorted = ordered(rows.filter((r) => r.number === number))
    const leveled = sorted[0].level !== null
    const label = `${sorted[0].family_key} (${TRIGGER_OF_NUMBER[number]})`

    it(`${label}: 첫 기준값 아래에서는 이 계열을 받지 않는다`, async () => {
      setMetric(number, thresholdOf(sorted[0]) - 1)
      const issued = await issueFor(TRIGGER_OF_NUMBER[number])
      expect(issued.filter((id) => id.startsWith(`${sorted[0].family_key}#`))).toEqual([])
    })

    sorted.forEach((r, i) => {
      if (leveled) {
        it(`${label} Lv.${r.level}: 값 ${thresholdOf(r)}이면 Lv.1~${r.level}을 차례로 받는다`, async () => {
          setMetric(number, thresholdOf(r))
          const issued = await issueFor(TRIGGER_OF_NUMBER[number])
          expect(issued.filter((id) => id.startsWith(`${r.family_key}#`))).toEqual(idsOf(sorted.slice(0, i + 1)))
        })
      } else {
        it(`${label} ${r.rarity}: 값 ${thresholdOf(r)}이면 이 단계 하나만 받는다(성장 티어, 최상위 1개)`, async () => {
          setMetric(number, thresholdOf(r))
          const issued = await issueFor(TRIGGER_OF_NUMBER[number])
          expect(issued.filter((id) => id.startsWith(`${r.family_key}#`))).toEqual(idsOf([r]))
        })
      }
    })

    it(`${label}: 받은 배지의 point_reward로 포인트가 지급된다`, async () => {
      const top = sorted[sorted.length - 1]
      setMetric(number, thresholdOf(top))
      const issued = await issueFor(TRIGGER_OF_NUMBER[number])
      const mine = issued.filter((id) => id.startsWith(`${top.family_key}#`))
      expect(mine.length).toBeGreaterThan(0)
      // 5-1과 5-4처럼 같은 키를 쓰는 계열이 함께 발급되므로 포인트는 이번에 발급된 배지 전체의 합과 맞춘다
      const issuedRows = rows.filter((x) => issued.includes(toBadgeRow(x).id))
      const paid = mocks.awardPoints.mock.calls.reduce((s, c) => s + (c as unknown as [string, number])[1], 0)
      expect(paid).toBe(issuedRows.reduce((s, x) => s + x.point_reward, 0))
    })

    it(`${label}: 이미 받은 단계는 다시 받지 않는다`, async () => {
      const top = sorted[sorted.length - 1]
      setMetric(number, thresholdOf(top))
      const first = await issueFor(TRIGGER_OF_NUMBER[number])
      expect(first.length).toBeGreaterThan(0)
      mocks.awardPoints.mockClear()
      setMetric(number, thresholdOf(top))
      const again = await issueFor(TRIGGER_OF_NUMBER[number], [...first])
      expect(again).toEqual([])
    })
  }

  it('1-4: 한 주에 3일 미만(2일) 활동한 주가 이어져도 «3일 이상인 주의 연속»은 0이라 받지 않는다', async () => {
    mocks.fetchRecognizedActivities.mockResolvedValue(activeWeeksActivities(6, 2))
    expect(await issueFor('active_week_streak')).toEqual([])
    // 3일 이상인 주 사이에 비어 있는 주가 끼면 이어진 것으로 세지 않는다
    mocks.fetchRecognizedActivities.mockResolvedValue([...activeWeeksActivities(1, 3), ...activeWeeksActivities(1, 3).map((a) => ({ ...a, dayKey: addDays(a.dayKey, 14) }))])
    expect(await issueFor('active_week_streak')).toEqual([])
  })

  it('7-3·7-4: 한 주에 잼 200 미만(199)인 주는 세지 않고, 7-3은 건너뛴 주도 쌓아 세고 7-4는 이어진 주만 센다', async () => {
    mocks.fetchDailyEarnedRows.mockResolvedValue(jamEarnedRows(6, 199, 1))
    expect(await issueFor('jam_week_count')).toEqual([])
    expect(await issueFor('jam_week_streak')).toEqual([])

    // 한 주씩 건너뛴 5주: 쌓은 주는 5(Rare까지), 연속은 1(받지 않는다)
    mocks.fetchDailyEarnedRows.mockResolvedValue(jamEarnedRows(5, 200, 2))
    expect(await issueFor('jam_week_count')).toEqual(['jam:J7-3#rare'])
    expect(await issueFor('jam_week_streak')).toEqual([])
  })

  it('5-1과 5-4는 같은 키(new_checkin_badge_count)를 쓴다: 값 1이면 5-4만, 값 3이면 5-4와 5-1 Lv.1을 받는다', async () => {
    mocks.computers.countNewCheckinBadgeCount.mockResolvedValue(1)
    expect(await issueFor('new_checkin_badge_count')).toEqual(['all:J5-4#common'])
    mocks.computers.countNewCheckinBadgeCount.mockResolvedValue(3)
    expect((await issueFor('new_checkin_badge_count')).sort()).toEqual(['all:J5-1#Lv1', 'all:J5-4#common'])
    // 5-4를 이미 가진 유저가 값 3이 되면 5-1 Lv.1만 받는다
    expect(await issueFor('new_checkin_badge_count', ['all:J5-4#common'])).toEqual(['all:J5-1#Lv1'])
  })

  it('보조 키가 계열 조건에 들어 있어 레지스트리가 짝을 요구하는 대로 저장된다(짝 누락 0)', () => {
    for (const r of rows.filter((x) => x.number === '1-4')) expect(findBlockingConditionKeys(r.condition_json as BadgeCondition).unpaired).toEqual([])
    for (const r of rows.filter((x) => x.number === '7-3' || x.number === '7-4')) {
      expect(findBlockingConditionKeys(r.condition_json as BadgeCondition).unpaired).toEqual([])
    }
  })

  it('2-2의 원고 «14일 이상 휴식»과 엔진 상수 7일의 어긋남이 기록된 그대로다(바뀌면 이 시험이 알린다)', () => {
    expect(RETURN_REST_DAYS).toBe(7)
    expect(FAMILY_DEFS['2-2'].aux?.expected).toBe(14)
    expect(FAMILY_DEFS['2-2'].aux?.key).toBeNull()
  })
})
