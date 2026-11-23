/**
 * 칩·스티커 배치의 기하(순수 계산) — 티켓 20261122_2228 R3, 상위 20261122_2217 §3·§4·§6·§7
 *
 * 확인하는 것: 유형별 모서리 후보 표, 칩·스티커 크기 추정, 기울어진 경계 상자, 모서리 자리 한도(안쪽 6%·5%, 바깥 6px),
 * 겹침·같은 줄 판정, 폭 288·358에서의 피할 영역, 최악 문구(COLLECTION)가 폭 288에서 한도를 벗어나지 않음.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedChipGeometry.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  CHIP_GEOMETRY_TYPES,
  FEED_CHIP_TYPE_TABLE,
  LOWER_BAND,
  PLAN_WIDTHS,
  cardGeometryOf,
  cardHeightOf,
  chipHeightOf,
  chipWidthOf,
  cornerOffsetLimits,
  cornerRect,
  inLowerBand,
  overlapArea,
  overlapWithAll,
  sameRow,
  stickerSizeOf,
  textBlockOf,
  tiltedBounds,
  toRatioRect,
  withinCornerLimits,
  worstCaseBounds,
  type CardGeometryInput,
  type ChipGeometryType,
} from '../feedChipGeometry'
import { FEED_CARD_MIN_HEIGHT, FEED_CORNER_INSET, FEED_CORNER_OVERHANG } from '../feedConstants'
import type { ChipCorner } from '../feedChipLayout'

const ALL_CORNERS: ChipCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

function inputOf(feedType: ChipGeometryType, width: number, extra: Partial<CardGeometryInput> = {}): CardGeometryInput {
  return { feedType, width, titleLines: [8], descriptionLength: 30, descriptionVisible: true, hasImage: true, ...extra }
}

describe('유형별 모서리 후보 표', () => {
  it('유형은 일곱 개이고 전체 배경 이미지는 없다', () => {
    expect(CHIP_GEOMETRY_TYPES).toHaveLength(7)
    expect(CHIP_GEOMETRY_TYPES).not.toContain('full_image' as never)
    expect(Object.keys(FEED_CHIP_TYPE_TABLE).sort()).toEqual([...CHIP_GEOMETRY_TYPES].sort())
  })

  it('글자가 아래에 있는 카드(히어로·배지 소개·드랍 픽업·컬렉션)는 위쪽 두 모서리만 후보다', () => {
    for (const type of ['hero_box', 'badge_intro', 'drop_pickup', 'collection_intro'] as const) {
      expect(FEED_CHIP_TYPE_TABLE[type].corners).toEqual(['top-left', 'top-right'])
      expect(FEED_CHIP_TYPE_TABLE[type].edge).toBe('top')
      expect(FEED_CHIP_TYPE_TABLE[type].diagonal).toBe(false)
    }
  })

  it('텍스트형은 네 모서리가 후보이고 두 칩은 대각선이다', () => {
    expect([...FEED_CHIP_TYPE_TABLE.text_box.corners].sort()).toEqual([...ALL_CORNERS].sort())
    expect(FEED_CHIP_TYPE_TABLE.text_box.diagonal).toBe(true)
  })

  it('배지만은 제목이 위에 있어 아래 두 모서리, 목록형은 모서리 후보가 없다(제목 위 흐름 줄)', () => {
    expect(FEED_CHIP_TYPE_TABLE.badge_only.corners).toEqual(['bottom-left', 'bottom-right'])
    expect(FEED_CHIP_TYPE_TABLE.gallery_list.corners).toEqual([])
    expect(FEED_CHIP_TYPE_TABLE.gallery_list.edge).toBe('flow')
  })

  it('둘째 칩을 내리는 높이는 카드 높이의 12~22%다', () => {
    expect(LOWER_BAND).toEqual({ min: 0.12, max: 0.22 })
    expect(inLowerBand(0.12)).toBe(true)
    expect(inLowerBand(0.22)).toBe(true)
    expect(inLowerBand(0.11)).toBe(false)
    expect(inLowerBand(0.23)).toBe(false)
  })
})

describe('칩·스티커 크기 추정', () => {
  it('칩 높이는 큰 칩 52·작은 칩 40이다', () => {
    expect(chipHeightOf('lg')).toBe(52)
    expect(chipHeightOf('sm')).toBe(40)
  })

  it('글자가 길수록 넓고 큰 칩이 작은 칩보다 넓다', () => {
    expect(chipWidthOf('ITEM', 'lg')).toBeLessThan(chipWidthOf('ACTIVITY', 'lg'))
    expect(chipWidthOf('ACTIVITY', 'sm')).toBeLessThan(chipWidthOf('ACTIVITY', 'lg'))
    expect(chipWidthOf('2일 남음', 'sm')).toBeGreaterThan(0)
  })

  it('큰 COLLECTION 칩은 글자 + 가로 여백 + 외곽선이라 약 200px다', () => {
    const width = chipWidthOf('COLLECTION', 'lg')
    expect(width).toBeGreaterThan(190)
    expect(width).toBeLessThan(230)
  })

  it('스티커 크기는 조약돌 116×84·물결 112×92이고 배율을 곱한다', () => {
    expect(stickerSizeOf('pebble')).toEqual({ w: 116, h: 84 })
    expect(stickerSizeOf('wave')).toEqual({ w: 112, h: 92 })
    expect(stickerSizeOf('pebble', 0.8).w).toBeCloseTo(92.8)
    expect(stickerSizeOf('wave', 0.8).h).toBeCloseTo(73.6)
  })
})

describe('기울어진 칩의 바깥 끝', () => {
  it('각도 0이면 그대로이고 기울이면 두 방향 모두 늘어난다', () => {
    expect(tiltedBounds(100, 40, 0)).toEqual({ w: 100, h: 40 })
    const t = tiltedBounds(100, 40, 12)
    expect(t.w).toBeGreaterThan(100)
    expect(t.h).toBeGreaterThan(40)
  })

  it('각도의 부호는 상관없고 각도가 클수록 더 늘어난다', () => {
    expect(tiltedBounds(150, 52, -8)).toEqual(tiltedBounds(150, 52, 8))
    expect(tiltedBounds(150, 52, 3).h).toBeLessThan(tiltedBounds(150, 52, 12).h)
  })

  it('최악 12° 경계 상자는 3~12° 어느 각도보다 작지 않다', () => {
    const worst = worstCaseBounds(174, 52)
    for (const deg of [3, 5, 8, 12]) {
      const t = tiltedBounds(174, 52, deg)
      expect(worst.w).toBeGreaterThanOrEqual(t.w - 1e-9)
      expect(worst.h).toBeGreaterThanOrEqual(t.h - 1e-9)
    }
  })
})

describe('모서리 자리 한도(안쪽 가로 6%·세로 5%, 바깥 6px)', () => {
  it('한도 상수가 사용자 확정값이다', () => {
    expect(FEED_CORNER_INSET).toEqual({ x: 6, y: 5 })
    expect(FEED_CORNER_OVERHANG).toBe(6)
  })

  it('한도 끝 자리는 한도 안이고, 한 칸 더 나가면 벗어난다', () => {
    const [w, h] = [358, 360]
    const limits = cornerOffsetLimits(w, h)
    for (const corner of ALL_CORNERS) {
      for (const [x, y] of [
        [limits.xMin, limits.yMin],
        [limits.xMax, limits.yMax],
        [limits.xMin, limits.yMax],
        [limits.xMax, limits.yMin],
      ]) {
        expect(withinCornerLimits(corner, cornerRect(corner, 120, 60, { x, y }, w, h), w, h)).toBe(true)
      }
      expect(withinCornerLimits(corner, cornerRect(corner, 120, 60, { x: limits.xMin - 0.01, y: 0 }, w, h), w, h)).toBe(false)
      expect(withinCornerLimits(corner, cornerRect(corner, 120, 60, { x: 0, y: limits.yMax + 0.01 }, w, h), w, h)).toBe(false)
    }
  })

  it('모서리마다 오프셋은 그 가장자리에서 잰다', () => {
    const rect = (corner: ChipCorner) => cornerRect(corner, 100, 50, { x: 0.05, y: 0.04 }, 300, 400)
    expect(rect('top-left')).toEqual({ l: 15, t: 16, r: 115, b: 66 })
    expect(rect('bottom-right')).toEqual({ l: 185, t: 334, r: 285, b: 384 })
    expect(rect('top-right').r).toBe(285)
    expect(rect('bottom-left').b).toBe(384)
  })

  it('최악 문구 COLLECTION(큰 칩, 기울기 12°)은 폭 288에서 한도 안 자리에서 카드를 벗어나지 않는다', () => {
    const [w, h] = [288, FEED_CARD_MIN_HEIGHT.hero_box]
    const box = { w: chipWidthOf('COLLECTION', 'lg'), h: chipHeightOf('lg') }
    const bounds = tiltedBounds(box.w, box.h, 12)
    const limits = cornerOffsetLimits(w, h)
    for (const corner of ALL_CORNERS) {
      for (const x of [limits.xMin, 0, limits.xMax]) {
        const rect = cornerRect(corner, bounds.w, bounds.h, { x, y: 0 }, w, h)
        expect(withinCornerLimits(corner, rect, w, h)).toBe(true)
        expect(rect.l).toBeGreaterThanOrEqual(-FEED_CORNER_OVERHANG - 1e-6)
        expect(rect.r).toBeLessThanOrEqual(w + FEED_CORNER_OVERHANG + 1e-6)
      }
    }
    expect(bounds.w).toBeLessThan(w * 0.85)
  })
})

describe('겹침과 같은 줄', () => {
  const a = { l: 0, t: 0, r: 10, b: 10 }

  it('겹치는 넓이를 잰다', () => {
    expect(overlapArea(a, { l: 5, t: 5, r: 15, b: 15 })).toBe(25)
    expect(overlapArea(a, { l: 10, t: 0, r: 20, b: 10 })).toBe(0)
    expect(overlapWithAll(a, [{ l: 5, t: 0, r: 20, b: 10 }, { l: 0, t: 5, r: 10, b: 20 }])).toBe(50 + 50)
  })

  it('세로 구간이 간격 안으로 겹치면 같은 줄이다', () => {
    expect(sameRow(a, { l: 100, t: 5, r: 110, b: 15 })).toBe(true)
    expect(sameRow(a, { l: 100, t: 12, r: 110, b: 22 })).toBe(true)
    expect(sameRow(a, { l: 100, t: 16, r: 110, b: 26 })).toBe(false)
  })
})

describe('카드 높이와 글자 블록', () => {
  it('제목이 짧으면 유형별 최소 높이이고 텍스트형은 정사각이다', () => {
    for (const type of ['hero_box', 'badge_intro', 'drop_pickup', 'collection_intro', 'badge_only'] as const) {
      expect(cardHeightOf(inputOf(type, 358))).toBe(FEED_CARD_MIN_HEIGHT[type])
    }
    expect(cardHeightOf(inputOf('text_box', 288))).toBe(288)
    expect(cardHeightOf(inputOf('text_box', 358))).toBe(358)
  })

  it('제목·설명이 길면 글자 블록이 높아지고 카드도 늘어난다', () => {
    const short = textBlockOf({ titleLines: [6], descriptionLength: 20, descriptionVisible: true }, 358)
    const long = textBlockOf({ titleLines: [40], descriptionLength: 200, descriptionVisible: true }, 358)
    expect(long.height).toBeGreaterThan(short.height)
    expect(cardHeightOf(inputOf('hero_box', 358, { titleLines: [40], descriptionLength: 200 }))).toBeGreaterThan(FEED_CARD_MIN_HEIGHT.hero_box)
  })

  it('폭이 좁으면 같은 글자가 더 많은 줄이 된다', () => {
    const text = { titleLines: [18], descriptionLength: 60, descriptionVisible: true }
    expect(textBlockOf(text, 288).height).toBeGreaterThan(textBlockOf(text, 358).height)
  })

  it('설명이 보이지 않으면 설명 높이를 세지 않는다', () => {
    const base = { titleLines: [6], descriptionLength: 80 }
    expect(textBlockOf({ ...base, descriptionVisible: false }, 358).height).toBeLessThan(textBlockOf({ ...base, descriptionVisible: true }, 358).height)
  })
})

describe('피할 영역', () => {
  it('글자 영역은 글자가 아래에 있는 카드에서 카드 아래쪽, 배지만에서는 위쪽에 있다', () => {
    for (const type of ['hero_box', 'badge_intro', 'drop_pickup', 'collection_intro'] as const) {
      const g = cardGeometryOf(inputOf(type, 358))
      expect(g.textRects).toHaveLength(1)
      expect(g.textRects[0].b).toBeGreaterThan(g.height - 16)
      expect(g.textRects[0].t).toBeGreaterThan(g.height / 2)
    }
    const only = cardGeometryOf(inputOf('badge_only', 358))
    expect(only.textRects[0].t).toBeLessThan(30)
  })

  it('글자 영역은 카드 폭이 달라도 카드 안에 있다', () => {
    for (const type of CHIP_GEOMETRY_TYPES) {
      for (const width of PLAN_WIDTHS) {
        const g = cardGeometryOf(inputOf(type, width, { titleLines: [30], descriptionLength: 120 }))
        for (const r of g.textRects) {
          expect(r.l).toBeGreaterThanOrEqual(0)
          expect(r.r).toBeLessThanOrEqual(width)
          expect(r.t).toBeGreaterThanOrEqual(0)
          expect(r.b).toBeLessThanOrEqual(g.height + 4)
        }
      }
    }
  })

  it('그림이 없으면 그림 가운데를 피하지 않고, 있으면 피한다', () => {
    for (const type of ['badge_intro', 'badge_only', 'drop_pickup', 'collection_intro'] as const) {
      const withArt = cardGeometryOf(inputOf(type, 358, { hasImage: true }))
      const noArt = cardGeometryOf(inputOf(type, 358, { hasImage: false }))
      expect(withArt.avoid.length).toBeGreaterThan(noArt.avoid.length)
    }
  })

  it('그림 가운데 영역은 그림 상자의 가운데 비율(가로·세로 50%)이다', () => {
    const g = cardGeometryOf(inputOf('badge_intro', 358))
    const zone = g.avoid[g.avoid.length - 1]
    expect(zone.r - zone.l).toBeCloseTo(104)
    expect((zone.l + zone.r) / 2).toBeCloseTo(179)
  })

  it('히어로의 사진 박스는 가운데 구역이 없다(글자 영역만 피한다)', () => {
    const g = cardGeometryOf(inputOf('hero_box', 358))
    expect(g.avoid).toEqual(g.textRects)
  })

  it('드랍·픽업은 배지 칸마다 가운데를 피한다(칸 수를 따른다)', () => {
    const three = cardGeometryOf(inputOf('drop_pickup', 358))
    const one = cardGeometryOf(inputOf('drop_pickup', 358, { imageCount: 1 }))
    expect(three.avoid.length - one.avoid.length).toBe(2)
  })

  it('컬렉션 소개는 퍼진 배지 자리를 피할 영역에 넣고, 폭에 따라 가로로 따라간다', () => {
    const burst = [
      { x: -0.5, y: -0.5, size: 80 },
      { x: 0.5, y: 0.5, size: 80 },
    ]
    const plain = cardGeometryOf(inputOf('collection_intro', 358))
    const spread = cardGeometryOf(inputOf('collection_intro', 358, { burst }))
    const narrow = cardGeometryOf(inputOf('collection_intro', 288, { burst }))
    expect(spread.avoid).toHaveLength(plain.avoid.length + 2)
    const left = (g: ReturnType<typeof cardGeometryOf>) => g.avoid[g.avoid.length - 2].l
    expect(left(narrow)).toBeLessThan(left(spread)) // 더 좁은 카드에서는 왼쪽 끝 배지도 더 왼쪽(카드 폭의 같은 비율)
    expect(Math.abs(left(spread) - left(narrow))).toBeGreaterThan(10)
  })

  it('도장 자리는 앵커 모서리 안쪽(12px)에서 도장 크기만큼을 피한다', () => {
    const without = cardGeometryOf(inputOf('hero_box', 358))
    const stamped = cardGeometryOf(inputOf('hero_box', 358, { stampCorner: 'top-left' }))
    const stamp = stamped.avoid[stamped.avoid.length - 1]
    expect(stamped.avoid).toHaveLength(without.avoid.length + 1)
    expect(stamp.l).toBeLessThan(16 + 12)
    expect(stamp.r - stamp.l).toBeGreaterThan(60)
    expect(stamp.t).toBeLessThan(16 + 12)
  })

  it('추가로 피할 영역은 카드 비율(0~1)로 받아 px로 바꾼다', () => {
    const g = cardGeometryOf(inputOf('hero_box', 288, { hasImage: false, extraAvoid: [{ l: 0.25, t: 0.5, r: 0.75, b: 1 }] }))
    const last = g.avoid[g.avoid.length - 1]
    expect(last).toEqual({ l: 72, t: g.height * 0.5, r: 216, b: g.height })
  })

  it('텍스트형은 폭 288과 358에서 글자 영역의 카드 비율이 거의 같다(글자 크기가 카드 폭 비율)', () => {
    const at = (width: number) => {
      const g = cardGeometryOf(inputOf('text_box', width, { titleLines: [4, 4] }))
      return toRatioRect(g.textRects[0], g.width, g.height)
    }
    const a = at(288)
    const b = at(358)
    for (const key of ['l', 't', 'r', 'b'] as const) expect(Math.abs(a[key] - b[key])).toBeLessThan(0.03)
  })

  it('긴 제목은 텍스트형 글자 크기를 낮춰 영역이 카드 안에 머문다', () => {
    const g = cardGeometryOf(inputOf('text_box', 288, { titleLines: [30, 30, 30] }))
    expect(g.textRects[0].t).toBeGreaterThanOrEqual(0)
    expect(g.textRects[0].b).toBeLessThanOrEqual(288 + 4)
  })

  it('목록형은 칩 자리가 없고 피할 영역도 만들지 않는다', () => {
    const g = cardGeometryOf(inputOf('gallery_list', 358))
    expect(g.spec.corners).toEqual([])
    expect(g.avoid).toEqual([])
    expect(g.height).toBe(FEED_CARD_MIN_HEIGHT.gallery_list)
  })
})
