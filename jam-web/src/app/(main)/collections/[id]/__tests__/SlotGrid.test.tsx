/**
 * 컬렉션 격자의 칸 표시 (티켓 20261028_1408)
 *
 * 등급이 정해진 칸은 그 등급의 칩을, 등급이 없는 칸(`tierUndecided`)은 칩을 그리지 않는다. 미보유 칸은 «???»·opacity-30·링크 없음이고
 * 버튼이 없다. 저장소에 jsdom·testing-library가 없어(vitest.config.ts `environment: 'node'`) 서버 렌더로 마크업만 고정한다 —
 * 시트를 여는 판정은 `shouldOpenCandidateSheet`(`lib/itembook/__tests__/tier-badge-slots.test.ts`)가 맡는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/collections/[id]/__tests__/SlotGrid.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

import SlotGrid, { type BadgeSlot } from '../SlotGrid'

function cell(name: string, rarity: string, extra: Partial<BadgeSlot> = {}): BadgeSlot {
  return {
    cellKey: name,
    badge: { id: `${name}-${rarity}`, name, image_url: null, rarity },
    candidates: [],
    slot: null,
    ...extra,
  }
}

const candidate = (id: string) => ({ id, serial_number: 1, serial_prefix: 'AAAA', expires_at: null })
const slotted = { id: 's1', slotted_at: '2026-10-28T00:00:00Z', inventory_item_id: 'inv-1' }

function count(html: string, text: string): number {
  return html.split(text).length - 1
}

describe('SlotGrid — 등급이 정해진 칸', () => {
  const badgeSlots = [
    cell('이름1', 'rare', { slot: slotted }),
    cell('이름2', 'rare', { candidates: [candidate('c1')] }),
    cell('이름3', 'rare'),
  ]

  it('장착된 칸은 «해제», 후보가 있는 칸은 «추가», 미보유 칸은 «???»에 버튼이 없다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} />)

    expect(count(html, '>해제<')).toBe(1)
    expect(count(html, '>추가<')).toBe(1)
    expect(count(html, '>???<')).toBe(1)
    expect(count(html, 'opacity-30')).toBe(1)
    // 미보유 칸은 링크가 없다 — 링크는 장착된 칸과 후보가 있는 칸 둘
    expect(count(html, 'href="/badges/')).toBe(2)
    expect(html).not.toContain('href="/badges/이름3-rare')
  })

  it('등급이 정해졌으면 보유한 칸에 등급 칩을 그린다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} />)

    // 칩은 미보유 칸을 뺀 두 칸에 있다
    expect(count(html, 'Rare')).toBe(2)
  })

  it('타인 열람(readOnly)은 버튼이 없다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} readOnly />)

    expect(html).not.toContain('>해제<')
    expect(html).not.toContain('>추가<')
    expect(html).not.toContain('>교체<')
  })
})

describe('SlotGrid — 등급이 없는 칸(tierUndecided)', () => {
  const badgeSlots = [
    cell('이름1', 'rare', { candidates: [{ ...candidate('c1'), rarity: 'rare' }, { ...candidate('c2'), rarity: 'epic' }] }),
    cell('이름2', 'common'),
  ]

  it('등급 칩을 그리지 않고 가진 이름은 «추가», 못 가진 이름은 «???»다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} tierUndecided />)

    expect(html).not.toContain('Rare')
    expect(html).not.toContain('Epic')
    expect(count(html, '>추가<')).toBe(1)
    expect(count(html, '>???<')).toBe(1)
    // 가진 이름의 링크는 대표 배지 상세다
    expect(html).toContain('href="/badges/이름1-rare"')
  })

  it('장착 모드에서는 «추가»가 있는 칸만 하이라이트한다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} tierUndecided slotMode />)

    expect(count(html, 'inset_0_0_0_2px_var(--link)')).toBe(1)
  })
})
