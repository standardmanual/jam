/**
 * JAM 2.0 새 액티비티 배지 계열 시드(마이그레이션 245) — 생성기와 엔진 평가 가능성 (티켓 20261018_1816 3회)
 *
 * 검증 대상:
 *  ① 생성기(`scripts/gen-new-activity-badge-families.mjs`): 번호 대조, 행 수·포인트·종류 규칙, 번호가 어긋나면 던지는지,
 *     디스크의 245 파일이 생성기 출력과 같은지(손으로 고친 흔적·낡은 파일 방지), SQL 본문에 쓰기 문장이 INSERT뿐인지
 *  ② DB 제약 쪽: 조건 키가 242의 CHECK 허용 키(80개)와 레지스트리에 있고 값이 레지스트리 스키마를 지키는지,
 *     계열 정합성 트리거(140)와 같은 규칙(등급형 계열 안에서 측정 키 집합 일치)
 *  ③ 엔진이 새 계열을 평가하는지: 걷기 두 계열은 `evaluateConditionDetailed`, JAM! 지표 12계열은 실제 발급 경로
 *     (`evaluateJamActionBadges`, `evaluateUsageBadges` → `issueQualifyingBadges`)에 생성한 행을 그대로 넣어 단계별 발급을 본다
 *  ④ 이름 충돌: 엔진이 등급형을 «이름»으로 묶으므로 다른 계열과 이름이 겹치지 않아야 한다(3-2를 뺀 근거)
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/new-activity-families-seed.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeCondition, BadgeRow } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'

// ── 모킹 (jam-action-new-keys-evaluate.test.ts·usage-badges.test.ts와 같은 자리) ────────────
const mocks = vi.hoisted(() => ({
  awardPoints: vi.fn(async () => null),
  recordFeedEvent: vi.fn(async () => {}),
  computers: {
    countCombineAttempts: vi.fn(),
    countCombineFail: vi.fn(),
    countCombineSuccess: vi.fn(),
    fetchFirstSuccessRecipeIds: vi.fn(),
    countDroppedItems: vi.fn(),
    countPickedUpByUsers: vi.fn(),
    countPickedUpItems: vi.fn(),
    countPickupFromUsers: vi.fn(),
    countCollectionCompletions: vi.fn(),
    countMissionCompletions: vi.fn(),
    countCapsuleOpens: vi.fn(),
    countLockedItemOpens: vi.fn(),
    countLockedItemPickups: vi.fn(),
    countOtherTribeItemKinds: vi.fn(),
    countCrossTribeCombineSuccess: vi.fn(),
    readChapterReached: vi.fn(),
    readJamTotalEarned: vi.fn(),
    readJamWeeklyEarned: vi.fn(),
    countDaysSinceSignup: vi.fn(),
    countRecentActiveDays: vi.fn(),
    countSameSpotCheckinDays: vi.fn(),
    countWeeklyActiveDays: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: mocks.recordFeedEvent }))
vi.mock('@/lib/points', () => ({ awardPoints: mocks.awardPoints }))
vi.mock('../jamActionMetrics', () => ({
  countCombineAttempts: mocks.computers.countCombineAttempts,
  countCombineFail: mocks.computers.countCombineFail,
  countCombineSuccess: mocks.computers.countCombineSuccess,
  fetchFirstSuccessRecipeIds: mocks.computers.fetchFirstSuccessRecipeIds,
}))
// 티켓 20261019_0542 2회: 새 키 계산 함수·순수 함수가 늘어도 이 시험이 쓰는 값만 대체하도록 나머지는 원본을 둔다
vi.mock('../jamActionDropMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jamActionDropMetrics')>()),
  countDroppedItems: mocks.computers.countDroppedItems,
  countPickedUpByUsers: mocks.computers.countPickedUpByUsers,
  countPickedUpItems: mocks.computers.countPickedUpItems,
  countPickupFromUsers: mocks.computers.countPickupFromUsers,
}))
vi.mock('../jamActionCompletionMetrics', () => ({
  countCollectionCompletions: mocks.computers.countCollectionCompletions,
  countMissionCompletions: mocks.computers.countMissionCompletions,
}))
vi.mock('../jamActionItemMetrics', () => ({
  countCapsuleOpens: mocks.computers.countCapsuleOpens,
  countLockedItemOpens: mocks.computers.countLockedItemOpens,
  countLockedItemPickups: mocks.computers.countLockedItemPickups,
  countOtherTribeItemKinds: mocks.computers.countOtherTribeItemKinds,
  countCrossTribeCombineSuccess: mocks.computers.countCrossTribeCombineSuccess,
}))
vi.mock('../jamActionJamMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jamActionJamMetrics')>()),
  readChapterReached: mocks.computers.readChapterReached,
  readJamTotalEarned: mocks.computers.readJamTotalEarned,
  readJamWeeklyEarned: mocks.computers.readJamWeeklyEarned,
}))
vi.mock('../jamActionDayMetrics', () => ({
  countDaysSinceSignup: mocks.computers.countDaysSinceSignup,
  countRecentActiveDays: mocks.computers.countRecentActiveDays,
  countSameSpotCheckinDays: mocks.computers.countSameSpotCheckinDays,
  countWeeklyActiveDays: mocks.computers.countWeeklyActiveDays,
}))

import {
  BRANCH_OF_NUMBER,
  FAMILY_DEFS,
  HELD_FAMILIES,
  LEVEL_POINT,
  RARITY_POINTS,
  RECYCLE_PATH,
  MANUSCRIPT_PATH,
  CHECK_MIGRATION_PATH,
  DEFAULT_OUT_PATH,
  TARGET_NUMBERS,
  buildRows,
  generate,
  readAllowedConditionKeys,
  verifyNumbering,
} from '../../../../scripts/gen-new-activity-badge-families.mjs'
import { evaluateConditionDetailed } from '../index'
import { evaluateJamActionBadges, JAM_ACTION_CONDITION_KEYS } from '../jamActionBadges'
import { evaluateUsageBadges } from '../usageBadges'
import { badgeKindOf } from '../badgeKind'
import {
  ALL_CONDITION_KEYS,
  MEASURABLE_CONDITION_KEYS,
  findBlockingConditionKeys,
  getConditionField,
} from '../conditionRegistry'

type SeedRow = ReturnType<typeof buildRows>[number]

const manuscript = fs.readFileSync(MANUSCRIPT_PATH, 'utf8')
const recycle = fs.readFileSync(RECYCLE_PATH, 'utf8')
const rows: SeedRow[] = buildRows()
const MIGRATIONS_DIR = path.dirname(DEFAULT_OUT_PATH)

const BRANCHES = Object.values(BRANCH_OF_NUMBER)
const ACTIVE_NUMBERS = TARGET_NUMBERS.filter((n) => !(n in HELD_FAMILIES))

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

// ═══════════════════════════════════════════════════════════════════════
// ① 생성기
// ═══════════════════════════════════════════════════════════════════════

describe('생성기 — 번호 대조와 행 규칙', () => {
  it('기본 출력은 15계열 중 보류 3-2를 뺀 14계열 61행이다', () => {
    expect(Object.keys(HELD_FAMILIES)).toEqual(['3-2'])
    expect(ACTIVE_NUMBERS).toHaveLength(14)
    expect(new Set(rows.map((r) => r.number))).toEqual(new Set(ACTIVE_NUMBERS))
    expect(families(rows).size).toBe(14)
    expect(rows).toHaveLength(61)
  })

  it('--include-held는 3-2를 종목마다 계열 하나로 더해 19계열 81행이 된다', () => {
    const all = buildRows({ includeHeld: true })
    expect(families(all).size).toBe(19)
    expect(all).toHaveLength(81)
    const held = all.filter((r) => r.number === '3-2')
    expect(new Set(held.map((r) => r.activity_types[0]))).toEqual(
      new Set(['walking', 'running', 'trail_running', 'cycling', 'hiking'])
    )
    // 4절 종목별 보정: 걷기·러닝·자전거 1·5·20·50, 트레일러닝 1·4·16·40, 등산 1·3·12·30
    const valuesOf = (sport: string) =>
      ordered(held.filter((r) => r.activity_types[0] === sport)).map((r) => (r.condition_json as { total_count: number }).total_count)
    expect(valuesOf('walking')).toEqual([1, 5, 20, 50])
    expect(valuesOf('trail_running')).toEqual([1, 4, 16, 40])
    expect(valuesOf('hiking')).toEqual([1, 3, 12, 30])
    expect((held[0].condition_json as { time_range: unknown }).time_range).toEqual({ start: '18:00', end: '22:00' })
  })

  it('종류와 포인트: 등급형 10·20·50·100, 레벨형은 레벨마다 10, 숨김은 없다', () => {
    for (const r of rows) {
      expect(r.type).toBe('activity')
      expect((r.rarity === null) !== (r.level === null)).toBe(true) // 마이그레이션 130 제약과 같다
      expect(r.point_reward).toBe(r.rarity ? RARITY_POINTS[r.rarity as keyof typeof RARITY_POINTS] : LEVEL_POINT)
      expect(r.is_hidden).toBe(false)
      expect(BRANCHES).toContain(r.branch_key)
      expect(r.description.length).toBeGreaterThan(0)
      expect(r.name.length).toBeGreaterThan(0)
    }
    expect(RARITY_POINTS).toEqual({ common: 10, rare: 20, epic: 50, mystic: 100 })
  })

  it('원고 번호별 단계 수와 값이 2절·11절과 같다', () => {
    const expected: Record<string, number[]> = {
      '6-1': [5, 7.5, 10, 20],
      '6-2': [60, 90, 120, 180],
      '7-1': [1000, 5000, 20000, 50000, 100000],
      '7-2': [200, 330, 830, 1200],
      '8-1': [5, 20, 50, 100, 200],
      '8-2': [1, 10, 30, 100],
      '8-3': [1, 5, 20, 50],
      '8-6': [1, 5, 30, 50, 100],
      '8-7': [1, 5, 30, 50, 100],
      '8-8': [3, 5, 10],
      '8-9': [5, 20, 50, 100, 200],
      '8-10': [1, 3, 10],
      '8-11': [1, 5, 20, 50, 100],
      '8-12': [1, 5, 20, 50, 100],
    }
    for (const [number, values] of Object.entries(expected)) {
      expect(ordered(rows.filter((r) => r.number === number)).map(thresholdOf)).toEqual(values)
    }
  })

  it('family_key는 계열마다 하나이고 기존 관례(종목:코드)를 따르며 서로 겹치지 않는다', () => {
    const keys = [...families(rows).keys()]
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^(walking|running|trail_running|cycling|hiking|jam):J\d+-\d+$/)
    // 기존 v5 시드의 family_key와 충돌하지 않는다
    const seed = JSON.parse(
      fs.readFileSync(path.resolve(MIGRATIONS_DIR, '..', '..', '..', 'docs/assets/content-seed/seed_v5_activity_badges.rows.json'), 'utf8')
    ) as { family_key: string }[]
    const existing = new Set(seed.map((s) => s.family_key))
    for (const k of keys) expect(existing.has(k)).toBe(false)
  })

  it('JAM! 지표 계열은 activity_types가 비고 admin_category가 jam이며, 걷기 계열은 걷기 하나다', () => {
    for (const r of rows) {
      if (FAMILY_DEFS[r.number].scope === 'jam') {
        expect(r.activity_types).toEqual([])
        expect(r.admin_category).toBe('jam')
        expect(r.family_key.startsWith('jam:')).toBe(true)
        expect(Object.keys(r.condition_json)).toEqual([FAMILY_DEFS[r.number].key])
      } else {
        expect(r.activity_types).toEqual(['walking'])
        expect(r.admin_category).toBeNull()
        expect((r.condition_json as { activity_type: string }).activity_type).toBe('walking')
      }
    }
  })

  it('이미지 원본은 재활용 후보 계열(244 유지 목록)에서만 고른다', () => {
    const sql244 = fs.readFileSync(path.join(MIGRATIONS_DIR, '244_deactivate_activity_badges_outside_recycle.sql'), 'utf8')
    for (const src of new Set(rows.map((r) => r.image.src_family_key))) {
      expect(sql244).toContain(`'${src}'`)
    }
  })

  it('원고의 번호·값이 어긋나면 번호 대조가 던진다', () => {
    // 2절 단계 값과 11절 조건 표기 값이 다르다
    const brokenValue = manuscript.replace('| 8-3 | 믹스에 성공한 횟수 | 등급형 4단 | 1·5·20·50회 |', '| 8-3 | 믹스에 성공한 횟수 | 등급형 4단 | 1·5·20·60회 |')
    expect(brokenValue).not.toBe(manuscript)
    expect(() => buildRows({ manuscript: brokenValue })).toThrow(/번호 대조 8-3/)
    // 2절 조건 이름이 11절 제목과 다르다
    const brokenTitle = manuscript.replace('| 8-6 | 컬렉션을 완성한 횟수 |', '| 8-6 | 컬렉션을 모은 횟수 |')
    expect(() => buildRows({ manuscript: brokenTitle })).toThrow(/번호 대조 8-6/)
    // 단계 수가 다르다
    const brokenCount = manuscript.replace('| 8-8 | 도달한 챕터 | 등급형 3단 |', '| 8-8 | 도달한 챕터 | 등급형 4단 |')
    expect(() => buildRows({ manuscript: brokenCount })).toThrow(/번호 대조 8-8/)
    // 재활용 후보 문서에서 분류가 새로 만듦이 아니다
    const brokenRecycle = recycle.replace(/^\| 8-12 \| ([^|]+)\| 새로 만듦 \|/m, '| 8-12 | $1| 그대로 재활용 |')
    expect(brokenRecycle).not.toBe(recycle)
    expect(() => buildRows({ recycle: brokenRecycle })).toThrow(/번호 대조 8-12/)
  })

  it('번호 대조는 15계열 전부(보류 포함)를 통과한다', () => {
    const verified = verifyNumbering({ manuscript, recycle })
    expect([...verified.keys()]).toEqual(TARGET_NUMBERS)
  })
})

describe('생성기 — SQL 파일', () => {
  const { sql, allowedKeys } = generate()
  const body = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

  it('디스크의 245 파일은 생성기 출력과 같다', () => {
    expect(fs.readFileSync(DEFAULT_OUT_PATH, 'utf8')).toBe(sql)
  })

  it('245 번호의 마이그레이션 파일은 하나뿐이다', () => {
    const same = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.startsWith('245_'))
    expect(same).toEqual(['245_seed_new_activity_badge_families.sql'])
  })

  it('쓰기 문장은 badges INSERT 하나뿐이고 옛 객체를 바꾸지 않는다', () => {
    expect(body).not.toMatch(/\b(UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i)
    expect(body.match(/\bINSERT INTO\b/g)).toHaveLength(1)
    expect(body).toContain('INSERT INTO public.badges')
    expect(body).toMatch(/^BEGIN;$/m)
    expect(body).toMatch(/^COMMIT;$/m)
  })

  it('되돌림 SQL 표식, 드라이런·사후 검증, 이미지 대응표가 있다', () => {
    expect(sql).toMatch(/^-- 되돌림 SQL$/m)
    expect(sql).toContain('드라이런')
    expect(sql).toContain('사후 검증')
    expect(sql).toContain('이미지 대응표')
    expect(sql).toContain('244(재활용 후보 밖 활동 배지를 끄는 SQL)를 «먼저» 적용')
    // 되돌림은 family_key 목록으로 지운다
    expect(sql).toMatch(/^-- DELETE FROM public\.badges WHERE family_key IN \(/m)
  })

  it('INSERT 행 수·계열 수·포인트 합이 사후 확인 DO 블록의 기대값과 같다', () => {
    const points = rows.reduce((s, r) => s + r.point_reward, 0)
    expect(sql).toContain(`v_rows <> ${rows.length} OR v_fams <> ${families(rows).size} OR v_points <> ${points}`)
    const valueLines = body.split('\n').filter((l) => /^ {4}\('.*\)[,]?$/.test(l))
    expect(valueLines).toHaveLength(rows.length)
  })

  it('CHECK 허용 키는 242 파일에서 80개를 읽는다', () => {
    expect(allowedKeys).toHaveLength(80)
    expect(new Set(allowedKeys).size).toBe(80)
    expect(readAllowedConditionKeys(fs.readFileSync(CHECK_MIGRATION_PATH, 'utf8'))).toEqual(allowedKeys)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② DB 제약 쪽 (CHECK 허용 키 · 값 스키마 · 계열 정합성 트리거)
// ═══════════════════════════════════════════════════════════════════════

describe('조건 키와 값 — CHECK·레지스트리·계열 정합성 트리거', () => {
  const allowed = new Set(readAllowedConditionKeys(fs.readFileSync(CHECK_MIGRATION_PATH, 'utf8')))
  const registry = new Set<string>(ALL_CONDITION_KEYS)
  const measurable = new Set<string>(MEASURABLE_CONDITION_KEYS)

  it('모든 행의 condition_json 키가 CHECK 허용 키와 레지스트리에 있다', () => {
    for (const r of rows) {
      for (const k of Object.keys(r.condition_json)) {
        expect(allowed.has(k), `${r.family_key} ${k}: CHECK 허용 키 밖`).toBe(true)
        expect(registry.has(k), `${r.family_key} ${k}: 레지스트리 밖`).toBe(true)
      }
    }
  })

  it('값은 레지스트리의 범위·정수 규칙을 지키고, pending·알 수 없는 키·짝 누락이 없다', () => {
    for (const r of rows) {
      const key = FAMILY_DEFS[r.number].key
      const field = getConditionField(key)!
      const v = (r.condition_json as Record<string, number>)[key]
      expect(typeof v).toBe('number')
      expect(v).toBeGreaterThanOrEqual(field.min ?? -Infinity)
      expect(v).toBeLessThanOrEqual(field.max ?? Infinity)
      if (field.input === 'integer') expect(Number.isInteger(v), `${r.family_key} ${key}=${v}`).toBe(true)
      const blocking = findBlockingConditionKeys(r.condition_json as BadgeCondition)
      expect(blocking.unknown).toEqual([])
      expect(blocking.pending).toEqual([])
      expect(blocking.unpaired).toEqual([])
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
      // 같은 (family_key, 등급 또는 레벨)이 둘 이상 없다
      expect(new Set(list.map((r) => `${r.rarity}/${r.level}`)).size).toBe(list.length)
    }
  })

  it('종류 판정: 등급 계열은 graded, 레벨 계열은 leveled(반복형 없음)', () => {
    for (const r of rows) {
      expect(badgeKindOf({ rarity: r.rarity as never, condition_json: r.condition_json as BadgeCondition })).toBe(
        r.level === null ? 'graded' : 'leveled'
      )
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ④ 이름 충돌 — 엔진이 등급형을 이름으로 묶는다
// ═══════════════════════════════════════════════════════════════════════

describe('이름: 등급형은 이름으로 묶이므로 다른 계열과 겹치면 안 된다', () => {
  it('한 이름은 한 family_key에만 있다', () => {
    const owner = new Map<string, string>()
    for (const r of rows) {
      const prev = owner.get(r.name)
      if (prev !== undefined) expect(prev, `이름 «${r.name}»이 둘 이상의 계열에 있다`).toBe(r.family_key)
      owner.set(r.name, r.family_key)
    }
  })

  it('등급형(구간이 아닌 것)은 단계마다 이름이 같고, 구간 계열(6-1·6-2)과 레벨형은 규칙대로다', () => {
    for (const [fk, list] of families(rows)) {
      const names = new Set(list.map((r) => r.name))
      const number = list[0].number
      if (number === '6-1' || number === '6-2') expect(names.size, fk).toBe(list.length) // 구간마다 이름이 다르다
      else expect(names.size, fk).toBe(1)
    }
  })

  it('기존 v5 시드 배지 이름과 겹치지 않는다', () => {
    const seed = JSON.parse(
      fs.readFileSync(path.resolve(MIGRATIONS_DIR, '..', '..', '..', 'docs/assets/content-seed/seed_v5_activity_badges.rows.json'), 'utf8')
    ) as { name: string }[]
    const existing = new Set(seed.map((s) => s.name))
    for (const r of rows) expect(existing.has(r.name), `기존 배지와 이름이 같다: ${r.name}`).toBe(false)
  })

  it('보류한 3-2는 종목별 계열 5개가 같은 이름을 쓰므로 이 규칙을 어긴다(보류 사유의 근거)', () => {
    const held = buildRows({ includeHeld: true }).filter((r) => r.number === '3-2')
    expect(new Set(held.map((r) => r.family_key)).size).toBe(5)
    expect(new Set(held.map((r) => r.name)).size).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ③ 엔진이 새 계열을 평가한다
// ═══════════════════════════════════════════════════════════════════════

function walkingActivity(distanceKm: number, minutes: number): NormalizedActivity {
  return {
    stravaId: 1,
    name: '걷기',
    distanceKm,
    movingTimeSec: Math.round(minutes * 60),
    elevationGainM: 10,
    jamActivityType: 'walking',
    startDate: '2026-10-19T03:00:00Z',
    startDateLocal: '2026-10-19T12:00:00',
    averageSpeedKmh: distanceKm / (minutes / 60),
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
  }
}

describe('엔진 평가 — 걷기 한 번의 활동 계열(6-1, 6-2)', () => {
  for (const number of ['6-1', '6-2']) {
    const list = ordered(rows.filter((r) => r.number === number))
    it.each(list.map((r) => [r.name, r] as const))('%s: 기준값에서 통과하고 기준값 바로 아래에서는 떨어진다', (_name, r) => {
      const threshold = thresholdOf(r)
      const cond = r.condition_json as BadgeCondition
      // 6-1은 거리, 6-2는 시간(분). 걷기 게이트(평균 2~8km/h)를 지키도록 다른 값은 4~5km/h로 맞춘다
      const make = (v: number) => (number === '6-1' ? walkingActivity(v, (v / 5) * 60) : walkingActivity((v / 60) * 4, v))
      expect(evaluateConditionDetailed(cond, [make(threshold)]).pass).toBe(true)
      expect(evaluateConditionDetailed(cond, [make(threshold - 0.5)]).pass).toBe(false)
    })
  }

  it('종목이 다른 활동(러닝)은 걷기 계열을 채우지 않는다', () => {
    const r = rows.find((x) => x.number === '6-1' && x.rarity === 'common')!
    const run = { ...walkingActivity(30, 360), jamActivityType: 'running' as const }
    expect(evaluateConditionDetailed(r.condition_json as BadgeCondition, [run]).pass).toBe(false)
  })
})

// ── JAM! 지표 12계열: 실제 발급 경로에 생성한 행을 넣는다 ──────────────────

const COMPUTER_OF: Record<string, keyof typeof mocks.computers> = {
  combine_success_count: 'countCombineSuccess',
  collection_complete_count: 'countCollectionCompletions',
  mission_complete_count: 'countMissionCompletions',
  capsule_open_count: 'countCapsuleOpens',
  locked_item_open_count: 'countLockedItemOpens',
  other_tribe_item_kinds_count: 'countOtherTribeItemKinds',
  cross_tribe_combine_success_count: 'countCrossTribeCombineSuccess',
  jam_total_earned: 'readJamTotalEarned',
  jam_weekly_earned: 'readJamWeeklyEarned',
  chapter_reached: 'readChapterReached',
}
const USAGE_KEYS = ['follower_count', 'following_count'] as const

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

async function issueFor(key: string, value: number, owned: string[] = []): Promise<string[]> {
  const badges = rows.map(toBadgeRow)
  const inserted: string[] = []
  const supabase = fakeSupabase(badges, owned, inserted)
  if ((USAGE_KEYS as readonly string[]).includes(key)) {
    await evaluateUsageBadges('user-1', key as (typeof USAGE_KEYS)[number], value, supabase)
  } else {
    mocks.computers[COMPUTER_OF[key]].mockResolvedValue(value)
    await evaluateJamActionBadges('user-1', [key as (typeof JAM_ACTION_CONDITION_KEYS)[number]], supabase)
  }
  return inserted
}

beforeEach(() => {
  mocks.awardPoints.mockClear()
  mocks.recordFeedEvent.mockClear()
  for (const fn of Object.values(mocks.computers)) fn.mockReset()
})

describe('엔진 평가 — JAM! 지표 12계열(7·8갈래)', () => {
  const jamFamilies = [...families(rows)].filter(([, list]) => FAMILY_DEFS[list[0].number].scope === 'jam')

  it('12계열이고 조건 키는 JAM! 행동 지표 키 또는 팔로워·팔로잉 사용량 키 중 하나다', () => {
    expect(jamFamilies).toHaveLength(12)
    for (const [, list] of jamFamilies) {
      const key = FAMILY_DEFS[list[0].number].key
      const known = (JAM_ACTION_CONDITION_KEYS as readonly string[]).includes(key) || (USAGE_KEYS as readonly string[]).includes(key)
      expect(known, key).toBe(true)
      expect(key in COMPUTER_OF || (USAGE_KEYS as readonly string[]).includes(key), key).toBe(true)
    }
  })

  for (const [fk, list] of jamFamilies) {
    const sorted = ordered(list)
    const key = FAMILY_DEFS[sorted[0].number].key
    const leveled = sorted[0].level !== null

    it(`${fk} (${key}): 첫 기준값 아래에서는 아무것도 받지 않는다`, async () => {
      expect(await issueFor(key, thresholdOf(sorted[0]) - 1)).toEqual([])
    })

    sorted.forEach((r, i) => {
      if (leveled) {
        it(`${fk} Lv.${r.level}: 값 ${thresholdOf(r)}이면 Lv.1~${r.level}을 차례로 받는다`, async () => {
          const issued = await issueFor(key, thresholdOf(r))
          expect(issued).toEqual(sorted.slice(0, i + 1).map((x) => toBadgeRow(x).id))
        })
      } else {
        it(`${fk} ${r.rarity}: 값 ${thresholdOf(r)}이면 이 단계 하나만 받는다(성장 티어, 최상위 1개)`, async () => {
          const issued = await issueFor(key, thresholdOf(r))
          expect(issued).toEqual([toBadgeRow(r).id])
        })
      }
    })

    it(`${fk}: 받은 배지의 point_reward로 포인트가 지급된다`, async () => {
      const top = sorted[sorted.length - 1]
      const issued = await issueFor(key, thresholdOf(top))
      expect(issued.length).toBeGreaterThan(0)
      const expected = (leveled ? sorted : [top]).reduce((s, r) => s + r.point_reward, 0)
      const paid = mocks.awardPoints.mock.calls.reduce((s, c) => s + (c as unknown as [string, number])[1], 0)
      expect(paid).toBe(expected)
    })
  }

  it('이미 받은 단계는 다시 받지 않고 다음 레벨만 이어서 받는다 (8-11 팔로워)', async () => {
    const sorted = ordered(rows.filter((r) => r.number === '8-11'))
    const owned = [toBadgeRow(sorted[0]).id]
    const issued = await issueFor('follower_count', 20, owned)
    expect(issued).toEqual([toBadgeRow(sorted[1]).id, toBadgeRow(sorted[2]).id])
  })
})
