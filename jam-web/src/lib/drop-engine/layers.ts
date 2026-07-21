/**
 * 드랍엔진 v2 — 순수 함수 레이어 (DB 비의존, randomFn 주입으로 결정론적 테스트 가능)
 * 로직 문서: PRD/badge/BADGE_ENGINE_UNIFIED.md §3
 */
import type { BadgeRarity } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'
import type { DropPolicy } from './policy'

export type Rand = () => number

// ────────────────────────────────────────────────────────────
// Layer 1 — 드랍 발생 (활동당 1개 확정 + 변동 희귀도)
// ────────────────────────────────────────────────────────────

export interface RarityContext {
  commonStreak: number
  isComeback: boolean
  isWeeklyFirst: boolean
  /** 오늘 이미 발생한 드랍 수 (이번 드랍 이전) */
  dailyDropCount: number
}

/**
 * rarity 추첨. 우선순위: 복귀/pity(rare+ 확정) → 일일 하향 → 주간 첫 활동(rare+ 2배) → 기본 분포.
 */
export function rollRarityV2(policy: DropPolicy, ctx: RarityContext, rand: Rand): BadgeRarity {
  const { rarity_common: c, rarity_rare: r, rarity_legendary: l, rarity_mythic: m } = policy

  // rare+ 확정: 복귀 또는 pity — common 제외 후 r/l/m 비율 유지
  if (ctx.isComeback || ctx.commonStreak >= policy.rare_pity_threshold) {
    return pickFromWeights([['rare', r], ['legendary', l], ['mythic', m]], rand)
  }

  // 일일 하향: 당일 N번째 활동부터 common 확률 상향
  if (ctx.dailyDropCount >= policy.daily_downgrade_from - 1) {
    const cc = policy.daily_downgrade_common
    const rest = 1 - cc
    const rlm = r + l + m
    return pickFromWeights(
      [['common', cc], ['rare', rest * (r / rlm)], ['legendary', rest * (l / rlm)], ['mythic', rest * (m / rlm)]],
      rand
    )
  }

  // 주간 첫 활동: rare+ 확률 배수 (상한 0.95)
  if (ctx.isWeeklyFirst) {
    const rarePlus = Math.min((r + l + m) * policy.weekly_first_rare_mult, 0.95)
    const rlm = r + l + m
    return pickFromWeights(
      [
        ['common', 1 - rarePlus],
        ['rare', rarePlus * (r / rlm)],
        ['legendary', rarePlus * (l / rlm)],
        ['mythic', rarePlus * (m / rlm)],
      ],
      rand
    )
  }

  return pickFromWeights([['common', c], ['rare', r], ['legendary', l], ['mythic', m]], rand)
}

/** 고강도 활동 판정 — 보너스 드랍 확률 상향 대상 */
export function isIntenseActivity(policy: DropPolicy, activity: NormalizedActivity): boolean {
  return (
    activity.movingTimeSec >= policy.intense_duration_min * 60 ||
    activity.elevationGainM >= policy.intense_elevation_m
  )
}

/** 2개째 보너스 드랍 여부 */
export function rollBonusDrop(policy: DropPolicy, intense: boolean, rand: Rand): boolean {
  const rate = intense ? policy.bonus_drop_rate_intense : policy.bonus_drop_rate
  return rand() < rate
}

/** 복귀 판정: 직전 활동으로부터 gap일 이상 공백 */
export function isComebackActivity(
  policy: DropPolicy,
  lastActivityAt: string | null,
  activityStartDate: string
): boolean {
  if (!lastActivityAt) return false // 첫 활동은 복귀가 아님 (첫싱크 온보딩 별도)
  const gapMs = new Date(activityStartDate).getTime() - new Date(lastActivityAt).getTime()
  return gapMs >= policy.comeback_gap_days * 24 * 60 * 60 * 1000
}

/** 주간 첫 활동 판정 (월요일 시작 주 키 비교, UTC 기준) */
export function isWeeklyFirstActivity(lastActivityAt: string | null, activityStartDate: string): boolean {
  if (!lastActivityAt) return false
  return mondayKey(new Date(lastActivityAt)) !== mondayKey(new Date(activityStartDate))
}

function mondayKey(d: Date): string {
  const day = d.getUTCDay() // 0=일 … 6=토
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
  return monday.toISOString().slice(0, 10)
}

// ────────────────────────────────────────────────────────────
// Layer 2 — 세계관 선택 (모멘텀/인접/탐험)
// ────────────────────────────────────────────────────────────

export interface FactionPickInput {
  /** 드랍 후보가 존재하는 세계관 id 목록 (활성 + 해당 rarity 배지 보유) */
  candidateFactionIds: string[]
  lastDropFactionId: string | null
  /** lastDropFactionId의 인접 세계관 id 목록 */
  adjacentFactionIds: string[]
  /** 미스터리 헌터 faction id — legendary+ 전용 */
  mysteryFactionId: string | null
  rarity: BadgeRarity
  /** 맥락 오버라이드 후보 (없으면 빈 배열) — 발동 여부는 호출부에서 rand로 결정 후 전달 */
  contextFactionIds: string[]
}

/**
 * 세계관 선택.
 * 1) 미스터리 스파이스: legendary+ 드랍이면 mystery_spice_rate 확률로 미스터리 헌터
 * 2) 맥락 오버라이드: contextFactionIds 있으면 그중 랜덤 (호출부에서 발동률 판정 완료 상태)
 * 3) 모멘텀 50 / 인접 25 / 탐험 15(+오버라이드 미발동분은 모멘텀 흡수)
 * 미스터리 헌터는 rarity < legendary이면 모든 버킷에서 제외.
 */
export function pickFaction(policy: DropPolicy, input: FactionPickInput, rand: Rand): string | null {
  const isHighRarity = input.rarity === 'legendary' || input.rarity === 'mythic'
  const mystery = input.mysteryFactionId

  // 후보에서 미스터리 분리
  const pool = input.candidateFactionIds.filter((id) => id !== mystery)
  const mysteryAvailable = mystery !== null && input.candidateFactionIds.includes(mystery)

  // 1) 미스터리 스파이스 (legendary+ 전용)
  if (isHighRarity && mysteryAvailable && rand() < policy.mystery_spice_rate) {
    return mystery
  }

  if (pool.length === 0) return mysteryAvailable && isHighRarity ? mystery : null

  // 2) 맥락 오버라이드
  const contextPool = input.contextFactionIds.filter((id) => pool.includes(id))
  if (contextPool.length > 0) {
    return contextPool[Math.floor(rand() * contextPool.length)]
  }

  // 3) 모멘텀 / 인접 / 탐험
  const momentum = input.lastDropFactionId && pool.includes(input.lastDropFactionId)
    ? input.lastDropFactionId
    : null
  const adjacent = input.adjacentFactionIds.filter((id) => id !== mystery && pool.includes(id))

  const mw = momentum ? policy.momentum_weight : 0
  const aw = adjacent.length > 0 ? policy.adjacent_weight : 0
  // 오버라이드 미발동분 + 모멘텀/인접 불가분은 전부 탐험으로 흡수 → 합은 항상 1
  const roll = rand() * (mw + aw + Math.max(policy.explore_weight, 1 - mw - aw))

  if (momentum && roll < mw) return momentum
  if (adjacent.length > 0 && roll < mw + aw) {
    return adjacent[Math.floor(rand() * adjacent.length)]
  }
  return pool[Math.floor(rand() * pool.length)]
}

// ────────────────────────────────────────────────────────────
// Layer 3 — 아이템북 선택 (완성 페이싱)
// ────────────────────────────────────────────────────────────

export interface BookCandidate {
  bookId: string
  /** badges.drop_weight 합 등 기본 가중치 (없으면 1) */
  baseWeight: number
  /** 유저의 해당 북 수집률 0.0~1.0 */
  completion: number
}

/**
 * 아이템북 선택: base × (1 − completion × decay), 완성 북은 completed_book_weight 고정 배율,
 * 직전 드랍 북은 same_book_penalty 배율.
 */
export function pickBook(
  policy: DropPolicy,
  candidates: BookCandidate[],
  lastDropBookId: string | null,
  rand: Rand
): string | null {
  if (candidates.length === 0) return null
  const weighted = candidates.map((c) => {
    let w = c.baseWeight
    w *= c.completion >= 1 ? policy.completed_book_weight : 1 - c.completion * policy.completion_decay
    if (lastDropBookId && c.bookId === lastDropBookId) w *= policy.same_book_penalty
    return { bookId: c.bookId, weight: Math.max(w, 0.001) }
  })
  const total = weighted.reduce((s, x) => s + x.weight, 0)
  let roll = rand() * total
  for (const x of weighted) {
    roll -= x.weight
    if (roll <= 0) return x.bookId
  }
  return weighted[weighted.length - 1].bookId
}

/** 일반 가중 랜덤 (누적) */
export function pickFromWeights<T extends string>(entries: Array<[T, number]>, rand: Rand): T {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let roll = rand() * total
  for (const [value, w] of entries) {
    roll -= w
    if (roll <= 0) return value
  }
  return entries[entries.length - 1][0]
}

/** rarity 폴백 순서: 추첨 rarity → 인접 낮은 쪽 → 인접 높은 쪽 */
export function rarityFallbackOrder(rarity: BadgeRarity): BadgeRarity[] {
  const order: BadgeRarity[] = ['common', 'rare', 'legendary', 'mythic']
  const idx = order.indexOf(rarity)
  const result: BadgeRarity[] = [rarity]
  for (let step = 1; step < order.length; step++) {
    if (idx - step >= 0) result.push(order[idx - step])
    if (idx + step < order.length) result.push(order[idx + step])
  }
  return result
}
