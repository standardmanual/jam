/**
 * 칩 자리 이름 → 화면 위치 (티켓 20261121_0041, 상위 20261120_2026 4회차-2)
 *
 * 확인하는 것: 걸침(`FEED_CHIP_OFFSET`)과 안쪽(`FEED_CHIP_INSET`) 위치, 유형이 허용하지 않는 자리·모서리가 아닌 자리는 null,
 * 폭 320px에서 칩이 카드 가장자리 안쪽(좌우 16px 한도), 도장 위치·기울기, 유형 한도로 자르기.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedChipLayout.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  chipAnchorModeOf,
  chipPositionOf,
  cornerOfSlot,
  limitChipsForType,
  stampPositionOf,
  stampTiltOf,
} from '../feedChipLayout'
import { FEED_CHIP_SLOT_SPECS, FEED_TYPES } from '../feedChipSlots'
import { FEED_CHIP_INSET, FEED_CHIP_OFFSET, FEED_STAMP_INSET } from '../feedConstants'

describe('cornerOfSlot', () => {
  it('자리 이름의 끝에서 모서리를 읽는다', () => {
    expect(cornerOfSlot('image-top-left')).toBe('top-left')
    expect(cornerOfSlot('badge-bottom-right')).toBe('bottom-right')
    expect(cornerOfSlot('box-top-right')).toBe('top-right')
    expect(cornerOfSlot('box-bottom-left')).toBe('bottom-left')
  })

  it('모서리 이름으로 끝나지 않는 자리는 null이다', () => {
    expect(cornerOfSlot('box-row-top')).toBeNull()
  })
})

describe('chipPositionOf', () => {
  it('걸침: 바깥 모서리가 앵커 밖으로 가로 12·세로 16 나간다', () => {
    expect(chipPositionOf('hero_box', 'image-top-left')).toEqual({ top: -FEED_CHIP_OFFSET.y, left: -FEED_CHIP_OFFSET.x })
    expect(chipPositionOf('hero_box', 'image-bottom-right')).toEqual({ bottom: -FEED_CHIP_OFFSET.y, right: -FEED_CHIP_OFFSET.x })
    expect(chipPositionOf('text_box', 'box-top-right')).toEqual({ top: -16, right: -12 })
    expect(chipPositionOf('badge_intro', 'badge-bottom-left')).toEqual({ bottom: -16, left: -12 })
  })

  it('full_image는 안쪽이다(걸치면 카드 밖으로 잘린다)', () => {
    expect(chipAnchorModeOf('full_image')).toBe('inset')
    expect(chipPositionOf('full_image', 'image-top-left')).toEqual({ top: FEED_CHIP_INSET, left: FEED_CHIP_INSET })
    expect(chipPositionOf('full_image', 'image-bottom-right')).toEqual({ bottom: FEED_CHIP_INSET, right: FEED_CHIP_INSET })
  })

  it('걸치는 유형의 기본은 걸침이고 방식을 넘기면 따른다', () => {
    expect(chipAnchorModeOf('hero_box')).toBe('overhang')
    expect(chipPositionOf('hero_box', 'image-top-left', 'inset')).toEqual({ top: FEED_CHIP_INSET, left: FEED_CHIP_INSET })
  })

  it('유형이 허용하지 않는 자리는 null이다(full_image의 제목 자리, 다른 유형의 자리 이름)', () => {
    expect(chipPositionOf('full_image', 'image-bottom-left')).toBeNull()
    expect(chipPositionOf('hero_box', 'badge-top-left')).toBeNull()
    expect(chipPositionOf('badge_only', 'image-top-left')).toBeNull()
  })

  it('4-3 유형의 모서리가 아닌 자리는 이 회차가 그리지 않아 null이다', () => {
    expect(chipPositionOf('drop_pickup', 'box-row-top')).toBeNull()
    expect(chipPositionOf('gallery_list', 'card-top-right')).toBeNull()
  })

  it('폭 320px(카드 288, 안쪽 여백 16)에서 칩이 카드 가장자리 안쪽에 있다: 가로 걸침 12 ≤ 여백 16', () => {
    const cardPadding = 16
    expect(FEED_CHIP_OFFSET.x).toBeLessThanOrEqual(cardPadding)
    expect(cardPadding - FEED_CHIP_OFFSET.x).toBeGreaterThanOrEqual(0)
  })

  it('걸치는 유형의 모든 모서리 자리가 위치를 갖는다', () => {
    for (const feedType of ['hero_box', 'text_box', 'badge_intro', 'full_image'] as const) {
      for (const slot of FEED_CHIP_SLOT_SPECS[feedType].slots) expect(chipPositionOf(feedType, slot)).not.toBeNull()
    }
  })
})

describe('stampPositionOf·stampTiltOf', () => {
  it('도장은 자리 모서리에서 안쪽으로 12px 들어온다', () => {
    expect(stampPositionOf('hero_box', 'image-top-right')).toEqual({ top: FEED_STAMP_INSET, right: FEED_STAMP_INSET })
    expect(stampPositionOf('hero_box', 'badge-top-right')).toBeNull()
  })

  it('왼쪽 자리는 기울기 부호를 뒤집는다', () => {
    expect(stampTiltOf('image-top-left', 14)).toBe(-14)
    expect(stampTiltOf('image-bottom-right', 14)).toBe(14)
  })
})

describe('limitChipsForType', () => {
  it('유형의 칩 한도로 자른다(앞이 남는다)', () => {
    expect(limitChipsForType('hero_box', ['a', 'b', 'c'])).toEqual(['a', 'b'])
    expect(limitChipsForType('badge_only', ['a'])).toEqual([])
    expect(limitChipsForType('drop_pickup', ['a', 'b'])).toEqual(['a'])
  })

  it('모든 유형이 한도를 갖는다', () => {
    for (const feedType of FEED_TYPES) expect(limitChipsForType(feedType, ['a', 'b', 'c']).length).toBeLessThanOrEqual(2)
  })
})
