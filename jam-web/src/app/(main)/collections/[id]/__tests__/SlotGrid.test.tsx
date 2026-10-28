/**
 * 컬렉션 격자의 칸 표시 (티켓 20261028_1408)
 *
 * 등급이 정해진 칸은 그 등급의 칩을, 등급이 없는 칸(`tierUndecided`)은 칩을 그리지 않는다. 미보유 칸은 «???»·opacity-30·링크 없음이고
 * 버튼이 없다. 저장소에 jsdom·testing-library가 없어(vitest.config.ts `environment: 'node'`) 서버 렌더로 마크업만 고정한다 —
 * 시트를 여는 판정은 `shouldOpenCandidateSheet`(`lib/itembook/__tests__/tier-badge-slots.test.ts`)가 맡는다.
 *
 * «모두 해제하기» 버튼(티켓 20261028_1420)의 노출 조건도 여기서 고정한다: 본인 화면이고 장착 개수(`slotCount`)가 1 이상일 때만 격자 아래에 한 줄로 그린다.
 * 확인 시트(BottomSheet)는 서버 렌더에서 아무것도 그리지 않아(마운트 게이트) 시트 안의 문구·버튼은 `UnslotAllSheet.test.tsx`가 본다.
 * 요청 중 비활성(`bulkBusy`)은 상태 전이라 서버 렌더로는 볼 수 없다 — 요청 흐름은 `runUnslotAll`·`toUnslotAllOutcome` 시험이 맡는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/collections/[id]/__tests__/SlotGrid.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
// 확인 시트가 토스트를 쓴다 — 서버 렌더에는 ToastProvider가 없다
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

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

describe('SlotGrid — 모두 해제하기 버튼의 노출 조건 (티켓 20261028_1420)', () => {
  const badgeSlots = [
    cell('이름1', 'rare', { slot: slotted }),
    cell('이름2', 'rare', { candidates: [candidate('c1')] }),
    cell('이름3', 'rare'),
  ]
  const BUTTON = '>모두 해제하기<'

  it('본인 화면에서 장착이 하나라도 있으면 격자 바로 아래에 버튼이 한 번 보인다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} slotCount={1} />)

    expect(count(html, BUTTON)).toBe(1)
    // 격자의 마지막 칸 뒤에 있다
    expect(html.indexOf(BUTTON)).toBeGreaterThan(html.lastIndexOf('href="/badges/'))
    // 흰 면 outline, 격자 폭 전체, 격자와 12px 간격, 라벨은 한 줄
    expect(html).toContain('bg-surface!')
    expect(html).toContain('w-full')
    expect(html).toContain('mt-3')
    expect(html).toContain('whitespace-nowrap')
  })

  it('장착이 없으면(slotCount 0) 어떤 흔적도 없다 — 값을 주지 않은 기본값도 같다', () => {
    for (const html of [
      renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} slotCount={0} />),
      renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} />),
    ]) {
      expect(html).not.toContain('모두 해제하기')
      expect(html).not.toContain('bg-surface!')
    }
  })

  it('타인 열람(readOnly)은 장착이 있어도 보이지 않는다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} slotCount={3} readOnly />)

    expect(html).not.toContain('모두 해제하기')
  })

  it('삭제된 배지에 꽂힌 장착만 남아 격자에 장착된 칸이 없어도 slotCount가 있으면 보인다', () => {
    const noVisibleSlot = [cell('이름1', 'rare'), cell('이름2', 'rare', { candidates: [candidate('c1')] })]

    const html = renderToStaticMarkup(
      <SlotGrid itemBookId="book-1" badgeSlots={noVisibleSlot} slotCount={1} tierFixed />,
    )

    expect(count(html, '>해제<')).toBe(0)
    expect(count(html, BUTTON)).toBe(1)
  })
})
