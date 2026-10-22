/**
 * 캡슐에서 나온 개체 가르기 시험 (티켓 20261022_1021)
 *
 * 프로필이 피드 행이 없는 개체를 «아이템 드랍» 카드로 합성할 때, 캡슐로 발급한 개체를 빼는 데 쓰는 조회다.
 * 실행: cd jam-web && npx vitest run src/lib/activity-feed/__tests__/capsuleItems.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchCapsuleIssuedItemIds } from '../capsuleItems'

type Result = { data: { inventory_item_id: string | null }[] | null; error: unknown }

function fakeService(result: Result) {
  const eq = vi.fn(async () => result)
  const inFn = vi.fn(() => ({ eq }))
  const select = vi.fn(() => ({ in: inFn }))
  const from = vi.fn(() => ({ select }))
  return { service: { from } as never, from, select, inFn, eq }
}

afterEach(() => vi.restoreAllMocks())

describe('fetchCapsuleIssuedItemIds', () => {
  it('개체가 없으면 조회하지 않고 빈 집합을 돌려준다', async () => {
    const { service, from } = fakeService({ data: [], error: null })

    expect((await fetchCapsuleIssuedItemIds(service, [])).size).toBe(0)
    expect((await fetchCapsuleIssuedItemIds(service, ['']) ).size).toBe(0)
    expect(from).not.toHaveBeenCalled()
  })

  it("발급 기록의 경로가 'capsule'인 개체만 묻고, 개체 id는 중복 없이 넘긴다", async () => {
    const { service, from, select, inFn, eq } = fakeService({ data: [{ inventory_item_id: 'item-2' }], error: null })

    const ids = await fetchCapsuleIssuedItemIds(service, ['item-1', 'item-2', 'item-1'])

    expect(from).toHaveBeenCalledWith('item_issue_log')
    expect(select).toHaveBeenCalledWith('inventory_item_id')
    expect(inFn).toHaveBeenCalledWith('inventory_item_id', ['item-1', 'item-2'])
    expect(eq).toHaveBeenCalledWith('route', 'capsule')
    expect([...ids]).toEqual(['item-2'])
  })

  it('개체 연결이 끊긴 기록(inventory_item_id가 비어 있음)은 집합에 넣지 않는다', async () => {
    const { service } = fakeService({ data: [{ inventory_item_id: null }, { inventory_item_id: 'item-3' }], error: null })

    expect([...(await fetchCapsuleIssuedItemIds(service, ['item-3']))]).toEqual(['item-3'])
  })

  it('조회가 실패하면 던지지 않고 빈 집합을 돌려주며 서버 로그를 남긴다', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { service } = fakeService({ data: null, error: { message: 'boom' } })

    expect((await fetchCapsuleIssuedItemIds(service, ['item-4'])).size).toBe(0)
    expect(errorLog).toHaveBeenCalledTimes(1)
  })
})
