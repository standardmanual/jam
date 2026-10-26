/**
 * 밸런스 서브 대시보드 계산 (티켓 20261022_1136 1회 a) — 읽기 없이 행을 직접 넣어 지킨다.
 *
 * 지키는 것:
 * 1. 대상: 시스템 계정·어드민·챕터 1 미도달 유저는 세지 않고, 기간과 겹치는 이용 정지 유저는 그 기간의 표본에서 빠진다
 * 2. 주: KST 월요일 0시 정렬. 일요일 23:59:59와 월요일 0:00:00 KST 사이에서 한 건이 이쪽저쪽으로 갈린다
 * 3. 부족 판정: 4명이면 부족, 5명이면 값(비율형은 19명 부족, 20명 값). 분모 0은 부족. 부족에는 값 칸이 없다
 * 4. 관찰 기간: 관찰이 충분한데 0건인 것은 값 0이고, 대상은 있으나 관찰이 모자라면 부족(period)이다
 * 5. 지표 1~6의 값 계산(중앙값, 비율, 유저-주·유저-월 노출량당 발급 수)
 */
import { describe, it, expect } from 'vitest'
import {
  buildCohort,
  capsuleWindow,
  chapterAt,
  DAY_MS,
  isSuspendedDuring,
  kstWeekStart,
  lastCompleteWeekEnd,
  WEEK_MS,
  type Cohort,
} from '../cohort'
import {
  computeCapsuleOpens,
  computeChapterReach,
  computeCollectionComplete,
  computeInventoryFull,
  computeMonthlyItems,
  computeRarityFeel,
  judgeSufficiency,
} from '../compute'
import type {
  CapsuleOpenRow,
  ChapterUpRow,
  InventoryRow,
  ItemBookRow,
  ItemIssueRow,
  Measurement,
  MetricPart,
  SuspensionRow,
  TierCompletionRow,
  UserRow,
} from '../types'

/** 수요일 12:00 KST */
const NOW = new Date('2026-10-28T03:00:00.000Z')
const NOW_MS = NOW.getTime()
/** 이번 주 월요일 0시 KST = 가장 최근 완결 주의 끝 */
const WEEK_END = Date.parse('2026-10-25T15:00:00.000Z')
const WINDOW_START = WEEK_END - 4 * WEEK_MS
const iso = (ms: number) => new Date(ms).toISOString()

interface Spec {
  id: string
  chapter1At: number
  tribe?: string | null
  admin?: boolean
  /** 챕터 번호 → 오른 시각 */
  reached?: Record<number, number>
  suspended?: Array<{ from: number; until: number | null }>
}

function build(specs: readonly Spec[]): Cohort {
  const users: UserRow[] = []
  const chapterUps: ChapterUpRow[] = []
  const suspensions: SuspensionRow[] = []
  for (const spec of specs) {
    users.push({ id: spec.id, is_admin: spec.admin ?? false, tribe_id: spec.tribe === undefined ? 't1' : spec.tribe })
    chapterUps.push({ user_id: spec.id, chapter_no: 1, reached_at: iso(spec.chapter1At) })
    for (const [chapterNo, at] of Object.entries(spec.reached ?? {})) {
      chapterUps.push({ user_id: spec.id, chapter_no: Number(chapterNo), reached_at: iso(at) })
    }
    for (const range of spec.suspended ?? []) {
      suspensions.push({
        user_id: spec.id,
        suspended_at: iso(range.from),
        lifted_at: range.until === null ? null : iso(range.until),
      })
    }
  }
  return buildCohort({ users, chapterUps, suspensions })
}

/** `count`명을 만든다. `make`가 유저마다 다른 값을 정한다 */
function many(count: number, make: (index: number) => Omit<Spec, 'id'>, prefix = 'u'): Spec[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index}`, ...make(index) }))
}

const LONG_AGO = NOW_MS - 200 * DAY_MS

function part(parts: readonly MetricPart[], id: string): Measurement {
  const found = parts.find((p) => p.id === id)
  if (!found) throw new Error(`칸 ${id}가 없어요`)
  return found.measurement
}

function expectReady(measurement: Measurement, value: number, sample?: number) {
  expect(measurement.status).toBe('ready')
  if (measurement.status !== 'ready') return
  expect(measurement.value).toBeCloseTo(value, 6)
  if (sample !== undefined) expect(measurement.sample).toBeCloseTo(sample, 6)
}

function expectInsufficient(measurement: Measurement, reason: 'sample' | 'period') {
  expect(measurement.status).toBe('insufficient')
  if (measurement.status !== 'insufficient') return
  expect(measurement.reason).toBe(reason)
  // 부족은 숫자가 아니다: 0이나 100%로 읽힐 값 칸이 없다
  expect('value' in measurement).toBe(false)
}

describe('주와 대상 유저', () => {
  it('주는 KST 월요일 0시에 맞춘다: 일요일 23:59:59는 지난 주, 월요일 0:00:00은 새 주다', () => {
    const sundayLastSecond = Date.parse('2026-10-25T14:59:59.000Z')
    const mondayStart = Date.parse('2026-10-25T15:00:00.000Z')
    expect(kstWeekStart(sundayLastSecond)).toBe(Date.parse('2026-10-18T15:00:00.000Z'))
    expect(kstWeekStart(mondayStart)).toBe(mondayStart)
    expect(kstWeekStart(mondayStart + 6 * DAY_MS + 8 * 3_600_000)).toBe(mondayStart)
  })

  it('가장 최근 완결 주의 끝은 이번 주 월요일 0시이고, 지표 1은 그 앞 4주를 본다', () => {
    expect(lastCompleteWeekEnd(NOW)).toBe(WEEK_END)
    expect(capsuleWindow(NOW)).toEqual({ start: WINDOW_START, end: WEEK_END })
  })

  it('시스템 계정, 어드민, 챕터 1에 오르지 않은 유저는 대상이 아니다', () => {
    const system = '00000000-0000-0000-0000-000000000001'
    const cohort = buildCohort({
      users: [
        { id: system, is_admin: false, tribe_id: null },
        { id: 'admin', is_admin: true, tribe_id: null },
        { id: 'no-chapter', is_admin: false, tribe_id: null },
        { id: 'normal', is_admin: false, tribe_id: 't1' },
      ],
      chapterUps: [system, 'admin', 'normal'].map((id) => ({ user_id: id, chapter_no: 1, reached_at: iso(LONG_AGO) })),
      suspensions: [],
    })
    expect(cohort.users.map((user) => user.id)).toEqual(['normal'])
  })

  it('이용 정지 기간이 구간과 겹치는지는 «이상 ~ 미만»으로 가른다', () => {
    const cohort = build([
      { id: 'lifted', chapter1At: LONG_AGO, suspended: [{ from: 100, until: 200 }] },
      { id: 'open', chapter1At: LONG_AGO, suspended: [{ from: 300, until: null }] },
    ])
    const [lifted, open] = cohort.users
    expect(isSuspendedDuring(lifted, 200, 300)).toBe(false)
    expect(isSuspendedDuring(lifted, 199, 300)).toBe(true)
    expect(isSuspendedDuring(open, 0, 300)).toBe(false)
    expect(isSuspendedDuring(open, 0, 301)).toBe(true)
    expect(isSuspendedDuring(open, 10_000_000, 10_000_001)).toBe(true)
  })

  it('챕터는 시각 직전까지 오른 가장 높은 챕터이고, 오른 시각과 같으면 아직 오르지 않은 것이다', () => {
    const [user] = build([{ id: 'u', chapter1At: 1000, reached: { 2: 2000, 3: 3000 } }]).users
    expect(chapterAt(user, 1000)).toBe(0)
    expect(chapterAt(user, 1001)).toBe(1)
    expect(chapterAt(user, 3000)).toBe(2)
    expect(chapterAt(user, 3001)).toBe(3)
  })
})

describe('judgeSufficiency', () => {
  const base = { minSample: 5, sampleUnit: 'user' as const }

  it('표본이 4면 부족이고 5면 값을 낸다', () => {
    expect(judgeSufficiency({ ...base, sample: 5, candidates: 5 })).toBeNull()
    const insufficient = judgeSufficiency({ ...base, sample: 4, candidates: 4 })
    expect(insufficient).toEqual({ status: 'insufficient', reason: 'sample', sample: 4, minSample: 5, sampleUnit: 'user' })
  })

  it('후보는 충분한데 표본이 모자라면 관찰 기간 미달이다', () => {
    expect(judgeSufficiency({ ...base, sample: 2, candidates: 9 })?.reason).toBe('period')
    expect(judgeSufficiency({ ...base, sample: 2, candidates: 4 })?.reason).toBe('sample')
  })

  it('분모가 0이어도 부족이며 값 칸이 없다', () => {
    const insufficient = judgeSufficiency({ ...base, sample: 0, candidates: 0 })
    expect(insufficient?.status).toBe('insufficient')
    expect(insufficient && 'value' in insufficient).toBe(false)
  })
})

describe('지표 1 — 캡슐을 여는 속도', () => {
  const openAt = (userId: string, at: number): CapsuleOpenRow => ({ user_id: userId, opened_at: iso(at) })
  const inWindow = WEEK_END - DAY_MS

  it('챕터 1 유저가 4명이면 부족, 5명이면 주당 열기의 중앙값을 낸다', () => {
    const specs = many(5, () => ({ chapter1At: LONG_AGO }))
    // 유저별 4주 열기 4, 8, 8, 12, 20번 → 주당 1, 2, 2, 3, 5
    const counts = [4, 8, 8, 12, 20]
    const opens = specs.flatMap((spec, index) =>
      Array.from({ length: counts[index] }, () => openAt(spec.id, inWindow))
    )
    expectInsufficient(part(computeCapsuleOpens(build(specs.slice(0, 4)), opens, NOW), 'chapter:1'), 'sample')
    expectReady(part(computeCapsuleOpens(build(specs), opens, NOW), 'chapter:1'), 2, 5)
  })

  it('구간은 월요일 0시 KST에 맞춘다: 시작 시각은 들고 끝 시각은 빠진다', () => {
    const specs = many(5, () => ({ chapter1At: LONG_AGO }))
    const opens = specs.flatMap((spec) => [
      openAt(spec.id, WINDOW_START - 1),
      openAt(spec.id, WINDOW_START),
      openAt(spec.id, WEEK_END - 1),
      openAt(spec.id, WEEK_END),
    ])
    // 4주 안에 든 것은 WINDOW_START와 WEEK_END - 1 두 건 → 주당 0.5
    expectReady(part(computeCapsuleOpens(build(specs), opens, NOW), 'chapter:1'), 0.5)
  })

  it('관찰이 충분한데 열기가 0건이면 부족이 아니라 값 0이다', () => {
    const parts = computeCapsuleOpens(build(many(5, () => ({ chapter1At: LONG_AGO }))), [], NOW)
    expectReady(part(parts, 'chapter:1'), 0, 5)
  })

  it('구간 안에 챕터 1에 오른 유저는 관찰 기간이 모자라 표본이 아니다', () => {
    const parts = computeCapsuleOpens(build(many(5, () => ({ chapter1At: WINDOW_START + DAY_MS }))), [], NOW)
    expectInsufficient(part(parts, 'chapter:1'), 'period')
  })

  it('유저는 구간 끝의 챕터로 묶고, 이용 정지가 구간과 겹치면 표본에서 뺀다', () => {
    const chapter1 = many(5, () => ({ chapter1At: LONG_AGO }), 'a')
    const chapter2 = many(5, () => ({ chapter1At: LONG_AGO, reached: { 2: LONG_AGO + DAY_MS } }), 'b')
    const suspended = many(1, () => ({ chapter1At: LONG_AGO, suspended: [{ from: WINDOW_START + DAY_MS, until: null }] }), 'c')
    const parts = computeCapsuleOpens(build([...chapter1, ...chapter2, ...suspended]), [], NOW)
    expectReady(part(parts, 'chapter:1'), 0, 5)
    expectReady(part(parts, 'chapter:2'), 0, 5)
    expectInsufficient(part(parts, 'chapter:3'), 'sample')
  })
})

describe('지표 2 — 챕터 도달 속도', () => {
  const OLD = NOW_MS - 400 * DAY_MS

  it('챕터 1 뒤 90일이 지난 유저가 19명이면 부족, 20명이면 90일 안에 챕터 5에 오른 비율을 낸다', () => {
    // 12명은 60일째, 1명은 정확히 90일째, 2명은 91일째(늦음)에 챕터 5에 오르고 나머지는 오르지 않았다
    const reachDay = (index: number): number | null => (index < 12 ? 60 : index === 12 ? 90 : index < 15 ? 91 : null)
    const specs = many(20, (index): Omit<Spec, 'id'> => {
      const day = reachDay(index)
      return { chapter1At: OLD, reached: day === null ? {} : { 5: OLD + day * DAY_MS } }
    })
    expectInsufficient(part(computeChapterReach(build(specs.slice(0, 19)), NOW), 'chapter:5'), 'sample')
    expectReady(part(computeChapterReach(build(specs), NOW), 'chapter:5'), 13 / 20, 20)
  })

  it('챕터 10은 365일 안에 오른 비율이다', () => {
    const specs = many(20, (index): Omit<Spec, 'id'> => ({ chapter1At: OLD, reached: index < 3 ? { 10: OLD + 365 * DAY_MS } : {} }))
    expectReady(part(computeChapterReach(build(specs), NOW), 'chapter:10'), 3 / 20)
  })

  it('아직 90일이 지나지 않은 유저는 분모에 넣지 않고, 후보만 많으면 관찰 기간 미달이다', () => {
    const mature = many(20, () => ({ chapter1At: OLD }), 'm')
    const young = many(10, () => ({ chapter1At: NOW_MS - 89 * DAY_MS }), 'y')
    expectReady(part(computeChapterReach(build([...mature, ...young]), NOW), 'chapter:5'), 0, 20)
    expectInsufficient(part(computeChapterReach(build(young.concat(many(10, () => ({ chapter1At: NOW_MS - DAY_MS }), 'z'))), NOW), 'chapter:5'), 'period')
  })

  it('분모가 0이면 부족이다', () => {
    expectInsufficient(part(computeChapterReach(build([]), NOW), 'chapter:5'), 'sample')
  })

  it('그 기간과 겹치는 이용 정지가 있는 유저는 뺀다', () => {
    const specs = [
      ...many(19, () => ({ chapter1At: OLD }), 'ok'),
      { id: 'banned', chapter1At: OLD, suspended: [{ from: OLD + 10 * DAY_MS, until: OLD + 12 * DAY_MS }] },
    ]
    expectInsufficient(part(computeChapterReach(build(specs), NOW), 'chapter:5'), 'sample')
  })
})

describe('지표 3 — 한 달에 받는 아이템 배지', () => {
  const issue = (userId: string, at: number, rarity: string | null = 'common'): ItemIssueRow => ({
    user_id: userId,
    rarity,
    created_at: iso(at),
  })

  it('최근 30일 유저별 발급 수의 중앙값을 내고 30일 밖 발급은 세지 않는다', () => {
    const specs = many(5, () => ({ chapter1At: LONG_AGO }))
    const counts = [10, 20, 24, 30, 40]
    const issues = [
      ...specs.flatMap((spec, index) => Array.from({ length: counts[index] }, () => issue(spec.id, NOW_MS - 5 * DAY_MS))),
      ...specs.map((spec) => issue(spec.id, NOW_MS - 31 * DAY_MS)),
    ]
    expectReady(part(computeMonthlyItems(build(specs), issues, NOW), 'monthly'), 24, 5)
    expectInsufficient(part(computeMonthlyItems(build(specs.slice(0, 4)), issues, NOW), 'monthly'), 'sample')
  })

  it('챕터 1에 오른 지 28일이 안 된 유저는 표본이 아니다 (27일은 빠지고 28일은 든다)', () => {
    const observed = many(4, () => ({ chapter1At: LONG_AGO }), 'o')
    const day27 = [{ id: 'young', chapter1At: NOW_MS - 27 * DAY_MS }]
    const day28 = [{ id: 'edge', chapter1At: NOW_MS - 28 * DAY_MS }]
    expectInsufficient(part(computeMonthlyItems(build([...observed, ...day27]), [], NOW), 'monthly'), 'period')
    expectReady(part(computeMonthlyItems(build([...observed, ...day28]), [], NOW), 'monthly'), 0, 5)
  })

  it('관찰이 충분한데 발급이 0건이면 부족이 아니라 값 0이다', () => {
    expectReady(part(computeMonthlyItems(build(many(5, () => ({ chapter1At: LONG_AGO }))), [], NOW), 'monthly'), 0, 5)
  })
})

describe('지표 4 — 등급 체감', () => {
  const WEEKS_12 = 12 * WEEK_MS
  const issue = (userId: string, at: number, rarity: string | null): ItemIssueRow => ({
    user_id: userId,
    rarity,
    created_at: iso(at),
  })

  it('노출량이 Rare 5유저-주, Epic 5유저-월, Mystic 18유저-월에 이르면 값을 낸다', () => {
    // 12주 내내 관찰된 6명 = 72유저-주 = 16.8유저-월: Rare와 Epic은 충분하고 Mystic(18)은 모자란다
    const six = many(6, () => ({ chapter1At: LONG_AGO }))
    const parts = computeRarityFeel(build(six), [], NOW)
    expectReady(part(parts, 'rare'), 0, 72)
    expectReady(part(parts, 'epic'), 0, 16.8)
    expectInsufficient(part(parts, 'mystic'), 'sample')

    const seven = many(7, () => ({ chapter1At: LONG_AGO }))
    expectReady(part(computeRarityFeel(build(seven), [], NOW), 'mystic'), 0, 19.6)
  })

  it('등급별 발급 수를 노출량으로 나눈다', () => {
    const six = many(6, () => ({ chapter1At: LONG_AGO }))
    const at = WEEK_END - DAY_MS
    const issues = [
      ...Array.from({ length: 12 }, () => issue('u0', at, 'rare')),
      ...Array.from({ length: 3 }, () => issue('u1', at, 'epic')),
      issue('u2', at, 'mystic'),
      issue('u2', at, 'common'),
      issue('u2', at, null),
    ]
    const parts = computeRarityFeel(build(six), issues, NOW)
    expectReady(part(parts, 'rare'), 12 / 72)
    expectReady(part(parts, 'epic'), 3 / 16.8)
  })

  it('노출량이 충분해도 대상이 5명 미만이면 부족이다 (4명은 부족, 5명은 값)', () => {
    const parts = computeRarityFeel(build(many(4, () => ({ chapter1At: LONG_AGO }))), [], NOW)
    for (const id of ['rare', 'epic', 'mystic']) expectInsufficient(part(parts, id), 'sample')
    expectReady(part(computeRarityFeel(build(many(5, () => ({ chapter1At: LONG_AGO }))), [], NOW), 'rare'), 0, 60)
  })

  it('구간은 월요일 0시 KST에 맞춘다: 끝 시각의 발급은 다음 주라서 세지 않는다', () => {
    const six = many(6, () => ({ chapter1At: LONG_AGO }))
    const issues = [
      issue('u0', WEEK_END - 1, 'rare'),
      issue('u0', WEEK_END, 'rare'),
      issue('u0', WEEK_END - WEEKS_12, 'rare'),
      issue('u0', WEEK_END - WEEKS_12 - 1, 'rare'),
    ]
    expectReady(part(computeRarityFeel(build(six), issues, NOW), 'rare'), 2 / 72)
  })

  it('챕터 1에 오른 지 얼마 안 돼 노출량이 모자라면 관찰 기간 미달이다', () => {
    // 3주 관찰된 8명 = 24유저-주(Rare 충분), 5.6유저-월(Mystic 18에 모자라지만 12주 내내였다면 22.4)
    const eight = many(8, () => ({ chapter1At: WEEK_END - 3 * WEEK_MS }))
    const parts = computeRarityFeel(build(eight), [], NOW)
    expectReady(part(parts, 'rare'), 0, 24)
    expectInsufficient(part(parts, 'mystic'), 'period')
  })
})

describe('지표 5 — 컬렉션 완성 속도', () => {
  const OLD = NOW_MS - 400 * DAY_MS
  const books: ItemBookRow[] = [
    { id: 'b1', tribe_id: 't1' },
    { id: 'b2', tribe_id: 't1' },
  ]
  const done = (userId: string, bookId: string, at: number): TierCompletionRow => ({
    user_id: userId,
    item_book_id: bookId,
    completed_at: iso(at),
  })

  it('챕터 1 뒤 60일 안에 컬렉션을 하나라도 완성한 비율과 365일 안에 트라이브 전체를 완성한 비율을 낸다', () => {
    const specs = many(20, () => ({ chapter1At: OLD }))
    const completions = [
      // 13명이 60일째(정확히 경계) 첫 컬렉션 완성
      ...specs.slice(0, 13).map((spec) => done(spec.id, 'b1', OLD + 60 * DAY_MS)),
      // 2명은 61일째라 늦다
      ...specs.slice(13, 15).map((spec) => done(spec.id, 'b1', OLD + 61 * DAY_MS)),
      // 4명은 둘 다 365일 안에 완성, 1명은 둘째를 366일째에 완성
      ...specs.slice(0, 4).map((spec) => done(spec.id, 'b2', OLD + 365 * DAY_MS)),
      done(specs[4].id, 'b2', OLD + 366 * DAY_MS),
    ]
    const parts = computeCollectionComplete(build(specs), completions, books, NOW)
    expectReady(part(parts, 'first'), 13 / 20, 20)
    expectReady(part(parts, 'tribe'), 4 / 20, 20)
  })

  it('같은 컬렉션을 등급별로 여러 번 완성해도 가장 이른 시각으로 한 번 센다', () => {
    const specs = many(20, () => ({ chapter1At: OLD }))
    const completions = specs.flatMap((spec) => [
      done(spec.id, 'b1', OLD + 30 * DAY_MS),
      done(spec.id, 'b1', OLD + 300 * DAY_MS),
      done(spec.id, 'b2', OLD + 300 * DAY_MS),
    ])
    const parts = computeCollectionComplete(build(specs), completions, books, NOW)
    expectReady(part(parts, 'first'), 1)
    expectReady(part(parts, 'tribe'), 1)
  })

  it('표본이 19명이면 부족이고, 공개된 컬렉션이 없는 트라이브의 유저는 트라이브 전체 분모에서 뺀다', () => {
    expectInsufficient(
      part(computeCollectionComplete(build(many(19, () => ({ chapter1At: OLD }))), [], books, NOW), 'first'),
      'sample'
    )
    const noBooks = many(20, () => ({ chapter1At: OLD, tribe: 't2' }))
    const parts = computeCollectionComplete(build(noBooks), [], books, NOW)
    expectReady(part(parts, 'first'), 0, 20)
    expectInsufficient(part(parts, 'tribe'), 'sample')
  })

  it('소속 트라이브가 없는 유저는 트라이브 전체 분모에서 빼고, 이용 정지가 겹치면 두 비율 모두에서 뺀다', () => {
    const specs = [
      ...many(19, () => ({ chapter1At: OLD }), 'ok'),
      { id: 'no-tribe', chapter1At: OLD, tribe: null },
      { id: 'banned', chapter1At: OLD, suspended: [{ from: OLD + DAY_MS, until: null }] },
    ]
    const parts = computeCollectionComplete(build(specs), [], books, NOW)
    expectReady(part(parts, 'first'), 0, 20)
    expectInsufficient(part(parts, 'tribe'), 'sample')
  })
})

describe('지표 6 — 인벤토리가 거의 가득 찬 유저의 비율', () => {
  const inv = (userId: string, max: number, used: number): InventoryRow => ({
    user_id: userId,
    max_slots: max,
    used_slots: used,
  })

  it('인벤토리가 있는 유저가 19명이면 부족, 20명이면 남은 칸 3 이하인 유저의 비율을 낸다', () => {
    const specs = many(20, () => ({ chapter1At: LONG_AGO }))
    // 남은 칸: 0(가득), 3(경계, 가득으로 센다), 4(여유), 사용 칸이 최대보다 많아도 남은 칸은 0
    const inventories = specs.map((spec, index) =>
      index === 0 ? inv(spec.id, 10, 10) : index === 1 ? inv(spec.id, 10, 7) : index === 2 ? inv(spec.id, 10, 6) : index === 3 ? inv(spec.id, 10, 12) : inv(spec.id, 10, 0)
    )
    expectInsufficient(part(computeInventoryFull(build(specs.slice(0, 19)), inventories, NOW), 'full'), 'sample')
    expectReady(part(computeInventoryFull(build(specs), inventories, NOW), 'full'), 3 / 20, 20)
  })

  it('인벤토리 행이 없는 유저, 시스템 계정, 어드민, 지금 이용 정지 중인 유저는 세지 않는다', () => {
    const normal = many(20, () => ({ chapter1At: LONG_AGO }), 'n')
    const noInventory = { id: 'no-inventory', chapter1At: LONG_AGO }
    const admin = { id: 'admin', chapter1At: LONG_AGO, admin: true }
    const banned = { id: 'banned', chapter1At: LONG_AGO, suspended: [{ from: NOW_MS - DAY_MS, until: null }] }
    const lifted = { id: 'lifted', chapter1At: LONG_AGO, suspended: [{ from: NOW_MS - 3 * DAY_MS, until: NOW_MS - DAY_MS }] }
    const inventories = [...normal, admin, banned, lifted].map((spec) => inv(spec.id, 10, 10))
    const cohort = build([...normal, noInventory, admin, banned, lifted])
    // 일반 20명 + 정지가 풀린 1명 = 21명이고 모두 가득
    expectReady(part(computeInventoryFull(cohort, inventories, NOW), 'full'), 1, 21)
  })
})
