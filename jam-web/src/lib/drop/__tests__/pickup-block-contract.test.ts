import { describe, expect, it } from 'vitest'
import { PICKUP_BLOCK_CODE, pickupBlockKind } from '../pickup-block-contract'

describe('pickupBlockKind — 픽업이 막힌 까닭을 상태 코드와 code로 읽는다 (티켓 20261018_1817)', () => {
  it.each([
    [403, { code: 'user_suspended' }, 'suspended'],
    [422, { code: PICKUP_BLOCK_CODE.inventoryFull }, 'inventory_full'],
    [403, { code: PICKUP_BLOCK_CODE.poiBlocked }, 'poi_blocked'],
    [404, { code: PICKUP_BLOCK_CODE.dropGone }, 'drop_gone'],
    [409, { code: PICKUP_BLOCK_CODE.alreadyPickedUp }, 'already_picked_up'],
  ])('%i %j → %s', (status, body, kind) => {
    expect(pickupBlockKind(status, body)).toBe(kind)
  })

  it('code가 없거나 상태가 맞지 않거나 본문이 객체가 아니면 일반 실패(null)다', () => {
    expect(pickupBlockKind(403, { error: '위치를 확인하지 못했어요' })).toBeNull()
    expect(pickupBlockKind(500, { code: PICKUP_BLOCK_CODE.dropGone })).toBeNull()
    expect(pickupBlockKind(404, { code: 'other' })).toBeNull()
    expect(pickupBlockKind(404, null)).toBeNull()
    expect(pickupBlockKind(404, 'drop_gone')).toBeNull()
  })
})
