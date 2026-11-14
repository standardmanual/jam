/**
 * 믹스 레시피 저장 — 레시피 유형(등급 대응형)과 첫 성공자 보상 배지 (티켓 20261114_1705 2회차)
 *
 * 고정하는 것:
 * - 등급 대응형(`follow_materials`)은 아이템 슬롯 후보와 보상이 «4등급이 모두 갖춰진 아이템 배지 묶음의 4등급 배지 전부»일 때만 저장한다.
 *   4등급이 모자란 묶음·묶음의 일부만 담은 후보는 거절한다. 등급 고정형(`fixed`)과 유형을 보내지 않은 요청은 이 검사를 거치지 않는다.
 * - 수정(`context.existing`)에서 유형을 보내지 않으면 기존 레시피의 유형으로 검사한다.
 * - 첫 성공자 보상 배지는 삭제되지 않은 아이템 배지 + 드랍 제외가 켜진 배지만 가능하다. 이미 믹스 성공 기록이 있는 레시피에는 켤 수도 바꿀 수도 없고,
 *   기존과 같은 배지를 다시 보내거나 끄는 것은 된다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/recipe-write-grade-mode.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildRecipeRow } from '../recipe-write'
import type { createServiceClient } from '@/lib/supabase/server'

const BOOK = 'book-1'
const RECIPE_ID = '11111111-1111-4111-8111-111111111111'

interface FakeBadge {
  id: string
  name: string
  type: string
  rarity: string | null
  item_book_id: string | null
  drop_excluded: boolean
  deleted_at: string | null
}

function badge(id: string, name: string, rarity: string | null, extra: Partial<FakeBadge> = {}): FakeBadge {
  return { id, name, type: 'item', rarity, item_book_id: BOOK, drop_excluded: false, deleted_at: null, ...extra }
}

function sign(prefix: string, name: string): FakeBadge[] {
  return [
    badge(`${prefix}-c`, name, 'common'),
    badge(`${prefix}-r`, name, 'rare'),
    badge(`${prefix}-e`, name, 'epic'),
    badge(`${prefix}-m`, name, 'mystic'),
  ]
}

const ids = (prefix: string) => ['c', 'r', 'e', 'm'].map((g) => `${prefix}-${g}`)

const state = vi.hoisted(() => ({
  badges: [] as FakeBadge[],
  successLogCount: 0,
  /** `badges` 조회에서 실패시킬 단계 */
  failBadges: false,
}))

/** 필터(.in / .eq / .is)를 기록하고 메모리 배지 표에서 거른다. `.maybeSingle()`은 첫 행, 그 밖은 목록이다. */
function badgesBuilder() {
  const filters: ((b: FakeBadge) => boolean)[] = []
  const builder: Record<string, unknown> = {
    select: () => builder,
    in: (col: string, vals: string[]) => {
      filters.push((b) => vals.includes((b as unknown as Record<string, string>)[col]))
      return builder
    },
    eq: (col: string, val: unknown) => {
      filters.push((b) => (b as unknown as Record<string, unknown>)[col] === val)
      return builder
    },
    is: (col: string, val: unknown) => {
      filters.push((b) => (b as unknown as Record<string, unknown>)[col] === val)
      return builder
    },
    maybeSingle: () =>
      Promise.resolve({
        data: state.failBadges ? null : (state.badges.filter((b) => filters.every((f) => f(b)))[0] ?? null),
        error: state.failBadges ? { message: 'boom' } : null,
      }),
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(
        state.failBadges
          ? { data: null, error: { message: 'boom' } }
          : { data: state.badges.filter((b) => filters.every((f) => f(b))), error: null }
      ).then(onFulfilled, onRejected),
  }
  return builder
}

const logCalls: string[] = []

function makeClient(): ReturnType<typeof createServiceClient> {
  return {
    from(table: string) {
      if (table === 'badges') return badgesBuilder()
      if (table === 'user_combine_success_logs') {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: (_col: string, id: string) => {
            logCalls.push(id)
            return Promise.resolve({ count: state.successLogCount, error: null })
          },
        }
        return builder
      }
      throw new Error(`예상하지 못한 표: ${table}`)
    },
  } as unknown as ReturnType<typeof createServiceClient>
}

const itemSlot = (allowed: string[]) => ({ badge_type: 'item', allowed_badge_ids: allowed })

beforeEach(() => {
  state.badges = [...sign('a', '체크섬 조각'), ...sign('b', '칸 번호 팻말'), badge('flag-c', '깃발', 'common'), badge('flag-r', '깃발', 'rare')]
  state.successLogCount = 0
  state.failBadges = false
  logCalls.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildRecipeRow — 등급 대응형(follow_materials)', () => {
  it('4등급이 갖춰진 묶음의 4등급 배지를 전부 담으면 저장 행에 유형이 실린다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '팻말 만들기',
      grade_mode: 'follow_materials',
      slots: [itemSlot(ids('a')), itemSlot(ids('a'))],
      reward_badge_ids: ids('b'),
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.grade_mode).toBe('follow_materials')
      expect(result.row.reward_badge_ids).toEqual(ids('b'))
      expect(result.slots[0].allowed_badge_ids).toEqual(ids('a'))
    }
  })

  it('한 슬롯에 묶음을 여러 개 담아도(OR 후보) 각 묶음이 4등급 전부면 통과한다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '팻말 만들기',
      grade_mode: 'follow_materials',
      slots: [itemSlot([...ids('a'), ...ids('b')]), itemSlot(ids('a'))],
      reward_badge_ids: ids('b'),
    })
    expect(result.ok).toBe(true)
  })

  it('4등급이 갖춰지지 않은 묶음을 재료 후보로 넣으면 거절하고 슬롯 번호와 묶음 이름을 알린다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '깃발 만들기',
      grade_mode: 'follow_materials',
      slots: [itemSlot(ids('a')), itemSlot(['flag-c', 'flag-r'])],
      reward_badge_ids: ids('b'),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('슬롯 2')
      expect(result.error).toContain('깃발')
      expect(result.error).toContain('Epic·Mystic 등급이 없어요')
    }
  })

  it('보상에 4등급이 모자란 묶음이 있어도 거절한다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '깃발 보상',
      grade_mode: 'follow_materials',
      slots: [itemSlot(ids('a')), itemSlot(ids('a'))],
      reward_badge_ids: ['flag-c', 'flag-r'],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('보상')
  })

  it('완비된 묶음이어도 일부 등급만 담으면 거절한다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '팻말 만들기',
      grade_mode: 'follow_materials',
      slots: [itemSlot(['a-c', 'a-r']), itemSlot(ids('a'))],
      reward_badge_ids: ids('b'),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('4등급 배지가 모두 담기지 않았어요')
  })

  it('컬렉션에 속하지 않은 아이템 배지는 거절한다', async () => {
    state.badges.push(badge('solo', '낱개', 'common', { item_book_id: null }))
    const result = await buildRecipeRow(makeClient(), {
      name: '낱개',
      grade_mode: 'follow_materials',
      slots: [itemSlot(['solo']), itemSlot(ids('a'))],
      reward_badge_ids: ids('b'),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('컬렉션에 속하지 않은')
  })

  it('액티비티 슬롯은 묶음 검사를 받지 않는다', async () => {
    state.badges.push(badge('act-1', '활동 배지', null, { type: 'activity', item_book_id: null }))
    const result = await buildRecipeRow(makeClient(), {
      name: '조건 있는 팻말',
      grade_mode: 'follow_materials',
      slots: [itemSlot(ids('a')), { badge_type: 'activity', allowed_badge_ids: ['act-1'] }],
      reward_badge_ids: ids('b'),
    })

    expect(result.ok).toBe(true)
  })

  it('배지 조회가 실패하면 저장하지 않는다(fail-closed)', async () => {
    state.failBadges = true
    const result = await buildRecipeRow(makeClient(), {
      name: '팻말 만들기',
      grade_mode: 'follow_materials',
      slots: [itemSlot(ids('a')), itemSlot(ids('a'))],
      reward_badge_ids: ids('b'),
    })
    expect(result.ok).toBe(false)
  })

  it('수정에서 유형을 보내지 않으면 기존 레시피의 유형(등급 대응형)으로 검사한다', async () => {
    const result = await buildRecipeRow(
      makeClient(),
      { name: '깃발 만들기', slots: [itemSlot(['flag-c', 'flag-r']), itemSlot(ids('a'))], reward_badge_ids: ids('b') },
      new Date(),
      { recipeId: RECIPE_ID, existing: { grade_mode: 'follow_materials' } }
    )
    expect(result.ok).toBe(false)
  })
})

describe('buildRecipeRow — 등급 고정형·유형 미지정은 묶음 검사를 하지 않는다', () => {
  it('fixed를 보내면 4등급이 모자란 배지도 그대로 저장한다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '깃발 고정',
      grade_mode: 'fixed',
      slots: [itemSlot(['flag-c']), itemSlot(['flag-r'])],
      reward_badge_ids: ['flag-r'],
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.row.grade_mode).toBe('fixed')
  })

  it('유형을 보내지 않으면 행에 grade_mode를 넣지 않는다(DB 기본값·기존 값 유지)', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '깃발 옛 방식',
      slots: [itemSlot(['flag-c']), itemSlot(['flag-r'])],
      reward_badge_ids: ['flag-r'],
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect('grade_mode' in result.row).toBe(false)
  })

  it('알 수 없는 유형 값은 거절한다', async () => {
    const result = await buildRecipeRow(makeClient(), {
      name: '이상한 유형',
      grade_mode: 'mixed',
      slots: [itemSlot(['flag-c']), itemSlot(['flag-r'])],
      reward_badge_ids: ['flag-r'],
    })
    expect(result.ok).toBe(false)
  })
})

describe('buildRecipeRow — 첫 성공자 보상 배지(first_success_badge_id)', () => {
  const base = {
    name: '팻말 만들기',
    grade_mode: 'fixed',
    slots: [itemSlot(['flag-c']), itemSlot(['flag-r'])],
    reward_badge_ids: ['flag-r'],
  }

  beforeEach(() => {
    state.badges.push(badge('first-1', '첫 성공 기념', 'mystic', { drop_excluded: true }))
    state.badges.push(badge('plain-1', '평범한 배지', 'common', { drop_excluded: false }))
    state.badges.push(badge('act-9', '활동 배지', null, { type: 'activity', item_book_id: null, drop_excluded: true }))
    state.badges.push(badge('gone-1', '지운 배지', 'rare', { drop_excluded: true, deleted_at: '2026-11-01T00:00:00Z' }))
  })

  it('드랍 제외가 켜진 아이템 배지는 행에 실린다', async () => {
    const result = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: 'first-1' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.row.first_success_badge_id).toBe('first-1')
  })

  it('드랍 제외가 꺼진 배지는 거절한다', async () => {
    const result = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: 'plain-1' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('드랍 제외')
  })

  it('아이템 배지가 아니면 거절한다', async () => {
    const result = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: 'act-9' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('아이템 배지만')
  })

  it('삭제된 배지·없는 배지는 거절한다', async () => {
    const gone = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: 'gone-1' })
    const missing = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: 'nope' })

    expect(gone.ok).toBe(false)
    expect(missing.ok).toBe(false)
  })

  it('null은 첫 성공자 보상 없음으로 행에 null을 싣는다', async () => {
    const result = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: null })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.row.first_success_badge_id).toBeNull()
  })

  it('제출하지 않으면 행에 칸을 넣지 않는다', async () => {
    const result = await buildRecipeRow(makeClient(), base)

    expect(result.ok).toBe(true)
    if (result.ok) expect('first_success_badge_id' in result.row).toBe(false)
  })

  it('새 레시피 생성에는 성공 기록을 보지 않는다', async () => {
    state.successLogCount = 5
    const result = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: 'first-1' })

    expect(result.ok).toBe(true)
    expect(logCalls).toEqual([])
  })

  it('이미 성공 기록이 있는 레시피에 새로 켜면 거절한다', async () => {
    state.successLogCount = 3
    const result = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: 'first-1' }, new Date(), {
      recipeId: RECIPE_ID,
      existing: { first_success_badge_id: null },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('이미 믹스에 성공한 유저가 있는 레시피')
    expect(logCalls).toEqual([RECIPE_ID])
  })

  it('이미 성공 기록이 있어도 다른 배지로 바꾸면 거절한다', async () => {
    state.successLogCount = 3
    state.badges.push(badge('first-2', '다른 기념', 'mystic', { drop_excluded: true }))
    const result = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: 'first-2' }, new Date(), {
      recipeId: RECIPE_ID,
      existing: { first_success_badge_id: 'first-1' },
    })

    expect(result.ok).toBe(false)
  })

  it('성공 기록이 있어도 기존과 같은 배지를 다시 보내는 수정은 통과한다', async () => {
    state.successLogCount = 3
    const result = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: 'first-1' }, new Date(), {
      recipeId: RECIPE_ID,
      existing: { first_success_badge_id: 'first-1' },
    })

    expect(result.ok).toBe(true)
    expect(logCalls).toEqual([])
  })

  it('성공 기록이 있어도 끄는 것(null)은 된다', async () => {
    state.successLogCount = 3
    const result = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: null }, new Date(), {
      recipeId: RECIPE_ID,
      existing: { first_success_badge_id: 'first-1' },
    })

    expect(result.ok).toBe(true)
  })

  it('성공 기록이 없는 레시피에는 켤 수 있다', async () => {
    state.successLogCount = 0
    const result = await buildRecipeRow(makeClient(), { ...base, first_success_badge_id: 'first-1' }, new Date(), {
      recipeId: RECIPE_ID,
      existing: { first_success_badge_id: null },
    })

    expect(result.ok).toBe(true)
  })
})
