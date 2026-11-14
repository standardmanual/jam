/**
 * 어드민 배지 삭제 화면의 참조 목록 — 믹스 레시피 첫 성공자 보상 배지(`combination_recipes.first_success_badge_id`) (티켓 20261114_1705 2회차)
 *
 * 고정하는 것:
 * - 첫 성공자 보상 칸이 참조 목록에 있다. 외래키는 `ON DELETE SET NULL`이라 삭제가 실패하지 않으므로 `blocksDelete`·`cascades`가 false이고,
 *   콘텐츠 연결 묶음이라 합계에 들어가 단건 하드 삭제 가드(`total > 0`이면 409)가 먼저 보이게 한다.
 * - `collectBadgeReferences`가 `.in('first_success_badge_id')`로 센다. 조회가 실패하면 fail-closed(`error`)다.
 * - 소프트 삭제 경고용 `countRecipesReferencingBadge`도 같은 칸을 센다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/badge-references-first-success.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'
import {
  BADGE_REFERENCE_SOURCES,
  BADGE_REFERENCE_SOURCE_BY_KEY,
  collectBadgeReferences,
} from '@/lib/admin/badge-references'
import { countRecipesReferencingBadge } from '@/lib/admin/recipe-references'

type ServiceClient = ReturnType<typeof createServiceClient>

function makeFake(counts: Record<string, number>, errors: Record<string, string> = {}) {
  const inCalls: Array<{ table: string; column: string }> = []
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      in: (column: string) => {
        inCalls.push({ table, column })
        return builder
      },
      order: () => builder,
      range: () => Promise.resolve({ data: [], error: null }),
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const error = errors[table] ? { message: errors[table] } : null
        return Promise.resolve({ count: counts[table] ?? 0, error }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  return { client: { from } as unknown as ServiceClient, inCalls }
}

describe('BADGE_REFERENCE_SOURCES — recipes_first_success', () => {
  it('첫 성공자 보상 칸이 콘텐츠 연결로 목록에 있고 삭제를 막지 않는다(SET NULL)', () => {
    const source = BADGE_REFERENCE_SOURCE_BY_KEY.get('recipes_first_success')

    expect(source?.location).toBe('combination_recipes.first_success_badge_id')
    expect(source?.group).toBe('content')
    expect(source?.blocksDelete).toBe(false)
    expect(source?.cascades).toBe(false)
    expect(source?.detachable).toBe(false)
    expect(BADGE_REFERENCE_SOURCES.filter((s) => s.key === 'recipes_first_success')).toHaveLength(1)
  })
})

describe('collectBadgeReferences — recipes_first_success', () => {
  it('first_success_badge_id로 세고 콘텐츠 연결 합계와 전체 합계에 넣는다(막는 참조·연쇄 삭제에는 넣지 않는다)', async () => {
    const { client, inCalls } = makeFake({ combination_recipes: 1 })
    const report = await collectBadgeReferences(client, ['badge-1'])

    expect(report.counts.recipes_first_success).toBe(1)
    expect(inCalls).toContainEqual({ table: 'combination_recipes', column: 'first_success_badge_id' })
    expect(report.contentTotal).toBe(1)
    expect(report.total).toBe(1)
    expect(report.blockingTotal).toBe(0)
    expect(report.cascadeTotal).toBe(0)
    expect(report.error).toBeNull()
  })

  it('참조가 없으면 0이다', async () => {
    const report = await collectBadgeReferences(makeFake({}).client, ['badge-1'])
    expect(report.counts.recipes_first_success).toBe(0)
  })

  it('조회가 실패하면 fail-closed(error)다', async () => {
    const report = await collectBadgeReferences(makeFake({}, { combination_recipes: 'db down' }).client, ['badge-1'])
    expect(report.error).toContain('recipes_first_success')
  })
})

describe('countRecipesReferencingBadge — 첫 성공자 보상', () => {
  function makeRecipeFake(result: { reward?: string[]; firstSuccess?: string[]; failFirstSuccess?: boolean }) {
    const from = (table: string) => {
      let mode: 'overlaps' | 'eq' | null = null
      const builder: Record<string, unknown> = {
        select: () => builder,
        overlaps: () => {
          mode = 'overlaps'
          return builder
        },
        eq: () => {
          mode = 'eq'
          return builder
        },
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
          if (table === 'combination_recipe_slots') return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
          if (mode === 'eq') {
            return Promise.resolve(
              result.failFirstSuccess
                ? { data: null, error: { message: 'boom' } }
                : { data: (result.firstSuccess ?? []).map((id) => ({ id })), error: null }
            ).then(onFulfilled, onRejected)
          }
          return Promise.resolve({ data: (result.reward ?? []).map((id) => ({ id })), error: null }).then(onFulfilled, onRejected)
        },
      }
      return builder
    }
    return { from } as unknown as ServiceClient
  }

  it('첫 성공자 보상으로 가리키는 레시피를 세어 합계에 넣는다', async () => {
    const report = await countRecipesReferencingBadge(makeRecipeFake({ reward: ['r1'], firstSuccess: ['r2'] }), 'badge-1')

    expect(report.rewardRecipeIds).toEqual(['r1'])
    expect(report.firstSuccessRecipeIds).toEqual(['r2'])
    expect(report.total).toBe(2)
    expect(report.error).toBeNull()
  })

  it('조회가 실패하면 error를 채우고 합계를 0으로 돌려준다', async () => {
    const report = await countRecipesReferencingBadge(makeRecipeFake({ failFirstSuccess: true }), 'badge-1')

    expect(report.error).toBe('boom')
    expect(report.total).toBe(0)
    expect(report.firstSuccessRecipeIds).toEqual([])
  })
})
