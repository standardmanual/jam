/**
 * 미션 아이템 배지 보상 DB 함수 반환 계약 시험 (티켓 20261019_1313, 마이그레이션 250)
 *
 * 마이그레이션 250 머리말이 적은 반환 모양을 앱이 그대로 읽는지, 계약 밖 모양을 null로 거르는지 고정한다.
 *
 * 위치: `__tests__/`는 vitest에서 제외돼 있어(node assert 시험 전용) 이 파일은 옆에 둔다.
 * 실행: cd jam-web && npx vitest run src/lib/missions/claim-contract.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  CLAIM_ITEM_REWARDS_ERROR_STATUS,
  parseClaimItemRewardsResult,
  parseGrantItemRewardsResult,
} from '@/lib/missions/claim-contract'

describe('parseGrantItemRewardsResult', () => {
  it('granted·none·pending 성공 응답을 읽는다', () => {
    expect(parseGrantItemRewardsResult({ ok: true, status: 'granted', itemIds: ['a'], pendingCount: 0 })).toEqual({
      ok: true,
      status: 'granted',
      itemIds: ['a'],
      pendingCount: 0,
    })
    expect(parseGrantItemRewardsResult({ ok: true, status: 'none', itemIds: [], pendingCount: 0 })).toEqual({
      ok: true,
      status: 'none',
      itemIds: [],
      pendingCount: 0,
    })
    expect(
      parseGrantItemRewardsResult({ ok: true, status: 'pending', itemIds: [], pendingCount: 2, free: 1, needed: 2 })
    ).toEqual({ ok: true, status: 'pending', itemIds: [], pendingCount: 2, free: 1, needed: 2 })
  })

  it('실패 응답의 오류 코드를 읽는다', () => {
    expect(parseGrantItemRewardsResult({ ok: false, error: 'mission_not_found' })).toEqual({ ok: false, error: 'mission_not_found' })
    expect(parseGrantItemRewardsResult({ ok: false, error: 'inventory_not_found' })).toEqual({ ok: false, error: 'inventory_not_found' })
  })

  it('계약 밖 모양은 null이다', () => {
    expect(parseGrantItemRewardsResult(null)).toBeNull()
    expect(parseGrantItemRewardsResult('ok')).toBeNull()
    expect(parseGrantItemRewardsResult([])).toBeNull()
    expect(parseGrantItemRewardsResult({})).toBeNull()
    expect(parseGrantItemRewardsResult({ ok: true, status: 'weird', itemIds: [] })).toBeNull()
    expect(parseGrantItemRewardsResult({ ok: true, status: 'granted', itemIds: [1] })).toBeNull()
    expect(parseGrantItemRewardsResult({ ok: true, status: 'granted', itemIds: [], pendingCount: -1 })).toBeNull()
    expect(parseGrantItemRewardsResult({ ok: false, error: 'unknown' })).toBeNull()
    expect(parseGrantItemRewardsResult({ ok: false })).toBeNull()
  })
})

describe('parseClaimItemRewardsResult', () => {
  it('성공 응답을 읽는다', () => {
    expect(parseClaimItemRewardsResult({ ok: true, granted: 2, itemIds: ['a', 'b'] })).toEqual({
      ok: true,
      granted: 2,
      itemIds: ['a', 'b'],
    })
  })

  it('실패 응답의 오류 코드와 free·needed를 읽는다', () => {
    expect(parseClaimItemRewardsResult({ ok: false, error: 'no_pending' })).toEqual({ ok: false, error: 'no_pending' })
    expect(parseClaimItemRewardsResult({ ok: false, error: 'user_suspended' })).toEqual({ ok: false, error: 'user_suspended' })
    expect(parseClaimItemRewardsResult({ ok: false, error: 'insufficient_slots', free: 1, needed: 3 })).toEqual({
      ok: false,
      error: 'insufficient_slots',
      free: 1,
      needed: 3,
    })
  })

  it('계약 밖 모양은 null이다', () => {
    expect(parseClaimItemRewardsResult(undefined)).toBeNull()
    expect(parseClaimItemRewardsResult({ ok: true, granted: 'x', itemIds: [] })).toBeNull()
    expect(parseClaimItemRewardsResult({ ok: true, granted: 1, itemIds: 'a' })).toBeNull()
    expect(parseClaimItemRewardsResult({ ok: false, error: 'mission_not_found' })).toBeNull()
  })
})

describe('CLAIM_ITEM_REWARDS_ERROR_STATUS', () => {
  it('정지를 뺀 세 실패 코드의 상태 코드다', () => {
    expect(CLAIM_ITEM_REWARDS_ERROR_STATUS).toEqual({ no_pending: 409, insufficient_slots: 409, inventory_not_found: 404 })
  })
})
