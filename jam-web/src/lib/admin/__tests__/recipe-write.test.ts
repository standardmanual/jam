/**
 * 믹스 레시피 저장 — 슬롯 타입 일치 + **보상 배지는 아이템 배지만** (티켓 20260917_1427)
 *
 * 보상 배지를 아이템 배지로 제한하는 이유: 엔진의 배지 지급 경로가 `inventory_items` 개체
 * 생성 하나뿐이라, 액티비티·체크인 배지를 보상으로 두면 인벤토리에는 개체가 생기지만
 * 각 타입의 획득 기록 테이블에는 남지 않아 데이터가 어긋난다.
 *
 * 티켓 20261001_1158: 공개 시각 — 생성(`createRecipeWithSlots`), 예약 취소(`cancelScheduledRecipe`),
 * 시각 변경 가드(`assertValidFromChange`)를 함께 검증한다.
 * 티켓 20261002_0710: 종료 시각 — 행 변환(`valid_until`)·생성 때 기간 확인·`assertValidPeriod`·종료된 레시피의
 * 공개 시각 잠금을 함께 검증한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/recipe-write.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  assertValidFromChange,
  assertValidPeriod,
  buildRecipeRow,
  cancelScheduledRecipe,
  createRecipeWithSlots,
  recipeCancelBlockedByCardsMessage,
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

describe('buildRecipeRow — 설명·결과 잠김·보상 없음 허용(티켓 20261018_0055)', () => {
  const base = { name: '테스트 레시피', slots: [itemSlot([ITEM_A]), activitySlot([ACT])] }

  it('제출하지 않으면 행에 세 칸을 넣지 않는다(수정 때 기존 값을 건드리지 않는다)', async () => {
    const result = await buildRecipeRow(makeClient(), { ...base, reward_points: 10 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect('description' in result.row).toBe(false)
      expect('reward_locked' in result.row).toBe(false)
      expect('allow_no_reward' in result.row).toBe(false)
    }
  })

  it('제출한 설명·잠김·보상 없음 허용을 행에 넣고 설명은 앞뒤 공백을 지운다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      ...base,
      reward_points: 10,
      description: '  같은 등급 5개를 모아 위 등급으로 올려요  ',
      reward_locked: true,
      allow_no_reward: false,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.description).toBe('같은 등급 5개를 모아 위 등급으로 올려요')
      expect(result.row.reward_locked).toBe(true)
      expect(result.row.allow_no_reward).toBe(false)
    }
  })

  it('빈 설명은 null로 넣는다(설명 없음)', async () => {
    const result = await buildRecipeRow(makeClient(), { ...base, reward_points: 10, description: '   ' })

    expect(result.ok && result.row.description).toBeNull()
  })

  it('설명이 500자를 넘으면 거부한다', async () => {
    const result = await buildRecipeRow(makeClient(), { ...base, reward_points: 10, description: 'ㄱ'.repeat(501) })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('500자')
  })

  it('allow_no_reward가 true이면 포인트와 보상 배지가 모두 없어도 저장 행이 만들어진다', async () => {
    const result = await buildRecipeRow(makeClient(), { ...base, allow_no_reward: true })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.reward_points).toBe(0)
      expect(result.row.reward_badge_ids).toEqual([])
      expect(result.row.allow_no_reward).toBe(true)
    }
  })

  it('allow_no_reward가 없거나 false이면 옛 검증(보상 하나 이상)이 그대로다', async () => {
    const missing = await buildRecipeRow(makeClient(), { ...base })
    const off = await buildRecipeRow(makeClient(), { ...base, allow_no_reward: false })

    for (const result of [missing, off]) {
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('보상을 하나 이상')
    }
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

describe('buildRecipeRow — 종료 시각(valid_until, 티켓 20261002_0710)', () => {
  const NOW = new Date('2026-10-01T00:00:00Z')
  const base = { name: '테스트 레시피', slots: [itemSlot([ITEM_A]), activitySlot([ACT])], reward_points: 10 }

  it('제출하지 않으면 행에 valid_until 키를 넣지 않는다(수정 때 기존 값을 건드리지 않는다)', async () => {
    const result = await buildRecipeRow(makeClient(), base, NOW)

    expect(result.ok).toBe(true)
    if (result.ok) expect('valid_until' in result.row).toBe(false)
  })

  it('시각이면 UTC ISO로, null·빈 값이면 null(종료 없음)로 행에 넣는다', async () => {
    const timed = await buildRecipeRow(makeClient(), { ...base, valid_until: '2026-10-12T09:00:00+09:00' }, NOW)
    const cleared = await buildRecipeRow(makeClient(), { ...base, valid_until: null }, NOW)
    const blank = await buildRecipeRow(makeClient(), { ...base, valid_until: '' }, NOW)

    expect(timed.ok && timed.row.valid_until).toBe('2026-10-12T00:00:00.000Z')
    expect(cleared.ok && cleared.row.valid_until).toBeNull()
    expect(blank.ok && blank.row.valid_until).toBeNull()
  })

  it('지난 시각도 받는다 — 저장하면 곧바로 내려간다', async () => {
    const result = await buildRecipeRow(makeClient(), { ...base, valid_until: '2026-09-01T00:00:00Z' }, NOW)

    expect(result.ok && result.row.valid_until).toBe('2026-09-01T00:00:00.000Z')
  })

  it('형식이 올바르지 않으면 거부한다', async () => {
    const result = await buildRecipeRow(makeClient(), { ...base, valid_until: '2026-10-12 09:00' }, NOW)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('종료 시각 형식이 올바르지 않아요')
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

  it('공개 시각과 종료 시각을 함께 저장한다 (티켓 20261002_0710)', async () => {
    const { client, calls } = makeWriteClient()

    const result = await createRecipeWithSlots(
      client,
      { ...body, valid_from: '2026-10-05T09:00:00+09:00', valid_until: '2026-10-12T09:00:00+09:00' },
      NOW
    )

    expect(result.ok).toBe(true)
    expect(calls.recipeInserts[0].valid_from).toBe('2026-10-05T00:00:00.000Z')
    expect(calls.recipeInserts[0].valid_until).toBe('2026-10-12T00:00:00.000Z')
  })

  it('종료 시각을 비우면 행에 valid_until을 넣지 않아 상시(DB 기본값 null)다', async () => {
    const { client, calls } = makeWriteClient()

    const result = await createRecipeWithSlots(client, body, NOW)

    expect(result.ok).toBe(true)
    expect('valid_until' in calls.recipeInserts[0]).toBe(false)
  })

  it('종료 시각이 공개 시각과 같거나 앞서면 400으로 거절하고 아무것도 저장하지 않는다', async () => {
    const { client, calls } = makeWriteClient()

    const same = await createRecipeWithSlots(
      client,
      { ...body, valid_from: '2026-10-05T09:00:00+09:00', valid_until: '2026-10-05T09:00:00+09:00' },
      NOW
    )
    const before = await createRecipeWithSlots(
      client,
      { ...body, valid_from: '2026-10-05T09:00:00+09:00', valid_until: '2026-10-04T09:00:00+09:00' },
      NOW
    )

    for (const result of [same, before]) {
      expect(result).toMatchObject({ ok: false, status: 400 })
      if (!result.ok) expect(result.error).toContain('종료 시각은 공개 시각보다 늦어야 해요')
    }
    expect(calls.recipeInserts).toHaveLength(0)
    expect(calls.slotInserts).toHaveLength(0)
  })

  it('바로 공개(공개 시각 없음)에 종료 시각만 있으면 순서를 볼 일이 없어 저장한다', async () => {
    const { client, calls } = makeWriteClient()

    const result = await createRecipeWithSlots(client, { ...body, valid_until: '2026-10-12T09:00:00+09:00' }, NOW)

    expect(result.ok).toBe(true)
    expect(calls.recipeInserts[0].valid_until).toBe('2026-10-12T00:00:00.000Z')
  })

  it('id 인자를 넘기면 그 ID로 행을 넣고 슬롯도 그 레시피에 묶는다 (티켓 20261002_2221, 운영툴 예약 등록)', async () => {
    const { client, calls } = makeWriteClient()
    const id = '11111111-1111-4111-8111-111111111111'

    const result = await createRecipeWithSlots(client, { ...body, valid_from: '2026-10-05T09:00:00+09:00' }, NOW, { id })

    expect(result.ok).toBe(true)
    expect(calls.recipeInserts).toHaveLength(1)
    expect(calls.recipeInserts[0].id).toBe(id)
    expect(calls.recipeInserts[0].valid_from).toBe('2026-10-05T00:00:00.000Z')
    if (result.ok) expect(result.recipe.id).toBe(id)
  })

  it('id 인자를 넘기지 않으면 행에 id 칸을 넣지 않아 기존 동작과 같다(어드민 POST 라우트)', async () => {
    const { client, calls } = makeWriteClient()

    expect((await createRecipeWithSlots(client, body, NOW)).ok).toBe(true)
    expect((await createRecipeWithSlots(client, body, NOW, {})).ok).toBe(true)

    expect(calls.recipeInserts).toHaveLength(2)
    for (const row of calls.recipeInserts) expect('id' in row).toBe(false)
  })

  it('id를 넘겨도 검증에서 거절하면 아무것도 저장하지 않는다', async () => {
    const { client, calls } = makeWriteClient()

    const result = await createRecipeWithSlots(client, { ...body, valid_from: '2026-09-01T09:00:00+09:00' }, NOW, {
      id: '11111111-1111-4111-8111-111111111111',
    })

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(calls.recipeInserts).toHaveLength(0)
  })

  it('id를 넘겼을 때 슬롯 저장이 실패하면 그 ID의 행을 지운다', async () => {
    const { client, calls } = makeWriteClient({ slotInsertError: 'slot insert failed' })
    const id = '11111111-1111-4111-8111-111111111111'

    const result = await createRecipeWithSlots(client, body, NOW, { id })

    expect(result).toMatchObject({ ok: false, status: 500 })
    expect(calls.recipeDeletes).toEqual([id])
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
    /** 이 레시피를 가리키는 레시피 공개 카드 수(`today_cards.recipe_id`) */
    cardCount: 0,
    cardError: null as { message: string } | null,
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
        if (table === 'today_cards') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve(
                  state.cardError ? { count: null, error: state.cardError } : { count: state.cardCount, error: null }
                ),
            }),
          }
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
    state.cardCount = 0
    state.cardError = null
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

  it('공개 시각이 지난 레시피는 409로 거절하고 지우지 않는다 — 내리는 길로 종료 시각을 안내한다', async () => {
    state.recipes.set(ID, PAST)

    const result = await cancelScheduledRecipe(makeCancelClient(), ID, NOW)

    expect(result).toMatchObject({ ok: false, status: 409 })
    if (!result.ok) {
      expect(result.error).toContain('이미 공개된')
      expect(result.error).toContain('종료 시각을 정하거나 레시피를 삭제해 주세요')
    }
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

  it('레시피 공개 카드가 가리켜도 기본(어드민)은 막지 않고 지운다 — 카드는 레시피 줄만 비운다(티켓 20261006_1218 가정 B)', async () => {
    state.recipes.set(ID, FUTURE)
    state.cardCount = 3

    const result = await cancelScheduledRecipe(makeCancelClient(), ID, NOW)

    expect(result).toEqual({ ok: true })
    expect(state.recipes.has(ID)).toBe(false)
  })

  it('blockOnCards(운영툴)이면 카드가 가리킬 때 409로 막고 지우지 않는다. 카드가 없으면 지운다(가정 A)', async () => {
    state.recipes.set(ID, FUTURE)
    state.cardCount = 2

    const blocked = await cancelScheduledRecipe(makeCancelClient(), ID, NOW, { blockOnCards: true })

    expect(blocked).toMatchObject({ ok: false, status: 409 })
    if (!blocked.ok) expect(blocked.error).toBe(recipeCancelBlockedByCardsMessage(2))
    expect(state.deleteCalls).toBe(0)
    expect(state.recipes.has(ID)).toBe(true)

    state.cardCount = 0
    expect(await cancelScheduledRecipe(makeCancelClient(), ID, NOW, { blockOnCards: true })).toEqual({ ok: true })
    expect(state.recipes.has(ID)).toBe(false)
  })

  it('blockOnCards여도 배지 참조가 먼저다(배지 문구 409). 카드 조회가 실패하면 500으로 막는다(fail-closed)', async () => {
    state.recipes.set(ID, FUTURE)
    state.badgeCount = 1
    state.cardCount = 2
    const byBadge = await cancelScheduledRecipe(makeCancelClient(), ID, NOW, { blockOnCards: true })
    expect(byBadge).toMatchObject({ ok: false, status: 409 })
    if (!byBadge.ok) expect(byBadge.error).toContain('이 레시피를 가리키는 배지가 1개 있어요')

    state.badgeCount = 0
    state.cardError = { message: 'today_cards 조회 실패' }
    const failed = await cancelScheduledRecipe(makeCancelClient(), ID, NOW, { blockOnCards: true })
    expect(failed).toMatchObject({ ok: false, status: 500 })
    expect(state.deleteCalls).toBe(0)
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

  it('종료된 레시피도 한 번 공개된 것이라 공개 시각 변경은 거절한다 (티켓 20261002_0710)', () => {
    const ended = { valid_from: PAST, valid_until: '2026-09-20T00:00:00.000Z' }

    expect(assertValidFromChange(ended, FUTURE, NOW).ok).toBe(false)
    expect(assertValidFromChange(ended, null, NOW).ok).toBe(false)
    expect(assertValidFromChange(ended, '2026-09-01T00:00:00Z', NOW).ok).toBe(true) // 같은 값은 통과
    expect(assertValidFromChange({ valid_from: null, valid_until: '2026-09-20T00:00:00.000Z' }, FUTURE, NOW).ok).toBe(false)
  })

  it('종료 시각이 미래여도 예약 중이면 공개 시각을 바꿀 수 있다', () => {
    expect(assertValidFromChange({ valid_from: FUTURE, valid_until: '2026-10-20T00:00:00.000Z' }, LATER, NOW).ok).toBe(true)
  })
})

describe('assertValidPeriod — 공개·종료 시각 순서 가드 (티켓 20261002_0710)', () => {
  const FROM = '2026-10-05T00:00:00.000Z'
  const AFTER = '2026-10-12T00:00:00.000Z'
  const BEFORE = '2026-10-01T00:00:00.000Z'

  it('둘 다 있으면 종료 시각이 공개 시각보다 뒤여야 한다', () => {
    expect(assertValidPeriod(null, FROM, AFTER).ok).toBe(true)
    expect(assertValidPeriod(null, FROM, BEFORE).ok).toBe(false)
  })

  it('종료 시각이 공개 시각과 같아도 거절한다(같은 순간이면 기간이 0이다)', () => {
    const sameInstant = assertValidPeriod(null, FROM, FROM)
    const sameInstantOtherZone = assertValidPeriod(null, FROM, '2026-10-05T09:00:00+09:00') // 00:00Z와 같은 순간

    expect(sameInstant.ok).toBe(false)
    expect(sameInstantOtherZone.ok).toBe(false)
    if (!sameInstant.ok) expect(sameInstant.error).toContain('종료 시각은 공개 시각보다 늦어야 해요')
  })

  it('공개 시각이 없거나(바로 공개) 종료 시각이 없으면(상시) 순서를 보지 않는다', () => {
    expect(assertValidPeriod(null, null, BEFORE).ok).toBe(true)
    expect(assertValidPeriod(null, FROM, null).ok).toBe(true)
    expect(assertValidPeriod(null, null, null).ok).toBe(true)
    expect(assertValidPeriod(null, undefined, undefined).ok).toBe(true)
  })

  it('제출하지 않은 쪽은 기존 값으로 비교한다 — 공개된 레시피의 종료 시각만 바꾸는 경우', () => {
    const released = { valid_from: '2026-09-01T00:00:00.000Z', valid_until: null }

    expect(assertValidPeriod(released, undefined, '2026-10-12T00:00:00.000Z').ok).toBe(true)
    expect(assertValidPeriod(released, undefined, '2026-08-01T00:00:00.000Z').ok).toBe(false) // 공개 시각보다 앞
    expect(assertValidPeriod(released, undefined, '2026-09-01T00:00:00.000Z').ok).toBe(false) // 공개 시각과 같음
    expect(assertValidPeriod(released, undefined, null).ok).toBe(true) // 종료 시각 지우기
  })

  it('지난 종료 시각도 공개 시각보다 뒤면 받는다 — 저장하면 곧바로 내려간다', () => {
    const released = { valid_from: '2026-09-01T00:00:00.000Z', valid_until: null }

    expect(assertValidPeriod(released, undefined, '2026-09-15T00:00:00.000Z').ok).toBe(true)
  })

  it('공개 시각만 새로 정하고 종료 시각은 제출하지 않으면 기존 종료 시각과 비교한다', () => {
    const scheduled = { valid_from: FROM, valid_until: AFTER }

    expect(assertValidPeriod(scheduled, '2026-10-08T00:00:00.000Z', undefined).ok).toBe(true)
    expect(assertValidPeriod(scheduled, '2026-10-20T00:00:00.000Z', undefined).ok).toBe(false)
    expect(assertValidPeriod(scheduled, null, undefined).ok).toBe(true) // 바로 공개로 돌리면 순서를 볼 일이 없다
  })

  it('기존 행에 칸이 없는 응답(undefined)이면 상시로 본다', () => {
    expect(assertValidPeriod({}, FROM, undefined).ok).toBe(true)
    expect(assertValidPeriod({ valid_from: FROM }, undefined, BEFORE).ok).toBe(false)
  })
})

describe('recipeReleaseState — 운영툴 자원 연결용 재내보내기', () => {
  it('visibility 판정과 같은 결과를 낸다', () => {
    const now = new Date('2026-10-01T00:00:00Z')

    expect(recipeReleaseState({ valid_from: null }, now)).toBe('released')
    expect(recipeReleaseState({ valid_from: '2026-10-05T00:00:00Z' }, now)).toBe('scheduled')
    expect(recipeReleaseState({ valid_from: null, valid_until: '2026-09-30T00:00:00Z' }, now)).toBe('ended')
  })
})
