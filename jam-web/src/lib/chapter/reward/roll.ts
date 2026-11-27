/**
 * 챕터 오름 보상 추첨 — 순수 판정 (티켓 20261127_1731 C3a, 상위 20261127_1720)
 *
 * 챕터를 마칠 때 받는 아이템 배지 개체를 DB·시계·난수에 기대지 않고 계산한다. 난수 함수와 현재 시각은 인자로 받는다.
 * 옛 캡슐 추첨(`lib/capsule/capsuleRoll.ts`)에서 복사해 왔다 — 캡슐은 D단계에서 지워지므로 이 파일은 `lib/capsule/*`를 가져오지 않는다.
 * **서버 전용 모듈(`@/lib/supabase/server`, `next/headers`)을 정적·동적 어느 쪽으로도 가져오지 않는다** — 시험이 고정한 난수로 경계를 재현해야 하고,
 * 클라이언트 번들에 끌려와도 안전해야 한다. 타입만 `import type`으로 쓴다(런타임에 지워진다). 읽기·저장·지급은 이 모듈의 일이 아니다(`draw.ts`·`record.ts`).
 *
 * 순서: (개체마다) 트라이브 → 등급 → 후보 → 잠김. 난수는 이 순서로 쓴다.
 *  - 개수: **고정이다.** 마친 챕터의 `chapter_definitions.reward_count`를 `input.count`로 받는다. 난수를 개수에 쓰지 않는다(옛 캡슐의 «확정 + 확률 보너스»는 가져오지 않았다).
 *  - 트라이브: 개체마다 확률 `other_tribe_probability`로 다른 트라이브, 그 안에서는 나머지 트라이브 가운데 고르게(확률 1번, 뽑을 때 1번).
 *    «나머지 트라이브»는 후보 배지가 있는 트라이브만이다(`tribesWithCandidates`, 호출부가 좁혀 넘긴다).
 *  - 등급: 설정 확률(30/40/22/8). 보정 1은 `epicMiss >= pity_epic_threshold`이면 **첫 개체**를 Epic 이상(epic:mystic 설정 비율)으로,
 *    보정 2는 `commonStreak >= common_streak_threshold`이면 Rare 이상(설정 비율). 둘이 겹치면 더 센 보정 1을 따른다.
 *    Common 연속은 개체를 받을 때마다 **실제로 받은 등급**으로 이어 센다.
 *  - 후보: 그 트라이브·등급의 활성이고 공개 기간 안인 아이템 배지 중 균등 무작위. 없으면 한 등급씩 내려 다시 뽑는다(`pickWithRarityFallback`).
 *  - 잠김: `assignLock`(경로 `capsule`과 같은 규칙, 상위 티켓 확정 Q-i). 퀘스트 전 캡슐 규칙은 가져오지 않았다.
 *  - 소속 재추첨: 소속이 뽑혔는데 모든 등급에 후보가 없으면, 후보가 있는 다른 트라이브 가운데 고르게 하나(난수 1번)를 골라 같은 처음 등급으로 다시 뽑는다.
 * 그래도 모든 등급에 후보가 없는 개체는 건너뛰고 `skipped`에 남긴다(호출부가 로그를 남긴다).
 */
import { assignLock, type LockAssignment, type LockPolicy } from '@/lib/drop-engine/lockAssignment'
import {
  listIssueCandidates,
  pickWeighted,
  pickWithRarityFallback,
  type IssueBadge,
  type IssueBook,
  type Rand,
} from '@/lib/drop-engine/syncIssue'
import type { BadgeRarity } from '@/types/database'

/** 추첨이 읽는 정책 칸 — `chapter_reward_policy`(등급 확률·다른 트라이브 확률·에픽 보정)와 `JamPolicy`(Common 연속 임계값, 잠김 확률과 최소값)의 값이다 */
export interface ChapterRewardRollPolicy extends LockPolicy {
  other_tribe_probability: number
  rarity_common: number
  rarity_rare: number
  rarity_epic: number
  rarity_mystic: number
  pity_epic_threshold: number
  common_streak_threshold: number
}

export interface ChapterRewardRollInput<B extends IssueBadge = IssueBadge> {
  policy: ChapterRewardRollPolicy
  /** 나올 개체 수 — 마친 챕터의 `chapter_definitions.reward_count`(3·4·5). 난수를 쓰지 않는다 */
  count: number
  /** 유저의 소속 트라이브 */
  tribeId: string
  /** «다른 트라이브» 후보로 삼을 트라이브 id(소속 포함). «다른 트라이브»는 이 가운데 소속을 뺀 것이다. 호출부(`draw.ts`)는 `tribesWithCandidates`로 후보 배지가 있는 트라이브만 넘긴다 */
  tribeIds: readonly string[]
  books: readonly IssueBook[]
  /** 판정 칸(`IssueBadge`) 외에 이름·이미지 같은 칸을 더 실어도 그대로 돌려준다 */
  badges: readonly B[]
  /** `user_drop_state.common_streak` */
  commonStreak: number
  /** `user_drop_state.capsule_epic_miss` */
  epicMiss: number
  now: Date
}

/** 정해진 개체 1개 */
export interface RolledChapterRewardItem<B extends IssueBadge = IssueBadge> {
  badge: B
  /** 이 개체를 뽑은 트라이브 */
  tribeId: string
  /** 실제 받는 등급 */
  rarity: BadgeRarity
  /** 처음 뽑힌 등급 — 후보가 없어 내려가지 않았다면 `rarity`와 같다 */
  rolledRarity: BadgeRarity
  lock: LockAssignment
}

export interface ChapterRewardRollResult<B extends IssueBadge = IssueBadge> {
  items: RolledChapterRewardItem<B>[]
  /** 모든 등급에 후보가 없어 건너뛴 개체 */
  skipped: Array<{ tribeId: string; rolledRarity: BadgeRarity }>
}

/** 후보를 뽑을 수 있는 등급 전체 — 어느 등급에든 후보가 있으면 그 트라이브는 «후보 배지가 있는 트라이브»다 */
const CANDIDATE_RARITIES: readonly BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/**
 * «다른 트라이브» 추첨 대상을 후보 배지가 있는 트라이브로 좁힌다.
 * 트라이브 표(`tribes`)에는 후보 배지가 없는 비활성 트라이브가 섞여 있어, 그대로 고르면 그 트라이브가 뽑혔을 때 개체가 빈다.
 * 후보 판정은 발급과 같다(`listIssueCandidates` — 활성 컬렉션·공개 기간 안·드랍 제외 아님·삭제 아님). 소속 트라이브는 후보가 없어도 항상 남긴다
 * (소속으로 뽑히는 길을 없애지 않는다. 소속에 후보가 없으면 `rollChapterReward`가 다른 트라이브에서 다시 뽑는다).
 */
export function tribesWithCandidates<B extends IssueBadge>(
  tribeIds: readonly string[],
  ownTribeId: string,
  books: readonly IssueBook[],
  badges: readonly B[],
  now: Date
): string[] {
  return tribeIds.filter(
    (id) =>
      id === ownTribeId ||
      CANDIDATE_RARITIES.some((rarity) => listIssueCandidates<B>({ tribeId: id, rarity, books, badges, now }).length > 0)
  )
}

/**
 * 개체 하나의 트라이브. 확률 `other_tribe_probability`로 다른 트라이브이고, 그 안에서는 고르게 고른다.
 * 다른 트라이브가 없으면 소속이다. 확률 0이면 늘 소속, 1이면 늘 다른 트라이브다.
 */
export function rollChapterRewardTribe(
  policy: Pick<ChapterRewardRollPolicy, 'other_tribe_probability'>,
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
  ChapterRewardRollPolicy,
  'rarity_common' | 'rarity_rare' | 'rarity_epic' | 'rarity_mystic' | 'pity_epic_threshold' | 'common_streak_threshold'
>

/**
 * 등급 하나. `epicPity`가 참이면 Epic 이상(보정 1), 아니면 `commonStreak`이 임계값 이상일 때 Rare 이상(보정 2), 아니면 설정 확률 전체.
 * 보정이 걸리면 남은 등급의 상대 비율은 설정 확률의 비율을 따른다.
 */
export function rollChapterRewardRarity(
  policy: RarityPolicy,
  opts: { epicPity: boolean; commonStreak: number },
  rand: Rand
): BadgeRarity {
  const rare: Array<[BadgeRarity, number]> = [
    ['rare', policy.rarity_rare],
    ['epic', policy.rarity_epic],
    ['mystic', policy.rarity_mystic],
  ]
  if (opts.epicPity) return pickWeighted<BadgeRarity>(rare.slice(1), rand)
  if (opts.commonStreak >= policy.common_streak_threshold) return pickWeighted<BadgeRarity>(rare, rand)
  return pickWeighted<BadgeRarity>([['common', policy.rarity_common], ...rare], rand)
}

/** 챕터 오름 보상으로 나올 개체 전체를 정한다. 개수는 `input.count`다. */
export function rollChapterReward<B extends IssueBadge>(input: ChapterRewardRollInput<B>, rand: Rand): ChapterRewardRollResult<B> {
  const { policy, books, badges, now, count } = input
  const result: ChapterRewardRollResult<B> = { items: [], skipped: [] }
  let commonStreak = input.commonStreak

  for (let i = 0; i < count; i++) {
    const tribeId = rollChapterRewardTribe(policy, input.tribeId, input.tribeIds, rand)
    // 보정 1은 «첫 개체»에만 건다. 나머지 개체는 보정 2와 설정 확률만 따른다.
    const epicPity = i === 0 && input.epicMiss >= policy.pity_epic_threshold
    const rolledRarity = rollChapterRewardRarity(policy, { epicPity, commonStreak }, rand)

    let pickedTribeId = tribeId
    let pick = pickWithRarityFallback<B>({ tribeId, rolledRarity, books, badges, now }, rand)
    // 소속이 뽑혔는데 모든 등급에 후보가 없으면 후보가 있는 다른 트라이브에서 한 번 다시 뽑는다(처음 등급 유지).
    // 새 난수는 이 경우에만 쓰므로 소속에 후보가 있는 경로의 난수 순서는 그대로다.
    if (!pick && tribeId === input.tribeId) {
      const others = input.tribeIds.filter((id) => id !== input.tribeId)
      if (others.length > 0) {
        const retryTribeId = others[Math.min(Math.floor(rand() * others.length), others.length - 1)]
        pick = pickWithRarityFallback<B>({ tribeId: retryTribeId, rolledRarity, books, badges, now }, rand)
        if (pick) pickedTribeId = retryTribeId
      }
    }
    if (!pick) {
      result.skipped.push({ tribeId, rolledRarity })
      continue
    }
    commonStreak = pick.rarity === 'common' ? commonStreak + 1 : 0

    const lock = assignLock(
      {
        alwaysLocked: pick.badge.always_locked ?? false,
        unlockRequired: pick.badge.unlock_required ?? null,
        rarity: pick.rarity,
        route: 'capsule',
      },
      policy,
      rand
    )

    result.items.push({ badge: pick.badge, tribeId: pickedTribeId, rarity: pick.rarity, rolledRarity: pick.rolledRarity, lock })
  }
  return result
}
