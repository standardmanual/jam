/**
 * 미션 보상 배지의 숨김·잠김 가림 (티켓 20261019_1317 2회, 운영 로직 7.3절·10.3절)
 *
 * 고정하는 것
 *  - 열린 보상은 이름·그림·id·등급만 싣고, 숨김 칸·잠김 칸은 싣지 않는다.
 *  - 잠긴 보상은 등급만 남고 이름·그림·id는 열린 목록에 없다. 숨김 배지는 등급도 내리지 않는다.
 *  - 숨김이면서 잠김이면 숨김이 이긴다.
 *  - 가릴 id 집합은 숨김 + 잠김이다. 읽기에 실패하면 모든 id를 가리고 아무것도 내리지 않는다.
 *  - 목록 화면은 미션마다 `lockedRaritiesOf`로 자기 보상의 잠긴 등급만 고른다.
 * 실행: cd jam-web && npx vitest run src/lib/missions/locked-rewards.test.ts
 */
import { describe, it, expect } from 'vitest'
import { lockedRaritiesOf, splitRewardBadges, type RewardBadgeSourceRow } from './locked-rewards'

const OPEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LOCKED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const HIDDEN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const BOTH = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const rows: RewardBadgeSourceRow[] = [
  { id: OPEN, name: '주말 러너', image_url: 'https://cdn.example/open.png', rarity: 'rare', is_hidden: false, always_locked: false },
  { id: LOCKED, name: '비밀 장갑', image_url: 'https://cdn.example/locked.png', rarity: 'epic', is_hidden: false, always_locked: true },
  { id: HIDDEN, name: '숨김 모자', image_url: 'https://cdn.example/hidden.png', rarity: 'mystic', is_hidden: true, always_locked: false },
  { id: BOTH, name: '숨김 잠김 신발', image_url: 'https://cdn.example/both.png', rarity: 'common', is_hidden: true, always_locked: true },
]
const ALL_IDS = [OPEN, LOCKED, HIDDEN, BOTH]

describe('splitRewardBadges', () => {
  it('열린 보상만 이름·그림·id·등급으로 싣는다. 숨김·잠김 칸은 싣지 않는다', () => {
    const { open } = splitRewardBadges(rows, ALL_IDS, false)

    expect(open).toEqual([{ id: OPEN, name: '주말 러너', image_url: 'https://cdn.example/open.png', rarity: 'rare' }])
    expect(open.every((badge) => !('is_hidden' in badge) && !('always_locked' in badge))).toBe(true)
  })

  it('잠긴 보상은 등급만 남는다. 숨김 배지의 등급은 내리지 않는다', () => {
    const { lockedRarities, open } = splitRewardBadges(rows, ALL_IDS, false)

    expect(lockedRarities).toEqual(['epic'])
    const serialized = JSON.stringify({ open, lockedRarities })
    expect(serialized).not.toContain('비밀 장갑')
    expect(serialized).not.toContain('locked.png')
    expect(serialized).not.toContain(LOCKED)
    expect(serialized).not.toContain('mystic')
  })

  it('숨김이면서 잠김인 배지는 숨김이 이긴다 — 열린 목록에도 잠긴 등급에도 없다', () => {
    const { open, lockedRarities, concealedIds } = splitRewardBadges(rows, ALL_IDS, false)

    expect(open.map((badge) => badge.id)).not.toContain(BOTH)
    expect(lockedRarities).toEqual(['epic'])
    expect(concealedIds.has(BOTH)).toBe(true)
  })

  it('가릴 id는 숨김과 잠김이고 열린 배지는 들어가지 않는다', () => {
    const { concealedIds } = splitRewardBadges(rows, ALL_IDS, false)

    expect([...concealedIds].sort()).toEqual([LOCKED, HIDDEN, BOTH].sort())
  })

  it('숨김·잠김 칸이 없는(옛 모양) 행은 열린 배지로 본다', () => {
    const plain: RewardBadgeSourceRow[] = [{ id: OPEN, name: '주말 러너', image_url: null, rarity: 'rare' }]

    const result = splitRewardBadges(plain, [OPEN], false)

    expect(result.open).toHaveLength(1)
    expect(result.concealedIds.size).toBe(0)
    expect(result.lockedRarities).toEqual([])
  })

  it('등급이 없는 잠긴 배지(무한레벨형)는 null 등급으로 남아 개수가 유지된다', () => {
    const noRarity: RewardBadgeSourceRow[] = [{ id: LOCKED, name: '이름', image_url: null, rarity: null, always_locked: true }]

    expect(splitRewardBadges(noRarity, [LOCKED], false).lockedRarities).toEqual([null])
  })

  it('잠긴 등급은 ids 순서를 따르고 같은 id는 한 번만 센다', () => {
    const twoLocked: RewardBadgeSourceRow[] = [
      { id: LOCKED, name: 'a', image_url: null, rarity: 'epic', always_locked: true },
      { id: BOTH, name: 'b', image_url: null, rarity: 'rare', always_locked: true },
    ]

    const { lockedRarities } = splitRewardBadges(twoLocked, [BOTH, LOCKED, BOTH], false)

    expect(lockedRarities).toEqual(['rare', 'epic'])
  })

  it('읽지 못했으면 모든 id를 가리고 열린 보상·잠긴 등급을 하나도 내리지 않는다', () => {
    const result = splitRewardBadges(rows, ALL_IDS, true)

    expect(result.open).toEqual([])
    expect(result.lockedRarities).toEqual([])
    expect([...result.concealedIds].sort()).toEqual([...ALL_IDS].sort())
  })

  it('조회에서 빠진(삭제된) id는 가릴 필요가 없다', () => {
    const result = splitRewardBadges(rows.slice(0, 1), [OPEN, HIDDEN], false)

    expect(result.concealedIds.size).toBe(0)
  })
})

describe('lockedRaritiesOf', () => {
  const byId = new Map<string, 'common' | 'rare' | 'epic' | 'mystic' | null>([
    [LOCKED, 'epic'],
    [BOTH, null],
  ])

  it('미션의 보상 id 중 잠긴 것의 등급만 순서대로 모은다', () => {
    expect(lockedRaritiesOf([OPEN, BOTH, LOCKED], byId)).toEqual([null, 'epic'])
  })

  it('보상 id가 없거나 null이면 빈 배열이다', () => {
    expect(lockedRaritiesOf(null, byId)).toEqual([])
    expect(lockedRaritiesOf(undefined, byId)).toEqual([])
    expect(lockedRaritiesOf([], byId)).toEqual([])
  })

  it('빈 값과 중복 id는 건너뛴다', () => {
    expect(lockedRaritiesOf([null, '', LOCKED, LOCKED], byId)).toEqual(['epic'])
  })
})
