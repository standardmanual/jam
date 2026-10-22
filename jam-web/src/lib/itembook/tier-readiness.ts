/**
 * 컬렉션 4등급 켜기 전 점검 — 순수 함수 (티켓 20261022_1139 1회, 상위 20261022_1131 묶음 7)
 *
 * `docs/service/content/ITEMBOOK_TIERS.md` 2절의 점검 세 가지를 화면이 같은 결과로 보이게 한다.
 *   1. 이름 점검 — 컬렉션의 아이템 배지(소프트 삭제 제외)를 이름별로 묶어 등급이 몇 개씩 있는지 센다.
 *      한 이름에 같은 등급이 둘 이상이거나 이름마다 등급 수가 다르면 «경고»다. 켜기를 막지 않는다.
 *   2. 장착한 등급 분포 — 유저별로 장착한 배지의 등급을 모아 여러 등급을 장착한 유저를 센다.
 *      소프트 삭제된 배지에 꽂힌 장착도 센다(호출부가 `deleted_at`을 걸지 않고 읽는다). 이 유저가 있으면 켜기를 막는다.
 *   3. 등급별 완성 기록 — 행이 하나라도 있으면 끄기를 막는다(기록이 어느 규칙에도 속하지 않게 된다).
 *
 * 결과에는 유저 id를 싣지 않는다. 숫자만 낸다(화면·API 응답으로 그대로 나가기 때문이다).
 * DB 조회는 `lib/admin/itembookTier.ts`가 한다. 이 파일은 서버·DB 모듈을 가져오지 않아 화면에서 타입을 가져와도 된다.
 */

/**
 * 등급 순서(`badge_rarity`). `completion-basis.ts`의 `COMPLETION_TIER_ORDER`와 같은 순서다.
 * 그 파일은 드랍 엔진을 끌어오므로 화면이 값으로 가져올 수 있게 여기에 따로 둔다.
 */
export const TIER_ORDER = ['common', 'rare', 'epic', 'mystic'] as const

export type TierName = (typeof TIER_ORDER)[number]

function asTier(value: string | null | undefined): TierName | null {
  return (TIER_ORDER as readonly string[]).includes(value ?? '') ? (value as TierName) : null
}

/** 컬렉션에 속한 소프트 삭제되지 않은 아이템 배지 한 개 */
export interface TierBadgeInput {
  name: string
  rarity: string | null
}

/** 장착 한 행. `rarity`는 꽂힌 배지의 등급이다(삭제된 배지여도 읽은 값) */
export interface TierSlotInput {
  userId: string
  rarity: string | null
}

export interface NameTierRow {
  name: string
  /** 등급별 배지 수 */
  counts: Record<TierName, number>
  /** 등급이 비어 있는 배지 수 — 어느 등급의 칸에도 들지 않는다 */
  noTierCount: number
  /** 배지가 하나라도 있는 등급 수 */
  tierCount: number
  /** 같은 등급의 배지가 둘 이상 */
  hasDuplicateTier: boolean
}

export interface NameCheck {
  /** 서로 다른 이름 수 */
  nameCount: number
  /** 이름순 */
  rows: NameTierRow[]
  /** 같은 등급 배지가 둘 이상인 이름 수 */
  duplicateTierNameCount: number
  /** 등급 수별 이름 수(등급 수 오름차순). 한 줄이면 이름마다 등급 수가 같다 */
  tierCountGroups: { tierCount: number; nameCount: number }[]
  /** 이름마다 등급 수가 다르다 */
  tierCountMismatch: boolean
  /** 등급이 비어 있는 배지 수(컬렉션 전체) */
  noTierBadgeCount: number
}

export interface TierDistribution {
  /** 장착 행 수(삭제된 배지에 꽂힌 장착 포함) */
  slotCount: number
  /** 장착한 유저 수 */
  userCount: number
  /** 등급별로 장착한 유저 수. 여러 등급을 장착한 유저는 각 등급에 한 번씩 들어간다 */
  userCountByTier: Record<TierName, number>
  /** 등급이 비어 있는 배지에 꽂힌 장착 수 — 등급 판별에서 빠진다 */
  noTierSlotCount: number
  /** 여러 등급을 장착한 유저 수 — 켜기 전에 정리가 필요한 건수 */
  multiTierUserCount: number
  /** 여러 등급을 장착한 유저를 등급 조합별로 센 것(유저 수 많은 순) */
  multiTierCombos: { tiers: TierName[]; userCount: number }[]
}

export interface TierReadinessInput {
  badges: TierBadgeInput[]
  slots: TierSlotInput[]
  /** 이 컬렉션의 등급별 완성 기록 행 수 */
  tierCompletionCount: number
}

export interface TierReadiness {
  names: NameCheck
  distribution: TierDistribution
  /** 이 컬렉션의 등급별 완성 기록 행 수 */
  tierCompletionCount: number
  /** 켜기를 막는 조건이 없다 — 여러 등급을 장착한 유저가 없을 때만 true다. 이름 점검은 막지 않는다 */
  canEnable: boolean
  /** 끄기를 막는 조건이 없다 — 등급별 완성 기록이 없을 때만 true다 */
  canDisable: boolean
}

function emptyTierCounts(): Record<TierName, number> {
  return { common: 0, rare: 0, epic: 0, mystic: 0 }
}

/** 이름 점검 — 이름×등급 표와 경고 판정. `ITEMBOOK_TIERS.md` 2절 SQL 1번과 같은 묶음이다. */
export function checkTierNames(badges: readonly TierBadgeInput[]): NameCheck {
  const byName = new Map<string, NameTierRow>()
  let noTierBadgeCount = 0

  for (const badge of badges) {
    let row = byName.get(badge.name)
    if (!row) {
      row = { name: badge.name, counts: emptyTierCounts(), noTierCount: 0, tierCount: 0, hasDuplicateTier: false }
      byName.set(badge.name, row)
    }
    const tier = asTier(badge.rarity)
    if (tier) row.counts[tier] += 1
    else {
      row.noTierCount += 1
      noTierBadgeCount += 1
    }
  }

  const rows = [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const row of rows) {
    row.tierCount = TIER_ORDER.filter((tier) => row.counts[tier] > 0).length
    row.hasDuplicateTier = TIER_ORDER.some((tier) => row.counts[tier] > 1)
  }

  const groupMap = new Map<number, number>()
  for (const row of rows) groupMap.set(row.tierCount, (groupMap.get(row.tierCount) ?? 0) + 1)
  const tierCountGroups = [...groupMap.entries()]
    .map(([tierCount, nameCount]) => ({ tierCount, nameCount }))
    .sort((a, b) => a.tierCount - b.tierCount)

  return {
    nameCount: rows.length,
    rows,
    duplicateTierNameCount: rows.filter((row) => row.hasDuplicateTier).length,
    tierCountGroups,
    tierCountMismatch: tierCountGroups.length > 1,
    noTierBadgeCount,
  }
}

/** 장착한 등급 분포 — `ITEMBOOK_TIERS.md` 2절 SQL 2번(유저별로 서로 다른 등급을 센다)과 같은 결과다. */
export function summarizeTierDistribution(slots: readonly TierSlotInput[]): TierDistribution {
  const tiersByUser = new Map<string, Set<TierName>>()
  let noTierSlotCount = 0

  for (const slot of slots) {
    let tiers = tiersByUser.get(slot.userId)
    if (!tiers) {
      tiers = new Set<TierName>()
      tiersByUser.set(slot.userId, tiers)
    }
    const tier = asTier(slot.rarity)
    if (tier) tiers.add(tier)
    else noTierSlotCount += 1
  }

  const userCountByTier = emptyTierCounts()
  const comboCounts = new Map<string, { tiers: TierName[]; userCount: number }>()
  let multiTierUserCount = 0

  for (const tiers of tiersByUser.values()) {
    const ordered = TIER_ORDER.filter((tier) => tiers.has(tier))
    for (const tier of ordered) userCountByTier[tier] += 1
    if (ordered.length > 1) {
      multiTierUserCount += 1
      const key = ordered.join('+')
      const combo = comboCounts.get(key) ?? { tiers: ordered, userCount: 0 }
      combo.userCount += 1
      comboCounts.set(key, combo)
    }
  }

  const multiTierCombos = [...comboCounts.entries()]
    .sort(([keyA, a], [keyB, b]) => b.userCount - a.userCount || (keyA < keyB ? -1 : keyA > keyB ? 1 : 0))
    .map(([, combo]) => combo)

  return {
    slotCount: slots.length,
    userCount: tiersByUser.size,
    userCountByTier,
    noTierSlotCount,
    multiTierUserCount,
    multiTierCombos,
  }
}

/** 세 가지 점검을 합쳐 켜기·끄기 가능 여부를 낸다. */
export function evaluateTierReadiness(input: TierReadinessInput): TierReadiness {
  const names = checkTierNames(input.badges)
  const distribution = summarizeTierDistribution(input.slots)
  return {
    names,
    distribution,
    tierCompletionCount: input.tierCompletionCount,
    canEnable: distribution.multiTierUserCount === 0,
    canDisable: input.tierCompletionCount === 0,
  }
}
