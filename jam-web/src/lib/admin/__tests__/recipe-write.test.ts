/**
 * 믹스 레시피 저장 — 슬롯 타입 일치 + **보상 배지는 아이템 배지만** (티켓 20260917_1427)
 *
 * 보상 배지를 아이템 배지로 제한하는 이유: 엔진의 배지 지급 경로가 `inventory_items` 개체
 * 생성 하나뿐이라, 액티비티·체크인 배지를 보상으로 두면 인벤토리에는 개체가 생기지만
 * 각 타입의 획득 기록 테이블에는 남지 않아 데이터가 어긋난다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/recipe-write.test.ts
 */
import { describe, it, expect } from 'vitest'
import { buildRecipeRow } from '../recipe-write'
import type { createServiceClient } from '@/lib/supabase/server'

const ITEM_A = 'badge-item-a'
const ITEM_B = 'badge-item-b'
const ACT = 'badge-activity'
const CHK = 'badge-checkin'
const REWARD_ITEM = 'badge-reward-item'

const TYPE_BY_ID: Record<string, string> = {
  [ITEM_A]: 'item',
  [ITEM_B]: 'item',
  [ACT]: 'activity',
  [CHK]: 'checkin',
  [REWARD_ITEM]: 'item',
}

/** `.from('badges').select().in(ids).is()`만 쓰는 호출부에 맞춘 최소 스텁. */
function makeClient() {
  let requested: string[] = []
  const builder = {
    select: () => builder,
    in: (_col: string, ids: string[]) => {
      requested = ids
      return builder
    },
    is: () => builder,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({
        data: requested
          .filter((id) => TYPE_BY_ID[id])
          .map((id) => ({ id, type: TYPE_BY_ID[id] })),
        error: null,
      }).then(onFulfilled, onRejected),
  } as Record<string, unknown>
  return { from: () => builder } as unknown as ReturnType<typeof createServiceClient>
}

function itemSlot(ids: string[]) {
  return { badge_type: 'item', allowed_badge_ids: ids }
}
function activitySlot(ids: string[]) {
  return { badge_type: 'activity', allowed_badge_ids: ids }
}
function checkinSlot(ids: string[]) {
  return { badge_type: 'checkin', allowed_badge_ids: ids }
}

describe('buildRecipeRow — 슬롯 타입 일치 + 보상 배지는 아이템 배지만 허용', () => {
  it('아이템·액티비티·체크인 슬롯이 섞여 있어도 각 슬롯 타입이 일치하면 통과한다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '테스트 레시피',
      slots: [itemSlot([ITEM_A, ITEM_B]), activitySlot([ACT]), checkinSlot([CHK])],
      reward_points: 50,
      reward_badge_ids: [REWARD_ITEM],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.slots).toEqual([
        { slot_order: 0, badge_type: 'item', allowed_badge_ids: [ITEM_A, ITEM_B] },
        { slot_order: 1, badge_type: 'activity', allowed_badge_ids: [ACT] },
        { slot_order: 2, badge_type: 'checkin', allowed_badge_ids: [CHK] },
      ])
      expect(result.row.reward_points).toBe(50)
      expect(result.row.reward_badge_ids).toEqual([REWARD_ITEM])
    }
  })

  it('슬롯이 선언한 타입과 실제 배지 타입이 다르면 거부한다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '테스트 레시피',
      // ACT는 실제로 activity 타입인데 item 슬롯에 넣음
      slots: [itemSlot([ITEM_A, ACT]), activitySlot([CHK])],
      reward_points: 10,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('아이템 배지만')
  })

  it('아이템 타입 슬롯이 하나도 없으면 거부한다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '테스트 레시피',
      slots: [activitySlot([ACT]), checkinSlot([CHK])],
      reward_points: 10,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('아이템 타입 슬롯')
  })

  it('액티비티 배지를 보상으로 지정하면 거부하고 사유를 돌려준다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '테스트 레시피',
      slots: [itemSlot([ITEM_A]), itemSlot([ITEM_B])],
      reward_badge_ids: [ACT],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('아이템 배지만')
  })

  it('체크인 배지를 보상으로 지정해도 거부한다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '테스트 레시피',
      slots: [itemSlot([ITEM_A]), itemSlot([ITEM_B])],
      reward_points: 10,
      reward_badge_ids: [REWARD_ITEM, CHK],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('아이템 배지만')
  })

  it('삭제되었거나 존재하지 않는 슬롯 후보 배지가 있으면 거부한다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '테스트 레시피',
      slots: [itemSlot(['ghost-badge']), itemSlot([ITEM_B])],
      reward_points: 10,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('삭제되었거나 존재하지 않는')
  })
})
