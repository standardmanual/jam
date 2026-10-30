/**
 * 잠긴 아이템 배지 열기 흐름의 결정 (티켓 20261018_0054 2회, 20261028_1741 1회)
 *
 * 응답 종류(성공 / 이용 정지 / 거절 / 실패)마다 어떤 안내와 후속 동작이 나오는지 고정한다. 이용 정지는 일반 실패가 아니라 info다.
 * 포인트가 모자라다는 거절(`insufficient_points`)은 info 안내이고, 응답의 `required`·`balance`를 화면에 돌려준다.
 * `not_locked`는 안내 뒤 다시 읽기(서버 페이지가 열린 개체를 보낸다), `item_not_found`는 안내 뒤 인벤토리로 이동한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/inventory/__tests__/lockedItemFill-flow.test.ts
 */
import { describe, expect, it, vi } from 'vitest'
import * as flow from '../lockedItemFill-flow'
import { runLockedOpen } from '../lockedItemFill-flow'
import type { LockedItemErrorResponse, LockedItemOpenPayload } from '../lockedItemFill-contract'
import { d } from '@/lib/i18n'

const ITEM_ID = '22222222-2222-4222-8222-222222222222'

const OPEN_OK: LockedItemOpenPayload = {
  itemId: ITEM_ID,
  badgeId: 'b1',
  serialNumber: 7,
  serialPrefix: 'ABCD',
  pointsAwarded: 50,
  pointsSpent: 50,
  pointBalance: 120,
  item: { name: '새벽의 첫 바퀴', imageUrl: null, description: '새벽에 달린 기록', rarity: 'epic', collection: null, tribe: null },
}

function rejected(code: LockedItemErrorResponse['code'], status = 409, extra: Partial<LockedItemErrorResponse> = {}) {
  const body: LockedItemErrorResponse = { error: `서버 문구:${code}`, code, ...extra }
  return async () => ({ kind: 'rejected' as const, status, body })
}

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

  it('insufficient_points는 info 안내이고 필요 포인트·가진 포인트를 돌려주며 서버 값을 다시 읽는다', async () => {
    expect(await runLockedOpen(ITEM_ID, rejected('insufficient_points', 409, { required: 1200, balance: 800 }))).toEqual({
      kind: 'notice',
      notice: { message: '서버 문구:insufficient_points', type: 'info' },
      effect: 'refresh',
      points: { required: 1200, balance: 800 },
    })
  })

  it('insufficient_points의 가진 포인트가 0이어도 값으로 돌려준다', async () => {
    const outcome = await runLockedOpen(ITEM_ID, rejected('insufficient_points', 409, { required: 100, balance: 0 }))
    expect(outcome).toMatchObject({ points: { required: 100, balance: 0 } })
  })

  it('insufficient_points인데 두 값 중 하나라도 숫자가 아니면 points 없이 일반 거절로 처리한다', async () => {
    const expected = { kind: 'notice', notice: { message: '서버 문구:insufficient_points', type: 'error' }, effect: 'refresh' }
    expect(await runLockedOpen(ITEM_ID, rejected('insufficient_points'))).toEqual(expected)
    expect(await runLockedOpen(ITEM_ID, rejected('insufficient_points', 409, { required: 1200 }))).toEqual(expected)
    expect(await runLockedOpen(ITEM_ID, rejected('insufficient_points', 409, { balance: 800 }))).toEqual(expected)
    const stringy = rejected('insufficient_points', 409, { required: '1200' as unknown as number, balance: 800 })
    expect(await runLockedOpen(ITEM_ID, stringy)).toEqual(expected)
  })

  it('insufficient_points가 아닌 거절은 필요 포인트 필드가 있어도 points를 돌려주지 않는다', async () => {
    const outcome = await runLockedOpen(ITEM_ID, rejected('not_full', 409, { required: 120, balance: 5 }))
    expect(outcome).not.toHaveProperty('points')
  })

  it('not_locked는 서버 문구를 보여 준 뒤 다시 읽는다(서버 페이지가 열린 개체를 배지 상세로 보낸다)', async () => {
    expect((await runLockedOpen(ITEM_ID, rejected('not_locked'))) as { effect: string }).toMatchObject({ effect: 'refresh' })
  })

  it('item_not_found는 인벤토리로 보낸다', async () => {
    expect((await runLockedOpen(ITEM_ID, rejected('item_not_found', 404))) as { effect: string }).toMatchObject({ effect: 'inventory' })
  })

  it('그 밖의 실패는 열기 실패 고정 문구이고 후속 동작이 없다', async () => {
    const outcome = await runLockedOpen(ITEM_ID, async () => ({ kind: 'failed' }))
    expect(outcome).toEqual({ kind: 'notice', notice: { message: d.lockedItem.open.failed, type: 'error' }, effect: 'none' })
  })

  it('채우기 흐름(runLockedFill)은 더는 내보내지 않는다(화면이 쓰지 않는다)', () => {
    expect(flow).not.toHaveProperty('runLockedFill')
  })
})
