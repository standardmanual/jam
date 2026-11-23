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
  plannedChipPositionOf,
  stampPositionOf,
  stampTiltOf,
} from '../feedChipLayout'
import { FEED_CHIP_SLOT_SPECS, FEED_TYPES } from '../feedChipSlots'
import { FEED_CHIP_INSET, FEED_CHIP_OFFSET, FEED_STAMP_INSET } from '../feedConstants'
import { cardGeometryOf, cornerRect, tiltedBounds, type ChipGeometryType } from '../feedChipGeometry'
import { planCardChips, type PlannedChip } from '../feedChipPlan'

describe('cornerOfSlot', () => {
  it('자리 이름의 끝에서 모서리를 읽는다', () => {
    expect(cornerOfSlot('image-top-left')).toBe('top-left')
    expect(cornerOfSlot('badge-bottom-right')).toBe('bottom-right')
    expect(cornerOfSlot('box-top-right')).toBe('top-right')
    expect(cornerOfSlot('box-bottom-left')).toBe('bottom-left')
    expect(cornerOfSlot('box-row-top-left')).toBe('top-left')
    expect(cornerOfSlot('box-row-bottom-right')).toBe('bottom-right')
  })

  it('모서리 이름으로 끝나지 않는 자리는 null이다', () => {
    expect(cornerOfSlot('box-row-top')).toBeNull()
    expect(cornerOfSlot('card-top-right')).toBeNull()
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

  it('드랍·픽업은 박스 줄 네 모서리에 히어로와 같은 기하로 걸친다(위쪽은 위로, 아래쪽은 아래로)', () => {
    expect(chipPositionOf('drop_pickup', 'box-row-top-left')).toEqual({ top: -16, left: -12 })
    expect(chipPositionOf('drop_pickup', 'box-row-top-right')).toEqual({ top: -16, right: -12 })
    expect(chipPositionOf('drop_pickup', 'box-row-bottom-left')).toEqual({ bottom: -16, left: -12 })
    expect(chipPositionOf('drop_pickup', 'box-row-bottom-right')).toEqual({ bottom: -16, right: -12 })
    expect(chipPositionOf('drop_pickup', 'box-row-top')).toBeNull()
    expect(chipPositionOf('drop_pickup', 'box-top-left')).toBeNull()
  })

  it('목록형의 모서리가 아닌 자리는 이 함수가 그리지 않아 null이다(목록형이 직접 정한다)', () => {
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
    expect(limitChipsForType('gallery_list', ['a', 'b'])).toEqual(['a'])
    expect(limitChipsForType('drop_pickup', ['a', 'b', 'c'])).toEqual(['a', 'b'])
  })

  it('모든 유형이 한도를 갖는다', () => {
    for (const feedType of FEED_TYPES) expect(limitChipsForType(feedType, ['a', 'b', 'c']).length).toBeLessThanOrEqual(2)
  })
})

describe('plannedChipPositionOf — 계획 → CSS 위치(티켓 20261122_2228 R6)', () => {
  const chip = (overrides: Partial<PlannedChip> = {}): PlannedChip => ({
    index: 0,
    kind: 'label',
    presentation: 'pill',
    text: 'ITEM',
    corner: 'top-left',
    inset: { x: 2.5, y: -1 },
    lowered: false,
    tilt: 6,
    size: 'lg',
    scale: 1,
    black: true,
    sticker: null,
    box: { w: 100, h: 52 },
    ...overrides,
  })

  it('왼쪽 위 모서리는 left·top이고 가운데 맞춤(-50%)으로 칩 자기 크기의 반을 되돌린다', () => {
    const css = plannedChipPositionOf(chip())
    expect(css.left).toMatch(/^calc\(2\.5% \+ [\d.]+px\)$/)
    expect(css.top).toMatch(/^calc\(-1% \+ [\d.]+px\)$/)
    expect(css.right).toBeUndefined()
    expect(css.bottom).toBeUndefined()
    expect(css.transform).toBe('translate(-50%, -50%)')
  })

  it('오른쪽 아래 모서리는 right·bottom이고 +50%로 되돌린다', () => {
    const css = plannedChipPositionOf(chip({ corner: 'bottom-right' }))
    expect(css.right).toBeDefined()
    expect(css.bottom).toBeDefined()
    expect(css.left).toBeUndefined()
    expect(css.top).toBeUndefined()
    expect(css.transform).toBe('translate(50%, 50%)')
  })

  it('가운데 지점은 기울어진 경계 상자의 반만큼 안쪽이다(기울기 부호와 무관)', () => {
    const plus = plannedChipPositionOf(chip({ tilt: 9 }))
    const minus = plannedChipPositionOf(chip({ tilt: -9 }))
    expect(plus).toEqual(minus)
    const half = tiltedBounds(100, 52, 9).w / 2
    expect(plus.left).toBe(`calc(2.5% + ${Math.round(half * 10) / 10}px)`)
  })

  it('계획 좌표와 같다: CSS가 가리키는 칩 경계 상자 = cornerRect (7개 유형·시드 여럿, 폭 343)', () => {
    const width = 343
    const types: ChipGeometryType[] = ['hero_box', 'badge_intro', 'text_box', 'drop_pickup', 'collection_intro', 'badge_only']
    const parse = (value: string) => {
      const match = /^calc\((-?[\d.]+)% \+ (-?[\d.]+)px\)$/.exec(value)
      return { pct: Number(match![1]), px: Number(match![2]) }
    }
    for (const feedType of types) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const input = {
          feedType,
          seed,
          chips: [
            { kind: 'label' as const, text: 'ITEM', size: 'lg' as const },
            { kind: 'value' as const, text: '3일 남음', size: 'sm' as const },
          ],
          titleLines: [10],
          descriptionLength: 20,
          descriptionVisible: true,
          hasImage: true,
        }
        const plan = planCardChips(input)
        const { height } = cardGeometryOf({ ...input, width })
        for (const planned of plan.chips) {
          const css = plannedChipPositionOf(planned)
          const b = tiltedBounds(planned.box.w, planned.box.h, planned.tilt)
          const expected = cornerRect(planned.corner, b.w, b.h, { x: planned.inset.x / 100, y: planned.inset.y / 100 }, width, height)
          const x = parse((css.left ?? css.right) as string)
          const y = parse((css.top ?? css.bottom) as string)
          const centerX = (x.pct / 100) * width + x.px
          const centerY = (y.pct / 100) * height + y.px
          // 왼쪽·위는 가장자리에서 재고, 오른쪽·아래는 반대쪽 가장자리에서 잰다
          const l = css.left !== undefined ? centerX - b.w / 2 : width - centerX - b.w / 2
          const t = css.top !== undefined ? centerY - b.h / 2 : height - centerY - b.h / 2
          expect(l).toBeCloseTo(expected.l, 0)
          expect(t).toBeCloseTo(expected.t, 0)
        }
      }
    }
  })
})
