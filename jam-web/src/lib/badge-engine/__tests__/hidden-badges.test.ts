/**
 * 숨김 배지(`badges.is_hidden`) 받기 전 비노출 판정 테스트 (티켓 20261018_1815 3회).
 *
 * 고정하는 성질:
 *  ① 받기 전 숨김 배지만 목록에서 빠진다. 받은 숨김 배지와 일반 배지는 그대로다.
 *  ② `is_hidden` 칸이 없는 행(옛 값·테스트 값)은 숨김이 아니다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/hidden-badges.test.ts
 */
import { describe, it, expect } from 'vitest'
import { excludeHiddenUnearned, isHiddenUnearned } from '@/lib/badge-engine/hiddenBadges'

type Source = { id: string; name: string; description: string | null; is_hidden?: boolean }

function badge(overrides: Partial<Source> & Pick<Source, 'id' | 'name'>): Source {
  return { description: null, ...overrides }
}

const normal = badge({ id: 'b-normal', name: '평범한 러너' })
const hiddenSecret = badge({
  id: 'b-hidden-secret',
  name: '비밀스러운 새벽 러너',
  description: '아무도 모르는 조건',
  is_hidden: true,
})
const hiddenEarned = badge({ id: 'b-hidden-earned', name: '이미 받은 숨김 러너', is_hidden: true })
const notHiddenExplicit = badge({ id: 'b-explicit', name: '숨김 아님 명시', is_hidden: false })

describe('isHiddenUnearned', () => {
  it('받기 전 숨김 배지만 true다', () => {
    const earned = new Set(['b-hidden-earned'])
    expect(isHiddenUnearned(hiddenSecret, earned)).toBe(true)
    expect(isHiddenUnearned(hiddenEarned, earned)).toBe(false)
    expect(isHiddenUnearned(normal, earned)).toBe(false)
    expect(isHiddenUnearned(notHiddenExplicit, earned)).toBe(false)
  })

  it('is_hidden 칸이 없거나 null인 행은 숨김이 아니다', () => {
    expect(isHiddenUnearned({ id: 'x' }, new Set())).toBe(false)
    expect(isHiddenUnearned({ id: 'x', is_hidden: null }, new Set())).toBe(false)
  })
})

describe('excludeHiddenUnearned', () => {
  it('받기 전 숨김 배지를 빼고 나머지 순서를 지킨다', () => {
    const list = [normal, hiddenSecret, hiddenEarned, notHiddenExplicit]
    const result = excludeHiddenUnearned(list, new Set(['b-hidden-earned']))
    expect(result.map((b) => b.id)).toEqual(['b-normal', 'b-hidden-earned', 'b-explicit'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const list = [normal, hiddenSecret]
    excludeHiddenUnearned(list, new Set())
    expect(list).toHaveLength(2)
  })
})
