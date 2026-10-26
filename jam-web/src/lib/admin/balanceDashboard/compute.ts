/**
 * 밸런스 서브 대시보드의 지표 6개 계산 (티켓 20261022_1136 1회 a, 운영 로직 19.2절)
 *
 * 순수 함수다. 읽기는 `load.ts`가 하고, 이 파일은 읽어 온 행과 «지금»을 받아 지표별 칸(`MetricPart`)을 만든다.
 * 대상 유저와 기간은 `cohort.ts`, 목표와 최소 표본은 `targets.ts`가 정한다.
 *
 * ## 부족 판정 (`judgeSufficiency`)
 *
 * 표본이 최소 표본보다 적으면 값을 내지 않고 `insufficient`를 돌려준다. 분모가 0이면 표본이 0이라 항상 부족이다.
 * 이유(`reason`)는 둘로 가른다. 관찰 기간을 따지지 않고 센 후보가 최소 표본 이상인데 표본이 모자라면 `period`(관찰 기간 미달), 후보부터 모자라면 `sample`이다.
 * 관찰이 충분한데 실제로 0건인 것은 `ready`의 값 0이다. 부족과 섞이지 않는다.
 *
 * ## 지표별 정의
 *
 * 1. 캡슐 열기: 완결 4주 동안 유저별 캡슐 연 횟수 ÷ 4의 중앙값을 챕터별로 낸다. 유저의 챕터는 구간 끝 시점의 챕터다. 구간 시작 전에 챕터 1에 오른 유저만 표본이다.
 * 2. 챕터 도달: 챕터 1에 오른 지 90일(챕터 5), 365일(챕터 10)이 지난 유저 중 그 기간 안에 해당 챕터에 오른 유저의 비율.
 * 3. 월 아이템 배지: 최근 30일 유저별 발급 수의 중앙값. 챕터 1에 오른 지 28일 이상 된 유저만 표본이다. 발급 경로(`route`)는 가리지 않는다.
 * 4. 등급 체감: 완결 12주 동안 등급별 발급 수 ÷ 대상 유저의 관찰 기간 합(Rare는 유저-주, Epic과 Mystic은 유저-월). 대상이 5명 미만이거나
 *    기대 건수 5건에 모자란 노출량이면 부족이다(앞은 `sample`, 뒤는 노출량이 모자란 이유에 따라 `sample`이나 `period`).
 * 5. 컬렉션 완성: 챕터 1 뒤 60일이 지난 유저 중 그 안에 컬렉션을 하나라도 완성한 비율(첫), 365일이 지난 유저 중 그 안에 소속 트라이브의 공개된 컬렉션을
 *    모두 완성한 비율(트라이브 전체). 컬렉션 완성은 `user_item_book_tier_completions`에 그 컬렉션의 행이 하나라도 있는 것이다(Common이 첫 등급).
 * 6. 인벤토리: 남은 칸(`max_slots - used_slots`)이 3 이하인 유저 ÷ 인벤토리가 있는 유저. 지금 시점이다.
 *
 * 시각 구간은 «이상 ~ 미만»이다.
 */
import {
  capsuleWindow,
  chapterAt,
  DAY_MS,
  isSuspendedDuring,
  monthlyWindow,
  rarityWindow,
  WEEK_MS,
  type Cohort,
  type CohortUser,
} from './cohort'
import {
  CAPSULE_CHAPTER_NUMBERS,
  CAPSULE_WINDOW_WEEKS,
  COLLECTION_HORIZON_DAYS,
  INVENTORY_LOW_FREE_SLOTS,
  MIN_SAMPLE_USERS,
  MONTH_DAYS,
  MONTHLY_MIN_OBSERVED_DAYS,
  partSpec,
  RARITY_KEYS,
  RARITY_WINDOW_WEEKS,
  REACH_HORIZONS,
} from './targets'
import type {
  CapsuleOpenRow,
  InsufficientMeasurement,
  InventoryRow,
  ItemBookRow,
  ItemIssueRow,
  Measurement,
  MetricPart,
  MetricPartSpec,
  SampleUnit,
  TierCompletionRow,
} from './types'

export interface SufficiencyInput {
  /** 지금 센 표본 */
  sample: number
  minSample: number
  /** 관찰 기간을 따지지 않고 센 후보(표본과 같은 단위). 후보가 최소 표본 이상인데 표본이 모자라면 관찰 기간 미달이다 */
  candidates: number
  sampleUnit: SampleUnit
}

/** 표본이 충분하면 `null`, 모자라면 부족 상태를 돌려준다 */
export function judgeSufficiency(input: SufficiencyInput): InsufficientMeasurement | null {
  const { sample, minSample, candidates, sampleUnit } = input
  if (sample >= minSample) return null
  return {
    status: 'insufficient',
    reason: candidates >= minSample ? 'period' : 'sample',
    sample: Number.isFinite(sample) ? sample : 0,
    minSample,
    sampleUnit,
  }
}

function ready(value: number, sample: number, sampleUnit: SampleUnit): Measurement {
  return { status: 'ready', value, sample, sampleUnit }
}

/** 값이 하나 이상일 때만 부른다(부족 판정이 먼저 막는다) */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

interface TimedEvent {
  at: number
  rarity: string | null
}

/** 유저별 사건 시각 목록. 읽을 수 없는 시각의 행은 센 적이 없는 것으로 둔다 */
function groupEvents<T extends { user_id: string }>(
  rows: readonly T[],
  pick: (row: T) => { at: string; rarity: string | null }
): Map<string, TimedEvent[]> {
  const byUser = new Map<string, TimedEvent[]>()
  for (const row of rows) {
    const { at, rarity } = pick(row)
    const ms = Date.parse(at)
    if (Number.isNaN(ms)) continue
    const list = byUser.get(row.user_id) ?? []
    list.push({ at: ms, rarity })
    byUser.set(row.user_id, list)
  }
  return byUser
}

/** `from` 이상 `to` 미만 사건의 수. `rarity`를 주면 그 등급만 센다 */
function countBetween(events: readonly TimedEvent[] | undefined, from: number, to: number, rarity?: string): number {
  if (!events) return 0
  return events.filter((event) => event.at >= from && event.at < to && (rarity === undefined || event.rarity === rarity)).length
}

/** 지표 1: 챕터별 캡슐 열기 속도(유저 한 명이 한 주에 연 횟수의 중앙값) */
export function computeCapsuleOpens(cohort: Cohort, opens: readonly CapsuleOpenRow[], now: Date): MetricPart[] {
  const { start, end } = capsuleWindow(now)
  const eventsByUser = groupEvents(opens, (row) => ({ at: row.opened_at, rarity: null }))

  const candidatesByChapter = new Map<number, CohortUser[]>()
  for (const user of cohort.users) {
    if (isSuspendedDuring(user, start, end)) continue
    const chapterNo = chapterAt(user, end)
    if (chapterNo < 1) continue
    const list = candidatesByChapter.get(chapterNo) ?? []
    list.push(user)
    candidatesByChapter.set(chapterNo, list)
  }

  return CAPSULE_CHAPTER_NUMBERS.map((chapterNo) => {
    const spec = partSpec('capsule_open', `chapter:${chapterNo}`)
    const inChapter = candidatesByChapter.get(chapterNo) ?? []
    const observed = inChapter.filter((user) => user.chapter1At <= start)
    const insufficient = judgeSufficiency({
      sample: observed.length,
      minSample: spec.minSample,
      candidates: inChapter.length,
      sampleUnit: spec.sampleUnit,
    })
    if (insufficient) return { id: spec.id, measurement: insufficient }
    const perWeek = observed.map((user) => countBetween(eventsByUser.get(user.id), start, end) / CAPSULE_WINDOW_WEEKS)
    return { id: spec.id, measurement: ready(median(perWeek), observed.length, spec.sampleUnit) }
  })
}

/** 지표 2: 챕터 1 뒤 정해진 기간 안에 해당 챕터에 오른 유저의 비율 */
export function computeChapterReach(cohort: Cohort, now: Date): MetricPart[] {
  const nowMs = now.getTime()
  return REACH_HORIZONS.map(({ chapterNo, days }) => {
    const spec = partSpec('chapter_reach', `chapter:${chapterNo}`)
    const horizon = days * DAY_MS
    const candidates = cohort.users.filter((user) => !isSuspendedDuring(user, user.chapter1At, user.chapter1At + horizon))
    const matured = candidates.filter((user) => user.chapter1At + horizon <= nowMs)
    const insufficient = judgeSufficiency({
      sample: matured.length,
      minSample: spec.minSample,
      candidates: candidates.length,
      sampleUnit: spec.sampleUnit,
    })
    if (insufficient) return { id: spec.id, measurement: insufficient }
    const reached = matured.filter((user) => {
      const at = user.reachedAt.get(chapterNo)
      return at !== undefined && at <= user.chapter1At + horizon
    })
    return { id: spec.id, measurement: ready(reached.length / matured.length, matured.length, spec.sampleUnit) }
  })
}

/** 지표 3: 최근 30일 유저별 아이템 배지 발급 수의 중앙값 */
export function computeMonthlyItems(cohort: Cohort, issues: readonly ItemIssueRow[], now: Date): MetricPart[] {
  const spec = partSpec('monthly_items', 'monthly')
  const { start, end } = monthlyWindow(now)
  const eventsByUser = groupEvents(issues, (row) => ({ at: row.created_at, rarity: row.rarity }))

  const candidates = cohort.users.filter((user) => !isSuspendedDuring(user, start, end))
  const observed = candidates.filter((user) => user.chapter1At <= end - MONTHLY_MIN_OBSERVED_DAYS * DAY_MS)
  const insufficient = judgeSufficiency({
    sample: observed.length,
    minSample: spec.minSample,
    candidates: candidates.length,
    sampleUnit: spec.sampleUnit,
  })
  if (insufficient) return [{ id: spec.id, measurement: insufficient }]

  const counts = observed.map((user) => countBetween(eventsByUser.get(user.id), Math.max(start, user.chapter1At), end))
  return [{ id: spec.id, measurement: ready(median(counts), observed.length, spec.sampleUnit) }]
}

/** 지표 4: 등급별 발급 속도(유저 한 명이 한 주 또는 한 달에 받은 수) */
export function computeRarityFeel(cohort: Cohort, issues: readonly ItemIssueRow[], now: Date): MetricPart[] {
  const { start, end } = rarityWindow(now)
  const eventsByUser = groupEvents(issues, (row) => ({ at: row.created_at, rarity: row.rarity }))

  const members = cohort.users.filter((user) => user.chapter1At < end && !isSuspendedDuring(user, start, end))
  const observedDays = sum(members.map((user) => (end - Math.max(start, user.chapter1At)) / DAY_MS))
  const fullWindowDays = members.length * RARITY_WINDOW_WEEKS * (WEEK_MS / DAY_MS)

  // 노출량이 충분해도 대상이 5명 미만이면 한두 명의 운으로 정해진 속도라 값을 내지 않는다
  const tooFewUsers = judgeSufficiency({
    sample: members.length,
    minSample: MIN_SAMPLE_USERS,
    candidates: members.length,
    sampleUnit: 'user',
  })

  return RARITY_KEYS.map((rarity) => {
    const spec = partSpec('rarity_feel', rarity)
    if (tooFewUsers) return { id: spec.id, measurement: tooFewUsers }
    const daysPerUnit = spec.sampleUnit === 'user_week' ? WEEK_MS / DAY_MS : MONTH_DAYS
    const exposure = observedDays / daysPerUnit
    const insufficient = judgeSufficiency({
      sample: exposure,
      minSample: spec.minSample,
      candidates: fullWindowDays / daysPerUnit,
      sampleUnit: spec.sampleUnit,
    })
    if (insufficient) return { id: spec.id, measurement: insufficient }
    const issued = sum(
      members.map((user) => countBetween(eventsByUser.get(user.id), Math.max(start, user.chapter1At), end, rarity))
    )
    return { id: spec.id, measurement: ready(issued / exposure, exposure, spec.sampleUnit) }
  })
}

/** 지표 5: 챕터 1 뒤 정해진 기간 안에 컬렉션을 완성한 유저의 비율(첫 컬렉션, 소속 트라이브 전체) */
export function computeCollectionComplete(
  cohort: Cohort,
  completions: readonly TierCompletionRow[],
  books: readonly ItemBookRow[],
  now: Date
): MetricPart[] {
  const nowMs = now.getTime()

  // 유저별로 컬렉션마다 가장 이른 완성 시각
  const completedAt = new Map<string, Map<string, number>>()
  for (const row of completions) {
    const at = Date.parse(row.completed_at)
    if (Number.isNaN(at)) continue
    const perBook = completedAt.get(row.user_id) ?? new Map<string, number>()
    const earlier = perBook.get(row.item_book_id)
    if (earlier === undefined || at < earlier) perBook.set(row.item_book_id, at)
    completedAt.set(row.user_id, perBook)
  }

  const booksByTribe = new Map<string, Set<string>>()
  for (const book of books) {
    if (book.tribe_id === null) continue
    const set = booksByTribe.get(book.tribe_id) ?? new Set<string>()
    set.add(book.id)
    booksByTribe.set(book.tribe_id, set)
  }

  const first = measureCompletion({
    spec: partSpec('collection_complete', 'first'),
    horizon: COLLECTION_HORIZON_DAYS.first * DAY_MS,
    nowMs,
    users: cohort.users,
    isDone: (user, horizonEnd) => {
      const perBook = completedAt.get(user.id)
      return perBook !== undefined && [...perBook.values()].some((at) => at <= horizonEnd)
    },
  })

  const tribe = measureCompletion({
    spec: partSpec('collection_complete', 'tribe'),
    horizon: COLLECTION_HORIZON_DAYS.tribe * DAY_MS,
    nowMs,
    // 소속 트라이브가 없거나 그 트라이브에 공개된 컬렉션이 없으면 «전체 완성»을 따질 수 없어 분모에서 뺀다
    users: cohort.users.filter((user) => user.tribeId !== null && (booksByTribe.get(user.tribeId)?.size ?? 0) > 0),
    isDone: (user, horizonEnd) => {
      const perBook = completedAt.get(user.id)
      const tribeBooks = booksByTribe.get(user.tribeId ?? '')
      if (perBook === undefined || tribeBooks === undefined) return false
      return [...tribeBooks].every((bookId) => {
        const at = perBook.get(bookId)
        return at !== undefined && at <= horizonEnd
      })
    },
  })

  return [first, tribe]
}

function measureCompletion(args: {
  spec: MetricPartSpec
  horizon: number
  nowMs: number
  users: readonly CohortUser[]
  isDone: (user: CohortUser, horizonEnd: number) => boolean
}): MetricPart {
  const { spec, horizon, nowMs, users, isDone } = args
  const candidates = users.filter((user) => !isSuspendedDuring(user, user.chapter1At, user.chapter1At + horizon))
  const matured = candidates.filter((user) => user.chapter1At + horizon <= nowMs)
  const insufficient = judgeSufficiency({
    sample: matured.length,
    minSample: spec.minSample,
    candidates: candidates.length,
    sampleUnit: spec.sampleUnit,
  })
  if (insufficient) return { id: spec.id, measurement: insufficient }
  const done = matured.filter((user) => isDone(user, user.chapter1At + horizon))
  return { id: spec.id, measurement: ready(done.length / matured.length, matured.length, spec.sampleUnit) }
}

/** 지표 6: 지금 인벤토리가 거의 가득 찬(남은 칸 3 이하) 유저의 비율 */
export function computeInventoryFull(cohort: Cohort, inventories: readonly InventoryRow[], now: Date): MetricPart[] {
  const spec = partSpec('inventory_full', 'full')
  const nowMs = now.getTime()
  const byUser = new Map(inventories.map((row) => [row.user_id, row]))

  const members = cohort.users.filter((user) => byUser.has(user.id) && !isSuspendedDuring(user, nowMs, nowMs + 1))
  const insufficient = judgeSufficiency({
    sample: members.length,
    minSample: spec.minSample,
    candidates: members.length,
    sampleUnit: spec.sampleUnit,
  })
  if (insufficient) return [{ id: spec.id, measurement: insufficient }]

  const full = members.filter((user) => {
    const row = byUser.get(user.id)
    return row !== undefined && Math.max(0, row.max_slots - row.used_slots) <= INVENTORY_LOW_FREE_SLOTS
  })
  return [{ id: spec.id, measurement: ready(full.length / members.length, members.length, spec.sampleUnit) }]
}
