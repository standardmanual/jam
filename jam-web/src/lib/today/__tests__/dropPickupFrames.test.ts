/**
 * 드랍·픽업 배지 배치 틀 `FEED_DROP_PICKUP_FRAMES` 불변식 (티켓 20261122_2229, 상위 20261122_2217 §7)
 *
 * 틀의 값은 시안(`docs/assets/prototypes/drop-pickup-a5/board-a5.jpg`)에서 채원이 읽은 값이라 시험은 값이 아니라 불변식을 건다:
 * 수별 항목 수, 한 변 최소 88, 기울인 상자가 영역 밖으로 8px를 넘지 않음(폭 320·358·430), 같은 수면 늘 같은 틀, 영역 높이 함수.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/dropPickupFrames.test.ts
 */
import { describe, it, expect } from 'vitest'
import { dropPickupBoundsOf, tiltedBounds } from '../feedChipGeometry'
import { FEED_CARD_MIN_HEIGHT, FEED_DROP_PICKUP, FEED_DROP_PICKUP_FRAMES, dropPickupAreaHeightOf, dropPickupFrameOf } from '../feedConstants'

const COUNTS = [1, 2, 3, 4, 5] as const
const PAD = 16

describe('배치 틀 표', () => {
  it('배지 수 1~5마다 그 수만큼의 항목이 있다', () => {
    expect(Object.keys(FEED_DROP_PICKUP_FRAMES)).toEqual(['1', '2', '3', '4', '5'])
    for (const n of COUNTS) expect(FEED_DROP_PICKUP_FRAMES[n]).toHaveLength(n)
    expect(FEED_DROP_PICKUP.max).toBe(5)
    expect(FEED_DROP_PICKUP.refWidth).toBe(326)
    expect(FEED_DROP_PICKUP.refHeight).toBe(248)
  })

  it('한 변은 88px 이상이고 중심은 영역 안(0~100%)이며 기울기는 ±12° 안이다', () => {
    for (const n of COUNTS) {
      for (const item of FEED_DROP_PICKUP_FRAMES[n]) {
        expect(item.size).toBeGreaterThanOrEqual(88)
        expect(item.x).toBeGreaterThan(0)
        expect(item.x).toBeLessThan(100)
        expect(item.y).toBeGreaterThan(0)
        expect(item.y).toBeLessThan(100)
        expect(Math.abs(item.tilt)).toBeLessThanOrEqual(12)
      }
    }
  })

  it('기준 영역(326×248)에서 기울인 상자가 영역 밖으로 8px를 넘지 않는다', () => {
    for (const n of COUNTS) {
      for (const item of FEED_DROP_PICKUP_FRAMES[n]) {
        const box = tiltedBounds(item.size, item.size, item.tilt)
        const cx = (item.x / 100) * FEED_DROP_PICKUP.refWidth
        const cy = (item.y / 100) * FEED_DROP_PICKUP.refHeight
        expect(cx - box.w / 2).toBeGreaterThanOrEqual(-8)
        expect(cy - box.h / 2).toBeGreaterThanOrEqual(-8)
        expect(cx + box.w / 2).toBeLessThanOrEqual(FEED_DROP_PICKUP.refWidth + 8)
        expect(cy + box.h / 2).toBeLessThanOrEqual(FEED_DROP_PICKUP.refHeight + 8)
      }
    }
  })

  it('카드 폭 320·358·430에서도 기울인 상자가 카드 밖으로 8px를 넘지 않아 가로 스크롤이 생기지 않는다', () => {
    for (const width of [320, 358, 430]) {
      const areaH = dropPickupAreaHeightOf(width)
      for (const n of COUNTS) {
        for (const box of dropPickupBoundsOf(width, n)) {
          // 영역은 카드 안쪽 여백 16 안에 있다. 영역 밖 한도 8px는 카드 가장자리 안(16 − 8)이라 카드 밖으로는 나가지 않는다
          expect(box.l).toBeGreaterThanOrEqual(PAD - 8 - 1e-6)
          expect(box.t).toBeGreaterThanOrEqual(PAD - 8 - 1e-6)
          expect(box.r).toBeLessThanOrEqual(width - PAD + 8 + 1e-6)
          expect(box.b).toBeLessThanOrEqual(PAD + areaH + 8 + 1e-6)
          expect(box.r).toBeLessThanOrEqual(width)
        }
      }
    }
  })

  it('가장 작은 배지도 폭 320 화면(카드 288, 영역 256)에서 68px 이상으로 읽힌다', () => {
    const smallest = Math.min(...COUNTS.flatMap((n) => FEED_DROP_PICKUP_FRAMES[n].map((item) => item.size)))
    expect(smallest).toBeGreaterThanOrEqual(88)
    expect((smallest * (288 - PAD * 2)) / FEED_DROP_PICKUP.refWidth).toBeGreaterThanOrEqual(68)
  })

  it('같은 수면 늘 같은 틀이다(함수 호출마다 같은 값, 5개를 넘으면 5개 틀, 0개는 빈 틀)', () => {
    for (const n of COUNTS) expect(dropPickupFrameOf(n)).toBe(FEED_DROP_PICKUP_FRAMES[n])
    expect(dropPickupFrameOf(6)).toBe(FEED_DROP_PICKUP_FRAMES[5])
    expect(dropPickupFrameOf(40)).toBe(FEED_DROP_PICKUP_FRAMES[5])
    expect(dropPickupFrameOf(0)).toEqual([])
    expect(dropPickupBoundsOf(358, 3)).toEqual(dropPickupBoundsOf(358, 3))
  })
})

describe('배지 영역 높이', () => {
  it('기준 폭(카드 358 → 영역 326)에서 248이고 폭에 비례해 줄어든다', () => {
    expect(dropPickupAreaHeightOf(358)).toBe(248)
    expect(dropPickupAreaHeightOf(343)).toBe(Math.round((311 * 248) / 326))
    expect(dropPickupAreaHeightOf(288)).toBe(Math.round((256 * 248) / 326))
    expect(dropPickupAreaHeightOf(320)).toBeLessThan(dropPickupAreaHeightOf(358))
    expect(dropPickupAreaHeightOf(430)).toBeGreaterThan(dropPickupAreaHeightOf(358))
  })

  it('최소 높이 400은 16 + 영역 248 + 16 + 글자 블록 약 100 + 16과 맞는다', () => {
    expect(FEED_CARD_MIN_HEIGHT.drop_pickup).toBe(400)
    expect(PAD + dropPickupAreaHeightOf(358) + PAD + 100 + PAD).toBeLessThanOrEqual(FEED_CARD_MIN_HEIGHT.drop_pickup)
  })
})
