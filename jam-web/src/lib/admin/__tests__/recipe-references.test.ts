/**
 * 레시피 삭제 가드 — 투데이 카드 `recipe_id` 참조(삭제를 막지 않는 안내 건수, 티켓 20261006_1218).
 * 배지 조건 참조는 «가장 먼저 성공» 조건을 없애면서 걷었다(티켓 20261114_1705 4회차) — 지금 삭제를 막는 참조는 없다.
 * DB는 기록형 스텁이다. 실제 조회는 하지 않는다.
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/recipe-references.test.ts
 */
import { collectRecipeReferences, collectRecipeDeletionCandidates } from '../recipe-references'
import {
  classifyRecipeDeletion,
  recipeDeleteBlockedMessage,
  recipeCardNoticeMessage,
  cancelReleaseConfirmMessage,
} from '../recipe-bulk'

interface CardCall {
  column: string
  ids: string[]
}

/**
 * `combination_recipes`(이름 조회)와 `today_cards`(참조 집계)만 흉내 낸다. 다른 테이블을 조회하면 던진다.
 * `cardsByRecipeId`는 레시피 id별로 그 레시피를 가리키는 카드 수를 정한다.
 */
function createStubSupabase(options: {
  recipes?: { id: string; name: string }[]
  cardsByRecipeId?: Record<string, number>
  failCards?: boolean
}) {
  const { recipes = [], cardsByRecipeId = {}, failCards = false } = options
  const cardCalls: CardCall[] = []

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
      if (table === 'today_cards') {
        return {
          select: () => ({
            in: async (column: string, ids: string[]) => {
              cardCalls.push({ column, ids })
              if (failCards) return { count: null, error: { message: 'today_cards 조회 실패' } }
              return { count: ids.reduce((sum, id) => sum + (cardsByRecipeId[id] ?? 0), 0), error: null }
            },
          }),
        }
      }
      throw new Error(`예상하지 못한 테이블: ${table}`)
    },
  }

  return { client: client as unknown as Parameters<typeof collectRecipeReferences>[0], cardCalls }
}

describe('collectRecipeReferences', () => {
  it('주소로 들어온 대문자 id도 소문자로 맞춰 센다', async () => {
    const { client, cardCalls } = createStubSupabase({ cardsByRecipeId: { r1: 1 } })

    const result = await collectRecipeReferences(client, ['R1'])

    expect(result.noticeTotal).toBe(1)
    expect(cardCalls[0].ids).toEqual(['r1'])
  })

  it('가리키는 카드가 없으면 0건이다', async () => {
    const { client } = createStubSupabase({})
    expect(await collectRecipeReferences(client, ['r1'])).toEqual({
      blockingTotal: 0,
      cascadeTotal: 0,
      total: 0,
      noticeTotal: 0,
      error: null,
    })
  })

  it('레시피 공개 카드가 가리키면 noticeTotal로만 세고 삭제를 막는 total은 늘지 않는다(어드민 삭제는 막지 않는다, 티켓 20261006_1218 가정 B)', async () => {
    const { client, cardCalls } = createStubSupabase({ cardsByRecipeId: { r1: 3 } })

    const result = await collectRecipeReferences(client, ['R1'])

    expect(result).toEqual({ blockingTotal: 0, cascadeTotal: 0, total: 0, noticeTotal: 3, error: null })
    expect(cardCalls).toEqual([{ column: 'recipe_id', ids: ['r1'] }])
  })

  it('빈 목록은 조회 없이 0건이다', async () => {
    const { client, cardCalls } = createStubSupabase({})
    expect((await collectRecipeReferences(client, [])).total).toBe(0)
    expect(cardCalls).toHaveLength(0)
  })

  it('id가 많으면 80개씩 나눠 조회하고 합산한다', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `r${i}`)
    const { client, cardCalls } = createStubSupabase({ cardsByRecipeId: { r0: 1, r50: 4, r199: 3 } })

    const result = await collectRecipeReferences(client, ids)

    expect(cardCalls.map((c) => c.ids.length)).toEqual([80, 80, 40])
    expect(result.total).toBe(0)
    expect(result.noticeTotal).toBe(8)
  })

  it('카드 조회가 실패해도 0건이 아니라 error를 돌려준다(fail-closed, 운영툴 취소가 막힌다)', async () => {
    const { client } = createStubSupabase({ failCards: true })

    const result = await collectRecipeReferences(client, ['r1'])

    expect(result).toEqual({ blockingTotal: 0, cascadeTotal: 0, total: 0, noticeTotal: 0, error: 'today_cards 조회 실패' })
  })
})

describe('collectRecipeDeletionCandidates', () => {
  const recipes = [
    { id: 'r1', name: '믹스 A' },
    { id: 'r2', name: '믹스 B' },
    { id: 'r3', name: '믹스 C' },
  ]

  it('참조가 없으면 한 번의 묶음 조회로 전원 0건이 된다', async () => {
    const { client, cardCalls } = createStubSupabase({ recipes })

    const lookup = await collectRecipeDeletionCandidates(client, ['r1', 'r2', 'r3'])

    expect(lookup.error).toBeNull()
    expect([...lookup.candidates.values()].map((c) => c.total)).toEqual([0, 0, 0])
    expect(cardCalls).toHaveLength(1)
  })

  it('레시피 공개 카드만 가리키는 레시피는 일괄 삭제에서 건너뛰지 않는다(카드는 레시피 줄만 비운다)', async () => {
    const { client } = createStubSupabase({ recipes, cardsByRecipeId: { r2: 5 } })

    const lookup = await collectRecipeDeletionCandidates(client, ['r1', 'r2', 'r3'])
    const { deletable, skipped } = classifyRecipeDeletion(['r1', 'r2', 'r3'], lookup.candidates)

    expect(lookup.error).toBeNull()
    expect(deletable).toEqual(['r1', 'r2', 'r3'])
    expect(skipped).toEqual([])
  })

  it('참조 조회가 실패하면 error를 돌려준다(호출부는 삭제를 막는다)', async () => {
    const { client } = createStubSupabase({ recipes, failCards: true })

    const lookup = await collectRecipeDeletionCandidates(client, ['r1', 'r2'])

    expect(lookup.error).toBe('today_cards 조회 실패')
    expect(lookup.allNoticeTotal).toBeNull()
  })

  describe('홈 카드 수(noticeTotal)를 같은 조회에서 함께 돌려준다(티켓 20261006_1406)', () => {
    it('막는 참조가 없으면 전체를 한 번 센 카드 수를 돌려주고 참조를 더 조회하지 않는다', async () => {
      const { client, cardCalls } = createStubSupabase({ recipes, cardsByRecipeId: { r1: 2, r3: 4 } })

      const lookup = await collectRecipeDeletionCandidates(client, ['r1', 'r2', 'r3'])

      expect(lookup.error).toBeNull()
      expect(lookup.allNoticeTotal).toBe(6)
      expect(cardCalls).toHaveLength(1)
    })

    it('전체를 한 번에 센 경우 후보별 카드 수는 0장이 아니라 null이다(레시피별로 셀 수 없다, 티켓 20261006_1427)', async () => {
      const { client } = createStubSupabase({ recipes, cardsByRecipeId: { r1: 2, r3: 4 } })

      const lookup = await collectRecipeDeletionCandidates(client, ['r1', 'r2', 'r3'])

      expect([...lookup.candidates.values()].map((c) => [c.id, c.noticeTotal])).toEqual([
        ['r1', null],
        ['r2', null],
        ['r3', null],
      ])
    })

    it('카드가 없으면 전체 카드 수는 0이다', async () => {
      const { client } = createStubSupabase({ recipes })

      const lookup = await collectRecipeDeletionCandidates(client, ['r1', 'r2', 'r3'])

      expect(lookup.allNoticeTotal).toBe(0)
      expect([...lookup.candidates.values()].map((c) => c.noticeTotal)).toEqual([null, null, null])
    })

    it('찾은 레시피가 없으면 참조를 조회하지 않는다', async () => {
      const { client, cardCalls } = createStubSupabase({ recipes: [] })

      const lookup = await collectRecipeDeletionCandidates(client, ['ghost'])

      expect(lookup.error).toBeNull()
      expect(lookup.candidates.size).toBe(0)
      expect(cardCalls).toHaveLength(0)
    })
  })
})

describe('recipeDeleteBlockedMessage', () => {
  it('가리키는 배지 수를 문장에 넣는다(막는 참조를 다시 더하면 문구도 함께 고친다)', () => {
    expect(recipeDeleteBlockedMessage(2)).toContain('이 레시피를 가리키는 배지가 2개 있어요')
  })
})

describe('recipeCardNoticeMessage', () => {
  it('카드가 있으면 장수를 넣은 안내 문장을 돌려준다', () => {
    expect(recipeCardNoticeMessage(2)).toBe('홈 카드 2장이 이 레시피를 가리켜요. 지우면 그 카드는 레시피 정보 없이 남아요.')
  })

  it('0장이면 문구가 없다', () => {
    expect(recipeCardNoticeMessage(0)).toBeNull()
  })

  it('음수·NaN처럼 세지 못한 값에도 문구를 내지 않는다', () => {
    expect(recipeCardNoticeMessage(-1)).toBeNull()
    expect(recipeCardNoticeMessage(Number.NaN)).toBeNull()
  })

  it('일괄 삭제는 여러 레시피를 가리키는 「지울 레시피를」 표현을 쓴다', () => {
    expect(recipeCardNoticeMessage(5, 'bulk')).toBe('홈 카드 5장이 지울 레시피를 가리켜요. 지우면 그 카드는 레시피 정보 없이 남아요.')
  })

  it('대상을 정하지 않으면 레시피 하나를 가리키는 「이 레시피를」 표현이다', () => {
    expect(recipeCardNoticeMessage(5)).toBe(recipeCardNoticeMessage(5, 'single'))
    expect(recipeCardNoticeMessage(5, 'single')).toContain('이 레시피를 가리켜요')
  })

  it('일괄 삭제 표현도 0장·음수·NaN이면 문구가 없다', () => {
    expect(recipeCardNoticeMessage(0, 'bulk')).toBeNull()
    expect(recipeCardNoticeMessage(-1, 'bulk')).toBeNull()
    expect(recipeCardNoticeMessage(Number.NaN, 'bulk')).toBeNull()
  })
})

describe('cancelReleaseConfirmMessage', () => {
  it('카드가 0장이면 삭제 경고만 남는다', () => {
    expect(cancelReleaseConfirmMessage(0)).toBe('취소하면 이 레시피가 삭제돼요. 되돌릴 수 없어요.')
  })

  it('카드가 있으면 삭제 경고 아래 빈 줄을 두고 「이 레시피를」 안내를 잇는다', () => {
    expect(cancelReleaseConfirmMessage(2)).toBe(
      '취소하면 이 레시피가 삭제돼요. 되돌릴 수 없어요.\n\n홈 카드 2장이 이 레시피를 가리켜요. 지우면 그 카드는 레시피 정보 없이 남아요.'
    )
  })
})
