/**
 * 카드 유형 → 자동 색 배정에 넘길 이미지 대표 색 (티켓 20261121_1828)
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedImageColors.test.ts
 */
import { describe, it, expect } from 'vitest'
import { FEED_TYPES } from '../feedChipSlots'
import { imageColorsForCard } from '../feedImageColors'

const COVER = ['#111111', '#222222', '#333333']
const BADGE_A = ['#aa0000', '#00aa00', '#0000aa']
const BADGE_B = ['#bb0000']
const BADGE_C = ['#cc0000', '#cc00cc']
const BADGE_D = ['#dd0000']
const BADGE_E = ['#ee0000']
const BADGE_F = ['#ff0000']
const NONE = { imageHexes: [], chipOnImage: false }

describe('imageColorsForCard — 적용 대상 표', () => {
  const badgeColors = [BADGE_A, BADGE_B, BADGE_C, BADGE_D, BADGE_E, BADGE_F]

  it('히어로·컬렉션 소개: 커버 대표 색을 쓰고 칩이 이미지 위에 걸친다', () => {
    for (const feedType of ['hero_box', 'collection_intro']) {
      expect(imageColorsForCard({ feedType, boxKind: null, coverColors: COVER, badgeColors })).toEqual({ imageHexes: COVER, chipOnImage: true })
    }
  })

  it('텍스트 박스: 이미지 마스크일 때만 커버 대표 색을 쓰고, 글자만 있는 박스·박스 용도 없음은 적용하지 않는다', () => {
    expect(imageColorsForCard({ feedType: 'text_box', boxKind: 'image_mask', coverColors: COVER, badgeColors })).toEqual({
      imageHexes: COVER,
      chipOnImage: true,
    })
    expect(imageColorsForCard({ feedType: 'text_box', boxKind: 'text', coverColors: COVER, badgeColors })).toEqual(NONE)
    expect(imageColorsForCard({ feedType: 'text_box', boxKind: null, coverColors: COVER, badgeColors })).toEqual(NONE)
  })

  it('배지 소개·배지만: 첫 배지의 대표 색만 쓰고 칩은 이미지 위에 걸치지 않는다', () => {
    for (const feedType of ['badge_intro', 'badge_only']) {
      expect(imageColorsForCard({ feedType, boxKind: null, coverColors: COVER, badgeColors })).toEqual({ imageHexes: BADGE_A, chipOnImage: false })
    }
  })

  it('드랍·픽업: 아이템 배지 최대 5개의 대표 색을 전부 쓴다(여섯째는 쓰지 않는다)', () => {
    expect(imageColorsForCard({ feedType: 'drop_pickup', boxKind: null, coverColors: COVER, badgeColors })).toEqual({
      imageHexes: [...BADGE_A, ...BADGE_B, ...BADGE_C, ...BADGE_D, ...BADGE_E],
      chipOnImage: false,
    })
  })

  it('전체 배경 이미지·목록형·옛 모양(유형 없음)은 적용하지 않는다', () => {
    for (const feedType of ['full_image', 'gallery_list', null, undefined, '모르는 값']) {
      expect(imageColorsForCard({ feedType, boxKind: 'image_mask', coverColors: COVER, badgeColors })).toEqual(NONE)
    }
  })

  it('유형 8개를 모두 짚었다', () => {
    const applied = FEED_TYPES.filter(
      (feedType) => imageColorsForCard({ feedType, boxKind: 'image_mask', coverColors: COVER, badgeColors }).imageHexes.length > 0,
    )
    expect([...applied].sort()).toEqual(['badge_intro', 'badge_only', 'collection_intro', 'drop_pickup', 'hero_box', 'text_box'])
    expect(FEED_TYPES).toHaveLength(8)
  })
})

describe('imageColorsForCard — 대표 색이 없을 때와 값 정리', () => {
  it('NULL(아직 안 뽑음)이나 [](색 없음)이면 이미지 규칙을 쓰지 않는다', () => {
    for (const coverColors of [null, undefined, []]) {
      expect(imageColorsForCard({ feedType: 'hero_box', boxKind: null, coverColors, badgeColors: [] })).toEqual(NONE)
    }
    for (const first of [null, undefined, []]) {
      expect(imageColorsForCard({ feedType: 'badge_intro', boxKind: null, coverColors: COVER, badgeColors: [first] })).toEqual(NONE)
    }
    expect(imageColorsForCard({ feedType: 'badge_intro', boxKind: null, coverColors: COVER, badgeColors: [] })).toEqual(NONE)
    expect(imageColorsForCard({ feedType: 'badge_intro', boxKind: null, coverColors: COVER, badgeColors: null })).toEqual(NONE)
  })

  it('첫 배지가 대표 색이 없으면 둘째 배지로 넘어가지 않고(첫 배지만 본다), 드랍·픽업은 색이 있는 배지만 모은다', () => {
    expect(imageColorsForCard({ feedType: 'badge_only', boxKind: null, coverColors: null, badgeColors: [null, BADGE_B] })).toEqual(NONE)
    expect(imageColorsForCard({ feedType: 'drop_pickup', boxKind: null, coverColors: null, badgeColors: [null, BADGE_B, []] })).toEqual({
      imageHexes: BADGE_B,
      chipOnImage: false,
    })
  })

  it('유효하지 않은 hex와 배열이 아닌 값은 걸러 낸다', () => {
    expect(
      imageColorsForCard({ feedType: 'hero_box', boxKind: null, coverColors: ['#111111', 'red', 12, null, ' #222222 ', '#12'], badgeColors: [] }),
    ).toEqual({ imageHexes: ['#111111', '#222222'], chipOnImage: true })
    expect(imageColorsForCard({ feedType: 'hero_box', boxKind: null, coverColors: { 0: '#111111' }, badgeColors: [] })).toEqual(NONE)
    expect(imageColorsForCard({ feedType: 'hero_box', boxKind: null, coverColors: '#111111', badgeColors: [] })).toEqual(NONE)
  })
})

describe('imageColorsForCard — 컬렉션 소개는 커버 색에 아이템 배지 4개 색을 더한다 (티켓 20261122_2224 7회차)', () => {
  const base = { feedType: 'collection_intro', boxKind: null, coverColors: COVER, badgeColors: [] as unknown[] }

  it('커버 색 뒤에 아이템 배지의 대표 색이 합쳐진다', () => {
    expect(imageColorsForCard({ ...base, collectionBadgeColors: [BADGE_A, BADGE_B] })).toEqual({
      imageHexes: [...COVER, ...BADGE_A, ...BADGE_B],
      chipOnImage: true,
    })
  })

  it('아이템 배지는 4개까지만 본다', () => {
    const fifth = ['#eeeeee']
    expect(imageColorsForCard({ ...base, collectionBadgeColors: [BADGE_A, BADGE_B, BADGE_C, BADGE_D, fifth] }).imageHexes).toEqual([
      ...COVER,
      ...BADGE_A,
      ...BADGE_B,
      ...BADGE_C,
      ...BADGE_D,
    ])
  })

  it('대표 색이 없는 배지(null·빈 목록·읽을 수 없는 값)는 건너뛴다(고른 4개 안에서 색만 빠진다)', () => {
    expect(imageColorsForCard({ ...base, collectionBadgeColors: [null, BADGE_B, [], 'red'] }).imageHexes).toEqual([...COVER, ...BADGE_B])
  })

  it('그림 색 입력(아이템 배지 색)이 없으면 결과가 예전과 같다(커버 색만)', () => {
    const before = { imageHexes: COVER, chipOnImage: true }
    expect(imageColorsForCard(base)).toEqual(before)
    expect(imageColorsForCard({ ...base, collectionBadgeColors: null })).toEqual(before)
    expect(imageColorsForCard({ ...base, collectionBadgeColors: [] })).toEqual(before)
    expect(imageColorsForCard({ ...base, collectionBadgeColors: [null, []] })).toEqual(before)
  })

  it('컬렉션 소개가 아닌 유형은 컬렉션 배지 색을 보지 않는다', () => {
    expect(imageColorsForCard({ ...base, feedType: 'hero_box', collectionBadgeColors: [BADGE_A] })).toEqual({ imageHexes: COVER, chipOnImage: true })
  })
})
