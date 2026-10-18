/**
 * 잠긴 아이템 배지 채우기·열기 흐름의 결정 (티켓 20261018_0054 2회)
 *
 * 응답 종류(성공 / 이용 정지 / 거절 / 실패)마다 어떤 안내와 후속 동작이 나오는지 고정한다. 이용 정지는 일반 실패가 아니라 info다.
 * `not_locked`는 안내 뒤 다시 읽기(서버 페이지가 열린 개체를 보낸다), `item_not_found`는 안내 뒤 인벤토리로 이동한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/inventory/__tests__/lockedItemFill-flow.test.ts
 */
import { describe, expect, it, vi } from 'vitest'
import { runLockedFill, runLockedOpen } from '../lockedItemFill-flow'
import type { LockedItemErrorResponse, LockedItemFillPayload, LockedItemOpenPayload } from '../lockedItemFill-contract'
import { d } from '@/lib/i18n'

const ITEM_ID = '22222222-2222-4222-8222-222222222222'

const FILL_OK: LockedItemFillPayload = { itemId: ITEM_ID, applied: 30, required: 120, filled: 60, remaining: 60, balance: 12, openable: false }
const OPEN_OK: LockedItemOpenPayload = {
  itemId: ITEM_ID,
  badgeId: 'b1',
  serialNumber: 7,
  serialPrefix: 'ABCD',
  pointsAwarded: 50,
  item: { name: '새벽의 첫 바퀴', imageUrl: null, description: '새벽에 달린 기록', rarity: 'epic', collection: null, tribe: null },
}

function rejected(code: LockedItemErrorResponse['code'], status = 409) {
  const body: LockedItemErrorResponse = { error: `서버 문구:${code}`, code }
  return async () => ({ kind: 'rejected' as const, status, body })
}

describe('runLockedFill', () => {
  it('성공하면 응답이 새 값이다', async () => {
    const request = vi.fn().mockResolvedValue({ kind: 'ok', data: FILL_OK })
    expect(await runLockedFill(ITEM_ID, 30, request)).toEqual({ kind: 'filled', payload: FILL_OK })
    expect(request).toHaveBeenCalledWith(ITEM_ID, 30)
  })

  it('이용 정지는 일반 실패가 아니라 info 안내이고 후속 동작이 없다', async () => {
    expect(await runLockedFill(ITEM_ID, 30, async () => ({ kind: 'suspended' }))).toEqual({
      kind: 'notice',
      notice: { message: d.suspension.lockedItemFillBlocked, type: 'info' },
      effect: 'none',
    })
  })

  it.each(['exceeds_remaining', 'insufficient_jam', 'already_full', 'invalid_amount', 'not_locked'] as const)(
    '거절 %s는 서버 문구를 그대로 보여 주고 서버 값을 다시 읽는다',
    async (code) => {
      expect(await runLockedFill(ITEM_ID, 30, rejected(code))).toEqual({
        kind: 'notice',
        notice: { message: `서버 문구:${code}`, type: 'error' },
        effect: 'refresh',
      })
    }
  )

  it('item_not_found는 안내 뒤 인벤토리로 보낸다', async () => {
    expect(await runLockedFill(ITEM_ID, 30, rejected('item_not_found', 404))).toEqual({
      kind: 'notice',
      notice: { message: '서버 문구:item_not_found', type: 'error' },
      effect: 'inventory',
    })
  })

  it('그 밖의 실패는 알려진 고정 문구이고 후속 동작이 없다', async () => {
    expect(await runLockedFill(ITEM_ID, 30, async () => ({ kind: 'failed' }))).toEqual({
      kind: 'notice',
      notice: { message: d.lockedItem.fill.failed, type: 'error' },
      effect: 'none',
    })
  })
})

describe('runLockedOpen', () => {
  it('성공하면 응답이 열린 뒤의 개체 정보다', async () => {
    const request = vi.fn().mockResolvedValue({ kind: 'ok', data: OPEN_OK })
    expect(await runLockedOpen(ITEM_ID, request)).toEqual({ kind: 'opened', payload: OPEN_OK })
    expect(request).toHaveBeenCalledWith(ITEM_ID)
  })

  it('개체 정보를 못 읽은 성공(item null)도 열기는 확정이라 opened로 돌려준다(전환 여부는 화면이 정한다)', async () => {
    const payload = { ...OPEN_OK, item: null }
    expect(await runLockedOpen(ITEM_ID, async () => ({ kind: 'ok', data: payload }))).toEqual({ kind: 'opened', payload })
  })

  it('이용 정지는 info 안내다', async () => {
    expect(await runLockedOpen(ITEM_ID, async () => ({ kind: 'suspended' }))).toEqual({
      kind: 'notice',
      notice: { message: d.suspension.lockedItemOpenBlocked, type: 'info' },
      effect: 'none',
    })
  })

  it('not_full은 서버 문구를 보여 주고 서버 값을 다시 읽는다', async () => {
    expect(await runLockedOpen(ITEM_ID, rejected('not_full'))).toEqual({
      kind: 'notice',
      notice: { message: '서버 문구:not_full', type: 'error' },
      effect: 'refresh',
    })
  })

  it('not_locked는 서버 문구를 보여 준 뒤 다시 읽는다(서버 페이지가 열린 개체를 배지 상세로 보낸다)', async () => {
    expect((await runLockedOpen(ITEM_ID, rejected('not_locked'))) as { effect: string }).toMatchObject({ effect: 'refresh' })
  })

  it('item_not_found는 인벤토리로 보낸다', async () => {
    expect((await runLockedOpen(ITEM_ID, rejected('item_not_found', 404))) as { effect: string }).toMatchObject({ effect: 'inventory' })
  })

  it('그 밖의 실패는 열기 실패 고정 문구다(채운 잼은 그대로라는 안내가 들어 있다)', async () => {
    const outcome = await runLockedOpen(ITEM_ID, async () => ({ kind: 'failed' }))
    expect(outcome).toEqual({ kind: 'notice', notice: { message: d.lockedItem.open.failed, type: 'error' }, effect: 'none' })
    expect(d.lockedItem.open.failed).toContain('채운 잼은 그대로')
  })
})
