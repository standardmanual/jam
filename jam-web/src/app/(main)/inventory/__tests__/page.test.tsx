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
