/**
 * 캡슐 열기 추첨 — 순수 판정 (티켓 20261018_0052 2회, 운영 로직 5.2·5.4절)
 *
 * 열 때 나올 개체를 DB·시계·난수에 기대지 않고 계산한다. 난수 함수와 현재 시각은 인자로 받는다.
 * **서버 전용 모듈(`@/lib/supabase/server`, `next/headers`)을 정적·동적 어느 쪽으로도 가져오지 않는다** — 시험이 고정한 난수로 경계를 재현해야 하고,
 * 클라이언트 번들에 끌려와도 안전해야 한다. 타입만 `import type`으로 쓴다(런타임에 지워진다). 지급·기록은 이 모듈의 일이 아니다(`open.ts`).
 *
 * 순서(5.2절): 개수 → (개체마다) 트라이브 → 등급 → 후보 → 잠김. 난수는 이 순서로 쓴다.
 *  - 개수: 확정 `guaranteed_count`개 + 확률 `bonus_probability`로 `bonus_count`개 더(난수 1번).
 *  - 트라이브: 개체마다 확률 `other_tribe_probability`로 다른 트라이브, 그 안에서는 나머지 트라이브 가운데 고르게(확률 1번, 뽑을 때 1번).
 *  - 등급: 설정 확률(70/22/6/2). 보정 1은 `capsule_epic_miss >= pity_epic_threshold`이면 **첫 개체**를 Epic 이상(epic:mystic 설정 비율)으로,
 *    보정 2는 `common_streak >= common_streak_threshold`이면 Rare 이상(설정 비율). 둘이 겹치면 더 센 보정 1을 따른다.
 *    Common 연속은 개체를 받을 때마다 **실제로 받은 등급**으로 이어 센다(DB 함수 `capsule_open`이 세는 방식과 같다).
 *  - 후보: 그 트라이브·등급의 활성이고 공개 기간 안인 아이템 배지 중 균등 무작위. 없으면 한 등급씩 내려 다시 뽑는다(`pickWithRarityFallback`).
 *  - 잠김: `assignLock`(경로 `capsule`). 퀘스트 전 캡슐(`preQuest`)은 **나온 첫 개체**를 반드시 잠근다(`rolled`, 필요한 양은 `pre_quest_unlock_required`).
 * 모든 등급에 후보가 없는 개체는 건너뛰고 `skipped`에 남긴다(호출부가 로그를 남긴다).
 */
import { assignLock, type LockAssignment, type LockPolicy } from '@/lib/drop-engine/lockAssignment'
import {
  pickWeighted,
  pickWithRarityFallback,
  type IssueBadge,
  type IssueBook,
  type Rand,
} from '@/lib/drop-engine/syncIssue'
import type { BadgeRarity } from '@/types/database'

/** 추첨이 읽는 정책 칸 — `CapsulePolicy`(캡슐 정책 행), `JamPolicy`(Common 연속 임계값, 잠김 확률과 최소값)의 값이다 */
export interface CapsuleRollPolicy extends LockPolicy {
  guaranteed_count: number
  bonus_count: number
  bonus_probability: number
  other_tribe_probability: number
  rarity_common: number
  rarity_rare: number
  rarity_epic: number
  rarity_mystic: number
  pity_epic_threshold: number
  pre_quest_unlock_required: number
  common_streak_threshold: number
}

export interface CapsuleRollInput<B extends IssueBadge = IssueBadge> {
  policy: CapsuleRollPolicy
  /** 유저의 소속 트라이브 */
  tribeId: string
  /** 모든 트라이브 id(소속 포함). «다른 트라이브»는 이 가운데 소속을 뺀 것이다 */
  tribeIds: readonly string[]
  books: readonly IssueBook[]
  /** 판정 칸(`IssueBadge`) 외에 이름·이미지 같은 칸을 더 실어도 그대로 돌려준다 */
  badges: readonly B[]
  /** `user_drop_state.common_streak` */
  commonStreak: number
  /** `user_drop_state.capsule_epic_miss` */
  epicMiss: number
  /** 퀘스트 전 캡슐인가(`user_capsules.chapter_no`가 null) */
  preQuest: boolean
  now: Date
}

/** 정해진 개체 1개 */
export interface RolledCapsuleItem<B extends IssueBadge = IssueBadge> {
  badge: B
  /** 이 개체를 뽑은 트라이브 */
  tribeId: string
  /** 실제 받는 등급 */
  rarity: BadgeRarity
  /** 처음 뽑힌 등급 — 후보가 없어 내려가지 않았다면 `rarity`와 같다 */
  rolledRarity: BadgeRarity
  lock: LockAssignment
}

export interface CapsuleRollResult<B extends IssueBadge = IssueBadge> {
  items: RolledCapsuleItem<B>[]
  /** 모든 등급에 후보가 없어 건너뛴 개체 */
  skipped: Array<{ tribeId: string; rolledRarity: BadgeRarity }>
}

/** 개수: 확정 개수 + 확률로 보너스 개수. 난수를 한 번 쓴다(확정 개수만 있는 설정이어도 한 번 쓴다). */
export function rollCapsuleCount(policy: Pick<CapsuleRollPolicy, 'guaranteed_count' | 'bonus_count' | 'bonus_probability'>, rand: Rand): number {
  const bonus = rand() < policy.bonus_probability ? policy.bonus_count : 0
  return policy.guaranteed_count + bonus
}

/**
 * 개체 하나의 트라이브. 확률 `other_tribe_probability`로 다른 트라이브이고, 그 안에서는 고르게 고른다.
 * 다른 트라이브가 없으면 소속이다. 확률 0이면 늘 소속, 1이면 늘 다른 트라이브다.
 */
export function rollCapsuleTribe(
  policy: Pick<CapsuleRollPolicy, 'other_tribe_probability'>,
  tribeId: string,
  tribeIds: readonly string[],
  rand: Rand
): string {
  const goOther = rand() < policy.other_tribe_probability
  const others = tribeIds.filter((id) => id !== tribeId)
  if (!goOther || others.length === 0) return tribeId
  return others[Math.min(Math.floor(rand() * others.length), others.length - 1)]
}

type RarityPolicy = Pick<
  CapsuleRollPolicy,
  'rarity_common' | 'rarity_rare' | 'rarity_epic' | 'rarity_mystic' | 'pity_epic_threshold' | 'common_streak_threshold'
>

/**
 * 등급 하나. `epicPity`가 참이면 Epic 이상(보정 1), 아니면 `commonStreak`이 임계값 이상일 때 Rare 이상(보정 2), 아니면 설정 확률 전체.
 * 보정이 걸리면 남은 등급의 상대 비율은 설정 확률의 비율을 따른다.
 */
export function rollCapsuleRarity(policy: RarityPolicy, opts: { epicPity: boolean; commonStreak: number }, rand: Rand): BadgeRarity {
  const rare: Array<[BadgeRarity, number]> = [
    ['rare', policy.rarity_rare],
    ['epic', policy.rarity_epic],
    ['mystic', policy.rarity_mystic],
  ]
  if (opts.epicPity) return pickWeighted<BadgeRarity>(rare.slice(1), rand)
  if (opts.commonStreak >= policy.common_streak_threshold) return pickWeighted<BadgeRarity>(rare, rand)
  return pickWeighted<BadgeRarity>([['common', policy.rarity_common], ...rare], rand)
}

/** 캡슐 한 번에 나올 개체 전체를 정한다. */
export function rollCapsule<B extends IssueBadge>(input: CapsuleRollInput<B>, rand: Rand): CapsuleRollResult<B> {
  const { policy, books, badges, now } = input
  const count = rollCapsuleCount(policy, rand)
  const result: CapsuleRollResult<B> = { items: [], skipped: [] }
  let commonStreak = input.commonStreak

  for (let i = 0; i < count; i++) {
    const tribeId = rollCapsuleTribe(policy, input.tribeId, input.tribeIds, rand)
    // 보정 1은 «다음 캡슐의 첫 개체»에만 건다. 둘째 개체는 보정 2와 설정 확률만 따른다.
    const epicPity = i === 0 && input.epicMiss >= policy.pity_epic_threshold
    const rolledRarity = rollCapsuleRarity(policy, { epicPity, commonStreak }, rand)

    const pick = pickWithRarityFallback<B>({ tribeId, rolledRarity, books, badges, now }, rand)
    if (!pick) {
      result.skipped.push({ tribeId, rolledRarity })
      continue
    }
    commonStreak = pick.rarity === 'common' ? commonStreak + 1 : 0

    // 퀘스트 전 첫 캡슐은 나온 첫 개체를 반드시 잠근다. 난수를 쓰지 않는다.
    const lock: LockAssignment =
      input.preQuest && result.items.length === 0
        ? { locked: true, lockReason: 'rolled', unlockRequired: policy.pre_quest_unlock_required }
        : assignLock(
            {
              alwaysLocked: pick.badge.always_locked ?? false,
              unlockRequired: pick.badge.unlock_required ?? null,
              rarity: pick.rarity,
              route: 'capsule',
            },
            policy,
            rand
          )

    result.items.push({ badge: pick.badge, tribeId, rarity: pick.rarity, rolledRarity: pick.rolledRarity, lock })
  }
  return result
}
