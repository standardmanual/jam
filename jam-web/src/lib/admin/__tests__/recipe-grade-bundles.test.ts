/**
 * 등급 대응형 레시피의 «아이템 배지 묶음» 판정 (티켓 20261114_1705 2회차)
 *
 * 고정하는 것: 같은 컬렉션·같은 이름만 한 묶음이고, 4등급이 한 개씩 모두 있어야 «완비»다. 컬렉션이 없는 배지·같은 등급 중복은 완비가 아니다.
 * 저장 검사(`findBundleViolation`)는 담긴 id가 «완비된 묶음의 4등급 전부»일 때만 통과시킨다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/recipe-grade-bundles.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  bundleBadgeIds,
  findBundleViolation,
  groupItemBadgeBundles,
  incompleteBundleReason,
  type BundleBadgeInput,
} from '../recipe-grade-bundles'

const BOOK = 'book-1'
const OTHER_BOOK = 'book-2'

function badge(id: string, name: string, rarity: string | null, itemBookId: string | null = BOOK): BundleBadgeInput {
  return { id, name, rarity, item_book_id: itemBookId }
}

/** 팻말 묶음(4등급 모두) */
const SIGN = [
  badge('sign-c', '팻말', 'common'),
  badge('sign-r', '팻말', 'rare'),
  badge('sign-e', '팻말', 'epic'),
  badge('sign-m', '팻말', 'mystic'),
]
/** 깃발 묶음(epic·mystic이 없다) */
const FLAG = [badge('flag-c', '깃발', 'common'), badge('flag-r', '깃발', 'rare')]

function byId(badges: BundleBadgeInput[]): Map<string, BundleBadgeInput> {
  return new Map(badges.map((b) => [b.id, b]))
}

describe('groupItemBadgeBundles', () => {
  it('같은 컬렉션·같은 이름을 한 묶음으로 모으고 4등급이 모두 있으면 완비다', () => {
    const bundles = groupItemBadgeBundles([...SIGN, ...FLAG])
    expect(bundles).toHaveLength(2)
    const sign = bundles.find((b) => b.name === '팻말')
    expect(sign?.complete).toBe(true)
    expect(sign && bundleBadgeIds(sign)).toEqual(['sign-c', 'sign-r', 'sign-e', 'sign-m'])
  })

  it('묶음 id는 입력 순서와 관계없이 common → rare → epic → mystic 순서다', () => {
    const [bundle] = groupItemBadgeBundles([...SIGN].reverse())
    expect(bundleBadgeIds(bundle)).toEqual(['sign-c', 'sign-r', 'sign-e', 'sign-m'])
  })

  it('등급이 모자란 묶음은 완비가 아니고 빈 등급과 이유를 알려 준다', () => {
    const flag = groupItemBadgeBundles(FLAG)[0]
    expect(flag.complete).toBe(false)
    expect(flag.missingGrades).toEqual(['epic', 'mystic'])
    expect(bundleBadgeIds(flag)).toEqual([])
    expect(incompleteBundleReason(flag)).toBe('Epic·Mystic 등급이 없어요')
  })

  it('이름이 같아도 컬렉션이 다르면 다른 묶음이다', () => {
    const other = SIGN.map((b) => ({ ...b, id: `x-${b.id}`, item_book_id: OTHER_BOOK }))
    const bundles = groupItemBadgeBundles([...SIGN, ...other])
    expect(bundles).toHaveLength(2)
    expect(bundles.every((b) => b.complete)).toBe(true)
  })

  it('컬렉션이 없는 배지는 묶음으로 세지 않는다', () => {
    expect(groupItemBadgeBundles([badge('solo', '낱개', 'common', null)])).toEqual([])
  })

  it('같은 등급에 배지가 둘이면 어느 쪽이 결과인지 정할 수 없어 완비가 아니다', () => {
    const [bundle] = groupItemBadgeBundles([...SIGN, badge('sign-c2', '팻말', 'common')])
    expect(bundle.complete).toBe(false)
    expect(bundle.duplicateGrades).toEqual(['common'])
    expect(incompleteBundleReason(bundle)).toBe('Common 등급이 둘 이상이에요')
  })
})

describe('findBundleViolation', () => {
  const bundles = groupItemBadgeBundles([...SIGN, ...FLAG])
  const lookup = byId([...SIGN, ...FLAG])

  it('완비된 묶음의 4등급 배지를 전부 담았으면 통과한다', () => {
    expect(findBundleViolation(['sign-c', 'sign-r', 'sign-e', 'sign-m'], bundles, lookup, '슬롯 1')).toBeNull()
  })

  it('4등급이 갖춰지지 않은 묶음은 어느 자리의 어느 묶음인지 알리며 거절한다', () => {
    const message = findBundleViolation(['flag-c', 'flag-r'], bundles, lookup, '슬롯 2')
    expect(message).toContain('슬롯 2')
    expect(message).toContain('깃발')
    expect(message).toContain('Epic·Mystic 등급이 없어요')
  })

  it('완비된 묶음이어도 4등급을 전부 담지 않으면 거절한다', () => {
    const message = findBundleViolation(['sign-c', 'sign-r'], bundles, lookup, '보상')
    expect(message).toContain('보상')
    expect(message).toContain('4등급 배지가 모두 담기지 않았어요')
  })

  it('컬렉션이 없는 배지나 찾지 못한 배지는 거절한다', () => {
    const solo = badge('solo', '낱개', 'common', null)
    expect(findBundleViolation(['solo'], bundles, byId([solo]), '슬롯 1')).toContain('컬렉션에 속하지 않은')
    expect(findBundleViolation(['ghost'], bundles, lookup, '슬롯 1')).toContain('컬렉션에 속하지 않은')
  })

  it('묶음에 속하지만 등급이 없는 배지는 거절한다', () => {
    const noGrade = badge('sign-x', '팻말', null)
    const all = [...SIGN, noGrade]
    const message = findBundleViolation(['sign-c', 'sign-r', 'sign-e', 'sign-m', 'sign-x'], groupItemBadgeBundles(all), byId(all), '슬롯 1')
    expect(message).toContain('등급이 없어')
  })

  it('후보가 비어 있으면 위반이 없다', () => {
    expect(findBundleViolation([], bundles, lookup, '슬롯 1')).toBeNull()
  })
})
