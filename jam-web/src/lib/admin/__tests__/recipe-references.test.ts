/**
 * 레시피 삭제 가드 — 배지 조건 `recipe_first_success.recipe_id` 참조 집계 (티켓 20261001_1200)
 * DB는 기록형 스텁이다. 실제 조회는 하지 않는다.
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/recipe-references.test.ts
 */
import { collectRecipeReferences, collectRecipeDeletionCandidates } from '../recipe-references'
import { classifyRecipeDeletion, recipeDeleteBlockedMessage } from '../recipe-bulk'

const PATH = 'condition_json->recipe_first_success->>recipe_id'

interface BadgeCall {
  column: string
  ids: string[]
  deletedAtIsNull: boolean
}

/**
 * `combination_recipes`(이름 조회)와 `badges`(참조 집계)만 흉내 낸다.
 * `badgesByRecipeId`는 레시피 id별로 그 레시피를 가리키는 배지 수를 정한다.
 */
function createStubSupabase(options: {
  recipes?: { id: string; name: string }[]
  badgesByRecipeId?: Record<string, number>
  failBadges?: boolean
}) {
  const { recipes = [], badgesByRecipeId = {}, failBadges = false } = options
  const badgeCalls: BadgeCall[] = []

  const client = {
    from(table: string) {
      if (table === 'combination_recipes') {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: recipes.filter((r) => ids.includes(r.id)),
              error: null,
            }),
          }),
        }
      }
      if (table === 'badges') {
        return {
          select: () => {
            const call: BadgeCall = { column: '', ids: [], deletedAtIsNull: false }
            const builder = {
              is: (col: string, value: unknown) => {
                if (col === 'deleted_at' && value === null) call.deletedAtIsNull = true
                return builder
              },
              in: async (column: string, ids: string[]) => {
                call.column = column
                call.ids = ids
                badgeCalls.push(call)
                if (failBadges) return { count: null, error: { message: 'badges 조회 실패' } }
                return { count: ids.reduce((sum, id) => sum + (badgesByRecipeId[id] ?? 0), 0), error: null }
              },
            }
            return builder
          },
        }
      }
      throw new Error(`예상하지 못한 테이블: ${table}`)
    },
  }

  return { client: client as unknown as Parameters<typeof collectRecipeReferences>[0], badgeCalls }
}

describe('collectRecipeReferences', () => {
  it('삭제되지 않은 배지가 조건 JSON 경로로 레시피를 가리키면 그 수를 센다', async () => {
    const { client, badgeCalls } = createStubSupabase({ badgesByRecipeId: { r1: 2 } })

    const result = await collectRecipeReferences(client, ['r1'])

    expect(result).toEqual({ blockingTotal: 2, cascadeTotal: 0, total: 2, error: null })
    expect(badgeCalls).toHaveLength(1)
    expect(badgeCalls[0]).toMatchObject({ column: PATH, ids: ['r1'], deletedAtIsNull: true })
  })

  it('가리키는 배지가 없으면 0건이다', async () => {
    const { client } = createStubSupabase({})
    expect(await collectRecipeReferences(client, ['r1'])).toEqual({
      blockingTotal: 0,
      cascadeTotal: 0,
      total: 0,
      error: null,
    })
  })

  it('빈 목록은 조회 없이 0건이다', async () => {
    const { client, badgeCalls } = createStubSupabase({})
    expect((await collectRecipeReferences(client, [])).total).toBe(0)
    expect(badgeCalls).toHaveLength(0)
  })

  it('id가 많으면 80개씩 나눠 조회하고 합산한다', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `r${i}`)
    const { client, badgeCalls } = createStubSupabase({ badgesByRecipeId: { r0: 1, r100: 2, r199: 3 } })

    const result = await collectRecipeReferences(client, ids)

    expect(badgeCalls.map((c) => c.ids.length)).toEqual([80, 80, 40])
    expect(result.total).toBe(6)
  })

  it('조회가 실패하면 0건이 아니라 error를 돌려준다(fail-closed)', async () => {
    const { client } = createStubSupabase({ failBadges: true })

    const result = await collectRecipeReferences(client, ['r1'])

    expect(result.error).toBe('badges 조회 실패')
    expect(result.total).toBe(0)
  })
})

describe('collectRecipeDeletionCandidates', () => {
  const recipes = [
    { id: 'r1', name: '믹스 A' },
    { id: 'r2', name: '믹스 B' },
    { id: 'r3', name: '믹스 C' },
  ]

  it('참조가 없으면 한 번의 묶음 조회로 전원 0건이 된다', async () => {
    const { client, badgeCalls } = createStubSupabase({ recipes })

    const lookup = await collectRecipeDeletionCandidates(client, ['r1', 'r2', 'r3'])

    expect(lookup.error).toBeNull()
    expect([...lookup.candidates.values()].map((c) => c.total)).toEqual([0, 0, 0])
    expect(badgeCalls).toHaveLength(1)
  })

  it('가리키는 배지가 있는 레시피만 막히고, 일괄 분류는 그 레시피를 건너뛴다', async () => {
    const { client } = createStubSupabase({ recipes, badgesByRecipeId: { r2: 3 } })

    const lookup = await collectRecipeDeletionCandidates(client, ['r1', 'r2', 'r3'])
    const { deletable, skipped } = classifyRecipeDeletion(['r1', 'r2', 'r3'], lookup.candidates)

    expect(lookup.error).toBeNull()
    expect(deletable).toEqual(['r1', 'r3'])
    expect(skipped).toEqual([{ id: 'r2', label: '믹스 B', reason: recipeDeleteBlockedMessage(3) }])
  })

  it('참조 조회가 실패하면 error를 돌려준다(호출부는 삭제를 막는다)', async () => {
    const { client } = createStubSupabase({ recipes, failBadges: true })

    const lookup = await collectRecipeDeletionCandidates(client, ['r1', 'r2'])

    expect(lookup.error).toBe('badges 조회 실패')
  })
})

describe('recipeDeleteBlockedMessage', () => {
  it('가리키는 배지 수를 문장에 넣는다', () => {
    expect(recipeDeleteBlockedMessage(2)).toContain('이 레시피를 가리키는 배지가 2개 있어요')
  })
})
