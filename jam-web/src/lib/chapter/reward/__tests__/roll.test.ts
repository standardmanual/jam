/**
 * lib/chapter/reward/roll — 챕터 오름 보상 추첨 순수 판정 (티켓 20261127_1731 C3a)
 *
 * 고정하는 것(A3 후보 E 확정 값):
 * - 개수: `input.count` 그대로(3·4·5). 난수를 개수에 쓰지 않는다.
 * - 등급 경계 30/40/22/8, 보정 1(Epic 이상, 첫 개체만, 임계값 경계), 보정 2(Rare 이상, 임계값 경계, 개체마다 받은 등급으로 이어 셈), 둘이 겹치면 보정 1.
 * - 트라이브: 20% 경계(내 트라이브/다른 트라이브), 다른 트라이브는 나머지 중 고르게, 후보 없는 트라이브는 좁혀 뺀다.
 * - 후보: 한 등급씩 내려감(올라가지 않음), 모든 등급에 후보 없으면 건너뜀, 소속에 후보가 없으면 다른 트라이브에서 한 번 다시 뽑음.
 * - 잠김: `assignLock` 규칙(항상 잠김 배지는 난수 없이 잠김, 확률 경계 0.25).
 * - 난수 사용 순서: (개체마다) 트라이브 확률, [트라이브 선택], 등급, 후보, 잠김.
 * - 이동의 동등성: 같은 입력·같은 난수면 옛 `rollCapsule`과 같은 개체가 나온다(보너스·퀘스트 전 제외).
 *   마지막 describe는 옛 캡슐 코드를 가져온다 — D단계에서 `lib/capsule/`을 지울 때 그 describe와 import도 함께 지운다.
 * 결정적 난수만 쓴다 — DB는 호출하지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/reward/__tests__/roll.test.ts
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import type { IssueBadge, IssueBook } from '@/lib/drop-engine/syncIssue'
import type { BadgeRarity } from '@/types/database'
import {
  rollChapterReward,
  rollChapterRewardRarity,
  rollChapterRewardTribe,
  tribesWithCandidates,
  type ChapterRewardRollInput,
  type ChapterRewardRollPolicy,
} from '../roll'
// D단계에서 지운다 — 이동의 동등성 시험(마지막 describe)만 쓴다
import { rollCapsule } from '@/lib/capsule/capsuleRoll'
import { DEFAULT_CAPSULE_POLICY } from '@/lib/capsule/policy'

/** 확정 값: 등급 30/40/22/8, 다른 트라이브 20%, 에픽 보정 15 — 같은 등급 연속(10)·잠금(25%)은 `jam_policy` 기본값 */
const policy: ChapterRewardRollPolicy = {
  ...DEFAULT_JAM_POLICY,
  other_tribe_probability: 0.2,
  rarity_common: 30,
  rarity_rare: 40,
  rarity_epic: 22,
  rarity_mystic: 8,
  pity_epic_threshold: 15,
}
const NOW = new Date('2026-11-27T00:00:00Z')

const TRIBES = ['A', 'B', 'C', 'D', 'E'] as const
const RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/** 정해진 값을 차례로 돌려주는 난수. 모자라면 던져 난수를 더 쓴 것을 드러낸다. */
function seq(...values: number[]) {
  let i = 0
  const rand = () => {
    if (i >= values.length) throw new Error(`난수가 모자란다(${values.length}개를 줬는데 ${i + 1}번째를 불렀다)`)
    return values[i++]
  }
  return { rand, used: () => i, left: () => values.length - i }
}

const book = (tribe: string, over: Partial<IssueBook> = {}): IssueBook => ({
  id: `book-${tribe}`,
  tribe_id: tribe,
  is_active: true,
  drop_excluded: false,
  valid_from: null,
  valid_until: null,
  ...over,
})

type TestBadge = IssueBadge & { name: string }

const badge = (tribe: string, rarity: BadgeRarity, over: Partial<TestBadge> = {}): TestBadge => ({
  id: `${tribe}-${rarity}`,
  name: `${tribe}-${rarity}`,
  rarity,
  item_book_id: `book-${tribe}`,
  drop_excluded: false,
  valid_from: null,
  valid_until: null,
  deleted_at: null,
  ...over,
})

/** 트라이브마다 네 등급 배지가 하나씩 있는 세상 */
const fullBadges: TestBadge[] = TRIBES.flatMap((t) => RARITIES.map((r) => badge(t, r)))

function input(over: Partial<ChapterRewardRollInput<TestBadge>> = {}): ChapterRewardRollInput<TestBadge> {
  return {
    policy,
    count: 1,
    tribeId: 'A',
    tribeIds: TRIBES,
    books: TRIBES.map((t) => book(t)),
    badges: fullBadges,
    commonStreak: 0,
    epicMiss: 0,
    now: NOW,
    ...over,
  }
}

/** 개체 한 개가 쓰는 난수 4개: 트라이브 확률(소속), 등급, 후보, 잠김(열린 채) */
const ONE_COMMON = [0.5, 0, 0, 0.9]

describe('rollChapterReward — 개수는 고정이다', () => {
  it.each([3, 4, 5])('count가 %i이면 개체가 %i개 나오고 개수에 난수를 쓰지 않는다', (count) => {
    // 개체마다 정확히 4개(트라이브 확률, 등급, 후보, 잠김)만 쓴다. 모자라면 seq가 던지고, 남으면 left가 드러낸다.
    const r = seq(...Array.from({ length: count }, () => ONE_COMMON).flat())
    const result = rollChapterReward(input({ count }), r.rand)
    expect(result.items).toHaveLength(count)
    expect(result.skipped).toEqual([])
    expect(r.left()).toBe(0)
  })

  it('count가 0이면 난수를 쓰지 않고 빈 결과다', () => {
    const r = seq()
    expect(rollChapterReward(input({ count: 0 }), r.rand)).toEqual({ items: [], skipped: [] })
    expect(r.used()).toBe(0)
  })
})

describe('rollChapterRewardRarity — 등급 경계와 보정', () => {
  const rarity = (r: number, opts: { epicPity?: boolean; commonStreak?: number } = {}) =>
    rollChapterRewardRarity(policy, { epicPity: opts.epicPity ?? false, commonStreak: opts.commonStreak ?? 0 }, seq(r).rand)

  it('30/40/22/8 누적 경계에서 등급이 바뀐다', () => {
    expect(rarity(0)).toBe('common')
    expect(rarity(0.2999)).toBe('common')
    expect(rarity(0.3)).toBe('rare')
    expect(rarity(0.6999)).toBe('rare')
    expect(rarity(0.7)).toBe('epic')
    expect(rarity(0.9199)).toBe('epic')
    expect(rarity(0.92)).toBe('mystic')
    expect(rarity(0.9999999)).toBe('mystic')
  })

  it('보정 1: Epic 이상만 나오고 epic:mystic은 22:8 비율이다', () => {
    // 22/(22+8) = 0.7333…
    expect(rarity(0, { epicPity: true })).toBe('epic')
    expect(rarity(0.7332, { epicPity: true })).toBe('epic')
    expect(rarity(0.74, { epicPity: true })).toBe('mystic')
    expect(rarity(0.9999999, { epicPity: true })).toBe('mystic')
  })

  it('보정 2: Common 연속이 임계값(10) 이상이면 Rare 이상만 나오고 비율은 40:22:8이다', () => {
    expect(rarity(0, { commonStreak: 9 })).toBe('common')
    expect(rarity(0, { commonStreak: 10 })).toBe('rare')
    // rare 40/70 = 0.5714…, epic까지 62/70 = 0.8857…
    expect(rarity(0.5714, { commonStreak: 10 })).toBe('rare')
    expect(rarity(0.58, { commonStreak: 10 })).toBe('epic')
    expect(rarity(0.8857, { commonStreak: 10 })).toBe('epic')
    expect(rarity(0.89, { commonStreak: 10 })).toBe('mystic')
  })

  it('보정이 겹치면 Epic 이상(보정 1)을 따른다', () => {
    expect(rarity(0, { epicPity: true, commonStreak: 99 })).toBe('epic')
  })
})

describe('rollChapterRewardTribe — 트라이브', () => {
  it('다른 트라이브 확률 0이면 늘 소속, 1이면 늘 다른 트라이브다', () => {
    expect(rollChapterRewardTribe({ other_tribe_probability: 0 }, 'A', TRIBES, seq(0).rand)).toBe('A')
    const other = rollChapterRewardTribe({ other_tribe_probability: 1 }, 'A', TRIBES, seq(0.9999999, 0.5).rand)
    expect(other).not.toBe('A')
  })

  it('경계: 난수가 0.2 미만이면 다른 트라이브, 0.2 이상이면 내 트라이브다', () => {
    expect(rollChapterRewardTribe(policy, 'A', TRIBES, seq(0.1999, 0).rand)).toBe('B')
    expect(rollChapterRewardTribe(policy, 'A', TRIBES, seq(0.2).rand)).toBe('A')
    expect(rollChapterRewardTribe(policy, 'A', TRIBES, seq(0.9999999).rand)).toBe('A')
  })

  it('다른 트라이브는 나머지 넷에서 고르게 고른다(첫째와 마지막 경계, 소속은 빠진다)', () => {
    const pick = (r: number) => rollChapterRewardTribe(policy, 'C', TRIBES, seq(0, r).rand)
    // 소속 C를 뺀 나머지: A B D E — 구간 폭 0.25
    expect(pick(0)).toBe('A')
    expect(pick(0.2499)).toBe('A')
    expect(pick(0.25)).toBe('B')
    expect(pick(0.5)).toBe('D')
    expect(pick(0.75)).toBe('E')
    expect(pick(0.9999999)).toBe('E')
  })

  it('다른 트라이브가 없으면 소속이다', () => {
    expect(rollChapterRewardTribe(policy, 'A', ['A'], seq(0).rand)).toBe('A')
  })
})

describe('rollChapterReward — 순서와 후보', () => {
  it('트라이브, 등급, 후보, 잠김 순서로 난수를 쓴다(소속, Common, 첫 후보, 열린 채)', () => {
    const r = seq(0.5, 0, 0, 0.9)
    const result = rollChapterReward(input(), r.rand)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      tribeId: 'A',
      rarity: 'common',
      rolledRarity: 'common',
      lock: { locked: false, lockReason: null, unlockRequired: null },
    })
    expect(result.items[0].badge.id).toBe('A-common')
    expect(r.left()).toBe(0)
  })

  it('후보는 활성이고 공개 기간 안인 것만이다(비활성 컬렉션·기간 지난 배지·삭제 배지는 빠진다)', () => {
    const badges = [
      badge('A', 'common', { id: 'expired', valid_until: '2026-11-01T00:00:00Z' }),
      badge('A', 'common', { id: 'deleted', deleted_at: '2026-11-01T00:00:00Z' }),
      badge('A', 'common', { id: 'ok' }),
    ]
    const result = rollChapterReward(input({ badges, tribeIds: ['A'] }), seq(0.5, 0, 0, 0.9).rand)
    expect(result.items[0].badge.id).toBe('ok')
    const inactive = rollChapterReward(input({ badges, books: [book('A', { is_active: false })], tribeIds: ['A'] }), seq(0.5, 0).rand)
    expect(inactive.items).toEqual([])
  })

  it('뽑힌 등급에 후보가 없으면 한 등급씩 내려가고, 실제 받은 등급과 처음 뽑힌 등급을 따로 남긴다', () => {
    // epic·mystic 배지가 없는 세상에서 mystic을 뽑으면 rare까지 내려간다(epic도 없으므로 rare)
    const badges = fullBadges.filter((b) => b.rarity === 'common' || b.rarity === 'rare')
    const result = rollChapterReward(input({ badges }), seq(0.5, 0.99, 0, 0.9).rand)
    expect(result.items[0]).toMatchObject({ rolledRarity: 'mystic', rarity: 'rare' })
  })

  it('위쪽 등급으로는 올라가지 않는다(common만 있는 트라이브에서 common을 뽑으면 common)', () => {
    const badges = fullBadges.filter((b) => b.rarity === 'common')
    const result = rollChapterReward(input({ badges }), seq(0.5, 0, 0, 0.9).rand)
    expect(result.items[0]).toMatchObject({ rolledRarity: 'common', rarity: 'common' })
    // common을 뽑았는데 common 후보가 없으면 위로 올라가지 않고 건너뛴다
    const rareOnly = fullBadges.filter((b) => b.rarity !== 'common')
    const skipped = rollChapterReward(input({ badges: rareOnly, tribeIds: ['A'] }), seq(0.5, 0).rand)
    expect(skipped.items).toEqual([])
    expect(skipped.skipped).toEqual([{ tribeId: 'A', rolledRarity: 'common' }])
  })

  it('모든 등급에 후보가 없는 개체는 건너뛰고 skipped에 남기며, 나머지 개체는 그대로 이어 뽑는다', () => {
    const result = rollChapterReward(input({ count: 2, badges: [], tribeIds: ['A'] }), seq(0.5, 0, 0.5, 0).rand)
    expect(result.items).toEqual([])
    expect(result.skipped).toEqual([
      { tribeId: 'A', rolledRarity: 'common' },
      { tribeId: 'A', rolledRarity: 'common' },
    ])
  })

  describe('소속에 후보가 없으면 다른 트라이브에서 다시 뽑는다', () => {
    const noOwn = fullBadges.filter((b) => b.item_book_id !== 'book-A')

    it('소속이 뽑혔는데 후보가 없으면 다른 트라이브에서 같은 처음 등급으로 뽑는다', () => {
      // 트라이브 확률 0.5(소속), 등급 0.8(epic), 다시 뽑기 0(B), 후보 0, 잠김 0.9
      const r = seq(0.5, 0.8, 0, 0, 0.9)
      const result = rollChapterReward(input({ badges: noOwn }), r.rand)
      expect(result.items[0]).toMatchObject({ tribeId: 'B', rarity: 'epic', rolledRarity: 'epic' })
      expect(result.items[0].badge.id).toBe('B-epic')
      expect(result.skipped).toEqual([])
      expect(r.left()).toBe(0)
    })

    it('다시 뽑기는 소속을 뺀 트라이브 가운데 고르게 고른다(마지막 경계는 마지막 트라이브)', () => {
      const result = rollChapterReward(input({ badges: noOwn }), seq(0.5, 0, 0.999, 0, 0.9).rand)
      expect(result.items[0].tribeId).toBe('E')
    })

    it('넘겨받은 트라이브에 소속뿐이면 다시 뽑지 않고(난수를 쓰지 않고) 건너뛴다', () => {
      const r = seq(0.5, 0.99)
      const result = rollChapterReward(input({ badges: noOwn, tribeIds: ['A'] }), r.rand)
      expect(result.items).toEqual([])
      expect(result.skipped).toEqual([{ tribeId: 'A', rolledRarity: 'mystic' }])
    })

    it('확률로 다른 트라이브가 뽑혔는데 후보가 없으면 다시 뽑지 않고 건너뛴다', () => {
      const badges = noOwn.filter((b) => b.item_book_id !== 'book-B')
      const result = rollChapterReward(input({ badges }), seq(0.1, 0, 0, 0).rand)
      expect(result.items).toEqual([])
      expect(result.skipped).toEqual([{ tribeId: 'B', rolledRarity: 'common' }])
    })
  })
})

describe('rollChapterReward — 보정', () => {
  it('보정 1: capsule_epic_miss가 임계값(15) 이상이면 첫 개체가 Epic 이상이다. 14이면 걸리지 않는다', () => {
    // 등급 난수 0 → 걸리지 않으면 common, 걸리면 epic
    expect(rollChapterReward(input({ epicMiss: 15 }), seq(0.5, 0, 0, 0.9).rand).items[0].rarity).toBe('epic')
    expect(rollChapterReward(input({ epicMiss: 14 }), seq(0.5, 0, 0, 0.9).rand).items[0].rarity).toBe('common')
  })

  it('보정 1은 첫 개체에만 건다(둘째 개체부터는 설정 확률을 따른다)', () => {
    const r = seq(0.5, 0, 0, 0.9, 0.5, 0, 0, 0.9, 0.5, 0, 0, 0.9)
    const result = rollChapterReward(input({ count: 3, epicMiss: 99 }), r.rand)
    expect(result.items.map((i) => i.rarity)).toEqual(['epic', 'common', 'common'])
  })

  it('보정 2: common_streak가 임계값(10) 이상이면 Rare 이상이다. 9이면 걸리지 않는다', () => {
    expect(rollChapterReward(input({ commonStreak: 10 }), seq(0.5, 0, 0, 0.9).rand).items[0].rarity).toBe('rare')
    expect(rollChapterReward(input({ commonStreak: 9 }), seq(0.5, 0, 0, 0.9).rand).items[0].rarity).toBe('common')
  })

  it('Common 연속은 개체마다 받은 등급으로 이어 센다(9에서 Common을 받으면 같은 보상의 다음 개체는 Rare 이상)', () => {
    const r = seq(0.5, 0, 0, 0.9, 0.5, 0, 0, 0.9)
    const result = rollChapterReward(input({ count: 2, commonStreak: 9 }), r.rand)
    expect(result.items.map((i) => i.rarity)).toEqual(['common', 'rare'])
  })

  it('뽑힌 등급보다 내려가 Common을 받아도 Common 연속으로 센다(8 → 9 → 10이 되어 셋째 개체는 Rare 이상을 뽑는다)', () => {
    // 소속에 Common만 있는 세상. 첫째: Rare를 뽑았지만 Common을 받는다(8 → 9). 둘째: Common(9 → 10). 셋째: 연속 10이라 난수 0도 Rare를 뽑는다.
    const badges = [badge('A', 'common')]
    const r = seq(0.5, 0.5, 0, 0.9, 0.5, 0, 0, 0.9, 0.5, 0, 0, 0.9)
    const result = rollChapterReward(input({ count: 3, badges, tribeIds: ['A'], commonStreak: 8 }), r.rand)
    expect(result.items.map((i) => [i.rolledRarity, i.rarity])).toEqual([
      ['rare', 'common'],
      ['common', 'common'],
      ['rare', 'common'],
    ])
  })
})

describe('rollChapterReward — 잠김', () => {
  it('잠김 확률 경계: 난수가 0.25 미만이면 잠긴 채(rolled), 이상이면 열린 채다', () => {
    const locked = rollChapterReward(input(), seq(0.5, 0, 0, 0.2499).rand).items[0].lock
    expect(locked).toEqual({ locked: true, lockReason: 'rolled', unlockRequired: DEFAULT_JAM_POLICY.locked_min_common })
    const open = rollChapterReward(input(), seq(0.5, 0, 0, 0.25).rand).items[0].lock
    expect(open).toEqual({ locked: false, lockReason: null, unlockRequired: null })
  })

  it('잠김으로 만든 배지는 난수를 쓰지 않고 늘 잠기며, 필요한 양은 배지 값이 우선이다', () => {
    const badges = [badge('A', 'common', { always_locked: true, unlock_required: 77 })]
    const r = seq(0.5, 0, 0)
    const result = rollChapterReward(input({ badges, tribeIds: ['A'] }), r.rand)
    expect(result.items[0].lock).toEqual({ locked: true, lockReason: 'badge_locked', unlockRequired: 77 })
    expect(r.left()).toBe(0)
  })

  it('잠김으로 만든 배지에 필요한 양이 없으면 그 등급의 최소값을 쓴다', () => {
    const badges = [badge('A', 'common', { always_locked: true })]
    const result = rollChapterReward(input({ badges, tribeIds: ['A'] }), seq(0.5, 0, 0).rand)
    expect(result.items[0].lock).toEqual({ locked: true, lockReason: 'badge_locked', unlockRequired: DEFAULT_JAM_POLICY.locked_min_common })
  })

  it('퀘스트 전 캡슐 규칙은 없다 — 첫 개체를 강제로 잠그지 않는다', () => {
    const result = rollChapterReward(input(), seq(0.5, 0, 0, 0.9).rand)
    expect(result.items[0].lock.locked).toBe(false)
  })
})

describe('tribesWithCandidates — 후보 배지가 있는 트라이브만 «다른 트라이브» 대상이다', () => {
  const books = TRIBES.map((t) => book(t))

  it('후보가 없는 트라이브는 빠지고, 소속 트라이브는 후보가 없어도 남으며, 입력 순서를 지킨다', () => {
    const badges = fullBadges.filter((b) => b.item_book_id !== 'book-B' && b.item_book_id !== 'book-A')
    expect(tribesWithCandidates(TRIBES, 'A', books, badges, NOW)).toEqual(['A', 'C', 'D', 'E'])
  })

  it('어느 등급이든 후보가 하나라도 있으면 남는다(Mystic만 있어도)', () => {
    const badges = [badge('B', 'mystic')]
    expect(tribesWithCandidates(['A', 'B'], 'A', books, badges, NOW)).toEqual(['A', 'B'])
  })

  it('비활성 컬렉션·드랍 제외·기간 밖·삭제된 배지만 있는 트라이브는 빠진다', () => {
    const badges = [
      badge('B', 'common', { deleted_at: '2026-11-01T00:00:00Z' }),
      badge('C', 'common', { valid_until: '2026-11-01T00:00:00Z' }),
      badge('D', 'common'),
    ]
    const bks = [book('B'), book('C'), book('D', { is_active: false })]
    expect(tribesWithCandidates(['A', 'B', 'C', 'D'], 'A', bks, badges, NOW)).toEqual(['A'])
  })
})

/**
 * 이동의 동등성 — 옛 `rollCapsule`과 같은 입력·같은 난수면 같은 개체다. 보너스·퀘스트 전을 쓰지 않는 입력만 비교한다.
 * 옛 추첨은 개수에 난수를 한 번 쓰므로(보너스 확률 0 → 난수가 무엇이든 확정 개수), 옛 쪽에는 맨 앞에 버리는 난수 하나를 끼운다.
 * D단계에서 `lib/capsule/`을 지울 때 이 describe와 위의 두 import를 함께 지운다.
 */
describe('옛 rollCapsule과 같은 개체가 나온다 (이동의 동등성)', () => {
  /** 시드가 같으면 같은 열을 돌려주는 간단한 난수(LCG) */
  function lcg(seed: number): () => number {
    let s = seed >>> 0
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 2 ** 32
    }
  }

  // 같은 설정이어도 세상이 다른 입력들 — 내려감·재추첨·건너뜀·보정·잠김이 섞이도록 한다
  const worlds: Array<{ name: string; over: Partial<ChapterRewardRollInput<TestBadge>> }> = [
    { name: '모든 후보가 있는 세상', over: {} },
    { name: '소속에 후보가 없는 세상', over: { badges: fullBadges.filter((b) => b.item_book_id !== 'book-A') } },
    { name: 'common·rare만 있는 세상', over: { badges: fullBadges.filter((b) => b.rarity === 'common' || b.rarity === 'rare') } },
    { name: '잠김으로 만든 배지가 섞인 세상', over: { badges: fullBadges.map((b, i) => (i % 3 === 0 ? { ...b, always_locked: true, unlock_required: 40 } : b)) } },
    { name: '보정이 걸린 세상', over: { epicMiss: 15, commonStreak: 9 } },
  ]

  for (const world of worlds) {
    for (const count of [3, 4, 5]) {
      it(`${world.name}, 개수 ${count}: 시드 200개에서 개체·등급·잠금·건너뜀이 같다`, () => {
        const base = input({ count, ...world.over })
        for (let seed = 1; seed <= 200; seed++) {
          const fresh = rollChapterReward(base, lcg(seed))

          const gen = lcg(seed)
          let first = true
          const oldRand = () => {
            if (first) {
              first = false
              return 0.99 // 개수 난수 — 보너스 확률 0이라 값과 무관하게 확정 개수만 나온다
            }
            return gen()
          }
          const old = rollCapsule(
            {
              policy: {
                ...DEFAULT_CAPSULE_POLICY,
                ...DEFAULT_JAM_POLICY,
                guaranteed_count: count,
                bonus_count: 0,
                bonus_probability: 0,
                other_tribe_probability: base.policy.other_tribe_probability,
                rarity_common: base.policy.rarity_common,
                rarity_rare: base.policy.rarity_rare,
                rarity_epic: base.policy.rarity_epic,
                rarity_mystic: base.policy.rarity_mystic,
                pity_epic_threshold: base.policy.pity_epic_threshold,
              },
              tribeId: base.tribeId,
              tribeIds: base.tribeIds,
              books: base.books,
              badges: base.badges,
              commonStreak: base.commonStreak,
              epicMiss: base.epicMiss,
              preQuest: false,
              now: base.now,
            },
            oldRand
          )

          expect(fresh.items.map((i) => ({ id: i.badge.id, tribe: i.tribeId, rarity: i.rarity, rolled: i.rolledRarity, lock: i.lock }))).toEqual(
            old.items.map((i) => ({ id: i.badge.id, tribe: i.tribeId, rarity: i.rarity, rolled: i.rolledRarity, lock: i.lock }))
          )
          expect(fresh.skipped).toEqual(old.skipped)
        }
      })
    }
  }
})
