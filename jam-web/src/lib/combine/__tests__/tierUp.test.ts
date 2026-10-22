/**
 * 등급 올리기 `tierUpProbabilities` · `rollTierUp` · `tierUp` (티켓 20261022_2119 2회, 운영 로직 8.4절)
 *
 * 검증 대상:
 *  1) 확률표 — 재료 등급 이상만 남겨 합이 1이 되게 다시 맞춘다. Common 70/22/6/2, Rare 약 73.3/20/6.7, Epic 75/25. 낮은 등급 줄은 없다.
 *     0% 줄은 지우지 않는다. 설정(캡슐 정책)을 바꾸면 따라 바뀐다. Mystic 재료는 던진다
 *  2) 굴림(순수) — 난수를 인자로 주입해 경계를 고정한다. 난수 순서는 트라이브 → 등급 → 아이템이다. 등급 분포는 확률표와 맞고, 재료 등급 아래는 나오지 않는다.
 *     아이템은 균등이다. 후보가 없으면 정한 등급에서 재료 등급까지만 내려가고, 그래도 없으면 null이다. 낮은 등급만 있는 트라이브는 «다른 트라이브» 대상에서 빠진다
 *  3) 실행 — 소각 앞(개수·정지·받지 않은 결과·소유·잠김·재료 검사·후보 없음)의 거절은 소각·지급·점수가 없다. 성공하면 소각 → 지급(`combine_grant_results`, 레시피 없음)
 *     → 후속 → 챕터 점수 «믹스 성공» 한 번(새 UUID). 빈칸이 모자라면 받지 않은 결과로 남기고, 잠긴 결과는 가린다. 지급 실패는 던진다
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/tierUp.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { IssueBadge, IssueBook, Rand } from '@/lib/drop-engine/syncIssue'
import type { BadgeRarity } from '@/types/database'

const mocks = vi.hoisted(() => ({
  callOrder: [] as string[],
  assertNotSuspended: vi.fn(),
  getPendingCount: vi.fn(),
  loadRollData: vi.fn(),
  getCapsulePolicy: vi.fn(),
  burnMaterials: vi.fn(),
  notifyInventorySlotsLow: vi.fn(),
  followUpCombineResultPoints: vi.fn(),
  awardChapterScore: vi.fn(),
  readUnlockRequired: vi.fn(),
}))

/** 가짜 DB — 쿼리 결과와 RPC 응답을 시험이 정한다 */
const db = vi.hoisted(() => ({
  inventory: null as unknown,
  items: [] as unknown[],
  materialBadges: [] as unknown[],
  materialBadgesError: null as { message: string } | null,
  grant: { data: null, error: null } as { data: unknown; error: { message: string } | null },
  rpcCalls: [] as { fnName: string; args: Record<string, unknown> }[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => {
    mocks.callOrder.push('createServiceClient')
    return {
      from: (table: string) => {
        const resolve = async (): Promise<{ data: unknown; error: unknown }> => {
          if (table === 'inventory') return { data: db.inventory, error: null }
          if (table === 'inventory_items') return { data: db.items, error: null }
          if (table === 'badges') return { data: db.materialBadges, error: db.materialBadgesError }
          return { data: null, error: null }
        }
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          is: () => builder,
          single: resolve,
          then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => resolve().then(onFulfilled, onRejected),
        }
        return builder
      },
      rpc: async (fnName: string, args: Record<string, unknown>) => {
        mocks.callOrder.push(`rpc:${fnName}`)
        db.rpcCalls.push({ fnName, args })
        return db.grant
      },
    } as unknown as SupabaseClient
  },
}))

vi.mock('@/lib/suspension/suspension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/suspension/suspension')>()
  return {
    ...actual,
    assertNotSuspended: (...args: unknown[]) => {
      mocks.callOrder.push('assertNotSuspended')
      return mocks.assertNotSuspended(...args)
    },
  }
})
vi.mock('@/lib/combine/pending', () => ({
  getPendingCount: (...args: unknown[]) => {
    mocks.callOrder.push('getPendingCount')
    return mocks.getPendingCount(...args)
  },
}))
vi.mock('@/lib/capsule/open', () => ({
  loadRollData: (...args: unknown[]) => {
    mocks.callOrder.push('loadRollData')
    return mocks.loadRollData(...args)
  },
}))
vi.mock('@/lib/capsule/policy', () => ({
  getCapsulePolicy: (...args: unknown[]) => mocks.getCapsulePolicy(...args),
}))
vi.mock('@/lib/combine/burn', () => ({
  burnMaterials: (...args: unknown[]) => {
    mocks.callOrder.push('burnMaterials')
    return mocks.burnMaterials(...args)
  },
}))
vi.mock('@/lib/inventory/slotAlert', () => ({
  notifyInventorySlotsLow: (...args: unknown[]) => {
    mocks.callOrder.push('notifyInventorySlotsLow')
    return mocks.notifyInventorySlotsLow(...args)
  },
}))
vi.mock('@/lib/combine/resultPointFollowUp', () => ({
  followUpCombineResultPoints: (...args: unknown[]) => {
    mocks.callOrder.push('followUpCombineResultPoints')
    return mocks.followUpCombineResultPoints(...args)
  },
}))
vi.mock('@/lib/chapter/score', () => ({
  awardChapterScore: (...args: unknown[]) => {
    mocks.callOrder.push('awardChapterScore')
    return mocks.awardChapterScore(...args)
  },
}))
// 믹스 본체는 가져오지 않는다 — 등급 올리기는 «잠긴 결과의 필요한 양 읽기» 하나만 쓴다
vi.mock('@/lib/combine/index', () => ({
  readUnlockRequired: (...args: unknown[]) => mocks.readUnlockRequired(...args),
}))

import { UserSuspendedError } from '@/lib/suspension/suspension'
import {
  isTierUpMaterialRarity,
  rollTierUp,
  tierUp,
  tierUpProbabilities,
  TIER_UP_MATERIAL_COUNT,
  type TierUpRollInput,
  type TierUpRollPolicy,
} from '../tierUp'

// ────────────────────────────────────────────────────────────
// 공통 준비물
// ────────────────────────────────────────────────────────────

const USER = 'user-1'
const NOW = new Date('2026-10-23T00:00:00.000Z')

/** 2026-10-23 공용 DB의 캡슐 값 — 등급 70/22/6/2, 다른 트라이브 20% */
const POLICY: TierUpRollPolicy = {
  rarity_common: 70,
  rarity_rare: 22,
  rarity_epic: 6,
  rarity_mystic: 2,
  other_tribe_probability: 0.2,
}

const T_OWN = 'tribe-own'
const T_B = 'tribe-b'
/** 옛 트라이브 — Common 컬렉션만 있다 */
const T_OLD = 'tribe-old'
const TRIBE_IDS = [T_OWN, T_B, T_OLD]

interface PoolBadge extends IssueBadge {
  name: string
  image_url: string | null
  point_reward: number | null
}

function book(id: string, tribeId: string, overrides: Partial<IssueBook> = {}): IssueBook {
  return { id, tribe_id: tribeId, is_active: true, drop_excluded: false, valid_from: null, valid_until: null, ...overrides }
}

function badge(id: string, rarity: BadgeRarity, bookId: string, overrides: Partial<PoolBadge> = {}): PoolBadge {
  return {
    id,
    name: `배지 ${id}`,
    image_url: null,
    point_reward: null,
    rarity,
    item_book_id: bookId,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    deleted_at: null,
    ...overrides,
  }
}

const BOOKS: IssueBook[] = [book('book-own', T_OWN), book('book-b', T_B), book('book-old', T_OLD)]

function pool(extra: PoolBadge[] = []): PoolBadge[] {
  return [
    badge('own-c1', 'common', 'book-own'),
    badge('own-c2', 'common', 'book-own'),
    badge('own-c3', 'common', 'book-own'),
    badge('own-r1', 'rare', 'book-own'),
    badge('own-r2', 'rare', 'book-own'),
    badge('own-e1', 'epic', 'book-own'),
    badge('own-m1', 'mystic', 'book-own'),
    badge('b-c1', 'common', 'book-b'),
    badge('b-r1', 'rare', 'book-b'),
    badge('b-e1', 'epic', 'book-b'),
    badge('b-m1', 'mystic', 'book-b'),
    badge('old-c1', 'common', 'book-old'),
    badge('old-c2', 'common', 'book-old'),
    ...extra,
  ]
}

function rollInput(
  materialRarity: TierUpRollInput<PoolBadge>['materialRarity'],
  overrides: Partial<TierUpRollInput<PoolBadge>> = {}
): TierUpRollInput<PoolBadge> {
  return { materialRarity, policy: POLICY, tribeId: T_OWN, tribeIds: TRIBE_IDS, books: BOOKS, badges: pool(), now: NOW, ...overrides }
}

/** 정해진 난수를 차례로 돌려준다. 더 쓰면 던진다 — 예상 밖의 굴림을 잡는다 */
function seq(...values: number[]): Rand & { left: () => number } {
  const queue = [...values]
  const fn = (() => {
    const v = queue.shift()
    if (v === undefined) throw new Error('예상보다 난수를 더 썼다')
    return v
  }) as Rand & { left: () => number }
  fn.left = () => queue.length
  return fn
}

const sum = (rows: Array<[BadgeRarity, number]>) => rows.reduce((s, [, p]) => s + p, 0)

// ────────────────────────────────────────────────────────────
// 1. 확률표
// ────────────────────────────────────────────────────────────

describe('tierUpProbabilities — 재료 등급별 결과 등급 확률', () => {
  it('Common 재료는 캡슐 확률 그대로 70/22/6/2(%)다', () => {
    const rows = tierUpProbabilities('common', POLICY)
    expect(rows.map(([r]) => r)).toEqual(['common', 'rare', 'epic', 'mystic'])
    expect(rows[0][1]).toBeCloseTo(0.7, 10)
    expect(rows[1][1]).toBeCloseTo(0.22, 10)
    expect(rows[2][1]).toBeCloseTo(0.06, 10)
    expect(rows[3][1]).toBeCloseTo(0.02, 10)
  })

  it('Rare 재료는 Rare 약 73.3%, Epic 20%, Mystic 약 6.7%이고 Common 줄이 없다', () => {
    const rows = tierUpProbabilities('rare', POLICY)
    expect(rows.map(([r]) => r)).toEqual(['rare', 'epic', 'mystic'])
    expect(rows[0][1]).toBeCloseTo(22 / 30, 10)
    expect(rows[1][1]).toBeCloseTo(0.2, 10)
    expect(rows[2][1]).toBeCloseTo(2 / 30, 10)
  })

  it('Epic 재료는 Epic 75%, Mystic 25%다', () => {
    const rows = tierUpProbabilities('epic', POLICY)
    expect(rows.map(([r]) => r)).toEqual(['epic', 'mystic'])
    expect(rows[0][1]).toBeCloseTo(0.75, 10)
    expect(rows[1][1]).toBeCloseTo(0.25, 10)
  })

  it.each(['common', 'rare', 'epic'] as const)('%s 재료의 확률 합은 1이다', (material) => {
    expect(sum(tierUpProbabilities(material, POLICY))).toBeCloseTo(1, 10)
  })

  it('재료보다 낮은 등급은 어떤 설정에서도 줄에 나오지 않는다', () => {
    const odd: TierUpRollPolicy = { ...POLICY, rarity_common: 10, rarity_rare: 10, rarity_epic: 40, rarity_mystic: 40 }
    expect(tierUpProbabilities('rare', odd).map(([r]) => r)).not.toContain('common')
    expect(tierUpProbabilities('epic', odd).map(([r]) => r)).toEqual(['epic', 'mystic'])
  })

  it('캡슐 설정을 바꾸면 확률표가 따라 바뀐다 (동기화 값 84/13/2.5/0.5로 시험)', () => {
    const changed: TierUpRollPolicy = { ...POLICY, rarity_common: 84, rarity_rare: 13, rarity_epic: 2.5, rarity_mystic: 0.5 }
    const rows = tierUpProbabilities('common', changed)
    expect(rows[0][1]).toBeCloseTo(0.84, 10)
    expect(rows[3][1]).toBeCloseTo(0.005, 10)
    const rare = tierUpProbabilities('rare', changed)
    expect(rare[0][1]).toBeCloseTo(13 / 16, 10)
    expect(sum(rare)).toBeCloseTo(1, 10)
  })

  it('확률 0인 등급도 줄에 남긴다 (0% 줄을 지우지 않는다)', () => {
    const noMystic: TierUpRollPolicy = { ...POLICY, rarity_common: 72, rarity_rare: 22, rarity_epic: 6, rarity_mystic: 0 }
    const rows = tierUpProbabilities('epic', noMystic)
    expect(rows).toEqual([
      ['epic', 1],
      ['mystic', 0],
    ])
  })

  it('재료 등급 이상의 설정 확률이 전부 0이면 재료 등급 그대로 100%다', () => {
    const onlyCommon: TierUpRollPolicy = { ...POLICY, rarity_common: 100, rarity_rare: 0, rarity_epic: 0, rarity_mystic: 0 }
    expect(tierUpProbabilities('rare', onlyCommon)).toEqual([['rare', 1]])
  })

  it('Mystic 재료는 지원하지 않는다', () => {
    expect(() => tierUpProbabilities('mystic' as never, POLICY)).toThrow()
  })

  it('isTierUpMaterialRarity — Common·Rare·Epic만 재료다', () => {
    expect(isTierUpMaterialRarity('common')).toBe(true)
    expect(isTierUpMaterialRarity('rare')).toBe(true)
    expect(isTierUpMaterialRarity('epic')).toBe(true)
    expect(isTierUpMaterialRarity('mystic')).toBe(false)
    expect(isTierUpMaterialRarity(null)).toBe(false)
    expect(isTierUpMaterialRarity('legend')).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────
// 2. 굴림 (순수)
// ────────────────────────────────────────────────────────────

describe('rollTierUp — 난수 순서와 경계', () => {
  it('난수는 트라이브 → 등급 → 아이템 순서로 쓴다 (내 트라이브: 트라이브 1번)', () => {
    const rand = seq(0.9, 0.5, 0.0)
    const result = rollTierUp(rollInput('common'), rand)

    expect(result?.tribeId).toBe(T_OWN)
    expect(result?.rarity).toBe('common')
    expect(result?.badge.id).toBe('own-c1')
    expect(rand.left()).toBe(0)
  })

  it('다른 트라이브면 트라이브에 난수를 두 번 쓴다 (확률 1번, 고르기 1번)', () => {
    // 0.1 < 0.2 → 다른 트라이브. 고르기 0.0 → 첫 번째(T_B). 이어서 등급 0.5 → common, 아이템 0.0 → 첫 후보
    const rand = seq(0.1, 0.0, 0.5, 0.0)
    const result = rollTierUp(rollInput('common'), rand)

    expect(result?.tribeId).toBe(T_B)
    expect(result?.badge.id).toBe('b-c1')
    expect(rand.left()).toBe(0)
  })

  it('다른 트라이브 확률 경계: 난수가 확률 미만이면 다른 트라이브, 이상이면 내 트라이브다', () => {
    expect(rollTierUp(rollInput('common'), seq(0.199, 0.0, 0.5, 0.0))?.tribeId).toBe(T_B)
    expect(rollTierUp(rollInput('common'), seq(0.2, 0.5, 0.0))?.tribeId).toBe(T_OWN)
  })

  it('다른 트라이브 확률이 0이면 늘 내 트라이브, 1이면 늘 다른 트라이브다', () => {
    const never = rollInput('common', { policy: { ...POLICY, other_tribe_probability: 0 } })
    expect(rollTierUp(never, seq(0.0, 0.5, 0.0))?.tribeId).toBe(T_OWN)
    const always = rollInput('common', { policy: { ...POLICY, other_tribe_probability: 1 } })
    expect(rollTierUp(always, seq(0.99, 0.0, 0.5, 0.0))?.tribeId).not.toBe(T_OWN)
  })

  it('Common 재료의 등급 경계 (70/22/6/2)', () => {
    const roll = (u: number) => rollTierUp(rollInput('common'), seq(0.9, u, 0.0))?.rarity
    expect(roll(0.5)).toBe('common')
    expect(roll(0.8)).toBe('rare')
    expect(roll(0.95)).toBe('epic')
    expect(roll(0.99)).toBe('mystic')
  })

  it('Rare 재료는 난수가 0이어도 Common이 나오지 않는다 (Rare 약 73.3/Epic 20/Mystic 약 6.7)', () => {
    const roll = (u: number) => rollTierUp(rollInput('rare'), seq(0.9, u, 0.0))?.rarity
    expect(roll(0.0)).toBe('rare')
    expect(roll(0.5)).toBe('rare')
    expect(roll(0.8)).toBe('epic')
    expect(roll(0.97)).toBe('mystic')
  })

  it('Epic 재료의 등급 경계 (Epic 75/Mystic 25)', () => {
    const roll = (u: number) => rollTierUp(rollInput('epic'), seq(0.9, u, 0.0))?.rarity
    expect(roll(0.0)).toBe('epic')
    expect(roll(0.7)).toBe('epic')
    expect(roll(0.8)).toBe('mystic')
    expect(roll(0.999)).toBe('mystic')
  })
})

describe('rollTierUp — 분포', () => {
  /** 등급 난수를 0~1에 고르게 훑어 얻은 등급별 비율 */
  function rarityFrequencies(material: TierUpRollInput<PoolBadge>['materialRarity'], samples = 10000): Record<string, number> {
    const counts: Record<string, number> = {}
    for (let i = 0; i < samples; i++) {
      const u = (i + 0.5) / samples
      const rarity = rollTierUp(rollInput(material), seq(0.9, u, 0.0))?.rarity ?? 'none'
      counts[rarity] = (counts[rarity] ?? 0) + 1
    }
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / samples]))
  }

  it('Common 재료: 70/22/6/2에 맞는 분포다', () => {
    const f = rarityFrequencies('common')
    expect(f.common).toBeCloseTo(0.7, 2)
    expect(f.rare).toBeCloseTo(0.22, 2)
    expect(f.epic).toBeCloseTo(0.06, 2)
    expect(f.mystic).toBeCloseTo(0.02, 2)
  })

  it('Rare 재료: 약 73.3/20/6.7이고 Common이 한 번도 나오지 않는다', () => {
    const f = rarityFrequencies('rare')
    expect(f.common).toBeUndefined()
    expect(f.rare).toBeCloseTo(22 / 30, 2)
    expect(f.epic).toBeCloseTo(0.2, 2)
    expect(f.mystic).toBeCloseTo(2 / 30, 2)
  })

  it('Epic 재료: 75/25이고 Common·Rare가 한 번도 나오지 않는다', () => {
    const f = rarityFrequencies('epic')
    expect(f.common).toBeUndefined()
    expect(f.rare).toBeUndefined()
    expect(f.epic).toBeCloseTo(0.75, 2)
    expect(f.mystic).toBeCloseTo(0.25, 2)
  })

  it('아이템은 균등이다 — 같은 트라이브·등급의 후보가 모두 같은 몫으로 나온다', () => {
    const counts: Record<string, number> = {}
    const samples = 3000
    for (let i = 0; i < samples; i++) {
      const u = (i + 0.5) / samples
      const id = rollTierUp(rollInput('common'), seq(0.9, 0.5, u))?.badge.id ?? 'none'
      counts[id] = (counts[id] ?? 0) + 1
    }
    expect(Object.keys(counts).sort()).toEqual(['own-c1', 'own-c2', 'own-c3'])
    for (const id of Object.keys(counts)) expect(counts[id] / samples).toBeCloseTo(1 / 3, 2)
  })

  it('아이템 난수 경계: 0이면 첫 후보, 1에 가까우면 마지막 후보다', () => {
    expect(rollTierUp(rollInput('common'), seq(0.9, 0.5, 0.0))?.badge.id).toBe('own-c1')
    expect(rollTierUp(rollInput('common'), seq(0.9, 0.5, 0.9999))?.badge.id).toBe('own-c3')
  })
})

describe('rollTierUp — 후보가 없을 때', () => {
  it('정한 등급에 후보가 없으면 한 등급씩 내려가되 재료 등급까지만 내려간다', () => {
    // 내 트라이브에 Epic·Mystic이 없고 Rare까지 있다. 재료 Rare, 굴림 Mystic → Rare로 내려간다.
    const badges = [badge('x-c1', 'common', 'book-own'), badge('x-r1', 'rare', 'book-own')]
    const result = rollTierUp(rollInput('rare', { badges }), seq(0.9, 0.97, 0.0))

    expect(result?.rolledRarity).toBe('mystic')
    expect(result?.rarity).toBe('rare')
    expect(result?.badge.id).toBe('x-r1')
  })

  it('재료 등급 아래로는 내려가지 않는다 — 재료 등급 이상 후보가 하나도 없으면 null이다', () => {
    const commonOnly = [badge('x-c1', 'common', 'book-own'), badge('x-c2', 'common', 'book-own')]
    expect(rollTierUp(rollInput('rare', { badges: commonOnly }), seq(0.9, 0.5, 0.0))).toBeNull()
    expect(rollTierUp(rollInput('epic', { badges: commonOnly }), seq(0.9, 0.5, 0.0))).toBeNull()
  })

  it('Common 재료는 Common까지 내려간다', () => {
    const commonOnly = [badge('x-c1', 'common', 'book-own')]
    const result = rollTierUp(rollInput('common', { badges: commonOnly }), seq(0.9, 0.99, 0.0))

    expect(result?.rolledRarity).toBe('mystic')
    expect(result?.rarity).toBe('common')
    expect(result?.badge.id).toBe('x-c1')
  })

  it('컬렉션이 꺼졌거나 삭제·드랍 제외·공개 기간 밖인 배지는 나오지 않는다', () => {
    const books = [
      book('book-own', T_OWN),
      book('book-off', T_OWN, { is_active: false }),
      book('book-excluded', T_OWN, { drop_excluded: true }),
    ]
    const badges = [
      badge('ok-c1', 'common', 'book-own'),
      badge('off-c1', 'common', 'book-off'),
      badge('excluded-c1', 'common', 'book-excluded'),
      badge('deleted-c1', 'common', 'book-own', { deleted_at: '2026-10-01T00:00:00.000Z' }),
      badge('dropx-c1', 'common', 'book-own', { drop_excluded: true }),
      badge('future-c1', 'common', 'book-own', { valid_from: '2026-11-01T00:00:00.000Z' }),
      badge('ended-c1', 'common', 'book-own', { valid_until: '2026-10-01T00:00:00.000Z' }),
    ]
    for (let i = 0; i < 20; i++) {
      const u = (i + 0.5) / 20
      expect(rollTierUp(rollInput('common', { books, badges }), seq(0.9, 0.5, u))?.badge.id).toBe('ok-c1')
    }
  })
})

describe('rollTierUp — 다른 트라이브 대상', () => {
  it('Common 재료는 Common만 있는 옛 트라이브도 «다른 트라이브» 대상이다', () => {
    // 대상 [T_B, T_OLD] — 고르기 0.99 → 마지막(T_OLD)
    const result = rollTierUp(rollInput('common'), seq(0.1, 0.99, 0.5, 0.0))
    expect(result?.tribeId).toBe(T_OLD)
    expect(result?.badge.id).toBe('old-c1')
  })

  it('Rare 이상 재료는 Common만 있는 옛 트라이브가 뽑혀 거절되는 일이 없다 (대상에서 빠진다)', () => {
    // 대상 [T_B] — 고르기 0.99여도 T_B
    for (const u of [0.0, 0.5, 0.99]) {
      const result = rollTierUp(rollInput('rare'), seq(0.1, u, 0.0, 0.0))
      expect(result?.tribeId).toBe(T_B)
      expect(result?.badge.id).toBe('b-r1')
    }
  })
})

// ────────────────────────────────────────────────────────────
// 3. 실행
// ────────────────────────────────────────────────────────────

const ITEM_IDS = ['item-1', 'item-2', 'item-3', 'item-4', 'item-5']
const INVENTORY = { id: 'inv-1', used_slots: 8, max_slots: 10 }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** 재료 5개: 서로 다른 배지 id(`mat-1`~`mat-5`)이고 모두 같은 등급의 아이템 배지 */
function setMaterials(rarity: BadgeRarity | null = 'common', type = 'item') {
  db.items = ITEM_IDS.map((id, i) => ({ id, badge_id: `mat-${i + 1}`, locked: false }))
  db.materialBadges = ITEM_IDS.map((_, i) => ({ id: `mat-${i + 1}`, type, rarity }))
}

function grantOk(itemIds = ['new-item-1']) {
  return { data: { ok: true, status: 'granted', itemIds, pendingCount: 0 }, error: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.callOrder = []
  db.inventory = { ...INVENTORY }
  db.materialBadgesError = null
  db.rpcCalls = []
  db.grant = grantOk()
  setMaterials('common')

  mocks.assertNotSuspended.mockResolvedValue(undefined)
  mocks.getPendingCount.mockResolvedValue(0)
  mocks.getCapsulePolicy.mockResolvedValue({ ...POLICY, guaranteed_count: 1 })
  mocks.loadRollData.mockResolvedValue({
    tribeId: T_OWN,
    tribes: TRIBE_IDS.map((id) => ({ id, name: `트라이브 ${id}` })),
    books: BOOKS,
    badges: pool(),
    commonStreak: 0,
    epicMiss: 0,
  })
  mocks.burnMaterials.mockResolvedValue({ ok: true, destroyedCount: 5 })
  mocks.notifyInventorySlotsLow.mockResolvedValue(undefined)
  mocks.followUpCombineResultPoints.mockResolvedValue(undefined)
  mocks.awardChapterScore.mockResolvedValue({ ok: true, scoreAdded: 20, currentChapter: null, reachedChapters: [] })
  mocks.readUnlockRequired.mockResolvedValue([])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** 소각 앞의 거절이 소각·지급·점수를 하나도 일으키지 않았는지 */
function expectNothingChanged() {
  expect(mocks.burnMaterials).not.toHaveBeenCalled()
  expect(db.rpcCalls).toEqual([])
  expect(mocks.notifyInventorySlotsLow).not.toHaveBeenCalled()
  expect(mocks.followUpCombineResultPoints).not.toHaveBeenCalled()
  expect(mocks.awardChapterScore).not.toHaveBeenCalled()
}

describe('tierUp — 성공', () => {
  it('Common 5개를 내면 소각하고 결과 1개를 지급하고 챕터 점수를 한 번 센다 (난수 고정: Epic 굴림)', async () => {
    // 내 트라이브, 등급 0.95 → epic, 아이템 0.0 → 첫 Epic(own-e1)
    const result = await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.95, 0.0), now: NOW })

    expect(result).toEqual({
      success: true,
      path: 'tier_up',
      materialRarity: 'common',
      resultBadges: [{ id: 'own-e1', name: '배지 own-e1', rarity: 'epic' }],
      pointsAwarded: 0,
      resultStatus: 'granted',
    })
    // 재료 소각 — 요청한 개체 5개 전부, 내 인벤토리
    expect(mocks.burnMaterials).toHaveBeenCalledTimes(1)
    const [, burnInput] = mocks.burnMaterials.mock.calls[0] as [unknown, { userId: string; inventory: unknown; itemIds: string[] }]
    expect(burnInput.userId).toBe(USER)
    expect(burnInput.itemIds).toEqual(ITEM_IDS)
    expect(burnInput.inventory).toEqual(INVENTORY)
    // 지급 — 레시피 없이 combine_grant_results 한 번, 결과 배지 1개, 열린 채
    expect(db.rpcCalls).toEqual([
      { fnName: 'combine_grant_results', args: { p_user_id: USER, p_recipe_id: null, p_badge_ids: ['own-e1'], p_locked: false } },
    ])
    // 후속 — 남은 칸 알림, 지급된 개체의 배지 포인트
    expect(mocks.notifyInventorySlotsLow).toHaveBeenCalledTimes(1)
    expect(mocks.followUpCombineResultPoints).toHaveBeenCalledWith(expect.anything(), USER, ['new-item-1'])
  })

  it('챕터 점수 «믹스 성공»은 새 UUID를 원천 id로 한 번만 센다 — 시도마다 다른 id다', async () => {
    await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })
    await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })

    expect(mocks.awardChapterScore).toHaveBeenCalledTimes(2)
    const [, first] = mocks.awardChapterScore.mock.calls[0] as [unknown, { userId: string; kind: string; sourceId: string }]
    const [, second] = mocks.awardChapterScore.mock.calls[1] as [unknown, { userId: string; kind: string; sourceId: string }]
    expect(first.userId).toBe(USER)
    expect(first.kind).toBe('mix_success')
    expect(first.sourceId).toMatch(UUID_PATTERN)
    expect(second.sourceId).toMatch(UUID_PATTERN)
    expect(second.sourceId).not.toBe(first.sourceId)
  })

  it('순서: 굴림(풀 읽기)은 소각보다 앞이고, 소각 → 지급 → 후속 → 챕터 점수다', async () => {
    await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })

    expect(mocks.callOrder).toEqual([
      'createServiceClient',
      'assertNotSuspended',
      'getPendingCount',
      'loadRollData',
      'burnMaterials',
      'rpc:combine_grant_results',
      'notifyInventorySlotsLow',
      'followUpCombineResultPoints',
      'awardChapterScore',
    ])
  })

  it('결과 등급은 재료 등급 이상이다 — Epic 재료는 난수가 0이어도 Epic이다', async () => {
    setMaterials('epic')
    const result = await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.0, 0.0) })

    expect(result).toMatchObject({ success: true, materialRarity: 'epic' })
    if (result.success) expect(result.resultBadges[0].rarity).toBe('epic')
  })

  it('캡슐 설정을 읽어 굴린다 — 설정을 바꾸면 결과 확률도 바뀐다 (Mystic 100%로 시험)', async () => {
    mocks.getCapsulePolicy.mockResolvedValue({ ...POLICY, rarity_common: 0, rarity_rare: 0, rarity_epic: 0, rarity_mystic: 100 })
    const result = await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.0, 0.0) })

    expect(result.success && result.resultBadges[0].rarity).toBe('mystic')
  })

  it('같은 배지의 개체 여러 개를 재료로 낼 수 있다 (배지 id가 겹쳐도 개수는 개체 기준이다)', async () => {
    db.items = ITEM_IDS.map((id) => ({ id, badge_id: 'mat-same', locked: false }))
    db.materialBadges = [{ id: 'mat-same', type: 'item', rarity: 'common' }]

    const result = await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })

    expect(result.success).toBe(true)
  })

  it('JAM! 행동 지표나 레시피 성공 기록은 만들지 않는다 (rpc는 combine_grant_results 하나뿐)', async () => {
    await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })

    expect(db.rpcCalls.map((c) => c.fnName)).toEqual(['combine_grant_results'])
  })

  it('챕터 점수 쪽이 실패해도(ok: false) 응답은 성공 그대로다', async () => {
    mocks.awardChapterScore.mockResolvedValue({ ok: false })

    const result = await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })

    expect(result.success).toBe(true)
  })
})

describe('tierUp — 받지 않은 결과와 잠긴 결과', () => {
  it('빈칸이 모자라면 결과를 받지 않은 결과로 남기고 알림·배지 포인트 후속은 하지 않는다 (재료는 소각됨, 점수는 센다)', async () => {
    db.grant = { data: { ok: true, status: 'pending', itemIds: [], pendingCount: 1, free: 0, needed: 1 }, error: null }

    const result = await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })

    expect(result).toEqual({
      success: true,
      path: 'tier_up',
      materialRarity: 'common',
      resultBadges: [],
      pointsAwarded: 0,
      resultStatus: 'pending',
      pendingCount: 1,
      freeSlots: 0,
    })
    expect(mocks.burnMaterials).toHaveBeenCalledTimes(1)
    expect(mocks.notifyInventorySlotsLow).not.toHaveBeenCalled()
    expect(mocks.followUpCombineResultPoints).not.toHaveBeenCalled()
    expect(mocks.awardChapterScore).toHaveBeenCalledTimes(1)
  })

  it('잠김으로 만든 배지가 나오면 이름·id를 가리고 필요한 양을 싣는다', async () => {
    const locked = badge('own-c1', 'common', 'book-own', { always_locked: true })
    mocks.loadRollData.mockResolvedValue({
      tribeId: T_OWN,
      tribes: [{ id: T_OWN, name: '내 트라이브' }],
      books: BOOKS,
      badges: [locked],
      commonStreak: 0,
      epicMiss: 0,
    })
    mocks.readUnlockRequired.mockResolvedValue([5])

    const result = await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })

    expect(result).toMatchObject({
      success: true,
      resultStatus: 'granted',
      resultBadges: [{ id: '', name: '', rarity: 'common', locked: true, unlockRequired: 5 }],
    })
    expect(mocks.readUnlockRequired).toHaveBeenCalledWith(expect.anything(), ['new-item-1'])
    // 지급은 열린 채 요청한다 — 잠김은 DB가 배지(always_locked)로 정한다
    expect(db.rpcCalls[0].args.p_locked).toBe(false)
  })

  it('필요한 양을 읽지 못하면 unlockRequired 칸을 뺀다', async () => {
    const locked = badge('own-c1', 'common', 'book-own', { always_locked: true })
    mocks.loadRollData.mockResolvedValue({
      tribeId: T_OWN,
      tribes: [{ id: T_OWN, name: '내 트라이브' }],
      books: BOOKS,
      badges: [locked],
      commonStreak: 0,
      epicMiss: 0,
    })
    mocks.readUnlockRequired.mockResolvedValue([])

    const result = await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })

    expect(result.success && result.resultBadges[0]).toEqual({ id: '', name: '', rarity: 'common', locked: true })
  })
})

describe('tierUp — 소각 앞의 거절 (재료·지급·점수 모두 그대로)', () => {
  it.each([
    ['4개', ITEM_IDS.slice(0, 4)],
    ['6개', [...ITEM_IDS, 'item-6']],
    ['빈 목록', []],
    ['중복', ['item-1', 'item-1', 'item-3', 'item-4', 'item-5']],
    ['빈 문자열 포함', ['item-1', '', 'item-3', 'item-4', 'item-5']],
  ])('재료가 %s이면 invalid_count다', async (_label, ids) => {
    const result = await tierUp(USER, ids, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_count', pointsAwarded: 0 })
    expectNothingChanged()
    expect(mocks.assertNotSuspended).not.toHaveBeenCalled()
  })

  it('재료 개수 상수는 5다', () => {
    expect(TIER_UP_MATERIAL_COUNT).toBe(5)
  })

  it('이용 정지 중이면 UserSuspendedError를 던지고 아무것도 하지 않는다', async () => {
    mocks.assertNotSuspended.mockRejectedValue(new UserSuspendedError({ reason: '운영 정책 위반', suspendedAt: '2026-10-01T00:00:00.000Z' }))

    await expect(tierUp(USER, ITEM_IDS, { rand: seq() })).rejects.toBeInstanceOf(UserSuspendedError)

    expectNothingChanged()
    expect(mocks.getPendingCount).not.toHaveBeenCalled()
  })

  it('받지 않은 결과가 있으면 pending_results_exist다', async () => {
    mocks.getPendingCount.mockResolvedValue(2)

    const result = await tierUp(USER, ITEM_IDS, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'pending_results_exist', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('받지 않은 결과 개수를 읽지 못하면 던진다 (있는데 없다고 보고 진행하지 않는다)', async () => {
    mocks.getPendingCount.mockRejectedValue(new Error('combine_pending_results 개수 조회 실패'))

    await expect(tierUp(USER, ITEM_IDS, { rand: seq() })).rejects.toThrow('개수 조회 실패')

    expectNothingChanged()
  })

  it('인벤토리가 없으면 items_not_found다', async () => {
    db.inventory = null

    const result = await tierUp(USER, ITEM_IDS, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'items_not_found', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('내 것이 아니거나 장착·드랍된 개체가 섞여 조회가 5개보다 적으면 items_not_found다', async () => {
    db.items = (db.items as unknown[]).slice(0, 4)

    const result = await tierUp(USER, ITEM_IDS, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'items_not_found', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('잠긴 개체가 하나라도 있으면 locked_item_not_allowed다', async () => {
    db.items = ITEM_IDS.map((id, i) => ({ id, badge_id: `mat-${i + 1}`, locked: i === 2 }))

    const result = await tierUp(USER, ITEM_IDS, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'locked_item_not_allowed', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('등급이 섞이면 invalid_materials다', async () => {
    db.materialBadges = ITEM_IDS.map((_, i) => ({ id: `mat-${i + 1}`, type: 'item', rarity: i === 4 ? 'rare' : 'common' }))

    const result = await tierUp(USER, ITEM_IDS, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_materials', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('Mystic 재료는 invalid_materials다', async () => {
    setMaterials('mystic')

    const result = await tierUp(USER, ITEM_IDS, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_materials', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('아이템 배지가 아닌 재료가 섞이면 invalid_materials다', async () => {
    db.materialBadges = ITEM_IDS.map((_, i) => ({ id: `mat-${i + 1}`, type: i === 0 ? 'activity' : 'item', rarity: 'common' }))

    const result = await tierUp(USER, ITEM_IDS, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_materials', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('등급 값이 없는 배지는 invalid_materials다', async () => {
    setMaterials(null)

    const result = await tierUp(USER, ITEM_IDS, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_materials', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('재료 배지 행을 찾지 못하면 invalid_materials다', async () => {
    db.materialBadges = (db.materialBadges as unknown[]).slice(0, 4)

    const result = await tierUp(USER, ITEM_IDS, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_materials', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('재료 배지를 읽지 못하면 던진다 (소각 전)', async () => {
    db.materialBadgesError = { message: 'db down' }

    await expect(tierUp(USER, ITEM_IDS, { rand: seq() })).rejects.toThrow('재료 배지 조회 실패')

    expectNothingChanged()
  })

  it('결과로 나올 아이템 배지가 하나도 없으면 소각하지 않고 no_candidate로 거절한다', async () => {
    mocks.loadRollData.mockResolvedValue({
      tribeId: T_OWN,
      tribes: [{ id: T_OWN, name: '내 트라이브' }],
      books: BOOKS,
      badges: [],
      commonStreak: 0,
      epicMiss: 0,
    })

    const result = await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5) })

    expect(result).toEqual({ success: false, reason: 'no_candidate', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('Rare 재료인데 Rare 이상 아이템이 하나도 없으면 no_candidate다 (Common으로 내려가지 않는다)', async () => {
    setMaterials('rare')
    mocks.loadRollData.mockResolvedValue({
      tribeId: T_OWN,
      tribes: TRIBE_IDS.map((id) => ({ id, name: id })),
      books: BOOKS,
      badges: [badge('own-c1', 'common', 'book-own')],
      commonStreak: 0,
      epicMiss: 0,
    })

    const result = await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })

    expect(result).toEqual({ success: false, reason: 'no_candidate', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('풀을 읽지 못하면 던진다 (소각 전)', async () => {
    mocks.loadRollData.mockRejectedValue(new Error('item_books 조회 실패'))

    await expect(tierUp(USER, ITEM_IDS, { rand: seq() })).rejects.toThrow('item_books 조회 실패')

    expectNothingChanged()
  })
})

describe('tierUp — 소각 뒤', () => {
  it('소각이 동시 시도로 실패하면 items_not_found이고 지급·점수가 없다', async () => {
    mocks.burnMaterials.mockResolvedValue({ ok: false })

    const result = await tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })

    expect(result).toEqual({ success: false, reason: 'items_not_found', pointsAwarded: 0 })
    expect(db.rpcCalls).toEqual([])
    expect(mocks.awardChapterScore).not.toHaveBeenCalled()
  })

  it.each([
    ['RPC 오류', { data: null, error: { message: 'rpc down' } }],
    ['ok: false', { data: { ok: false, error: 'inventory_not_found' }, error: null }],
    ['지급할 결과 없음(status none)', { data: { ok: true, status: 'none', itemIds: [], pendingCount: 0 }, error: null }],
    ['빈 응답', { data: null, error: null }],
  ])('결과 지급이 실패하면(%s) 재료가 이미 소각된 뒤라 로그를 남기고 던진다 — 점수는 세지 않는다', async (_label, grant) => {
    db.grant = grant as typeof db.grant

    await expect(tierUp(USER, ITEM_IDS, { rand: seq(0.9, 0.5, 0.0) })).rejects.toThrow('재료는 이미 소각됐다')

    expect(mocks.burnMaterials).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      '[tierUp] combine_grant_results 실패 — 재료만 소각되고 결과가 지급되지 않음:',
      expect.objectContaining({ userId: USER, materialItemIds: ITEM_IDS })
    )
    expect(mocks.awardChapterScore).not.toHaveBeenCalled()
  })
})
