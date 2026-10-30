/**
 * 캡슐 열기 결과 → 획득 연출 (티켓 20261018_0054 1회)
 *
 * 잠긴 채 나온 개체는 이름·그림을 처음부터 싣지 않고, 래퍼가 가린 문구와 잠금 타일로 그린다. 호출부 실수로 이름·그림이 들어와도
 * `locked`이면 래퍼가 막는다. `resultMessage`를 주면 카드 위에 한 줄이 나오고 라이브 리전이 그 문구를 알린다.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/capsuleReveal.test.tsx
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

import BadgeRevealOverlay, { toCarouselItem, type RevealBadge } from '@/components/BadgeRevealOverlay'
import { toChapterRevealBadge, toRevealBadges, toRevealRewards } from './capsuleReveal'
import { d, t } from '@/lib/i18n'
import type { CapsuleChapterBadge, CapsuleOpenedItem } from '@/lib/capsule/capsule-contract'
import { buildCapsuleResultView } from '@/lib/capsule/result-overlay-model'

const OPENED: CapsuleOpenedItem[] = [
  { locked: false, inventoryItemId: 'i1', badgeId: 'b1', name: '바람의 깃', imageUrl: 'https://img.test/wind.png', rarity: 'rare', serialNumber: 7 },
  { locked: true, inventoryItemId: 'i2', rarity: 'common', unlockRequired: 60 },
]

describe('toRevealBadges', () => {
  it('열린 개체는 이름·그림·등급을, 잠긴 개체는 등급과 필요한 양만 싣는다', () => {
    expect(toRevealBadges(OPENED)).toEqual([
      { id: 'i1', name: '바람의 깃', description: '', imageUrl: 'https://img.test/wind.png', rarity: 'rare' },
      { id: 'i2', name: '', description: '', rarity: 'common', locked: true, unlockRequired: 60 },
    ])
  })

  it('잠긴 개체 항목에는 이름·그림·일련번호가 없다', () => {
    const locked = toRevealBadges(OPENED)[1]
    expect(locked.imageUrl).toBeUndefined()
    expect(locked.name).toBe('')
    expect(JSON.stringify(locked)).not.toMatch(/serial|badgeId|바람/)
  })
})

describe('toCarouselItem', () => {
  it('잠기지 않은 항목은 그대로다', () => {
    const item: RevealBadge = { id: 'a', name: '들꽃', description: '설명', imageUrl: 'x.png', rarity: 'epic' }
    expect(toCarouselItem(item)).toBe(item)
  })

  it('잠긴 항목은 가린 이름과 숫자 없는 일반 설명, 비운 그림으로 바꾸고 필요한 양은 싣지 않는다', () => {
    expect(toCarouselItem({ id: 'b', name: '', description: '', rarity: 'rare', locked: true, unlockRequired: 60 })).toEqual({
      id: 'b',
      name: d.lockedItem.card.name,
      description: d.lockedItem.card.description,
      imageUrl: null,
      rarity: 'rare',
      locked: true,
    })
  })

  it('호출부 실수로 이름·그림·설명이 들어와도 잠긴 항목이면 래퍼가 막는다', () => {
    const out = toCarouselItem({ id: 'b', name: '비밀 이름', description: '비밀 설명', imageUrl: 'secret.png', rarity: 'epic', locked: true, unlockRequired: 30 })
    expect(JSON.stringify(out)).not.toMatch(/비밀|secret/)
    expect(out.imageUrl).toBeNull()
  })
})

describe('BadgeRevealOverlay', () => {
  const render = (over: { resultMessage?: string; items?: RevealBadge[] } = {}) =>
    renderToStaticMarkup(
      <BadgeRevealOverlay open items={over.items ?? toRevealBadges(OPENED)} profileHref="/profile" onClose={() => {}} resultMessage={over.resultMessage} />
    )

  it('resultMessage를 주면 카드 위 한 줄과 라이브 리전에 같은 문구가 나온다', () => {
    const message = t(d.capsule.openResult, { n: 2 })
    const html = render({ resultMessage: message })
    expect(html.split(message).length - 1).toBeGreaterThanOrEqual(2)
    expect(html).toContain(`>${message}</div>`)
  })

  it('resultMessage가 없으면 기존 화면 그대로다(개수 공지만)', () => {
    const html = render()
    expect(html).not.toContain('캡슐을 열었어요')
    expect(html).toContain(t(d.badgeReveal.opened, { count: 2 }))
  })

  it('잠긴 채 나온 개체만 있으면 가린 문구와 잠금 타일만 그리고 그림은 DOM에 없다', () => {
    const html = render({ items: toRevealBadges([OPENED[1]]) })
    expect(html).toContain(d.lockedItem.card.name)
    expect(html).toContain(d.lockedItem.card.description)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('바람의 깃')
  })
})

describe('챕터 배지 변환 (티켓 20261028_1740 3회)', () => {
  const CHAPTER_BADGE: CapsuleChapterBadge = {
    id: 'cb-3',
    name: '챕터 셋 배지',
    description: '챕터 3에 올랐어요',
    imageUrl: 'https://img.test/c3.png',
    rarity: null,
    level: 2,
  }

  it('이름·설명·그림·등급·레벨을 그대로 옮긴다', () => {
    expect(toChapterRevealBadge(CHAPTER_BADGE)).toEqual({
      id: 'cb-3',
      name: '챕터 셋 배지',
      description: '챕터 3에 올랐어요',
      imageUrl: 'https://img.test/c3.png',
      rarity: null,
      level: 2,
    })
  })

  it('보상 목록을 순서 그대로 옮긴다: 개체는 이벤트 순서, 챕터 배지는 맨 끝', () => {
    const view = buildCapsuleResultView<CapsuleOpenedItem, CapsuleChapterBadge>(
      [
        { openId: 'o1', items: [OPENED[0]], reachedChapters: [3] },
        { openId: 'o2', items: [OPENED[1]], reachedChapters: [] },
      ],
      [CHAPTER_BADGE]
    )
    const rewards = toRevealRewards(view!.rewards)
    expect(rewards.map((r) => r.id)).toEqual(['i1', 'i2', 'cb-3'])
    expect(rewards[1]).toMatchObject({ locked: true, name: '' })
  })

  it('보상이 없으면 빈 목록이다', () => {
    expect(toRevealRewards([])).toEqual([])
  })
})
