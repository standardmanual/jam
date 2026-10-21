/**
 * strava/sync-flow — 동기화 요청과 보류 고르기를 잇는 흐름 (티켓 20261017_1425 2회)
 *
 * 고정하는 것:
 * - 409 + `code: 'sync_pending_items'` → 고르기를 먼저 연다. 'resolved'면 동기화를 **한 번만** 다시 요청한다.
 *   'dismissed'면 다시 요청하지 않고 막힘으로 끝낸다. 다시 요청해도 409면 멈춘다(무한 반복 없음, 요청은 정확히 2번).
 * - 200 + `pendingItems > 0` → 고르기를 결과보다 먼저 연다. 마치든 «나중에»로 닫든 결과(`ok`)로 이어진다.
 * - `pendingItems`가 없는 이전 응답은 고르기 없이 기존 동작 그대로다.
 * - 409지만 `code`가 다른 응답과 그 밖의 실패는 `failed`다(고르기를 열지 않는다).
 * - 고르기가 떠 있는 동안 버튼 스피너를 끄고, 동기화를 다시 요청할 때 켠다.
 * - 403 + `code: 'tribe_required'` → 일반 실패가 아니라 `tribe_required`로 돌려준다(호출부가 트라이브 고르기 화면으로 보낸다, 티켓 20261021_1247).
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-flow.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { runSyncFlow } from '../sync-flow'
import { SYNC_PENDING_ITEMS_CODE } from '../pending-items-contract'
import type { PickResult } from '../pending-pick'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'
import { TRIBE_REQUIRED_CODE } from '@/lib/tribe/gate-contract'

interface Data {
  synced: number
  pendingItems?: number
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const blocked = () => json(409, { error: 'x', code: SYNC_PENDING_ITEMS_CODE, pendingCount: 2 })

function setup(responses: Response[], pickResults: PickResult[]) {
  const log: string[] = []
  const queue = [...responses]
  const picks = [...pickResults]
  const fetchSync = vi.fn(async () => {
    log.push('sync')
    const next = queue.shift()
    if (!next) throw new Error('예상보다 요청이 많다')
    return next
  })
  const openPicker = vi.fn(async (): Promise<PickResult> => {
    log.push('pick')
    return picks.shift() ?? 'dismissed'
  })
  const setLoading = vi.fn((loading: boolean) => {
    log.push(`loading:${loading}`)
  })
  return { log, fetchSync, openPicker, setLoading, run: () => runSyncFlow<Data>({ fetchSync, openPicker, setLoading }) }
}

describe('runSyncFlow — 409 sync_pending_items', () => {
  it('고르기를 먼저 열고 resolved면 동기화를 한 번만 다시 요청한다', async () => {
    const t = setup([blocked(), json(200, { synced: 3 })], ['resolved'])

    const result = await t.run()

    expect(result).toEqual({ kind: 'ok', data: { synced: 3 }, pickedFirst: false })
    expect(t.fetchSync).toHaveBeenCalledTimes(2)
    expect(t.openPicker).toHaveBeenCalledTimes(1)
    expect(t.log).toEqual(['sync', 'loading:false', 'pick', 'loading:true', 'sync'])
  })

  it('dismissed면 다시 요청하지 않고 막힘으로 끝낸다', async () => {
    const t = setup([blocked()], ['dismissed'])

    const result = await t.run()

    expect(result).toEqual({ kind: 'blocked' })
    expect(t.fetchSync).toHaveBeenCalledTimes(1)
  })

  it('다시 요청해도 409면 멈춘다(고르기를 두 번 열지 않고 요청은 2번)', async () => {
    const t = setup([blocked(), blocked(), json(200, { synced: 1 })], ['resolved', 'resolved'])

    const result = await t.run()

    expect(result).toEqual({ kind: 'blocked' })
    expect(t.fetchSync).toHaveBeenCalledTimes(2)
    expect(t.openPicker).toHaveBeenCalledTimes(1)
  })

  it('다시 요청한 응답에 새 보류가 있으면 고르기를 한 번 더 먼저 연다', async () => {
    const t = setup([blocked(), json(200, { synced: 1, pendingItems: 2 })], ['resolved', 'dismissed'])

    const result = await t.run()

    expect(result).toEqual({ kind: 'ok', data: { synced: 1, pendingItems: 2 }, pickedFirst: true })
    expect(t.openPicker).toHaveBeenCalledTimes(2)
  })

  it('code가 다른 409는 고르기를 열지 않고 실패다', async () => {
    const t = setup([json(409, { error: 'x', code: 'something_else' })], [])

    const result = await t.run()

    expect(result).toEqual({ kind: 'failed' })
    expect(t.openPicker).not.toHaveBeenCalled()
  })
})

describe('runSyncFlow — 200 + pendingItems', () => {
  it('고르기를 결과보다 먼저 연다', async () => {
    const t = setup([json(200, { synced: 2, pendingItems: 3 })], ['resolved'])

    const result = await t.run()

    expect(result).toEqual({ kind: 'ok', data: { synced: 2, pendingItems: 3 }, pickedFirst: true })
    expect(t.log).toEqual(['sync', 'loading:false', 'pick'])
  })

  it('«나중에»로 닫아도 결과로 이어진다', async () => {
    const t = setup([json(200, { synced: 2, pendingItems: 3 })], ['dismissed'])

    const result = await t.run()

    expect(result).toMatchObject({ kind: 'ok', pickedFirst: true })
  })

  it('pendingItems가 0이면 고르기를 열지 않는다', async () => {
    const t = setup([json(200, { synced: 2, pendingItems: 0 })], [])

    const result = await t.run()

    expect(result).toMatchObject({ kind: 'ok', pickedFirst: false })
    expect(t.openPicker).not.toHaveBeenCalled()
  })

  it('이전 응답(pendingItems 없음)은 기존 동작 그대로다', async () => {
    const t = setup([json(200, { synced: 2 })], [])

    const result = await t.run()

    expect(result).toEqual({ kind: 'ok', data: { synced: 2 }, pickedFirst: false })
    expect(t.openPicker).not.toHaveBeenCalled()
    expect(t.log).toEqual(['sync'])
  })
})

describe('runSyncFlow — 403 user_suspended (티켓 20261017_1426)', () => {
  const suspended = () => json(403, { error: 'x', code: USER_SUSPENDED_CODE })

  it('일반 실패가 아니라 suspended로 돌려주고 고르기를 열지 않는다', async () => {
    const t = setup([suspended()], [])

    await expect(t.run()).resolves.toEqual({ kind: 'suspended' })
    expect(t.fetchSync).toHaveBeenCalledTimes(1)
    expect(t.openPicker).not.toHaveBeenCalled()
  })

  it('고르기를 마친 뒤 다시 요청한 응답이 403 user_suspended여도 suspended다', async () => {
    const t = setup([blocked(), suspended()], ['resolved'])

    await expect(t.run()).resolves.toEqual({ kind: 'suspended' })
    expect(t.fetchSync).toHaveBeenCalledTimes(2)
  })

  it('code가 다른 403은 기존처럼 실패다', async () => {
    const t = setup([json(403, { error: 'x', code: 'forbidden' })], [])

    await expect(t.run()).resolves.toEqual({ kind: 'failed' })
  })

  it('본문이 없는 403도 실패다', async () => {
    const t = setup([new Response('', { status: 403 })], [])

    await expect(t.run()).resolves.toEqual({ kind: 'failed' })
  })
})

describe('runSyncFlow — 403 tribe_required (티켓 20261021_1247)', () => {
  const tribeRequired = () => json(403, { error: 'x', code: TRIBE_REQUIRED_CODE, redirectTo: '/onboarding' })

  it('일반 실패가 아니라 tribe_required로 돌려주고 고르기를 열지 않으며 다시 요청하지 않는다', async () => {
    const t = setup([tribeRequired()], [])

    await expect(t.run()).resolves.toEqual({ kind: 'tribe_required' })
    expect(t.fetchSync).toHaveBeenCalledTimes(1)
    expect(t.openPicker).not.toHaveBeenCalled()
  })

  it('고르기를 마친 뒤 다시 요청한 응답이 403 tribe_required여도 tribe_required다', async () => {
    const t = setup([blocked(), tribeRequired()], ['resolved'])

    await expect(t.run()).resolves.toEqual({ kind: 'tribe_required' })
    expect(t.fetchSync).toHaveBeenCalledTimes(2)
  })

  it('403 본문을 한 번만 읽어도 정지 403은 그대로 suspended로 가려진다(복제본으로 먼저 가린다)', async () => {
    const t = setup([json(403, { error: 'x', code: USER_SUSPENDED_CODE })], [])

    await expect(t.run()).resolves.toEqual({ kind: 'suspended' })
  })
})

describe('runSyncFlow — 실패', () => {
  it('실패 응답은 고르기 없이 failed다', async () => {
    const t = setup([json(500, { error: 'x' })], [])

    await expect(t.run()).resolves.toEqual({ kind: 'failed' })
    expect(t.openPicker).not.toHaveBeenCalled()
  })

  it('네트워크 오류는 던진다(호출부가 네트워크 오류 토스트로 처리한다)', async () => {
    const t = setup([], [])

    await expect(t.run()).rejects.toThrow()
  })
})
