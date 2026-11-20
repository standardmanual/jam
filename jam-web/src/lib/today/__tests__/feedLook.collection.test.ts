/**
 * 컬렉션 소개의 배지 배치 `look.burst` (티켓 20261121_0115, 상위 20261120_2026 4회차-3)
 *
 * 확인하는 것: ① 같은 시드는 같은 값(서버·브라우저 같은 값, `Math.random` 없음) ② 배지 4개가 범위(−1~1·크기 68~84·지연 70~210·기울기 6~14°)를 지키고
 * 가운데 그림·배지끼리 최소 거리를 지킨다(시드 500개) ③ 저장된 `collection_burst`는 보존하되 범위를 넘으면 맞추고, NULL·모자란 칸은 시드가 채운다
 * ④ 컬렉션 소개가 아닌 유형에는 `burst`가 없다 ⑤ 설명 노출(세 유형 모두 «보임», `show_description === false`면 숨김).
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedLook.collection.test.ts
 */
import { describe, it, expect } from 'vitest'
import { FEED_BURST, FEED_MOTION } from '../feedConstants'
import { generateCollectionBurst, resolveCollectionBurst, resolveFeedLook, type FeedBurstPlacement, type FeedLookCard, type RenderedFeedType } from '../feedLook'

const NOW = new Date('2026-11-21T12:00:00+09:00')

function look(feedType: RenderedFeedType, card: Partial<FeedLookCard> = {}) {
  return resolveFeedLook({ card: { id: 'card-1', feed_type: feedType, ...card }, feedType, valueSource: null, now: NOW })
}

const px = (point: FeedBurstPlacement) => [point.x * FEED_BURST.referenceHalf.x, point.y * FEED_BURST.referenceHalf.y] as const
const centerDistance = (point: FeedBurstPlacement) => Math.hypot(...px(point))
const pairDistance = (a: FeedBurstPlacement, b: FeedBurstPlacement) => Math.hypot(px(a)[0] - px(b)[0], px(a)[1] - px(b)[1])

describe('generateCollectionBurst — 시드로 정한 배치', () => {
  it('같은 시드는 같은 배치다', () => {
    expect(generateCollectionBurst(12345)).toEqual(generateCollectionBurst(12345))
  })

  it('Math.random과 Date.now를 쓰지 않는다', () => {
    const random = Math.random
    const dateNow = Date.now
    Math.random = () => {
      throw new Error('Math.random 호출')
    }
    Date.now = () => {
      throw new Error('Date.now 호출')
    }
    try {
      expect(generateCollectionBurst(7)).toHaveLength(FEED_BURST.count)
    } finally {
      Math.random = random
      Date.now = dateNow
    }
  })

  it('시드가 다르면 배치가 불규칙하게 달라진다(500개 시드에서 서로 다른 배치가 여럿)', () => {
    const distinct = new Set(Array.from({ length: 500 }, (_, seed) => JSON.stringify(generateCollectionBurst(seed))))
    expect(distinct.size).toBeGreaterThan(400)
  })

  it('시드 500개 모두 범위와 최소 거리를 지킨다', () => {
    for (let seed = 0; seed < 500; seed++) {
      const burst = generateCollectionBurst(seed)
      expect(burst).toHaveLength(FEED_BURST.count)
      burst.forEach((point) => {
        expect(point.x).toBeGreaterThanOrEqual(-1)
        expect(point.x).toBeLessThanOrEqual(1)
        expect(point.y).toBeGreaterThanOrEqual(-1)
        expect(point.y).toBeLessThanOrEqual(1)
        expect(point.size).toBeGreaterThanOrEqual(FEED_BURST.badgeSize.min)
        expect(point.size).toBeLessThanOrEqual(FEED_BURST.badgeSize.max)
        expect(point.delayMs).toBeGreaterThanOrEqual(FEED_MOTION.delayMs.min)
        expect(point.delayMs).toBeLessThanOrEqual(FEED_MOTION.delayMs.max)
        expect(Math.abs(point.tilt)).toBeGreaterThanOrEqual(FEED_BURST.tilt.min)
        expect(Math.abs(point.tilt)).toBeLessThanOrEqual(FEED_BURST.tilt.max)
        // 배지가 영역 밖으로 나가지 않는다
        expect(Math.abs(px(point)[0]) + point.size / 2).toBeLessThanOrEqual(FEED_BURST.referenceHalf.x)
        expect(Math.abs(px(point)[1]) + point.size / 2).toBeLessThanOrEqual(FEED_BURST.referenceHalf.y)
        // 대표 그림에서 떨어진다
        expect(centerDistance(point)).toBeGreaterThanOrEqual(FEED_BURST.minCenterDistance)
      })
      // 배지끼리 지나치게 겹치지 않는다
      for (let i = 0; i < burst.length; i++) {
        for (let j = i + 1; j < burst.length; j++) {
          expect(pairDistance(burst[i], burst[j])).toBeGreaterThanOrEqual(FEED_BURST.minPairDistance)
        }
      }
    }
  })

  it('배지마다 시작 지연이 다르고 사분면이 하나씩이다(한쪽으로 몰리지 않는다)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const burst = generateCollectionBurst(seed)
      expect(new Set(burst.map((point) => point.delayMs)).size).toBe(FEED_BURST.count)
      const quadrants = new Set(burst.map((point) => `${Math.sign(point.x)}${Math.sign(point.y)}`))
      expect(quadrants.size).toBe(FEED_BURST.count)
    }
  })
})

describe('resolveCollectionBurst — 저장된 값과 시드의 합침', () => {
  it('NULL·빈 배열이면 시드 배치다', () => {
    expect(resolveCollectionBurst(null, 9)).toEqual(generateCollectionBurst(9))
    expect(resolveCollectionBurst([], 9)).toEqual(generateCollectionBurst(9))
    expect(resolveCollectionBurst(undefined, 9)).toEqual(generateCollectionBurst(9))
  })

  it('저장된 값은 보존한다', () => {
    const stored = [
      { x: -0.69, y: -0.25, tilt: 8, size: 80, delay_ms: 70 },
      { x: -0.52, y: 0.65, tilt: -14, size: 68, delay_ms: 140 },
      { x: 0.64, y: -0.63, tilt: -9, size: 72, delay_ms: 100 },
      { x: 0.69, y: 0.4, tilt: 12, size: 84, delay_ms: 210 },
    ]
    expect(resolveCollectionBurst(stored, 1)).toEqual([
      { x: -0.69, y: -0.25, tilt: 8, size: 80, delayMs: 70 },
      { x: -0.52, y: 0.65, tilt: -14, size: 68, delayMs: 140 },
      { x: 0.64, y: -0.63, tilt: -9, size: 72, delayMs: 100 },
      { x: 0.69, y: 0.4, tilt: 12, size: 84, delayMs: 210 },
    ])
  })

  it('범위를 넘는 값은 범위 안으로 맞춘다', () => {
    const [first] = resolveCollectionBurst([{ x: 3, y: -9, tilt: 400, size: 10, delay_ms: 5 }], 1)
    expect(first).toEqual({ x: 1, y: -1, tilt: 45, size: FEED_BURST.badgeSize.min, delayMs: FEED_MOTION.delayMs.min })
    const [big] = resolveCollectionBurst([{ x: 0, y: 0, size: 500, delay_ms: 9999 }], 1)
    expect(big.size).toBe(FEED_BURST.badgeSize.max)
    expect(big.delayMs).toBe(FEED_MOTION.delayMs.max)
  })

  it('모자라거나 읽을 수 없는 칸은 시드가 채운다(항상 4개)', () => {
    const generated = generateCollectionBurst(5)
    const resolved = resolveCollectionBurst([{ x: 0.5, y: 0.5 }, { x: Number.NaN, y: 0 } as never], 5)
    expect(resolved).toHaveLength(FEED_BURST.count)
    expect(resolved[0]).toEqual({ x: 0.5, y: 0.5, tilt: generated[0].tilt, size: generated[0].size, delayMs: generated[0].delayMs })
    expect(resolved[1]).toEqual(generated[1])
    expect(resolved[2]).toEqual(generated[2])
    expect(resolved[3]).toEqual(generated[3])
  })
})

describe('resolveFeedLook — burst와 설명 노출', () => {
  it('컬렉션 소개만 burst가 있고 카드 id 시드(또는 feed_seed)를 쓴다', () => {
    const intro = look('collection_intro')
    expect(intro.burst).toEqual(generateCollectionBurst(intro.seed))
    expect(look('collection_intro', { feed_seed: 0 }).burst).toEqual(generateCollectionBurst(0))
    for (const type of ['hero_box', 'text_box', 'badge_intro', 'badge_only', 'full_image', 'drop_pickup', 'gallery_list'] as const) {
      expect(look(type)).not.toHaveProperty('burst')
    }
  })

  it('저장된 collection_burst를 look에 반영한다', () => {
    const intro = look('collection_intro', { collection_burst: [{ x: 0.5, y: -0.5, tilt: 5, size: 70, delay_ms: 90 }] })
    expect(intro.burst?.[0]).toEqual({ x: 0.5, y: -0.5, tilt: 5, size: 70, delayMs: 90 })
    expect(intro.burst).toHaveLength(FEED_BURST.count)
  })

  it('컬렉션 소개·드랍·픽업·목록형은 설명이 보이고 show_description이 false면 숨긴다', () => {
    for (const type of ['collection_intro', 'drop_pickup', 'gallery_list'] as const) {
      expect(look(type).showDescription).toBe(true)
      expect(look(type, { show_description: null }).showDescription).toBe(true)
      expect(look(type, { show_description: false }).showDescription).toBe(false)
    }
  })

  it('칩 자리는 4-1 자리표를 따른다(컬렉션 art-*, 드랍·픽업 box-row-top, 목록형 card-top-right)', () => {
    const source = { resource: 'collection', itemCount: 12 } as const
    const intro = resolveFeedLook({ card: { id: 'c', feed_type: 'collection_intro' }, feedType: 'collection_intro', valueSource: source, now: NOW })
    expect(intro.chips.length).toBeGreaterThan(0)
    for (const chip of intro.chips) expect(chip.slot).toMatch(/^art-/)
    const drop = resolveFeedLook({ card: { id: 'c', feed_type: 'drop_pickup' }, feedType: 'drop_pickup', valueSource: { resource: 'drop_pickup' }, now: NOW })
    expect(drop.chips.map((chip) => chip.slot)).toEqual(['box-row-top'])
  })
})
