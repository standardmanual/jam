/**
 * 동기화 아이템 배지 발급 — 순수 판정 (티켓 20261017_1424, 운영 로직 6.2·6.7절)
 *
 * 개수 → 등급 → 후보 선정을 DB·시계·난수에 기대지 않고 계산한다. 난수 함수와 현재 시각은 인자로 받는다.
 * 서버 전용 모듈(`@/lib/supabase/server`, `next/headers`)은 가져오지 않는다 — 클라이언트 번들에서도 안전해야 하고,
 * 시험이 고정한 난수로 분포를 재현해야 하기 때문이다. 정책 타입만 `import type`으로 쓴다(런타임에 지워진다).
 *
 * 규칙(옛 규칙과 달리 보정은 «Common 연속 임계값» 하나뿐이다)
 *  - 개수: 활동마다 확정 개수(등산은 별도 값) + 보너스 굴림(한 번마다 활동 잼 ÷ 분모, 상한). 확정 0 설정은 드랍 없음.
 *  - 등급: 설정 확률. `common_streak >= 임계값`이면 Rare 이상에서만 뽑고, 상대 비율은 설정 확률 비율을 따른다.
 *  - 후보: 소속 트라이브 컬렉션 · 그 등급 · 활성 · 공개 기간 안 · 드랍 제외 아님 · 삭제 아님. 보정 없이 균등 무작위.
 * 값 근거는 운영 로직 6.7절이다. 지급(`grant_inventory_item`)과 기록은 이 모듈의 일이 아니다(`syncIssueRun.ts`).
 *  - 뽑힌 등급에 후보가 없으면 한 등급씩 내려 다시 뽑는다(`pickWithRarityFallback`).
 */
import type { JamPolicy } from '@/lib/jam/policy'
import type { BadgeRarity } from '@/types/database'

export type Rand = () => number

/** 개수·등급 판정이 읽는 정책 칸 */
export type SyncIssuePolicy = Pick<
  JamPolicy,
  | 'sync_item_guaranteed'
  | 'sync_item_guaranteed_hiking'
  | 'sync_item_bonus_rolls'
  | 'sync_item_bonus_jam_divisor'
  | 'sync_item_bonus_max_probability'
  | 'sync_rarity_common'
  | 'sync_rarity_rare'
  | 'sync_rarity_epic'
  | 'sync_rarity_mystic'
  | 'common_streak_threshold'
>

// ────────────────────────────────────────────────────────────
// 1. 개수
// ────────────────────────────────────────────────────────────

export interface ItemCountInput {
  /** 그 활동의 정산 잼 */
  jam: number
  /** 등산 여부 — 확정 개수가 별도 값이다 */
  isHiking: boolean
}

/**
 * 활동 1건이 받을 아이템 배지 개수. 확정 개수 + 보너스 굴림 성공 횟수.
 * 확정 개수가 0이면 «드랍 없음»이어야 하므로 보너스도 굴리지 않고 0을 돌려준다.
 */
export function rollItemCount(policy: SyncIssuePolicy, input: ItemCountInput, rand: Rand): number {
  const guaranteed = input.isHiking ? policy.sync_item_guaranteed_hiking : policy.sync_item_guaranteed
  if (guaranteed <= 0) return 0

  const rawP = input.jam / policy.sync_item_bonus_jam_divisor
  const p = Number.isFinite(rawP) ? Math.min(Math.max(rawP, 0), policy.sync_item_bonus_max_probability) : 0

  let count = guaranteed
  for (let i = 0; i < policy.sync_item_bonus_rolls; i++) {
    if (rand() < p) count += 1
  }
  return count
}

// ────────────────────────────────────────────────────────────
// 2. 등급
// ────────────────────────────────────────────────────────────

export interface RarityRollResult {
  rarity: BadgeRarity
  /** 이번 판정 뒤의 `common_streak` — Common이면 +1, 아니면 0 */
  nextCommonStreak: number
}

/** 가중치 추첨. 가중치 0인 항목은 뽑지 않는다(rand()가 정확히 0이어도). rand()는 [0, 1)이다. */
function pickWeighted<T>(entries: Array<[T, number]>, rand: Rand): T {
  const positive = entries.filter(([, w]) => w > 0)
  // 전부 0인 퇴화 설정 — 첫 항목으로 대체한다(정책 로더가 합계 100을 보장하므로 정상 경로에서는 오지 않는다)
  if (positive.length === 0) return entries[0][0]
  const total = positive.reduce((s, [, w]) => s + w, 0)
  let roll = rand() * total
  for (const [value, w] of positive) {
    if (roll < w) return value
    roll -= w
  }
  return positive[positive.length - 1][0]
}

/**
 * 등급 추첨. 보정은 «Common이 임계값만큼 연속이면 다음은 Rare 이상» 하나다.
 * 보정이 걸리면 Rare/Epic/Mystic을 설정 확률의 비율대로 뽑는다.
 */
export function rollRarity(policy: SyncIssuePolicy, commonStreak: number, rand: Rand): RarityRollResult {
  const rare: Array<[BadgeRarity, number]> = [
    ['rare', policy.sync_rarity_rare],
    ['epic', policy.sync_rarity_epic],
    ['mystic', policy.sync_rarity_mystic],
  ]
  const rarity =
    commonStreak >= policy.common_streak_threshold
      ? pickWeighted(rare, rand)
      : pickWeighted<BadgeRarity>([['common', policy.sync_rarity_common], ...rare], rand)

  return { rarity, nextCommonStreak: rarity === 'common' ? commonStreak + 1 : 0 }
}

// ────────────────────────────────────────────────────────────
// 3. 후보 선정
// ────────────────────────────────────────────────────────────

/** 후보 판정에 필요한 컬렉션(item_books) 칸 */
export interface IssueBook {
  id: string
  tribe_id: string | null
  is_active: boolean
  drop_excluded: boolean
  valid_from: string | null
  valid_until: string | null
}

/** 후보 판정에 필요한 아이템 배지(badges) 칸 */
export interface IssueBadge {
  id: string
  rarity: BadgeRarity | null
  item_book_id: string | null
  drop_excluded: boolean
  valid_from: string | null
  valid_until: string | null
  deleted_at: string | null
}

/** 공개 기간 안인가 — 시작·종료가 비어 있으면 그쪽은 제한 없음. 종료 시각 정각까지 포함한다(기존 엔진과 같은 경계). */
function inWindow(from: string | null, until: string | null, nowMs: number): boolean {
  if (from) {
    const f = Date.parse(from)
    if (Number.isNaN(f) || f > nowMs) return false
  }
  if (until) {
    const u = Date.parse(until)
    if (Number.isNaN(u) || u < nowMs) return false
  }
  return true
}

export interface PickItemBadgeInput<B extends IssueBadge = IssueBadge> {
  /** 유저의 소속 트라이브 */
  tribeId: string
  rarity: BadgeRarity
  books: readonly IssueBook[]
  /** 판정 칸(`IssueBadge`) 외에 이름·이미지 같은 칸을 더 실어도 그대로 돌려준다 */
  badges: readonly B[]
  now: Date
}

/** 발급할 수 있는 후보 전체 — 소속 트라이브 컬렉션, 그 등급, 활성, 공개 기간 안, 드랍 제외 아님, 삭제 아님 */
export function listIssueCandidates<B extends IssueBadge>(input: PickItemBadgeInput<B>): B[] {
  const nowMs = input.now.getTime()
  const bookIds = new Set(
    input.books
      .filter(
        (b) =>
          b.tribe_id === input.tribeId && b.is_active && !b.drop_excluded && inWindow(b.valid_from, b.valid_until, nowMs)
      )
      .map((b) => b.id)
  )
  return input.badges.filter(
    (b) =>
      b.rarity === input.rarity &&
      b.item_book_id !== null &&
      bookIds.has(b.item_book_id) &&
      !b.drop_excluded &&
      b.deleted_at === null &&
      inWindow(b.valid_from, b.valid_until, nowMs)
  )
}

/**
 * 후보 전체에서 균등 무작위로 하나를 고른다. 후보가 없으면 null이다.
 * 없는 것 먼저 · 컬렉션 비중 · 마지막 조각 몰아주기 보정은 두지 않는다(운영 로직 6.2절).
 */
export function pickItemBadge<B extends IssueBadge>(input: PickItemBadgeInput<B>, rand: Rand): B | null {
  const candidates = listIssueCandidates(input)
  if (candidates.length === 0) return null
  const idx = Math.min(Math.floor(rand() * candidates.length), candidates.length - 1)
  return candidates[idx]
}

// ────────────────────────────────────────────────────────────
// 4. 후보 없는 등급은 한 등급씩 내려 다시 뽑는다 (사용자 결정 5번)
// ────────────────────────────────────────────────────────────

/** 높은 등급부터 낮은 등급 순서 — 한 등급씩 내려갈 때의 경로 */
const RARITY_DESCENDING: readonly BadgeRarity[] = ['mystic', 'epic', 'rare', 'common']

export interface FallbackPick<B extends IssueBadge = IssueBadge> {
  /** 처음 뽑힌 등급 — 발급 기록의 `rolled_rarity` */
  rolledRarity: BadgeRarity
  /** 실제로 준 등급 — 발급 기록의 `rarity`. 후보가 있어 내려가지 않았다면 `rolledRarity`와 같다 */
  rarity: BadgeRarity
  badge: B
}

/**
 * 뽑힌 등급에 후보가 없으면 한 등급씩 내려가며 후보가 있는 가장 높은 등급에서 고른다.
 * 위쪽 등급으로는 올라가지 않는다. 모든 등급에 후보가 없으면 null이다(호출부가 그 개체를 건너뛰고 로그를 남긴다).
 */
export function pickWithRarityFallback<B extends IssueBadge>(
  input: Omit<PickItemBadgeInput<B>, 'rarity'> & { rolledRarity: BadgeRarity },
  rand: Rand
): FallbackPick<B> | null {
  const { rolledRarity, ...rest } = input
  const start = RARITY_DESCENDING.indexOf(rolledRarity)
  if (start < 0) return null
  for (const rarity of RARITY_DESCENDING.slice(start)) {
    const badge = pickItemBadge<B>({ ...rest, rarity }, rand)
    if (badge) return { rolledRarity, rarity, badge }
  }
  return null
}
