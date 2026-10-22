/**
 * 컬렉션 4등급 켜기 전 점검 판정 (티켓 20261022_1139 1회)
 *
 * `docs/service/content/ITEMBOOK_TIERS.md` 2절의 점검 SQL과 같은 결과를 내는지 고정한다.
 *   - SQL 1번(이름별 등급): 이름별 배지 수·서로 다른 등급 수. 등급이 빈 배지는 등급 수에 들지 않는다.
 *   - SQL 2번(유저별 장착 등급): 서로 다른 등급이 둘 이상인 유저만 남긴다. 등급이 빈 배지는 세지 않는다.
 *   - 3번(등급별 완성 기록): 행이 있으면 끄기를 막는다.
 * 실행: cd jam-web && npx vitest run src/lib/itembook/__tests__/tier-readiness.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  TIER_ORDER,
  checkTierNames,
  evaluateTierReadiness,
  summarizeTierDistribution,
} from '../tier-readiness'

describe('checkTierNames — 이름×등급 표와 경고', () => {
  it('이름마다 4등급이 하나씩이면 경고가 없다', () => {
    const badges = ['가', '나'].flatMap((name) => TIER_ORDER.map((rarity) => ({ name, rarity })))
    const names = checkTierNames(badges)
    expect(names.nameCount).toBe(2)
    expect(names.duplicateTierNameCount).toBe(0)
    expect(names.tierCountMismatch).toBe(false)
    expect(names.tierCountGroups).toEqual([{ tierCount: 4, nameCount: 2 }])
    expect(names.rows[0].counts).toEqual({ common: 1, rare: 1, epic: 1, mystic: 1 })
  })

  it('한 이름에 같은 등급이 둘 이상이면 그 이름만 중복으로 센다', () => {
    const names = checkTierNames([
      { name: '가', rarity: 'common' },
      { name: '가', rarity: 'common' },
      { name: '가', rarity: 'rare' },
      { name: '나', rarity: 'common' },
      { name: '나', rarity: 'rare' },
    ])
    expect(names.duplicateTierNameCount).toBe(1)
    const row = names.rows.find((r) => r.name === '가')!
    expect(row.hasDuplicateTier).toBe(true)
    expect(row.counts.common).toBe(2)
    expect(row.tierCount).toBe(2)
    expect(names.rows.find((r) => r.name === '나')!.hasDuplicateTier).toBe(false)
  })

  it('이름마다 등급 수가 다르면 등급 수별 이름 수와 함께 불일치로 본다', () => {
    const names = checkTierNames([
      { name: '가', rarity: 'common' },
      { name: '가', rarity: 'rare' },
      { name: '가', rarity: 'epic' },
      { name: '가', rarity: 'mystic' },
      { name: '나', rarity: 'common' },
      { name: '다', rarity: 'common' },
    ])
    expect(names.tierCountMismatch).toBe(true)
    expect(names.tierCountGroups).toEqual([
      { tierCount: 1, nameCount: 2 },
      { tierCount: 4, nameCount: 1 },
    ])
  })

  it('등급이 빈 배지는 등급 수에 들지 않고 따로 센다', () => {
    const names = checkTierNames([
      { name: '가', rarity: 'common' },
      { name: '가', rarity: null },
      { name: '나', rarity: null },
    ])
    const row = names.rows.find((r) => r.name === '가')!
    expect(row.tierCount).toBe(1)
    expect(row.noTierCount).toBe(1)
    expect(names.rows.find((r) => r.name === '나')!.tierCount).toBe(0)
    expect(names.noTierBadgeCount).toBe(2)
  })

  it('배지가 없으면 빈 표이고 경고도 없다', () => {
    const names = checkTierNames([])
    expect(names).toMatchObject({ nameCount: 0, rows: [], tierCountGroups: [], tierCountMismatch: false, duplicateTierNameCount: 0 })
  })

  it('이름은 글자 그대로 구분한다(띄어쓰기가 다르면 다른 이름)', () => {
    const names = checkTierNames([
      { name: '새벽 러너', rarity: 'common' },
      { name: '새벽러너', rarity: 'rare' },
    ])
    expect(names.nameCount).toBe(2)
  })
})

describe('summarizeTierDistribution — 장착한 등급 분포', () => {
  it('여러 등급을 장착한 유저만 정리 대상으로 센다', () => {
    const dist = summarizeTierDistribution([
      { userId: 'u1', rarity: 'common' },
      { userId: 'u1', rarity: 'common' },
      { userId: 'u2', rarity: 'common' },
      { userId: 'u2', rarity: 'rare' },
      { userId: 'u3', rarity: 'rare' },
      { userId: 'u3', rarity: 'epic' },
      { userId: 'u3', rarity: 'mystic' },
      { userId: 'u4', rarity: 'common' },
      { userId: 'u4', rarity: 'rare' },
    ])
    expect(dist.slotCount).toBe(9)
    expect(dist.userCount).toBe(4)
    expect(dist.multiTierUserCount).toBe(3)
    expect(dist.userCountByTier).toEqual({ common: 3, rare: 3, epic: 1, mystic: 1 })
    expect(dist.multiTierCombos).toEqual([
      { tiers: ['common', 'rare'], userCount: 2 },
      { tiers: ['rare', 'epic', 'mystic'], userCount: 1 },
    ])
  })

  it('한 등급만 여러 개 장착한 유저는 정리 대상이 아니다', () => {
    const dist = summarizeTierDistribution([
      { userId: 'u1', rarity: 'rare' },
      { userId: 'u1', rarity: 'rare' },
      { userId: 'u1', rarity: 'rare' },
    ])
    expect(dist.multiTierUserCount).toBe(0)
    expect(dist.multiTierCombos).toEqual([])
  })

  it('등급이 빈 배지에 꽂힌 장착은 등급 판별에서 빠지고 따로 센다', () => {
    const dist = summarizeTierDistribution([
      { userId: 'u1', rarity: 'common' },
      { userId: 'u1', rarity: null },
      { userId: 'u2', rarity: null },
    ])
    expect(dist.multiTierUserCount).toBe(0)
    expect(dist.noTierSlotCount).toBe(2)
    expect(dist.userCount).toBe(2)
    expect(dist.userCountByTier.common).toBe(1)
  })

  it('장착이 없으면 모든 수가 0이다', () => {
    expect(summarizeTierDistribution([])).toEqual({
      slotCount: 0,
      userCount: 0,
      userCountByTier: { common: 0, rare: 0, epic: 0, mystic: 0 },
      noTierSlotCount: 0,
      multiTierUserCount: 0,
      multiTierCombos: [],
    })
  })

  it('결과에 유저 id가 들어 있지 않다', () => {
    const dist = summarizeTierDistribution([
      { userId: 'user-secret-1', rarity: 'common' },
      { userId: 'user-secret-1', rarity: 'rare' },
    ])
    expect(JSON.stringify(dist)).not.toContain('user-secret-1')
  })
})

describe('evaluateTierReadiness — 켜기·끄기 가능 여부', () => {
  const clean = { badges: [], slots: [], tierCompletionCount: 0 }

  it('아무것도 없으면 켜고 끌 수 있다', () => {
    const readiness = evaluateTierReadiness(clean)
    expect(readiness.canEnable).toBe(true)
    expect(readiness.canDisable).toBe(true)
  })

  it('여러 등급을 장착한 유저가 한 명이라도 있으면 켤 수 없다', () => {
    const readiness = evaluateTierReadiness({
      ...clean,
      slots: [
        { userId: 'u1', rarity: 'common' },
        { userId: 'u1', rarity: 'rare' },
      ],
    })
    expect(readiness.canEnable).toBe(false)
    expect(readiness.distribution.multiTierUserCount).toBe(1)
  })

  it('이름 점검 경고는 켜기를 막지 않는다', () => {
    const readiness = evaluateTierReadiness({
      ...clean,
      badges: [
        { name: '가', rarity: 'common' },
        { name: '가', rarity: 'common' },
        { name: '나', rarity: 'rare' },
      ],
    })
    expect(readiness.names.duplicateTierNameCount).toBe(1)
    expect(readiness.names.tierCountMismatch).toBe(false)
    expect(readiness.canEnable).toBe(true)
  })

  it('등급별 완성 기록이 하나라도 있으면 끌 수 없다', () => {
    const readiness = evaluateTierReadiness({ ...clean, tierCompletionCount: 1 })
    expect(readiness.canDisable).toBe(false)
    expect(readiness.tierCompletionCount).toBe(1)
    expect(readiness.canEnable).toBe(true)
  })
})
