/**
 * 인벤토리 페이지 — 임베드 `badge`가 null인 행은 빠지고 화면이 그려진다 (티켓 20261006_1530)
 *
 * 마이그레이션 216 정책이 공개 전 배지를 0행으로 돌려주면 `inventory_items(*, badge:badges(*))`
 * 임베드의 `badge`가 null로 온다. 페이지는 `item.badge &&`로 그 행을 거르므로, 거르지 않으면
 * `item.badge.name`에서 TypeError로 화면이 죽는다. 그리드·빈 상태는 모의 컴포넌트로 바꿔 **페이지가
 * 넘기는 값**과 **어느 쪽을 그리는지**만 본다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/inventory/__tests__/page.test.tsx"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  inventory: null as Row | null,
  gridProps: null as { items: { id: string; badgeName: string }[] } | null,
  /** 그리드가 받은 props 전체(직렬화 가능한 값이 클라이언트·RSC 페이로드로 내려가는 지점) */
  gridPropsRaw: null as unknown,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({ data: state.inventory, error: null }),
      }
      return builder
    },
  }),
}))

vi.mock('@/lib/onboarding-quest/screen-gate', () => ({
  getOnboardingQuestGate: async () => null,
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

vi.mock('@/components/ui/TopNav', () => ({ default: () => <div data-stub="topnav" /> }))

vi.mock('../QuestBagGrid', () => ({ default: () => <div data-stub="quest-bag-grid" /> }))

vi.mock('@/components/inventory/InventoryGrid', () => ({
  default: (props: { items: { id: string; badgeName: string }[] }) => {
    state.gridProps = props
    state.gridPropsRaw = props
    return <div data-stub="inventory-grid" />
  },
}))

import InventoryPage from '../page'
import { d } from '@/lib/i18n'

const OK_BADGE = { id: 'badge-ok', name: '살아있는 배지', image_url: null, rarity: 'common', deleted_at: null }

function inventoryItem(id: string, badge: Row | null): Row {
  return { id, badge_id: `badge-of-${id}`, dropped_at: null, slotted_in: null, expires_at: null, badge }
}

async function render(): Promise<string> {
  return renderToStaticMarkup((await InventoryPage()) as ReactElement)
}

describe('인벤토리 페이지 — 임베드 badge가 null인 행', () => {
  beforeEach(() => {
    state.inventory = null
    state.gridProps = null
    state.gridPropsRaw = null
  })

  it('badge가 null인 행은 그리드에서 빠지고 나머지는 그려진다', async () => {
    state.inventory = {
      id: 'inv-1',
      used_slots: 2,
      max_slots: 50,
      inventory_items: [inventoryItem('item-hidden', null), inventoryItem('item-ok', OK_BADGE)],
    }

    const html = await render()

    expect(html).toContain('data-stub="inventory-grid"')
    expect(state.gridProps?.items.map((item) => item.id)).toEqual(['item-ok'])
    expect(state.gridProps?.items[0].badgeName).toBe('살아있는 배지')
  })

  it('모든 행의 badge가 null이면 빈 상태가 그려지고 그리드는 그려지지 않는다', async () => {
    state.inventory = {
      id: 'inv-1',
      used_slots: 1,
      max_slots: 50,
      inventory_items: [inventoryItem('item-hidden', null)],
    }

    const html = await render()

    expect(html).toContain(d.inventory.emptyTitle)
    expect(html).not.toContain('data-stub="inventory-grid"')
    expect(state.gridProps).toBeNull()
  })
})

/**
 * 잠긴 개체의 가림은 서버에서 일어난다 (티켓 20261018_0054 2회, 운영 로직 7.3절)
 *
 * 그리드는 클라이언트 컴포넌트라 서버 페이지가 넘기는 props가 그대로 RSC 페이로드에 직렬화돼 브라우저로 간다. 화면에서 가리는 것으로는 부족하고,
 * 페이지가 **이름·그림·설명을 값으로 넘기지 않아야** 한다. 그래서 그리드 모의에 닿은 props 전체를 문자열로 만들어 값이 없는지 본다.
 */
describe('인벤토리 페이지 — 잠긴 개체는 이름·그림이 서버에서 비워진다', () => {
  const SECRET_BADGE = {
    id: 'badge-secret',
    name: '새어 나가면 안 되는 이름',
    description: '새어 나가면 안 되는 설명',
    image_url: 'https://example.com/secret-badge.png',
    rarity: 'epic',
    deleted_at: null,
  }

  beforeEach(() => {
    state.inventory = null
    state.gridProps = null
    state.gridPropsRaw = null
  })

  function lockedItem(id: string, extra: Row = {}): Row {
    return { ...inventoryItem(id, SECRET_BADGE), serial_number: 4242, serial_prefix: 'ZZZZ', locked: true, unlock_required: 120, unlock_filled: 30, ...extra }
  }

  it('그리드 props 전체에 이름·그림 URL·설명·배지 id·일련번호가 없다', async () => {
    state.inventory = { id: 'inv-1', used_slots: 2, max_slots: 50, inventory_items: [lockedItem('item-locked'), inventoryItem('item-ok', OK_BADGE)] }

    await render()

    const serialized = JSON.stringify(state.gridPropsRaw)
    const locked = state.gridProps?.items.find((item) => item.id === 'item-locked') as Record<string, unknown>
    expect(locked).toMatchObject({ id: 'item-locked', badgeName: '', badgeImageUrl: null, badgeRarity: 'epic', locked: true })
    // 채운 비율은 더는 의미가 없어 그리드에 싣지 않는다(티켓 20261028_1741 2회)
    expect(locked).not.toHaveProperty('fillPercent')
    expect(serialized).not.toContain('fillPercent')
    for (const secret of ['새어 나가면 안 되는 이름', '새어 나가면 안 되는 설명', 'secret-badge.png', 'badge-secret', '4242', 'ZZZZ']) {
      expect(serialized, `그리드 props에 ${secret}이 실렸다`).not.toContain(secret)
    }
    // 일반 개체는 그대로 이름을 싣는다
    expect(serialized).toContain('살아있는 배지')
  })

  it('옛 필요량·채운 양 열이 비어 있거나 남아 있어도 잠긴 개체는 같은 모양이다 — 던지지 않는다', async () => {
    state.inventory = { id: 'inv-1', used_slots: 1, max_slots: 50, inventory_items: [lockedItem('item-locked', { unlock_required: null, unlock_filled: 0 })] }

    await render()

    expect(state.gridProps?.items[0]).toEqual({ id: 'item-locked', badgeName: '', badgeImageUrl: null, badgeRarity: 'epic', expiresAt: null, locked: true })
  })

  it('locked가 false인 개체(열린 개체)는 이름과 그림을 그대로 싣는다', async () => {
    state.inventory = { id: 'inv-1', used_slots: 1, max_slots: 50, inventory_items: [lockedItem('item-opened', { locked: false })] }

    await render()

    expect(state.gridProps?.items[0]).toMatchObject({ badgeName: SECRET_BADGE.name, badgeImageUrl: SECRET_BADGE.image_url })
    expect((state.gridProps?.items[0] as Record<string, unknown>).locked).toBeUndefined()
  })
})

/**
 * 슬롯 사용량 표시 (티켓 20261018_0056, 2026-11-09 사용자 지시로 바꿈)
 *  - 컬렉션 상세의 진행도 바와 같은 모양: 바(높이 16px) 오른쪽에 «사용/전체» 수치. 바 아래 문장(«N/50개 사용 중 · N개 남음»,
 *    «N개만 남았어요»)은 없다. 남은 칸이 적을 때의 강조도 없다.
 *  - 0개: 한 줄 안내 카드(본문에 장착·믹스·드랍)는 그대로다.
 */
describe('인벤토리 페이지 — 슬롯 사용량 표시', () => {
  beforeEach(() => {
    state.inventory = null
    state.gridProps = null
    state.gridPropsRaw = null
  })

  function withUsed(used: number, max = 50): Row {
    return { id: 'inv-1', used_slots: used, max_slots: max, inventory_items: [inventoryItem('item-ok', OK_BADGE)] }
  }

  it.each([46, 47, 49, 50])('사용 %i개이면 바 오른쪽에 «%i/50» 수치만 보이고 바 아래 문장이 없다', async (used) => {
    state.inventory = withUsed(used)
    const html = await render()
    expect(html).toContain(`>${used}/50</span>`)
    // 바 아래 문장과 남은 칸 강조는 없다
    expect(html).not.toContain('개 사용 중')
    expect(html).not.toContain('개 남음')
    expect(html).not.toContain('개만 남았어요')
    expect(html).not.toContain('드랍하기')
  })

  it('컬렉션 상세의 진행도 바와 같은 부품이다(바 16px + 13px 굵은 link 색 수치)', async () => {
    state.inventory = withUsed(46)
    const html = await render()
    expect(html).toContain('height:16px')
    expect(html).toMatch(/<span style="color:var\(--link\);font-size:13px;line-height:1;font-weight:700;font-variant-numeric:tabular-nums">46\/50<\/span>/)
    // 수치는 바 오른쪽(같은 줄, 바 다음)에 있다
    expect(html.indexOf('height:16px')).toBeLessThan(html.indexOf('>46/50</span>'))
  })

  it('남은 칸이 0개이면 수치(50/50) 아래에 한 줄 안내 카드를 더한다 (2026-11-06 사용자 결정: 문구 한 줄, 버튼 없음)', async () => {
    state.inventory = withUsed(50)
    const html = await render()
    expect(html).toContain('>50/50</span>')
    expect(html).not.toContain('개만 남았어요')
    expect(d.inventory.fullNoticeBody).toBe('인벤토리가 꽉 찼어요.')
    expect(html).toContain('인벤토리가 꽉 찼어요.')
    // 원인·해결 문장과 «드랍하기» 버튼이 없다
    expect(html).not.toContain('개까지만 보관할 수 있어서')
    expect(html).not.toContain('자리를 비워 주세요')
    expect(html).not.toContain('드랍하기')
    expect('fullNoticeCta' in d.inventory).toBe(false)
  })

  it('남은 칸이 0개일 때 안내 카드는 어두운 반전 면이고 글자는 snow이며 링크·버튼이 없다 (티켓 20261105_1953)', async () => {
    state.inventory = withUsed(50)
    const html = await render()
    const card = html.match(/<div class="mt-3 rounded-2xl px-4 py-3 bg-background-inverse border border-background-inverse">.*?<\/div>/)?.[0] ?? ''
    expect(card).toContain('text-snow')
    expect(card).not.toMatch(/<a |<button|href="\/drops"/)
    expect(html).not.toContain('bg-surface border border-border')
  })

  it('가득 차지 않으면 반전 안내가 DOM에 없다', async () => {
    state.inventory = withUsed(49)
    const html = await render()
    expect(html).not.toContain('bg-background-inverse')
    expect(html).not.toContain('href="/drops"')
  })
})
