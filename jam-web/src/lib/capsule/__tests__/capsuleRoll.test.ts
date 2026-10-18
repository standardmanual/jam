/**
 * lib/capsule/capsuleRoll — 캡슐 열기 추첨 순수 판정 (티켓 20261018_0052 2회, 운영 로직 5.2·5.4절)
 *
 * 고정하는 것:
 * - 개수: 확정 1개 + 확률 20%로 1개 더(경계 0.2는 보너스 없음).
 * - 트라이브: 확률 0이면 늘 소속, 1이면 늘 다른 트라이브, 다른 트라이브는 나머지 넷 가운데 고르게(첫째·마지막 경계).
 * - 등급 경계 70/22/6/2, 보정 1(Epic 이상, 첫 개체만, 임계값 경계), 보정 2(Rare 이상, 임계값 경계, 개체마다 받은 등급으로 이어 셈).
 * - 후보: 활성이고 공개 기간 안인 것만, 후보가 없으면 한 등급 내림(올라가지 않음), 모든 등급에 없으면 건너뜀.
 * - 잠김: `assignLock`(경로 capsule), 퀘스트 전 캡슐은 나온 첫 개체를 반드시 잠그고(rolled, 필요한 양 5) 난수를 쓰지 않는다.
 * - 난수 사용 순서(개수, 개체마다 [트라이브 확률, 트라이브 선택], 등급, 후보, 잠김)를 순서가 있는 난수열로 고정한다.
 * 결정적 난수만 쓴다 — DB는 호출하지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/capsuleRoll.test.ts
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import type { IssueBadge, IssueBook } from '@/lib/drop-engine/syncIssue'
import type { BadgeRarity } from '@/types/database'
import { DEFAULT_CAPSULE_POLICY } from '../policy'
import {
  rollCapsule,
  rollCapsuleCount,
  rollCapsuleRarity,
  rollCapsuleTribe,
  type CapsuleRollInput,
  type CapsuleRollPolicy,
} from '../capsuleRoll'

const policy: CapsuleRollPolicy = { ...DEFAULT_CAPSULE_POLICY, ...DEFAULT_JAM_POLICY }
const NOW = new Date('2026-10-18T00:00:00Z')

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

function input(over: Partial<CapsuleRollInput<TestBadge>> = {}): CapsuleRollInput<TestBadge> {
  return {
    policy,
    tribeId: 'A',
    tribeIds: TRIBES,
    books: TRIBES.map((t) => book(t)),
    badges: fullBadges,
    commonStreak: 0,
    epicMiss: 0,
    preQuest: false,
    now: NOW,
    ...over,
  }
}

describe('rollCapsuleCount — 개수', () => {
  it('확정 1개이고, 난수가 0.2 미만이면 1개 더 나온다(0.2는 경계라 더 나오지 않는다)', () => {
    expect(rollCapsuleCount(policy, seq(0).rand)).toBe(2)
    expect(rollCapsuleCount(policy, seq(0.1999).rand)).toBe(2)
    expect(rollCapsuleCount(policy, seq(0.2).rand)).toBe(1)
    expect(rollCapsuleCount(policy, seq(0.9999).rand)).toBe(1)
  })

  it('보너스 확률 0이면 늘 1개, 1이면 늘 2개다', () => {
    expect(rollCapsuleCount({ ...policy, bonus_probability: 0 }, seq(0).rand)).toBe(1)
    expect(rollCapsuleCount({ ...policy, bonus_probability: 1 }, seq(0.9999999).rand)).toBe(2)
  })
})

describe('rollCapsuleTribe — 트라이브', () => {
  it('다른 트라이브 확률 0이면 늘 소속, 1이면 늘 다른 트라이브다', () => {
    expect(rollCapsuleTribe({ other_tribe_probability: 0 }, 'A', TRIBES, seq(0).rand)).toBe('A')
    const other = rollCapsuleTribe({ other_tribe_probability: 1 }, 'A', TRIBES, seq(0.9999999, 0.5).rand)
    expect(other).not.toBe('A')
  })

  it('경계: 난수가 0.2 미만이면 다른 트라이브, 0.2 이상이면 소속이다', () => {
    expect(rollCapsuleTribe(policy, 'A', TRIBES, seq(0.1999, 0).rand)).toBe('B')
    expect(rollCapsuleTribe(policy, 'A', TRIBES, seq(0.2).rand)).toBe('A')
  })

  it('다른 트라이브는 나머지 넷에서 고르게 고른다(첫째와 마지막 경계, 소속은 빠진다)', () => {
    const pick = (r: number) => rollCapsuleTribe(policy, 'C', TRIBES, seq(0, r).rand)
    // 소속 C를 뺀 나머지: A B D E — 구간 폭 0.25
    expect(pick(0)).toBe('A')
    expect(pick(0.2499)).toBe('A')
    expect(pick(0.25)).toBe('B')
    expect(pick(0.5)).toBe('D')
    expect(pick(0.75)).toBe('E')
    expect(pick(0.9999999)).toBe('E')
  })

  it('다른 트라이브가 없으면 소속이다', () => {
    expect(rollCapsuleTribe({ other_tribe_probability: 1 }, 'A', ['A'], seq(0).rand)).toBe('A')
  })
})

describe('rollCapsuleRarity — 등급 경계와 보정', () => {
  const rarity = (r: number, opts: { epicPity?: boolean; commonStreak?: number } = {}) =>
    rollCapsuleRarity(policy, { epicPity: opts.epicPity ?? false, commonStreak: opts.commonStreak ?? 0 }, seq(r).rand)

  it('70/22/6/2 경계에서 등급이 바뀐다', () => {
    expect(rarity(0)).toBe('common')
    expect(rarity(0.6999)).toBe('common')
    expect(rarity(0.7)).toBe('rare')
    expect(rarity(0.9199)).toBe('rare')
    expect(rarity(0.92)).toBe('epic')
    expect(rarity(0.9799)).toBe('epic')
    expect(rarity(0.98)).toBe('mystic')
    expect(rarity(0.9999999)).toBe('mystic')
  })

  it('보정 1: Epic 이상만 나오고 epic:mystic은 6:2(75:25) 비율이다', () => {
    expect(rarity(0, { epicPity: true })).toBe('epic')
    expect(rarity(0.7499, { epicPity: true })).toBe('epic')
    expect(rarity(0.75, { epicPity: true })).toBe('mystic')
    expect(rarity(0.9999999, { epicPity: true })).toBe('mystic')
  })

  it('보정 2: Common 연속이 임계값(10) 이상이면 Rare 이상만 나오고 비율은 22:6:2다', () => {
    // 임계값 직전(9)에는 Common이 나올 수 있고, 10부터는 나오지 않는다
    expect(rarity(0, { commonStreak: 9 })).toBe('common')
    expect(rarity(0, { commonStreak: 10 })).toBe('rare')
    expect(rarity(0.7332, { commonStreak: 10 })).toBe('rare')
    expect(rarity(0.74, { commonStreak: 10 })).toBe('epic')
    expect(rarity(0.9, { commonStreak: 10 })).toBe('epic')
    expect(rarity(0.95, { commonStreak: 10 })).toBe('mystic')
  })

  it('보정이 겹치면 Epic 이상(보정 1)을 따른다', () => {
    expect(rarity(0, { epicPity: true, commonStreak: 99 })).toBe('epic')
  })
})

describe('rollCapsule — 순서와 후보', () => {
  it('개수, 트라이브, 등급, 후보, 잠김 순서로 난수를 쓴다(1개, 소속, Common, 첫 후보, 열린 채)', () => {
    // 개수 0.5(1개), 트라이브 0.5(소속), 등급 0(common), 후보 0, 잠김 0.9(열린 채)
    const r = seq(0.5, 0.5, 0, 0, 0.9)

    const result = rollCapsule(input(), r.rand)

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      tribeId: 'A',
      rarity: 'common',
      rolledRarity: 'common',
      lock: { locked: false, lockReason: null, unlockRequired: null },
    })
    expect(result.items[0].badge.id).toBe('A-common')
    expect(result.skipped).toEqual([])
    expect(r.left()).toBe(0)
  })

  it('보너스가 나오면 2개이고 둘째는 다른 트라이브일 수 있다', () => {
    // 개수 0.1(2개) / 1번째: 소속 0.5, 등급 0, 후보 0, 잠김 0.9 / 2번째: 다른 트라이브 0.1 → 첫째(B), 등급 0.95(epic), 후보 0, 잠김 0.9
    const r = seq(0.1, 0.5, 0, 0, 0.9, 0.1, 0, 0.95, 0, 0.9)

    const result = rollCapsule(input(), r.rand)

    expect(result.items.map((i) => i.badge.id)).toEqual(['A-common', 'B-epic'])
    expect(result.items[1].tribeId).toBe('B')
    expect(r.left()).toBe(0)
  })

  it('후보는 활성이고 공개 기간 안인 것만이다(비활성 컬렉션·기간 지난 배지·삭제 배지는 빠진다)', () => {
    const badges = [
      badge('A', 'common', { id: 'expired', valid_until: '2026-10-17T23:59:59Z' }),
      badge('A', 'common', { id: 'not-yet', valid_from: '2026-10-19T00:00:00Z' }),
      badge('A', 'common', { id: 'deleted', deleted_at: '2026-10-01T00:00:00Z' }),
      badge('A', 'common', { id: 'excluded', drop_excluded: true }),
      badge('A', 'common', { id: 'ok' }),
      badge('A', 'rare', { id: 'inactive-book', item_book_id: 'book-inactive' }),
    ]
    const books = [book('A'), book('A', { id: 'book-inactive', is_active: false })]

    // 개수 0.5(1개), 소속 0.5, common 0, 후보 0, 잠김 0.9
    const result = rollCapsule(input({ badges, books }), seq(0.5, 0.5, 0, 0, 0.9).rand)
    expect(result.items.map((i) => i.badge.id)).toEqual(['ok'])

    // 비활성 컬렉션의 rare만 있으므로 rare를 뽑아도 후보가 없다 → common으로 내려간다
    const down = rollCapsule(input({ badges, books }), seq(0.5, 0.5, 0.8, 0, 0.9).rand)
    expect(down.items[0]).toMatchObject({ rolledRarity: 'rare', rarity: 'common' })
    expect(down.items[0].badge.id).toBe('ok')
  })

  it('뽑힌 등급에 후보가 없으면 한 등급씩 내려가고, 실제 받은 등급과 처음 뽑힌 등급을 따로 남긴다', () => {
    const badges = fullBadges.filter((b) => !(b.item_book_id === 'book-A' && (b.rarity === 'mystic' || b.rarity === 'epic')))

    // 개수 0.5, 소속 0.5, 등급 0.99(mystic) → mystic·epic 없음 → rare, 후보 0, 잠김 0.9
    const result = rollCapsule(input({ badges }), seq(0.5, 0.5, 0.99, 0, 0.9).rand)

    expect(result.items[0]).toMatchObject({ rolledRarity: 'mystic', rarity: 'rare' })
    expect(result.items[0].badge.id).toBe('A-rare')
  })

  it('위쪽 등급으로는 올라가지 않는다(common만 있는 트라이브에서 common을 뽑으면 common)', () => {
    const badges = fullBadges.filter((b) => b.item_book_id !== 'book-A' || b.rarity === 'common')
    const result = rollCapsule(input({ badges }), seq(0.5, 0.5, 0, 0, 0.9).rand)
    expect(result.items[0].rarity).toBe('common')
  })

  it('모든 등급에 후보가 없는 개체는 건너뛰고 skipped에 남긴다', () => {
    const badges = fullBadges.filter((b) => b.item_book_id !== 'book-A')

    const result = rollCapsule(input({ badges }), seq(0.5, 0.5, 0.99).rand)

    expect(result.items).toEqual([])
    expect(result.skipped).toEqual([{ tribeId: 'A', rolledRarity: 'mystic' }])
  })
})

describe('rollCapsule — 보정', () => {
  it('보정 1: capsule_epic_miss가 임계값(15) 이상이면 첫 개체가 Epic 이상이다. 14이면 걸리지 않는다', () => {
    // 개수 0.5(1개), 소속 0.5, 등급 0(보정이면 epic, 아니면 common), 후보 0, 잠김 0.9
    const pity = rollCapsule(input({ epicMiss: 15 }), seq(0.5, 0.5, 0, 0, 0.9).rand)
    expect(pity.items[0]).toMatchObject({ rarity: 'epic', rolledRarity: 'epic' })

    const none = rollCapsule(input({ epicMiss: 14 }), seq(0.5, 0.5, 0, 0, 0.9).rand)
    expect(none.items[0].rarity).toBe('common')
  })

  it('보정 1은 첫 개체에만 건다(둘째 개체는 설정 확률을 따른다)', () => {
    // 개수 0.1(2개) / 1번째 소속 0.5, 등급 0(epic), 후보 0, 잠김 0.9 / 2번째 소속 0.5, 등급 0(common), 후보 0, 잠김 0.9
    const result = rollCapsule(input({ epicMiss: 20 }), seq(0.1, 0.5, 0, 0, 0.9, 0.5, 0, 0, 0.9).rand)
    expect(result.items.map((i) => i.rarity)).toEqual(['epic', 'common'])
  })

  it('보정 2: common_streak가 임계값(10) 이상이면 Rare 이상이다. 9이면 걸리지 않는다', () => {
    const pity = rollCapsule(input({ commonStreak: 10 }), seq(0.5, 0.5, 0, 0, 0.9).rand)
    expect(pity.items[0].rarity).toBe('rare')

    const none = rollCapsule(input({ commonStreak: 9 }), seq(0.5, 0.5, 0, 0, 0.9).rand)
    expect(none.items[0].rarity).toBe('common')
  })

  it('Common 연속은 개체마다 받은 등급으로 이어 센다(9에서 Common을 받으면 같은 캡슐의 다음 개체는 Rare 이상)', () => {
    // 개수 0.1(2개) / 1번째 소속 0.5, 등급 0(common), 후보 0, 잠김 0.9 / 2번째 소속 0.5, 등급 0(보정 2로 rare), 후보 0, 잠김 0.9
    const result = rollCapsule(input({ commonStreak: 9 }), seq(0.1, 0.5, 0, 0, 0.9, 0.5, 0, 0, 0.9).rand)
    expect(result.items.map((i) => i.rarity)).toEqual(['common', 'rare'])
  })

  it('뽑힌 등급보다 내려가 Common을 받으면 Common 연속으로 센다(9 → 10이 되어 다음 개체는 Rare 이상)', () => {
    const badges = fullBadges.filter((b) => b.item_book_id !== 'book-A' || b.rarity === 'common')
    // 개수 0.1(2개)
    // 1번째: 소속 0.5, 등급 0.99(mystic → A에는 common뿐이라 common으로 내려감), 후보 0, 잠김 0.9
    // 2번째: 다른 트라이브 0.1 → B, 등급 0(streak 10이면 rare, 9이면 common), 후보 0, 잠김 0.9
    const result = rollCapsule(input({ badges, commonStreak: 9 }), seq(0.1, 0.5, 0.99, 0, 0.9, 0.1, 0, 0, 0, 0.9).rand)

    expect(result.items.map((i) => [i.rolledRarity, i.rarity])).toEqual([
      ['mystic', 'common'],
      ['rare', 'rare'],
    ])
  })
})

describe('rollCapsule — 잠김', () => {
  it('잠김 확률 경계: 난수가 0.25 미만이면 잠긴 채(rolled), 이상이면 열린 채다', () => {
    const locked = rollCapsule(input(), seq(0.5, 0.5, 0, 0, 0.2499).rand)
    expect(locked.items[0].lock).toEqual({ locked: true, lockReason: 'rolled', unlockRequired: 30 })

    const open = rollCapsule(input(), seq(0.5, 0.5, 0, 0, 0.25).rand)
    expect(open.items[0].lock.locked).toBe(false)
  })

  it('잠김으로 만든 배지는 난수를 쓰지 않고 늘 잠기며, 필요한 양은 배지 값이 우선이다', () => {
    const badges = [badge('A', 'common', { always_locked: true, unlock_required: 77 })]
    const r = seq(0.5, 0.5, 0, 0)

    const result = rollCapsule(input({ badges }), r.rand)

    expect(result.items[0].lock).toEqual({ locked: true, lockReason: 'badge_locked', unlockRequired: 77 })
    expect(r.left()).toBe(0)
  })

  it('퀘스트 전 캡슐은 나온 첫 개체를 반드시 잠그고(rolled, 필요한 양 5) 잠김 난수를 쓰지 않는다', () => {
    const noLock = { ...policy, locked_roll_probability: 0 }
    // 개수 0.1(2개) / 1번째 소속 0.5, 등급 0, 후보 0 (잠김 난수 없음) / 2번째 소속 0.5, 등급 0, 후보 0, 잠김 0.9(확률 0이라 열린 채)
    const r = seq(0.1, 0.5, 0, 0, 0.5, 0, 0, 0.9)

    const result = rollCapsule(input({ policy: noLock, preQuest: true }), r.rand)

    expect(result.items[0].lock).toEqual({ locked: true, lockReason: 'rolled', unlockRequired: 5 })
    expect(result.items[1].lock.locked).toBe(false)
    expect(r.left()).toBe(0)
  })

  it('퀘스트 전이 아니면 첫 개체를 강제로 잠그지 않는다', () => {
    const noLock = { ...policy, locked_roll_probability: 0 }
    const result = rollCapsule(input({ policy: noLock, preQuest: false }), seq(0.5, 0.5, 0, 0, 0.9).rand)
    expect(result.items[0].lock.locked).toBe(false)
  })

  it('퀘스트 전 캡슐의 필요한 양은 정책 값을 쓴다', () => {
    const result = rollCapsule(input({ policy: { ...policy, pre_quest_unlock_required: 8 }, preQuest: true }), seq(0.5, 0.5, 0, 0).rand)
    expect(result.items[0].lock).toEqual({ locked: true, lockReason: 'rolled', unlockRequired: 8 })
  })

  it('퀘스트 전 캡슐에서 첫 개체가 후보 없음으로 건너뛰어지면 나온 첫 개체를 잠근다', () => {
    const badges = fullBadges.filter((b) => b.item_book_id !== 'book-B')
    // 개수 0.1(2개) / 1번째 다른 트라이브 0.1 → B(후보 없음), 등급 0.5 → 건너뜀 / 2번째 소속 0.5, 등급 0, 후보 0 → 나온 첫 개체라 잠김
    const result = rollCapsule(input({ badges, preQuest: true }), seq(0.1, 0.1, 0, 0.5, 0.5, 0, 0).rand)

    expect(result.skipped).toHaveLength(1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].lock).toMatchObject({ locked: true, lockReason: 'rolled' })
  })
})
