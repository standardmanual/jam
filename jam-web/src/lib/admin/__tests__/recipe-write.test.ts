/**
 * 믹스 레시피 저장 — 재료 타입 자동 분류 + **보상 배지는 아이템 배지만** (티켓 20260910_1408)
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

describe('buildRecipeRow — 보상 배지는 아이템 배지만 허용', () => {
  it('아이템 배지 보상은 통과하고 재료는 타입별로 분리 저장된다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      badge_ids: [ITEM_A, ACT, ITEM_B, CHK],
      reward_points: 50,
      reward_badge_ids: [REWARD_ITEM],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.ingredient_badge_ids).toEqual([ITEM_A, ITEM_B])
      expect(result.row.required_badge_ids).toEqual([ACT, CHK])
      expect(result.row.reward_points).toBe(50)
      expect(result.row.reward_badge_ids).toEqual([REWARD_ITEM])
    }
  })

  it('액티비티 배지를 보상으로 지정하면 거부하고 사유를 돌려준다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      badge_ids: [ITEM_A, ITEM_B],
      reward_badge_ids: [ACT],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('아이템 배지만')
  })

  it('체크인 배지를 보상으로 지정해도 거부한다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      badge_ids: [ITEM_A, ITEM_B],
      reward_points: 10,
      reward_badge_ids: [REWARD_ITEM, CHK],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('아이템 배지만')
  })
})
