/**
 * 잠김 배정 — 순수 판정 (티켓 20261018_0051, 운영 로직 7.2·7.4·7.5절)
 *
 * 이미 정해진 아이템 배지 하나가 «잠긴 채» 배정되는지, 잠기면 까닭과 여는 데 필요한 양이 얼마인지를 정한다.
 * 동기화 발급(`syncIssueRun.ts`)이 쓰고, 캡슐(3-2)이 같은 함수를 쓴다. DB·시계를 부르지 않고 난수는 인자로 받는다.
 *
 * 규칙
 *  - 잠김으로 만든 아이템 배지(`alwaysLocked`)는 어느 경로로 얻어도 늘 잠긴다(`badge_locked`). 난수를 쓰지 않는다.
 *  - 그 밖에는 `sync`·`capsule` 경로만 `locked_roll_probability`로 잠김(`rolled`)을 정한다.
 *    `designated`(운영자가 지정하는 미션 보상·프로모션) 경로는 무작위로 잠그지 않는다.
 *  - 여는 데 필요한 양은 배지 값(`unlockRequired`), 값이 없으면 그 등급의 최소값(`locked_min_*`)이다. 배정 때 고정한다.
 *
 * 서버 전용 모듈(`@/lib/supabase/server`, `next/headers` 등)을 가져오지 않는다 — 클라이언트 번들에서도 안전해야 하고,
 * 시험이 고정한 난수로 경계(확률 0·1)를 재현해야 하기 때문이다. 타입만 `import type`으로 쓴다(런타임에 지워진다).
 */
import type { JamPolicy } from '@/lib/jam/policy'
import type { BadgeRarity } from '@/types/database'

/** 잠김을 배정하는 경로 */
export type LockRoute = 'sync' | 'capsule' | 'designated'

/** 개체의 잠긴 까닭(`inventory_items.lock_reason`). `designated`(운영자가 잠가서 지정)는 지정 경로가 직접 정해 이 함수가 돌려주지 않는다. */
export type LockReason = 'badge_locked' | 'rolled' | 'designated'

/** 잠김 배정이 읽는 정책 칸 */
export type LockPolicy = Pick<
  JamPolicy,
  'locked_min_common' | 'locked_min_rare' | 'locked_min_epic' | 'locked_min_mystic' | 'locked_roll_probability'
>

export interface LockAssignInput {
  /** 배지 양식의 «잠김으로 만듦»(`badges.always_locked`) */
  alwaysLocked: boolean
  /** 배지 양식의 «여는 데 필요한 양»(`badges.unlock_required`). 정하지 않았으면 null */
  unlockRequired: number | null
  /** 이 개체의 실제 등급 */
  rarity: BadgeRarity
  route: LockRoute
}

export type LockAssignment =
  | { locked: false; lockReason: null; unlockRequired: null }
  | { locked: true; lockReason: LockReason; unlockRequired: number }

const OPEN: LockAssignment = { locked: false, lockReason: null, unlockRequired: null }

/** 등급별 최소값 — 배지에 값이 없을 때 여는 데 필요한 양 */
export function minUnlockRequired(rarity: BadgeRarity, policy: LockPolicy): number {
  switch (rarity) {
    case 'common':
      return policy.locked_min_common
    case 'rare':
      return policy.locked_min_rare
    case 'epic':
      return policy.locked_min_epic
    case 'mystic':
      return policy.locked_min_mystic
  }
}

/** 여는 데 필요한 양: 배지 값이 양의 정수면 그 값, 아니면 등급 최소값 */
export function resolveUnlockRequired(badgeValue: number | null, rarity: BadgeRarity, policy: LockPolicy): number {
  if (badgeValue !== null && Number.isInteger(badgeValue) && badgeValue >= 1) return badgeValue
  return minUnlockRequired(rarity, policy)
}

/**
 * 아이템 배지 하나의 잠김을 정한다. `rand()`는 [0, 1)이고, 무작위가 필요한 경로(`sync`·`capsule`이면서 잠김으로 만든 배지가 아닐 때)에서만
 * 한 번 부른다. 확률 0이면 절대 잠기지 않고 1이면 늘 잠긴다.
 */
export function assignLock(input: LockAssignInput, policy: LockPolicy, rand: () => number): LockAssignment {
  if (input.alwaysLocked) {
    return {
      locked: true,
      lockReason: 'badge_locked',
      unlockRequired: resolveUnlockRequired(input.unlockRequired, input.rarity, policy),
    }
  }
  if (input.route === 'designated') return OPEN
  if (rand() < policy.locked_roll_probability) {
    return {
      locked: true,
      lockReason: 'rolled',
      unlockRequired: resolveUnlockRequired(input.unlockRequired, input.rarity, policy),
    }
  }
  return OPEN
}
