/**
 * 믹스 레시피 저장 — 슬롯 타입 일치 + **보상 배지는 아이템 배지만** (티켓 20260917_1427)
 *
 * 보상 배지를 아이템 배지로 제한하는 이유: 엔진의 배지 지급 경로가 `inventory_items` 개체
 * 생성 하나뿐이라, 액티비티·체크인 배지를 보상으로 두면 인벤토리에는 개체가 생기지만
 * 각 타입의 획득 기록 테이블에는 남지 않아 데이터가 어긋난다.
 *
 * 티켓 20261001_1158: 공개 시각 — 생성(`createRecipeWithSlots`), 예약 취소(`cancelScheduledRecipe`),
 * 시각 변경 가드(`assertValidFromChange`)를 함께 검증한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/recipe-write.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  assertValidFromChange,
  buildRecipeRow,
  cancelScheduledRecipe,
  createRecipeWithSlots,
  recipeReleaseState,
} from '../recipe-write'
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

/** `.from('badges').select().in(ids).is()`만 쓰는 호출부에 맞춘 최소 배지 조회 빌더. */
function makeBadgesBuilder() {
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
  return builder
}

function makeClient() {
  const builder = makeBadgesBuilder()
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

describe('buildRecipeRow — 공개 시각(valid_from)', () => {
  const NOW = new Date('2026-10-01T00:00:00Z')
  const base = { name: '테스트 레시피', slots: [itemSlot([ITEM_A]), activitySlot([ACT])], reward_points: 10 }

  it('제출하지 않으면 행에 valid_from 키를 넣지 않는다(수정 때 기존 값을 건드리지 않는다)', async () => {
    const result = await buildRecipeRow(makeClient(), base, NOW)

    expect(result.ok).toBe(true)
    if (result.ok) expect('valid_from' in result.row).toBe(false)
  })

  it('미래 시각이면 UTC ISO로, null이면 null로 행에 넣는다', async () => {
    const scheduled = await buildRecipeRow(makeClient(), { ...base, valid_from: '2026-10-05T09:00:00+09:00' }, NOW)
    const immediate = await buildRecipeRow(makeClient(), { ...base, valid_from: null }, NOW)

    expect(scheduled.ok && scheduled.row.valid_from).toBe('2026-10-05T00:00:00.000Z')
    expect(immediate.ok && immediate.row.valid_from).toBeNull()
  })

  it('과거 시각이면 거부한다', async () => {
    const result = await buildRecipeRow(makeClient(), { ...base, valid_from: '2026-09-30T00:00:00Z' }, NOW)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('이미 지났어요')
  })
})

describe('createRecipeWithSlots — 행 + 슬롯 생성', () => {
  const NOW = new Date('2026-10-01T00:00:00Z')
  const body = {
    name: '테스트 레시피',
    slots: [itemSlot([ITEM_A]), activitySlot([ACT])],
    reward_points: 10,
  }

  function makeWriteClient(opts: { insertError?: string; slotInsertError?: string } = {}) {
    const calls = {
      recipeInserts: [] as Record<string, unknown>[],
      slotInserts: [] as unknown[],
      recipeDeletes: [] as string[],
    }
    const badges = makeBadgesBuilder()
    const client = {
      from: (table: string) => {
        if (table === 'badges') return badges
        if (table === 'combination_recipes') {
          return {
            insert: (row: Record<string, unknown>) => {
              calls.recipeInserts.push(row)
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve(
                      opts.insertError
                        ? { data: null, error: { message: opts.insertError } }
                        : { data: { id: 'new-recipe', created_at: '2026-10-01T00:00:00Z', ...row }, error: null }
                    ),
                }),
              }
            },
            delete: () => ({
              eq: (_column: string, id: string) => {
                calls.recipeDeletes.push(id)
                return Promise.resolve({ error: null })
              },
            }),
          }
        }
        return {
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          insert: (rows: unknown) => {
            calls.slotInserts.push(rows)
            return Promise.resolve({ error: opts.slotInsertError ? { message: opts.slotInsertError } : null })
          },
        }
      },
    }
    return { client: client as unknown as ReturnType<typeof createServiceClient>, calls }
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('예약 시각과 함께 행·슬롯을 저장하고 만든 레시피를 돌려준다', async () => {
    const { client, calls } = makeWriteClient()

    const result = await createRecipeWithSlots(client, { ...body, valid_from: '2026-10-05T09:00:00+09:00' }, NOW)

    expect(result.ok).toBe(true)
    expect(calls.recipeInserts).toHaveLength(1)
    expect(calls.recipeInserts[0].valid_from).toBe('2026-10-05T00:00:00.000Z')
    expect(calls.slotInserts).toHaveLength(1)
    if (result.ok) {
      expect(result.recipe.id).toBe('new-recipe')
      expect(result.slots).toHaveLength(2)
    }
  })

  it('공개 시각을 비우면 행에 valid_from을 넣지 않아 바로 공개(DB 기본값 null)다', async () => {
    const { client, calls } = makeWriteClient()

    const result = await createRecipeWithSlots(client, body, NOW)

    expect(result.ok).toBe(true)
    expect('valid_from' in calls.recipeInserts[0]).toBe(false)
  })

  it('과거 시각이면 400으로 거절하고 아무것도 저장하지 않는다', async () => {
    const { client, calls } = makeWriteClient()

    const result = await createRecipeWithSlots(client, { ...body, valid_from: '2026-09-01T09:00:00+09:00' }, NOW)

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(calls.recipeInserts).toHaveLength(0)
    expect(calls.slotInserts).toHaveLength(0)
  })

  it('슬롯 저장이 실패하면 방금 만든 행을 지우고 500을 돌려준다(반쪽 상태 방지)', async () => {
    const { client, calls } = makeWriteClient({ slotInsertError: 'slot insert failed' })

    const result = await createRecipeWithSlots(client, body, NOW)

    expect(result).toMatchObject({ ok: false, status: 500 })
    expect(calls.recipeDeletes).toEqual(['new-recipe'])
  })

  it('행 저장이 실패하면 500이고 슬롯은 저장하지 않는다', async () => {
    const { client, calls } = makeWriteClient({ insertError: 'insert failed' })

    const result = await createRecipeWithSlots(client, body, NOW)

    expect(result).toMatchObject({ ok: false, status: 500 })
    expect(calls.slotInserts).toHaveLength(0)
  })
})

describe('cancelScheduledRecipe — 공개 전 취소(= 삭제)', () => {
  const NOW = new Date('2026-10-01T00:00:00Z')
  const ID = '11111111-1111-4111-8111-111111111111'
  const FUTURE = '2026-10-05T00:00:00.000Z'
  const PAST = '2026-09-01T00:00:00.000Z'

  const state = {
    /** id → valid_from (행이 없으면 키가 없다) */
    recipes: new Map<string, string | null>(),
    badgeCount: 0,
    badgeError: null as { message: string } | null,
    deleteError: null as { message: string } | null,
    /** DELETE에 실린 `.gt('valid_from', …)` 값 */
    deleteGt: [] as string[],
    deleteCalls: 0,
  }

  /**
   * 메모리 스텁 — 삭제는 `.gt('valid_from', x)` 조건을 실제로 적용한다(null 행·경계 시각은 지워지지 않는다).
   * 조건이 빠지면 공개된 행이 지워져 테스트가 깨진다.
   */
  function makeCancelClient() {
    return {
      from: (table: string) => {
        if (table === 'badges') {
          const builder = {
            is: () => builder,
            in: () =>
              Promise.resolve(
                state.badgeError ? { count: null, error: state.badgeError } : { count: state.badgeCount, error: null }
              ),
          }
          return { select: () => builder }
        }
        return {
          delete: () => {
            state.deleteCalls += 1
            let id = ''
            return {
              eq: (_column: string, value: string) => {
                id = value
                return {
                  gt: (_col: string, threshold: string) => {
                    state.deleteGt.push(threshold)
                    return {
                      select: () => {
                        if (state.deleteError) return Promise.resolve({ data: null, error: state.deleteError })
                        const validFrom = state.recipes.get(id)
                        const matches = validFrom != null && Date.parse(validFrom) > Date.parse(threshold)
                        if (matches) state.recipes.delete(id)
                        return Promise.resolve({ data: matches ? [{ id }] : [], error: null })
                      },
                    }
                  },
                }
              },
            }
          },
          select: () => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: () =>
                Promise.resolve({ data: state.recipes.has(value) ? { id: value } : null, error: null }),
            }),
          }),
        }
      },
    } as unknown as ReturnType<typeof createServiceClient>
  }

  beforeEach(() => {
    state.recipes = new Map()
    state.badgeCount = 0
    state.badgeError = null
    state.deleteError = null
    state.deleteGt = []
    state.deleteCalls = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('예약 중 레시피는 지우고 성공한다 — DELETE 한 번에 valid_from > now 조건을 건다', async () => {
    state.recipes.set(ID, FUTURE)

    const result = await cancelScheduledRecipe(makeCancelClient(), ID, NOW)

    expect(result).toEqual({ ok: true })
    expect(state.recipes.has(ID)).toBe(false)
    expect(state.deleteCalls).toBe(1)
    expect(state.deleteGt).toEqual([NOW.toISOString()])
  })

  it('공개 시각이 지난 레시피는 409로 거절하고 지우지 않는다', async () => {
    state.recipes.set(ID, PAST)

    const result = await cancelScheduledRecipe(makeCancelClient(), ID, NOW)

    expect(result).toMatchObject({ ok: false, status: 409 })
    if (!result.ok) expect(result.error).toContain('이미 공개된')
    expect(state.recipes.has(ID)).toBe(true)
  })

  it('공개 시각이 정확히 지금인 레시피도 공개된 것으로 보고 지우지 않는다(경계 포함)', async () => {
    state.recipes.set(ID, NOW.toISOString())

    const result = await cancelScheduledRecipe(makeCancelClient(), ID, NOW)

    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(state.recipes.has(ID)).toBe(true)
  })

  it('valid_from이 없는(처음부터 공개된) 레시피는 409로 거절하고 지우지 않는다', async () => {
    state.recipes.set(ID, null)

    const result = await cancelScheduledRecipe(makeCancelClient(), ID, NOW)

    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(state.recipes.has(ID)).toBe(true)
  })

  it('없는 레시피는 404다', async () => {
    const result = await cancelScheduledRecipe(makeCancelClient(), ID, NOW)

    expect(result).toMatchObject({ ok: false, status: 404 })
  })

  it('uuid 형식이 아닌 id는 DB에 묻지 않고 404다', async () => {
    const result = await cancelScheduledRecipe(makeCancelClient(), 'not-a-uuid', NOW)

    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(state.deleteCalls).toBe(0)
  })

  it('배지 조건이 가리키는 레시피는 예약 중이어도 삭제 가드가 막는다(409, 삭제 시도 없음)', async () => {
    state.recipes.set(ID, FUTURE)
    state.badgeCount = 2

    const result = await cancelScheduledRecipe(makeCancelClient(), ID, NOW)

    expect(result).toMatchObject({ ok: false, status: 409 })
    if (!result.ok) expect(result.error).toContain('이 레시피를 가리키는 배지가 2개 있어요')
    expect(state.deleteCalls).toBe(0)
    expect(state.recipes.has(ID)).toBe(true)
  })

  it('참조 조회가 실패하면 500으로 막는다(fail-closed, 삭제 시도 없음)', async () => {
    state.recipes.set(ID, FUTURE)
    state.badgeError = { message: 'badges 조회 실패' }

    const result = await cancelScheduledRecipe(makeCancelClient(), ID, NOW)

    expect(result).toMatchObject({ ok: false, status: 500 })
    expect(state.deleteCalls).toBe(0)
    expect(state.recipes.has(ID)).toBe(true)
  })

  it('삭제 쿼리가 실패하면 DB 오류 원문 없이 500이다', async () => {
    state.recipes.set(ID, FUTURE)
    state.deleteError = { message: 'permission denied for table combination_recipes' }

    const result = await cancelScheduledRecipe(makeCancelClient(), ID, NOW)

    expect(result).toMatchObject({ ok: false, status: 500 })
    if (!result.ok) expect(result.error).not.toContain('permission denied')
  })
})

describe('assertValidFromChange — 공개 시각 변경 가드', () => {
  const NOW = new Date('2026-10-01T00:00:00Z')
  const FUTURE = '2026-10-05T00:00:00.000Z'
  const LATER = '2026-10-09T00:00:00.000Z'
  const PAST = '2026-09-01T00:00:00.000Z'

  it('제출하지 않으면(undefined) 공개 여부와 상관없이 통과한다', () => {
    expect(assertValidFromChange({ valid_from: PAST }, undefined, NOW).ok).toBe(true)
    expect(assertValidFromChange({ valid_from: null }, undefined, NOW).ok).toBe(true)
    expect(assertValidFromChange({ valid_from: FUTURE }, undefined, NOW).ok).toBe(true)
  })

  it('예약 중이면 다른 미래 시각으로 바꿀 수 있다', () => {
    expect(assertValidFromChange({ valid_from: FUTURE }, LATER, NOW).ok).toBe(true)
  })

  it('예약 중이면 null(바로 공개)로 돌릴 수 있다', () => {
    expect(assertValidFromChange({ valid_from: FUTURE }, null, NOW).ok).toBe(true)
  })

  it('이미 공개된 레시피(과거 시각)의 시각 변경은 거절한다', () => {
    const toFuture = assertValidFromChange({ valid_from: PAST }, FUTURE, NOW)
    const toNull = assertValidFromChange({ valid_from: PAST }, null, NOW)

    expect(toFuture.ok).toBe(false)
    expect(toNull.ok).toBe(false)
    if (!toFuture.ok) expect(toFuture.error).toContain('이미 공개된')
  })

  it('처음부터 공개된 레시피(valid_from 없음)에 시각을 붙이는 변경은 거절한다', () => {
    expect(assertValidFromChange({ valid_from: null }, FUTURE, NOW).ok).toBe(false)
    expect(assertValidFromChange({}, FUTURE, NOW).ok).toBe(false)
  })

  it('공개된 레시피에 같은 값을 다시 보내면 바뀌는 게 없으니 통과한다', () => {
    expect(assertValidFromChange({ valid_from: PAST }, '2026-09-01T00:00:00Z', NOW).ok).toBe(true)
    expect(assertValidFromChange({ valid_from: null }, null, NOW).ok).toBe(true)
  })
})

describe('recipeReleaseState — 운영툴 자원 연결용 재내보내기', () => {
  it('visibility 판정과 같은 결과를 낸다', () => {
    const now = new Date('2026-10-01T00:00:00Z')

    expect(recipeReleaseState({ valid_from: null }, now)).toBe('released')
    expect(recipeReleaseState({ valid_from: '2026-10-05T00:00:00Z' }, now)).toBe('scheduled')
  })
})
