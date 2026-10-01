/**
 * drop-engine/preview — 어드민 시뮬레이터가 엔진 판정을 그대로 따르는지 대조하는 테스트
 *
 * 티켓 20261001_1219: 시뮬레이터가 v1 상수(40/25/10/5)로 따로 굴려 엔진과 어긋났다.
 * `planItemDrops`가 같은 난수열에서 `rollBonusDrop`·`rollRarityV2`·`selectBadge`를 직접 부른
 * 결과와 같은 값을 내는지, 일일 하향·pity·복귀·보너스 드랍·슬롯 가득·후보 없음·섀도우밴 경우와
 * 입력 객체 불변을 본다.
 */
import { vi } from 'vitest'
import { planItemDrops, type PlanItemDropsInput, type PlannableStructure } from '../preview'
import {
  buildBadgeIdsOfBook,
  selectBadge,
  updateLastPiecePity,
  type DropBadge,
} from '../index'
import {
  rollBonusDrop,
  rollRarityV2,
  isComebackActivity,
  isWeeklyFirstActivity,
  type RarityContext,
} from '../layers'
import { matchContextTribes } from '../context'
import { DEFAULT_DROP_POLICY, type DropPolicy } from '../policy'
import { RESOLUTION_TRIBE_ID } from '../constants'
import type { BadgeRarity, UserDropStateRow } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'

const P = DEFAULT_DROP_POLICY

/** 고정 시퀀스 rand — 값이 모자라면 마지막 값을 반복한다 */
const seq = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

/** 시드가 같으면 같은 수열을 내는 PRNG (mulberry32) */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 활동 시작 시각 — 맥락(새벽·심야·고도·장시간) 어느 쪽에도 걸리지 않는 낮 12시
const ACTIVITY_START = '2026-10-01T12:00:00.000Z'

function makeActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: -1,
    name: '시뮬레이션 활동 #1',
    distanceKm: 5,
    movingTimeSec: 1800,
    elevationGainM: 50,
    jamActivityType: 'running',
    startDate: ACTIVITY_START,
    averageSpeedKmh: 10,
    startLatLng: null,
    endLatLng: null,
    ...overrides,
  } as NormalizedActivity
}

function badge(id: string, bookId: string, rarity: BadgeRarity, dropWeight = 1): DropBadge {
  return {
    id,
    name: `배지 ${id}`,
    image_url: null,
    rarity,
    drop_weight: dropWeight,
    valid_from: null,
    valid_until: null,
    condition_json: null,
    item_book_id: bookId,
    point_reward: 0,
    drop_excluded: false,
  } as DropBadge
}

/** 트라이브 3개(a·b·작심삼일), 컬렉션 3개, 배지 11개 */
function makeStructure(overrides: Partial<PlannableStructure> = {}): PlannableStructure {
  const droppable: DropBadge[] = [
    badge('a-common-1', 'book-a', 'common'),
    badge('a-common-2', 'book-a', 'common'),
    badge('a-rare-1', 'book-a', 'rare'),
    badge('a-rare-2', 'book-a', 'rare'),
    badge('b-common-1', 'book-b', 'common'),
    badge('b-rare-1', 'book-b', 'rare'),
    badge('b-epic-1', 'book-b', 'epic'),
    badge('r-common-1', 'book-r', 'common'),
    badge('r-rare-1', 'book-r', 'rare'),
    badge('r-epic-1', 'book-r', 'epic'),
    badge('r-mystic-1', 'book-r', 'mystic'),
  ]
  return {
    tribeOfBook: new Map([
      ['book-a', 'tribe-a'],
      ['book-b', 'tribe-b'],
      ['book-r', RESOLUTION_TRIBE_ID],
    ]),
    tribeNames: new Map([
      ['tribe-a', '트라이브 A'],
      ['tribe-b', '트라이브 B'],
      [RESOLUTION_TRIBE_ID, '작심삼일 클럽'],
    ]),
    badgeIdsOfBook: buildBadgeIdsOfBook(droppable),
    droppable,
    adjacentTribeIds: ['tribe-b'],
    owned: new Set<string>(),
    inventory: { id: 'inv-1', used_slots: 3, max_slots: 20 },
    ...overrides,
  }
}

function makeState(overrides: Partial<UserDropStateRow> = {}): UserDropStateRow {
  return {
    user_id: 'user-1',
    last_drop_tribe_id: 'tribe-a',
    last_drop_book_id: 'book-a',
    common_streak: 0,
    last_piece_pity: {},
    daily_drop_count: 0,
    daily_drop_date: '2026-10-01',
    total_drops: 10, // 온보딩(첫 3드랍) 제한을 피한다
    last_activity_at: '2026-09-30T12:00:00.000Z',
    updated_at: '2026-09-30T12:00:00.000Z',
    ...overrides,
  }
}

function makeInput(overrides: Partial<PlanItemDropsInput> = {}): PlanItemDropsInput {
  return {
    policy: P,
    state: makeState(),
    structure: makeStructure(),
    activity: makeActivity(),
    activityStartDate: ACTIVITY_START,
    activityWeight: 1,
    capRarity: (rarity) => rarity,
    ...overrides,
  }
}

/**
 * 엔진 함수를 직접 불러 첫 드랍까지 따라간 기준 결과.
 * 입력 객체를 건드리지 않도록 복사본으로 굴린다.
 */
function referenceFirstDrop(input: PlanItemDropsInput, rand: () => number) {
  const state = { ...input.state, last_piece_pity: { ...input.state.last_piece_pity } }
  const structure = { ...input.structure, owned: new Set(input.structure.owned) }
  const activityDate = input.activityStartDate.slice(0, 10)
  if (state.daily_drop_date !== activityDate) {
    state.daily_drop_count = 0
    state.daily_drop_date = activityDate
  }
  const comeback = isComebackActivity(input.policy, state.last_activity_at, input.activityStartDate)
  const weeklyFirst = isWeeklyFirstActivity(state.last_activity_at, input.activityStartDate)
  const contextMatch = matchContextTribes(input.activity, comeback)
  const dropCount = 1 + (rollBonusDrop(input.policy, false, rand, input.activityWeight) ? 1 : 0)
  const ctx: RarityContext = {
    commonStreak: state.common_streak,
    isComeback: comeback,
    isWeeklyFirst: weeklyFirst,
    dailyDropCount: state.daily_drop_count,
  }
  const rolled = rollRarityV2(input.policy, ctx, rand)
  const contextActive =
    contextMatch !== null && (contextMatch.always || rand() < input.policy.context_override_rate)
  const picked = selectBadge(
    input.policy,
    structure,
    state,
    rolled,
    contextActive && contextMatch ? contextMatch.tribeIds : [],
    rand
  )
  return { dropCount, rolled, picked, state, structure }
}

describe('planItemDrops — 엔진 함수 직접 호출과의 대조', () => {
  it('여러 시드에서 첫 드랍(개수·등급·배지·트라이브·컬렉션)이 엔진 함수 호출 결과와 같다', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const input = makeInput()
      const plan = planItemDrops(input, seeded(seed))
      const ref = referenceFirstDrop(input, seeded(seed))

      expect(plan.dropCount).toBe(ref.dropCount)
      if (ref.picked) {
        expect(plan.drops[0].badge.id).toBe(ref.picked.badge.id)
        expect(plan.drops[0].tribeId).toBe(ref.picked.tribeId)
        expect(plan.drops[0].bookId).toBe(ref.picked.bookId)
        expect(plan.drops[0].isLastPiece).toBe(ref.picked.isLastPiece)
        expect(plan.drops[0].rolledRarity).toBe(ref.rolled)
        expect(plan.drops[0].cappedRarity).toBe(ref.rolled)
        expect(plan.drops[0].tribeName).toBe(input.structure.tribeNames.get(ref.picked.tribeId))
      } else {
        expect(plan.skipped[0]).toMatchObject({ attempt: 0, reason: 'no_candidate' })
      }
    }
  })

  it('등급 비율은 넘겨받은 drop_policy 값을 따른다 (옛 v1 상수가 아니다)', () => {
    // 어떤 난수가 와도 mystic만 나오는 정책: v1 문턱(0.40/0.65/0.75/0.80)이라면 common이 섞인다
    const onlyMystic: DropPolicy = {
      ...P,
      rarity_common: 0,
      rarity_rare: 0,
      rarity_epic: 0,
      rarity_mystic: 1,
    }
    for (let seed = 1; seed <= 50; seed++) {
      const plan = planItemDrops(makeInput({ policy: onlyMystic }), seeded(seed))
      expect(plan.drops[0].rolledRarity).toBe('mystic')
    }

    // 기본 정책 0.6/0.28/0.09/0.03 경계: 0.59는 common, 0.61은 rare
    const base = makeInput()
    expect(planItemDrops(base, seq(0.99, 0.59, 0.5)).drops[0].rolledRarity).toBe('common')
    expect(planItemDrops(base, seq(0.99, 0.61, 0.5)).drops[0].rolledRarity).toBe('rare')
  })

  it('Math.random을 쓰지 않고 주입한 난수만 쓴다 (같은 난수열이면 같은 결과)', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random은 호출되면 안 된다')
    })
    try {
      const a = planItemDrops(makeInput(), seeded(7))
      const b = planItemDrops(makeInput(), seeded(7))
      expect(b).toEqual(a)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('planItemDrops — 판정 단계별 경우', () => {
  it('일일 하향: 당일 4번째 활동부터 common 90%', () => {
    // 난수 0.8은 기본 분포에서는 rare(0.6~0.88)이지만, 일일 하향 구간(common 0.9)에서는 common
    const down = makeInput({ state: makeState({ daily_drop_count: 3, daily_drop_date: '2026-10-01' }) })
    const plan = planItemDrops(down, seq(0.99, 0.8, 0.5))
    expect(plan.drops[0].rolledRarity).toBe('common')
    expect(plan.drops[0].rolledRarity).toBe(
      rollRarityV2(P, { commonStreak: 0, isComeback: false, isWeeklyFirst: false, dailyDropCount: 3 }, seq(0.8))
    )

    // 활동 날짜가 바뀌면 일일 카운터가 0으로 돌아가 하향이 풀린다
    const reset = makeInput({ state: makeState({ daily_drop_count: 3, daily_drop_date: '2026-09-30' }) })
    expect(planItemDrops(reset, seq(0.99, 0.8, 0.5)).drops[0].rolledRarity).toBe('rare')
  })

  it('pity: 연속 common이 임계에 닿으면 rare 이상이 확정된다', () => {
    const input = makeInput({ state: makeState({ common_streak: P.rare_pity_threshold }) })
    for (let seed = 1; seed <= 100; seed++) {
      const plan = planItemDrops(input, seeded(seed))
      expect(plan.drops[0].rolledRarity).not.toBe('common')
    }
  })

  it('마지막 조각 pity: 1개 남은 컬렉션이 임계에 닿으면 그 배지가 확정된다', () => {
    const input = makeInput({
      state: makeState({
        common_streak: P.rare_pity_threshold, // rare+ 확정
        last_drop_tribe_id: 'tribe-a', // 모멘텀으로 tribe-a가 뽑히도록
        last_piece_pity: { 'book-a': P.last_piece_pity_threshold },
      }),
      structure: makeStructure({
        owned: new Set(['a-common-1', 'a-common-2', 'a-rare-1']), // book-a의 a-rare-2만 남음
      }),
    })
    // 보너스 없음 → rare 확정(roll 0) → 트라이브 모멘텀(roll 0)
    const plan = planItemDrops(input, seq(0.99, 0, 0))
    expect(plan.drops[0]).toMatchObject({
      badge: expect.objectContaining({ id: 'a-rare-2' }),
      tribeId: 'tribe-a',
      bookId: 'book-a',
      isLastPiece: true,
    })
  })

  it('복귀: 7일 이상 공백이면 rare 이상이 확정되고 작심삼일 클럽으로 간다', () => {
    const input = makeInput({ state: makeState({ last_activity_at: '2026-09-20T12:00:00.000Z' }) })
    const plan = planItemDrops(input, seq(0.99, 0.1, 0.5))
    expect(plan.comeback).toBe(true)
    expect(plan.drops[0]).toMatchObject({
      isComeback: true,
      contextActive: true,
      tribeId: RESOLUTION_TRIBE_ID,
    })
    expect(plan.drops[0].rolledRarity).not.toBe('common')

    const ref = referenceFirstDrop(input, seq(0.99, 0.1, 0.5))
    expect(plan.drops[0].badge.id).toBe(ref.picked?.badge.id)
  })

  it('보너스 드랍: 2개째는 첫 드랍이 반영된 상태에서 굴리고, 걷기 가중치는 common 연속에 0.4만 더한다', () => {
    const input = makeInput({ activityWeight: 0.4 })
    // 보너스 확률 0.15 × 0.4 = 0.06 → 난수 0.0이면 보너스
    const rand = seq(0.0, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0)
    const plan = planItemDrops(input, rand)
    expect(plan.dropCount).toBe(2)
    expect(plan.drops).toHaveLength(2)
    expect(plan.drops.map((d) => d.isBonus)).toEqual([false, true])
    // 같은 배지가 두 번 나오지 않는다 (첫 드랍 배지가 보유로 반영되어 미보유 우선)
    expect(plan.drops[1].badge.id).not.toBe(plan.drops[0].badge.id)

    // 2개째를 엔진 함수로 직접 이어 굴린 결과와 같다 (첫 드랍 반영 상태를 손으로 만든다)
    const r = seq(0.0, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0)
    const ref = referenceFirstDrop(input, r)
    const first = ref.picked
    if (!first) throw new Error('첫 드랍 후보가 없다 — 테스트 구조가 잘못됐다')
    expect(first.badge.id).toBe(plan.drops[0].badge.id)
    const state2 = { ...ref.state, last_piece_pity: { ...ref.state.last_piece_pity } }
    const structure2 = { ...ref.structure, owned: new Set(ref.structure.owned) }
    updateLastPiecePity(structure2, state2, first.tribeId, first.badge.id)
    structure2.owned.add(first.badge.id)
    state2.daily_drop_count += 1
    state2.total_drops += 1
    state2.last_drop_tribe_id = first.tribeId
    state2.last_drop_book_id = first.bookId
    state2.common_streak = first.badge.rarity === 'common' ? state2.common_streak + 0.4 : 0
    const rolled2 = rollRarityV2(
      P,
      {
        commonStreak: state2.common_streak,
        isComeback: false,
        isWeeklyFirst: false,
        dailyDropCount: state2.daily_drop_count,
      },
      r
    )
    const picked2 = selectBadge(P, structure2, state2, rolled2, [], r)
    expect(plan.drops[1].rolledRarity).toBe(rolled2)
    expect(plan.drops[1].badge.id).toBe(picked2?.badge.id)
  })

  it('보너스 확률은 활동 가중치를 곱한다 (걷기 0.4 → 난수 0.1은 보너스 아님)', () => {
    expect(planItemDrops(makeInput({ activityWeight: 1 }), seq(0.1)).dropCount).toBe(2)
    expect(planItemDrops(makeInput({ activityWeight: 0.4 }), seq(0.1)).dropCount).toBe(1)
  })

  it('고강도 활동은 보너스 확률이 오른다 (0.15 → 0.30)', () => {
    const intense = makeInput({ activity: makeActivity({ movingTimeSec: 4000 }) })
    expect(planItemDrops(intense, seq(0.2)).intense).toBe(true)
    expect(planItemDrops(intense, seq(0.2)).dropCount).toBe(2)
    expect(planItemDrops(makeInput(), seq(0.2)).dropCount).toBe(1)
  })

  it('슬롯이 가득 차면 드랍 없이 slot_full로 끝난다', () => {
    const full = makeInput({
      structure: makeStructure({ inventory: { id: 'inv-1', used_slots: 20, max_slots: 20 } }),
    })
    const plan = planItemDrops(full, seq(0.99, 0.5, 0.5))
    expect(plan.drops).toEqual([])
    expect(plan.skipped).toEqual([{ attempt: 0, reason: 'slot_full' }])
  })

  it('보너스 드랍 직전에 슬롯이 차면 2개째만 slot_full이다', () => {
    const oneLeft = makeInput({
      structure: makeStructure({ inventory: { id: 'inv-1', used_slots: 19, max_slots: 20 } }),
    })
    const plan = planItemDrops(oneLeft, seq(0.0, 0.1, 0.0, 0.0, 0.0))
    expect(plan.dropCount).toBe(2)
    expect(plan.drops).toHaveLength(1)
    expect(plan.skipped).toEqual([{ attempt: 1, reason: 'slot_full' }])
  })

  it('후보가 없으면 no_candidate로 빠지고 추첨 등급을 함께 돌려준다', () => {
    const empty = makeInput({ structure: makeStructure({ droppable: [] }) })
    const plan = planItemDrops(empty, seq(0.99, 0.5, 0.5))
    expect(plan.drops).toEqual([])
    expect(plan.skipped).toEqual([
      { attempt: 0, reason: 'no_candidate', rolledRarity: 'common', cappedRarity: 'common' },
    ])
  })

  it('섀도우밴으로 등급이 강등되면 상한 적용 등급으로 배지를 고른다', () => {
    const banned = makeInput({
      capRarity: (rarity) => (rarity === 'epic' || rarity === 'mystic' ? 'common' : rarity),
    })
    // 난수 0.9 → epic 추첨, 상한으로 common 강등
    const plan = planItemDrops(banned, seq(0.99, 0.9, 0.5))
    expect(plan.drops[0].rolledRarity).toBe('epic')
    expect(plan.drops[0].cappedRarity).toBe('common')
    expect(plan.drops[0].badge.rarity).toBe('common')
  })

  it('섀도우밴으로 등급이 막히면 shadow_ban_blocked로 빠지고 다음 난수를 쓰지 않는다', () => {
    const blocked = makeInput({ capRarity: () => null })
    const plan = planItemDrops(blocked, seq(0.99, 0.5, 0.5))
    expect(plan.drops).toEqual([])
    expect(plan.skipped).toEqual([{ attempt: 0, reason: 'shadow_ban_blocked', rolledRarity: 'common' }])
  })
})

describe('planItemDrops — 입력 불변', () => {
  it('state·structure를 바꾸지 않는다 (보너스 드랍·pity 갱신이 일어나는 경우도 포함)', () => {
    const state = makeState({
      common_streak: 2,
      daily_drop_date: '2026-09-30',
      last_piece_pity: { 'book-a': 1 },
    })
    const structure = makeStructure({ owned: new Set(['a-common-1', 'a-common-2', 'a-rare-1']) })

    const stateBefore = JSON.parse(JSON.stringify(state))
    const ownedBefore = [...structure.owned]
    const droppableBefore = structure.droppable.map((b) => b.id)
    const inventoryBefore = { ...structure.inventory }

    for (let seed = 1; seed <= 50; seed++) {
      planItemDrops(makeInput({ state, structure, activityWeight: 0.4 }), seeded(seed))
    }
    // 보너스 드랍이 확실히 일어나는 난수에서도
    const plan = planItemDrops(makeInput({ state, structure }), seq(0.0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5))
    expect(plan.dropCount).toBe(2)

    expect(state).toEqual(stateBefore)
    expect([...structure.owned]).toEqual(ownedBefore)
    expect(structure.droppable.map((b) => b.id)).toEqual(droppableBefore)
    expect(structure.inventory).toEqual(inventoryBefore)
  })
})
