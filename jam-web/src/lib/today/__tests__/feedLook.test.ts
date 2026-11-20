/**
 * 홈피드 새 카드의 «그릴 값» 해석 `resolveFeedLook` (티켓 20261121_0041, 상위 20261120_2026 4회차-2)
 *
 * 확인하는 것: ① 같은 행은 두 번 해석해도 같은 값(서버·브라우저 같은 값), ② NULL 칸은 4-1 계산이 채우고 지정한 칸은 보존,
 * ③ 칩 구성(저장된 칩·자동·한도·크기·구분 칩 색), ④ 제목 속 칩·설명·도장·박스, ⑤ 지원 유형 목록(`isRenderedFeedType`).
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedLook.test.ts
 */
import { describe, it, expect } from 'vitest'
import { hashSeed } from '../boxShape'
import { FEED_CHIP_SLOT_SPECS } from '../feedChipSlots'
import { FEED_COLOR_KEYS, FEED_FULL_IMAGE_ENABLED, FEED_TILTS } from '../feedConstants'
import {
  FEED_RENDERED_TYPES,
  isRenderedFeedType,
  resolveFeedLook,
  type FeedLookCard,
  type RenderedFeedType,
  type ResolveFeedLookInput,
} from '../feedLook'
import type { FeedValueChipSource } from '../feedValueChips'

const NOW = new Date('2026-11-21T12:00:00+09:00')
const MISSION: FeedValueChipSource = { resource: 'mission', endsAt: '2026-11-23T12:00:00+09:00', rewardPoints: 300 }

function look(
  feedType: RenderedFeedType,
  card: Partial<FeedLookCard> = {},
  valueSource: FeedValueChipSource | null = MISSION,
  now = NOW,
) {
  const input: ResolveFeedLookInput = { card: { id: 'card-1', feed_type: feedType, ...card }, feedType, valueSource, now }
  return resolveFeedLook(input)
}

describe('resolveFeedLook — 같은 행은 같은 값', () => {
  it('같은 입력을 두 번 해석하면 깊은 값이 같다', () => {
    const card = { chips: null, title_chip_words: ['한 주'], stamp_enabled: true }
    expect(look('hero_box', card)).toEqual(look('hero_box', card))
  })

  it('Math.random과 Date.now를 쓰지 않는다(호출해도 값이 같다)', () => {
    const random = Math.random
    const dateNow = Date.now
    Math.random = () => {
      throw new Error('Math.random 호출')
    }
    Date.now = () => {
      throw new Error('Date.now 호출')
    }
    try {
      expect(() => look('text_box', { stamp_enabled: true, title_chip_words: ['a'] })).not.toThrow()
    } finally {
      Math.random = random
      Date.now = dateNow
    }
  })

  it('시드는 feed_seed(0도 유효)가 있으면 그것, 없으면 카드 id의 해시다', () => {
    expect(look('hero_box', { feed_seed: 12345 }).seed).toBe(12345)
    expect(look('hero_box', { feed_seed: 0 }).seed).toBe(0)
    expect(look('hero_box', { id: 'abc' }).seed).toBe(hashSeed('abc'))
  })

  it('카드 id가 다르면 값이 달라질 수 있다(시드를 쓴다)', () => {
    const shapes = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => look('hero_box', { id }).boxShape))
    expect(shapes.size).toBeGreaterThan(1)
  })
})

describe('resolveFeedLook — 색', () => {
  it('NULL 칸은 15색 키로 채워진다', () => {
    const { colors } = look('hero_box')
    for (const key of [colors.bg, colors.chip, colors.box]) expect(FEED_COLOR_KEYS).toContain(key)
  })

  it('지정한 색 칸은 그대로 보존하고 NULL 칸만 채운다', () => {
    const { colors } = look('hero_box', { bg_color_key: 'purple-soft', chip_color_key: 'green' })
    expect(colors.bg).toBe('purple-soft')
    expect(colors.chip).toBe('green')
    expect(FEED_COLOR_KEYS).toContain(colors.box)
  })

  it('세 칸을 모두 지정하면 규칙에 걸려도 막지 않고 그대로 쓴다', () => {
    const colors = look('hero_box', { bg_color_key: 'red', chip_color_key: 'red', box_color_key: 'red' }).colors
    expect(colors).toEqual({ bg: 'red', chip: 'red', box: 'red' })
  })

  it('색 키가 아닌 값은 지정하지 않은 것으로 본다', () => {
    const { colors } = look('hero_box', { bg_color_key: '#ff0000' })
    expect(FEED_COLOR_KEYS).toContain(colors.bg)
  })
})

describe('resolveFeedLook — 칩', () => {
  it('저장된 칩이 있으면 그것을 그린다(문구·구분·값, 글자 보존)', () => {
    const { chips } = look('hero_box', {
      chips: [
        { kind: 'phrase', text: '이번 주 미션' },
        { kind: 'label', text: '아이템 배지' },
      ],
    })
    expect(chips.map((chip) => [chip.kind, chip.text])).toEqual([
      ['phrase', '이번 주 미션'],
      ['label', '아이템 배지'],
    ])
  })

  it('구분 칩은 검정, 나머지는 카드의 칩 색이고 첫 칩은 큰 칩·둘째는 작은 칩이다', () => {
    const result = look('hero_box', {
      chip_color_key: 'blue',
      chips: [{ kind: 'phrase', text: '문구' }, { kind: 'label', text: '구분' }],
    })
    expect(result.chips.map((chip) => chip.color)).toEqual(['blue', 'black'])
    expect(result.chips.map((chip) => chip.size)).toEqual(['lg', 'sm'])
  })

  it('구분 칩 글자를 저장하지 않으면 자원의 구분 문구를 쓴다', () => {
    expect(look('hero_box', { chips: [{ kind: 'label' }] }, MISSION).chips[0].text).toBe('미션')
    // 칩을 내지 않는 자원이면 글자가 없어 칩이 없다
    expect(look('hero_box', { chips: [{ kind: 'label' }] }, null).chips).toEqual([])
  })

  it('값 칩은 출처 키가 가리키는 값을 문구로 바꾼다(알 수 없는 출처·값 없음은 칩이 없다)', () => {
    const chips = look('hero_box', {
      chips: [
        { kind: 'value', source: 'mission.remaining' },
        { kind: 'value', source: 'mission.reward_points' },
      ],
    }).chips
    expect(chips.map((chip) => chip.text)).toEqual(['2일 남음', '300 포인트'])
    expect(look('hero_box', { chips: [{ kind: 'value', source: 'unknown.source' }] }).chips).toEqual([])
    expect(look('hero_box', { chips: [{ kind: 'value', source: 'collection.item_count' }] }).chips).toEqual([])
  })

  it('chips가 빈 배열이면 «칩 없음»이다(자동으로 채우지 않는다)', () => {
    expect(look('hero_box', { chips: [] }).chips).toEqual([])
  })

  it('NULL이면 자원에서 첫 값 칩과 구분 칩을 만든다', () => {
    const chips = look('hero_box', { chips: null }).chips
    expect(chips.map((chip) => [chip.kind, chip.text])).toEqual([
      ['value', '2일 남음'],
      ['label', '미션'],
    ])
  })

  it('NULL이고 값이 없으면 구분 칩 하나, 칩을 내지 않는 자원이면 칩이 없다', () => {
    const noValues: FeedValueChipSource = { resource: 'mission', endsAt: null, rewardPoints: null }
    expect(look('hero_box', {}, noValues).chips.map((chip) => chip.text)).toEqual(['미션'])
    expect(look('hero_box', {}, null).chips).toEqual([])
  })

  it('구분 칩이 없는 자원(드랍·픽업은 구분 칩이 있고 값이 없다)도 한도를 지킨다', () => {
    expect(look('hero_box', {}, { resource: 'drop_pickup' }).chips.map((chip) => chip.text)).toEqual(['아이템 배지'])
  })

  it('카드당 2개를 넘지 않는다', () => {
    const chips = look('hero_box', {
      chips: [{ kind: 'phrase', text: 'a' }, { kind: 'phrase', text: 'b' }, { kind: 'phrase', text: 'c' }],
    }).chips
    expect(chips).toHaveLength(2)
  })

  it('배지만은 칩이 없다(저장돼 있어도)', () => {
    expect(look('badge_only', { chips: [{ kind: 'phrase', text: 'a' }] }).chips).toEqual([])
  })

  it('full_image는 자리 세 개뿐이라 제목 자리(image-bottom-left)를 쓰지 않는다', () => {
    for (let i = 0; i < 20; i += 1) {
      const chips = look('full_image', { id: `card-${i}`, chips: [{ kind: 'phrase', text: 'a' }, { kind: 'phrase', text: 'b' }] }).chips
      for (const chip of chips) expect(chip.slot).not.toBe('image-bottom-left')
    }
  })

  it('자리는 유형이 허용하는 이름이고 두 칩은 대각선이며 기울기는 여섯 값 중 하나다', () => {
    for (const feedType of ['hero_box', 'text_box', 'badge_intro'] as const) {
      const chips = look(feedType, { id: `x-${feedType}`, chips: [{ kind: 'phrase', text: 'a' }, { kind: 'phrase', text: 'b' }] }).chips
      expect(chips).toHaveLength(2)
      for (const chip of chips) {
        expect(FEED_CHIP_SLOT_SPECS[feedType].slots).toContain(chip.slot)
        expect(FEED_TILTS).toContain(chip.tilt)
      }
      const pair = FEED_CHIP_SLOT_SPECS[feedType].diagonalPairs.find(([a, b]) => [a, b].includes(chips[0].slot))
      expect(pair).toBeTruthy()
      expect(pair).toContain(chips[1].slot)
    }
  })

  it('지정한 자리·기울기는 보존하고, 유형이 허용하지 않는 자리는 지정하지 않은 것으로 본다', () => {
    const kept = look('hero_box', { chips: [{ kind: 'phrase', text: 'a', slot: 'image-bottom-right', tilt: 8 }] }).chips[0]
    expect(kept.slot).toBe('image-bottom-right')
    expect(kept.tilt).toBe(8)
    const replaced = look('hero_box', { chips: [{ kind: 'phrase', text: 'a', slot: 'art-top-left' }] }).chips[0]
    expect(FEED_CHIP_SLOT_SPECS.hero_box.slots).toContain(replaced.slot)
  })
})

describe('resolveFeedLook — 제목 속 칩·설명·도장·박스', () => {
  it('제목 속 칩은 최대 2개이고 색·기울기가 낱말과 같은 위치다(둘째는 첫째와 다른 기울기)', () => {
    const { titleChips } = look('hero_box', { title_chip_words: ['a', 'b', 'c'] })
    expect(titleChips.words).toEqual(['a', 'b'])
    expect(titleChips.colors).toHaveLength(2)
    expect(titleChips.tilts).toHaveLength(2)
    expect(titleChips.tilts[0]).not.toBe(titleChips.tilts[1])
    expect(look('hero_box', { title_chip_words: null }).titleChips.words).toEqual([])
  })

  it('설명: 보이는 유형은 show_description이 false일 때만 숨기고(NULL은 유형 기본), 숨기는 유형은 늘 숨긴다', () => {
    expect(look('hero_box', { show_description: null }).showDescription).toBe(true)
    expect(look('hero_box', { show_description: true }).showDescription).toBe(true)
    expect(look('hero_box', { show_description: false }).showDescription).toBe(false)
    expect(look('badge_intro', { show_description: null }).showDescription).toBe(true)
    for (const hidden of ['text_box', 'badge_only', 'full_image'] as const) {
      expect(look(hidden, { show_description: true }).showDescription).toBe(false)
    }
  })

  it('도장은 stamp_enabled가 참일 때만 있고 하나다. 자리는 허용 자리이고 칩 자리와 겹치지 않는다', () => {
    expect(look('hero_box', { stamp_enabled: null }).stamp).toBeNull()
    expect(look('hero_box', { stamp_enabled: false }).stamp).toBeNull()
    for (let i = 0; i < 20; i += 1) {
      const result = look('hero_box', { id: `s-${i}`, stamp_enabled: true, chips: [{ kind: 'phrase', text: 'a' }] })
      expect(result.stamp).not.toBeNull()
      expect(FEED_CHIP_SLOT_SPECS.hero_box.slots).toContain(result.stamp?.slot)
      expect(result.stamp?.slot).not.toBe(result.chips[0].slot)
    }
  })

  it('지정한 도장 자리는 허용 자리일 때 보존한다. 칩 자리가 없는 배지만은 도장도 없다', () => {
    expect(look('hero_box', { stamp_enabled: true, stamp_slot: 'image-top-left' }).stamp?.slot).toBe('image-top-left')
    expect(look('badge_only', { stamp_enabled: true }).stamp).toBeNull()
  })

  it('박스 모양은 NULL이면 5종 중 하나를 시드로 고르고(끄는 선택지 없음), 지정하면 보존한다', () => {
    const shapes = new Set<string>()
    for (let i = 0; i < 60; i += 1) shapes.add(look('text_box', { id: `b-${i}` }).boxShape)
    expect([...shapes].sort()).toEqual(['bump', 'round', 'stamp', 'ticket', 'wave'])
    expect(look('text_box', { box_shape: 'wave' }).boxShape).toBe('wave')
  })

  it('박스 용도는 NULL이면 유형 기본(히어로는 이미지 마스크, 텍스트는 글자 박스)이고 지정하면 보존한다', () => {
    expect(look('hero_box').boxKind).toBe('image_mask')
    expect(look('text_box').boxKind).toBe('text')
    expect(look('text_box', { box_kind: 'image_mask' }).boxKind).toBe('image_mask')
  })
})

describe('지원 유형 목록', () => {
  it('여덟 유형이다(4-2의 다섯 유형 + 4-3의 컬렉션 소개·드랍·픽업·목록형)', () => {
    expect([...FEED_RENDERED_TYPES]).toEqual([
      'hero_box',
      'text_box',
      'badge_intro',
      'badge_only',
      'full_image',
      'collection_intro',
      'drop_pickup',
      'gallery_list',
    ])
  })

  it('모르는 값·NULL은 그리지 않는다', () => {
    for (const value of ['nope', null, undefined, 3]) {
      expect(isRenderedFeedType(value)).toBe(false)
    }
  })

  it('4-3 유형은 그린다', () => {
    for (const value of ['collection_intro', 'drop_pickup', 'gallery_list']) expect(isRenderedFeedType(value)).toBe(true)
  })

  it('full_image는 꺼짐 상수를 따른다(지금 꺼져 있다)', () => {
    expect(FEED_FULL_IMAGE_ENABLED).toBe(false)
    expect(isRenderedFeedType('full_image')).toBe(FEED_FULL_IMAGE_ENABLED)
    for (const value of ['hero_box', 'text_box', 'badge_intro', 'badge_only']) expect(isRenderedFeedType(value)).toBe(true)
  })
})
