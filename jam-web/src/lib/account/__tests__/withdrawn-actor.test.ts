/**
 * 탈퇴한 유저의 행위자 판정 (티켓 20261021_1249 2회, 운영 로직 17.2절)
 * 순수 함수라 가짜가 없다. 고정하는 것: 이벤트 종류별 필수 칸의 *_user_id가 NULL이면 탈퇴 · 필수가 아닌 칸의 NULL은 원래 빈 것이라 그리지 않는다 ·
 * Pickup의 from은 짝 드랍이 유저 드랍일 때만 필수 · *_user_id가 NULL인 칸의 옛 이름 문자열은 값이 있어도 무시한다 · 살아 있는 유저는 이름으로 보인다 ·
 * 짝 드랍은 picked_up_at이 이벤트 시각과 같은 행이다(표기가 달라도 같은 시각이면 같다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/account/__tests__/withdrawn-actor.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { CustodyEventRow, CustodyEventType } from '@/types/database'
import {
  findPickupDropSource,
  isWithdrawnDrop,
  resolveCustodyActors,
  withdrawnSlots,
} from '../withdrawn-actor'

const ALL_TYPES: CustodyEventType[] = [
  'Minted',
  'UserDrop',
  'Pickup',
  'Expire',
  'Slot',
  'Unslot',
  'Consume',
  'Orphan',
  'AdminDestroy',
  'AdminReassign',
]

/** 세 칸 모두 NULL인 이벤트(= 필수 칸의 유저가 모두 탈퇴한 상태) */
function emptyEvent(event_type: CustodyEventType): CustodyEventRow {
  return {
    id: 'e1',
    inventory_item_id: 'i1',
    event_type,
    from_user_id: null,
    from_username: null,
    to_user_id: null,
    to_username: null,
    actor_user_id: null,
    actor_username: null,
    poi_id: null,
    created_at: '2026-10-01T00:00:00.000Z',
  }
}

describe('withdrawnSlots — 필수 칸의 user_id가 NULL이면 탈퇴', () => {
  const expected: Record<CustodyEventType, { from: boolean; to: boolean; actor: boolean }> = {
    Minted: { from: false, to: false, actor: false },
    Expire: { from: false, to: false, actor: false },
    UserDrop: { from: true, to: false, actor: false },
    Pickup: { from: false, to: true, actor: false },
    Slot: { from: false, to: false, actor: true },
    Unslot: { from: false, to: false, actor: true },
    Consume: { from: false, to: false, actor: true },
    AdminDestroy: { from: false, to: false, actor: true },
    Orphan: { from: true, to: false, actor: false },
    AdminReassign: { from: false, to: true, actor: true },
  }

  it.each(ALL_TYPES)('%s: 세 칸이 모두 NULL일 때 필수 칸만 탈퇴로 본다', (type) => {
    expect(withdrawnSlots(emptyEvent(type))).toEqual(expected[type])
  })

  it('필수 칸에 유저 id가 있으면(살아 있는 유저) 탈퇴가 아니다', () => {
    const slot = { ...emptyEvent('Slot'), actor_user_id: 'u1' }
    expect(withdrawnSlots(slot).actor).toBe(false)
    const reassign = { ...emptyEvent('AdminReassign'), to_user_id: 'u1' }
    expect(withdrawnSlots(reassign)).toEqual({ from: false, to: false, actor: true })
  })

  it('Pickup의 from은 짝 드랍이 유저 드랍일 때만 탈퇴다', () => {
    const pickup = emptyEvent('Pickup')
    expect(withdrawnSlots(pickup, 'user')).toEqual({ from: true, to: true, actor: false })
    expect(withdrawnSlots(pickup, 'system')).toEqual({ from: false, to: true, actor: false })
    expect(withdrawnSlots(pickup, null)).toEqual({ from: false, to: true, actor: false })
    expect(withdrawnSlots(pickup, undefined)).toEqual({ from: false, to: true, actor: false })
  })

  it('Pickup이 아닌 이벤트는 dropSource를 무시한다', () => {
    expect(withdrawnSlots(emptyEvent('Slot'), 'user')).toEqual({ from: false, to: false, actor: true })
    expect(withdrawnSlots(emptyEvent('Minted'), 'user')).toEqual({ from: false, to: false, actor: false })
  })

  it('유저 드랍을 살아 있는 유저가 놓았으면 Pickup의 from은 탈퇴가 아니다', () => {
    const pickup = { ...emptyEvent('Pickup'), from_user_id: 'dropper', to_user_id: 'picker' }
    expect(withdrawnSlots(pickup, 'user')).toEqual({ from: false, to: false, actor: false })
  })
})

describe('resolveCustodyActors — 칸별 표시 정보', () => {
  it('살아 있는 유저는 이름으로 보이고 id를 함께 준다', () => {
    const e: CustodyEventRow = {
      ...emptyEvent('Slot'),
      actor_user_id: 'u1',
      actor_username: '민수',
    }
    expect(resolveCustodyActors(e)).toEqual({
      from: null,
      to: null,
      actor: { kind: 'user', userId: 'u1', name: '민수' },
    })
  })

  it('필수 칸의 user_id가 NULL이면 이름이 비어 있어도 탈퇴 표시다', () => {
    expect(resolveCustodyActors(emptyEvent('Orphan'))).toEqual({
      from: { kind: 'withdrawn' },
      to: null,
      actor: null,
    })
  })

  it('user_id가 NULL인 칸의 옛 이름 문자열은 값이 있어도 무시한다 — 필수 칸이면 탈퇴, 아니면 그리지 않는다', () => {
    const required: CustodyEventRow = { ...emptyEvent('Slot'), actor_username: '옛이름' }
    expect(resolveCustodyActors(required).actor).toEqual({ kind: 'withdrawn' })
    const optional: CustodyEventRow = { ...emptyEvent('Slot'), from_username: '옛이름' }
    expect(resolveCustodyActors(optional).from).toBeNull()
  })

  it('user_id가 값이 있는데 이름이 비어 있으면 지금처럼 그리지 않는다', () => {
    const e: CustodyEventRow = { ...emptyEvent('Slot'), actor_user_id: 'u1', actor_username: null }
    expect(resolveCustodyActors(e).actor).toBeNull()
  })

  it('Minted·Expire처럼 필수 칸이 없는 이벤트는 아무것도 그리지 않는다', () => {
    expect(resolveCustodyActors(emptyEvent('Minted'))).toEqual({ from: null, to: null, actor: null })
    expect(resolveCustodyActors(emptyEvent('Expire'))).toEqual({ from: null, to: null, actor: null })
  })

  it('Pickup: 유저 드랍을 탈퇴한 유저가 놓았고 줍은 유저도 탈퇴면 둘 다 탈퇴 표시다', () => {
    expect(resolveCustodyActors(emptyEvent('Pickup'), 'user')).toEqual({
      from: { kind: 'withdrawn' },
      to: { kind: 'withdrawn' },
      actor: null,
    })
  })

  it('Pickup: 시스템 드랍이거나 짝이 없으면 from은 그리지 않는다', () => {
    const e: CustodyEventRow = { ...emptyEvent('Pickup'), to_user_id: 'u2', to_username: '지수' }
    const expected = { from: null, to: { kind: 'user', userId: 'u2', name: '지수' }, actor: null }
    expect(resolveCustodyActors(e, 'system')).toEqual(expected)
    expect(resolveCustodyActors(e, null)).toEqual(expected)
  })
})

describe('isWithdrawnDrop — 드랍한 유저가 탈퇴한 드랍', () => {
  it('유저 드랍인데 드랍한 유저가 없으면 탈퇴다', () => {
    expect(isWithdrawnDrop({ source: 'user', dropper_user_id: null })).toBe(true)
  })
  it('유저 드랍이고 드랍한 유저가 있으면 탈퇴가 아니다', () => {
    expect(isWithdrawnDrop({ source: 'user', dropper_user_id: 'u1' })).toBe(false)
  })
  it('시스템 드랍은 원래 드랍한 유저가 없으므로 탈퇴가 아니다', () => {
    expect(isWithdrawnDrop({ source: 'system', dropper_user_id: null })).toBe(false)
  })
})

describe('findPickupDropSource — Pickup 이벤트와 짝인 드랍의 source', () => {
  const pickup = { event_type: 'Pickup' as const, created_at: '2026-10-01T03:04:05.678Z' }

  it('picked_up_at이 이벤트 시각과 같은 행의 source를 돌려준다', () => {
    const drops = [
      { source: 'system' as const, picked_up_at: '2026-09-01T00:00:00.000Z' },
      { source: 'user' as const, picked_up_at: '2026-10-01T03:04:05.678Z' },
    ]
    expect(findPickupDropSource(pickup, drops)).toBe('user')
  })

  it('표기가 달라도(+00:00) 같은 시각이면 같은 행이다', () => {
    const drops = [{ source: 'user' as const, picked_up_at: '2026-10-01T03:04:05.678+00:00' }]
    expect(findPickupDropSource(pickup, drops)).toBe('user')
  })

  it('짝이 없으면 null이다', () => {
    expect(findPickupDropSource(pickup, [{ source: 'user', picked_up_at: '2026-10-02T00:00:00.000Z' }])).toBeNull()
    expect(findPickupDropSource(pickup, [{ source: 'user', picked_up_at: null }])).toBeNull()
    expect(findPickupDropSource(pickup, [])).toBeNull()
  })

  it('Pickup이 아닌 이벤트는 찾지 않는다', () => {
    const drops = [{ source: 'user' as const, picked_up_at: '2026-10-01T03:04:05.678Z' }]
    expect(findPickupDropSource({ ...pickup, event_type: 'Slot' }, drops)).toBeNull()
  })
})
