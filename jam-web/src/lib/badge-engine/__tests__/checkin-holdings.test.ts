/**
 * 체크인 배지 «보유» 값 계산 순수 함수 시험 (티켓 20261019_1445 2회)
 *
 * `usageBadges.ts`의 인라인 계산을 옮긴 순수 함수다. 배지 발급 쪽 동작은 `usage-badges.test.ts` 6번 블록(특성 시험)이
 * 고정하고, 이 파일은 순수 함수를 직접 고정해 미션 판정(`jamActionCheckinMetrics.ts`)이 같은 계산을 믿고 쓸 수 있게 한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/checkin-holdings.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  countBadgesByCategory,
  countListedNamesOwned,
  isCheckinBadgeCountValue,
  isCheckinCategoryCountValue,
  ownedCheckinBadgeNames,
} from '../checkinHoldings'

describe('값 모양 가드', () => {
  it('checkin_category_count: category 문자열과 count 숫자가 있어야 한다', () => {
    expect(isCheckinCategoryCountValue({ category: 'train_subway', count: 2 })).toBe(true)
    expect(isCheckinCategoryCountValue({ category: 'train_subway' })).toBe(false)
    expect(isCheckinCategoryCountValue({ count: 2 })).toBe(false)
    expect(isCheckinCategoryCountValue({ category: 1, count: 2 })).toBe(false)
    expect(isCheckinCategoryCountValue({ category: 'x', count: '2' })).toBe(false)
    expect(isCheckinCategoryCountValue(null)).toBe(false)
    expect(isCheckinCategoryCountValue(undefined)).toBe(false)
    expect(isCheckinCategoryCountValue(3)).toBe(false)
  })

  it('checkin_badge_count: 이름 배열과 count 숫자가 있어야 한다', () => {
    expect(isCheckinBadgeCountValue({ checkin_badge_names: ['a'], count: 1 })).toBe(true)
    expect(isCheckinBadgeCountValue({ checkin_badge_names: [], count: 0 })).toBe(true)
    expect(isCheckinBadgeCountValue({ checkin_badge_names: 'a', count: 1 })).toBe(false)
    expect(isCheckinBadgeCountValue({ checkin_badge_names: ['a'], count: '1' })).toBe(false)
    expect(isCheckinBadgeCountValue({ count: 1 })).toBe(false)
    expect(isCheckinBadgeCountValue(null)).toBe(false)
  })
})

describe('countBadgesByCategory — effective category별 개수', () => {
  it('badges.category가 우선이고, 없으면 연결 지점의 카테고리를 쓴다', () => {
    const counts = countBadgesByCategory(
      [
        { id: 'a', category: 'train_subway' },
        { id: 'b', category: null },
        { id: 'c', category: 'michelin' },
      ],
      [
        { linked_badge_id: 'b', category: 'train_subway' },
        { linked_badge_id: 'c', category: 'train_subway' }, // badges.category(michelin)가 우선이라 쓰지 않는다
      ]
    )
    expect(counts.get('train_subway')).toBe(2)
    expect(counts.get('michelin')).toBe(1)
  })

  it('연결 지점이 여럿이면 먼저 읽은 줄의 카테고리만 쓴다', () => {
    const counts = countBadgesByCategory(
      [{ id: 'a', category: null }],
      [
        { linked_badge_id: 'a', category: 'michelin' },
        { linked_badge_id: 'a', category: 'train_subway' },
      ]
    )
    expect([...counts.entries()]).toEqual([['michelin', 1]])
  })

  it('카테고리가 어디에도 없는 배지는 세지 않고, 입력이 비면 빈 맵이다', () => {
    expect(countBadgesByCategory([{ id: 'a', category: null }], []).size).toBe(0)
    expect(countBadgesByCategory([], []).size).toBe(0)
  })
})

describe('ownedCheckinBadgeNames — 받은 이름의 집합', () => {
  const rows = [
    { id: 'seongsu-a', name: '성수역' },
    { id: 'seongsu-b', name: '성수역' },
    { id: 'wangsimni', name: '왕십리역' },
  ]

  it('같은 이름의 배지 중 하나라도 받았으면 그 이름은 받은 것이다', () => {
    const owned = ownedCheckinBadgeNames(['성수역', '왕십리역'], rows, new Set(['seongsu-b']))
    expect([...owned]).toEqual(['성수역'])
  })

  it('카탈로그에 없는 이름은 조용히 빠진다', () => {
    const owned = ownedCheckinBadgeNames(['성수역', '없는이름'], rows, new Set(['seongsu-a']))
    expect([...owned]).toEqual(['성수역'])
  })

  it('받은 배지가 없으면 빈 집합이다', () => {
    expect(ownedCheckinBadgeNames(['성수역'], rows, new Set()).size).toBe(0)
  })
})

describe('countListedNamesOwned — 목록 가운데 받은 이름 수', () => {
  it('받은 이름만 센다', () => {
    expect(countListedNamesOwned(['성수역', '왕십리역', '건대입구역'], new Set(['성수역', '건대입구역']))).toBe(2)
  })

  it('목록에 같은 이름이 두 번 있으면 두 번 센다', () => {
    expect(countListedNamesOwned(['성수역', '성수역'], new Set(['성수역']))).toBe(2)
  })

  it('빈 목록은 0이다', () => {
    expect(countListedNamesOwned([], new Set(['성수역']))).toBe(0)
  })
})
