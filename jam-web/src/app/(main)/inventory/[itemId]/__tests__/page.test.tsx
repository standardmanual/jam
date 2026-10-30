/**
 * 인벤토리 개체 페이지 — 잠긴 개체는 배지 상세로 보내지 않고 제자리에서 그린다 (티켓 20261018_0054 2회, 운영 로직 7.3절)
 *
 * 확인하는 것
 * ① 잠긴 개체: 리다이렉트하지 않고 `LockedItemDetail`을 그린다. 클라이언트 컴포넌트로 내려가는 props 전체(RSC 페이로드로 직렬화되는 값)에
 *    배지 id·이름·그림·설명·일련번호가 없다. 주소에 배지 id가 실리는 `/badges/...` 리다이렉트도 없다.
 * ② 열린 개체(`locked` false)는 기존대로 `/badges/{badge_id}?item=…&from=inventory`로 간다.
 * ③ 내 개체가 아니면 404, 잠긴 개체의 상태 조회가 `item_not_found`여도 404, 읽기 실패는 던진다. 필요한 잼이 없다는 이유로는 404로 닫지 않는다(20261028_1741).
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/inventory/[itemId]/__tests__/page.test.tsx"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown> | null

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  item: null as Row,
  inventoryCheck: { id: 'inv-1' } as Row,
  badge: { rarity: 'epic' } as Row,
  badgeError: null as { message: string } | null,
  status: null as unknown,
  statusError: null as unknown,
  detailProps: null as unknown,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({ data: table === 'inventory_items' ? state.item : state.inventoryCheck, error: null }),
      }
      return builder
    },
  }),
  createServiceClient: () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: state.badge, error: state.badgeError }),
      }
      return builder
    },
  }),
}))

vi.mock('@/lib/inventory/lockedItemFill', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/inventory/lockedItemFill')>()
  return {
    ...actual,
    getLockedItemStatus: async () => {
      if (state.statusError) throw state.statusError
      return state.status
    },
  }
})

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

vi.mock('../LockedItemDetail', () => ({
  default: (props: unknown) => {
    state.detailProps = props
    return <div data-stub="locked-item-detail" />
  },
}))

import InventoryItemPage from '../page'
import { LockedItemError } from '@/lib/inventory/lockedItemFill'

const ITEM_ID = '22222222-2222-4222-8222-222222222222'
const BADGE_ID = 'badge-secret-id'

function lockedRow(extra: Record<string, unknown> = {}): Row {
  return { badge_id: BADGE_ID, inventory_id: 'inv-1', locked: true, obtained_at: '2026-10-18T01:00:00Z', obtained_by: 'system_event', ...extra }
}

const LOCKED_STATUS = {
  itemId: ITEM_ID,
  locked: true,
  required: 120,
  filled: 30,
  remaining: 90,
  balance: 500,
  pointsRequired: 1200,
  pointBalance: 800,
  openable: false,
}

async function render() {
  return InventoryItemPage({ params: Promise.resolve({ itemId: ITEM_ID }) })
}

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.item = null
  state.inventoryCheck = { id: 'inv-1' }
  state.badge = { rarity: 'epic' }
  state.badgeError = null
  state.status = LOCKED_STATUS
  state.statusError = null
  state.detailProps = null
})

describe('인벤토리 개체 페이지 — 잠긴 개체', () => {
  it('리다이렉트하지 않고 잠긴 상세를 그린다', async () => {
    state.item = lockedRow()

    const element = await render()

    expect((element as { type: unknown }).type).toBeTypeOf('function')
    const props = (element as { props: Record<string, unknown> }).props
    expect(props).toMatchObject({ itemId: ITEM_ID, rarity: 'epic', pointsRequired: 1200, pointBalance: 800, obtainedAt: '2026-10-18T01:00:00Z', obtainedBy: 'system_event' })
  })

  it('클라이언트로 내려가는 props 전체에 배지 id가 없다(이름·그림·설명·일련번호 값도 받지 않는다)', async () => {
    state.item = lockedRow({ serial_number: 4242, serial_prefix: 'ZZZZ', name: '새어 나가면 안 되는 이름' })

    const element = (await render()) as { props: Record<string, unknown> }

    const serialized = JSON.stringify(element.props)
    for (const secret of [BADGE_ID, 'badge_id', 'badgeId', '4242', 'ZZZZ', '새어 나가면 안 되는 이름', 'imageUrl', 'description']) {
      expect(serialized, `props에 ${secret}이 실렸다`).not.toContain(secret)
    }
    expect(Object.keys(element.props).sort()).toEqual(['itemId', 'obtainedAt', 'obtainedBy', 'pointBalance', 'pointsRequired', 'rarity'])
  })

  it('잼 값(필요한 잼·채운 양·가진 잼)은 상세 props에 싣지 않는다', async () => {
    state.item = lockedRow()

    const element = (await render()) as { props: Record<string, unknown> }

    for (const jamKey of ['required', 'filled', 'balance', 'remaining']) {
      expect(element.props, jamKey).not.toHaveProperty(jamKey)
    }
  })

  it('서버 값이 바뀌면 클라이언트 상태를 다시 시작하도록 key를 필요 포인트·가진 포인트로 만든다', async () => {
    state.item = lockedRow()

    const element = (await render()) as { key: string | null }

    expect(element.key).toBe('1200:800')
  })

  it('필요 포인트가 비어 있으면(null) key는 x로 시작하고 그 값을 그대로 내려 준다', async () => {
    state.item = lockedRow()
    state.status = { ...LOCKED_STATUS, pointsRequired: null }

    const element = (await render()) as { key: string | null; props: Record<string, unknown> }

    expect(element.key).toBe('x:800')
    expect(element.props.pointsRequired).toBeNull()
  })

  it('필요 포인트가 0이면 0을 그대로 내려 준다(null로 접지 않는다)', async () => {
    state.item = lockedRow()
    state.status = { ...LOCKED_STATUS, pointsRequired: 0, pointBalance: 0 }

    const element = (await render()) as { key: string | null; props: Record<string, unknown> }

    expect(element.key).toBe('0:0')
    expect(element.props).toMatchObject({ pointsRequired: 0, pointBalance: 0 })
  })

  it('배지 등급을 읽지 못한 정상 응답(행 없음)이면 등급 없이 그린다', async () => {
    state.item = lockedRow()
    state.badge = null

    const element = (await render()) as { props: Record<string, unknown> }

    expect(element.props.rarity).toBeNull()
  })

  it('상태 조회가 item_not_found이면 404다', async () => {
    state.item = lockedRow()
    state.statusError = new LockedItemError('item_not_found')

    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('상태 조회의 읽기 실패는 404로 위장하지 않고 던진다', async () => {
    state.item = lockedRow()
    state.statusError = new Error('inventory_items 조회 실패: down')

    await expect(render()).rejects.toThrow('조회 실패')
  })

  it('필요한 잼이 없는 잠긴 개체(옛 unlock_required 없음)도 404로 닫지 않고 그린다 - 판정은 잠겼는가만 본다', async () => {
    state.item = lockedRow()
    state.status = { ...LOCKED_STATUS, required: null, pointsRequired: null }

    const element = (await render()) as { props: Record<string, unknown> }

    expect(element.props).toMatchObject({ itemId: ITEM_ID, pointsRequired: null, pointBalance: 800 })
  })

  it('조회하는 사이 열렸다면(상태가 locked false) 기존 리다이렉트로 이어진다', async () => {
    state.item = lockedRow()
    state.status = { ...LOCKED_STATUS, locked: false }

    await expect(render()).rejects.toThrow(`NEXT_REDIRECT:/badges/${BADGE_ID}?item=${ITEM_ID}&from=inventory`)
  })

  it('내 인벤토리의 개체가 아니면 404이고 상태 조회까지 가지 않는다', async () => {
    state.item = lockedRow()
    state.inventoryCheck = null

    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(state.detailProps).toBeNull()
  })
})

describe('인벤토리 개체 페이지 — 열린 개체와 그 밖', () => {
  it('열린 개체(locked false)는 배지 상세로 리다이렉트한다', async () => {
    state.item = lockedRow({ locked: false })

    await expect(render()).rejects.toThrow(`NEXT_REDIRECT:/badges/${BADGE_ID}?item=${ITEM_ID}&from=inventory`)
  })

  it('locked 값이 없는 옛 행도 열린 개체로 본다', async () => {
    state.item = lockedRow({ locked: undefined })

    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/badges/')
  })

  it('개체가 없으면 404다', async () => {
    state.item = null

    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('소유자 없는 개체(inventory_id null)는 404다', async () => {
    state.item = lockedRow({ inventory_id: null })

    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('로그인하지 않았으면 로그인으로 보낸다', async () => {
    state.user = null

    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})
