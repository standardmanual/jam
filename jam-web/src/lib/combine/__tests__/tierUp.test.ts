/**
 * 등급 올리기 `tierUpProbabilities` · `rollTierUp` · `tierUp` (티켓 20261022_2119 2회, 20261023_1648 2회, 운영 로직 8.4절)
 *
 * 검증 대상:
 *  1) 확률표 — 재료 등급 그대로가 `1 - p`, 바로 위 등급이 `p`(윗등급 확률 한 칸). 기본 0.7이면 30/70. 0과 1에서도 0% 줄을 지우지 않는다. Mystic 재료는 던진다
 *  2) 굴림(순수) — 난수를 인자로 주입해 경계를 고정한다. 난수 순서는 등급(1번) → 아이템(1번)이다. 아이템은 **고른 컬렉션** 안의 그 등급 후보에서 균등이다.
 *     정한 등급의 후보가 없거나 소속 트라이브의 열린 컬렉션이 아니면 아래 등급으로 내려가지 않고 null이다
 *  3) 실행 — 소각 앞(개수·정지·받지 않은 결과·소유·잠김·재료 검사·고른 컬렉션 검사)의 거절은 소각·지급·점수가 없다. 고른 컬렉션에 재료 등급·바로 윗등급 아이템 배지가
 *     모두 있어야 하고(`collectionSupportsTierUp`, 믹스 화면 목록과 같은 판정, 티켓 20261025_2011) 한쪽만 있으면 `invalid_collection`이다. 성공하면 소각 → 지급(`combine_grant_results`,
 *     레시피 없음) → 후속 → 서비스 활동 잼 «믹스 성공» 한 번(새 UUID). 빈칸이 모자라면 받지 않은 결과로 남기고, 잠긴 결과는 가린다. 지급 실패는 던진다
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
  getCombinePolicy: vi.fn(),
  burnMaterials: vi.fn(),
  notifyInventorySlotsLow: vi.fn(),
  followUpCombineResultPoints: vi.fn(),
  awardServiceJam: vi.fn(),
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
vi.mock('@/lib/combine/policy', () => ({
  getCombinePolicy: (...args: unknown[]) => {
    mocks.callOrder.push('getCombinePolicy')
    return mocks.getCombinePolicy(...args)
  },
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
vi.mock('@/lib/jam/serviceActivity', () => ({
  awardServiceJam: (...args: unknown[]) => {
    mocks.callOrder.push('awardServiceJam')
    return mocks.awardServiceJam(...args)
  },
}))
// 믹스 본체는 가져오지 않는다 — 등급 올리기는 «잠긴 결과의 필요한 양 읽기» 하나만 쓴다
vi.mock('@/lib/combine/index', () => ({
  readUnlockRequired: (...args: unknown[]) => mocks.readUnlockRequired(...args),
}))

import { UserSuspendedError } from '@/lib/suspension/suspension'
import { tierUpCollectionChoices } from '@/app/(main)/combine/tierUpClient'
import { buildTierUpCollectionOptions } from '@/lib/combine/tierUpCollections'
import { collectionSupportsTierUp, tierUpUpperRarity } from '@/lib/combine/tierUpOdds'
import {
  isTierUpMaterialRarity,
  rollTierUp,
  tierUp,
  tierUpProbabilities,
  TIER_UP_MATERIAL_COUNT,
  type TierUpRollInput,
} from '../tierUp'

// ────────────────────────────────────────────────────────────
// 공통 준비물
// ────────────────────────────────────────────────────────────

const USER = 'user-1'
const NOW = new Date('2026-10-23T00:00:00.000Z')

/** 2026-10-23 공용 DB의 믹스 정책 — 윗등급 확률 0.7 */
const COMBINE_POLICY = { fail_reward_points: 10, tier_up_probability: 0.7 }

const T_OWN = 'tribe-own'
const T_B = 'tribe-b'

/** 내가 고르는 컬렉션(소속 트라이브) */
const BOOK_OWN = 'book-own'
/** 소속 트라이브의 다른 컬렉션 */
const BOOK_OWN_2 = 'book-own-2'
/** 다른 트라이브의 컬렉션 — 고를 수 없다 */
const BOOK_B = 'book-b'

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

const BOOKS: IssueBook[] = [book(BOOK_OWN, T_OWN), book(BOOK_OWN_2, T_OWN), book(BOOK_B, T_B)]

function pool(extra: PoolBadge[] = []): PoolBadge[] {
  return [
    badge('own-c1', 'common', BOOK_OWN),
    badge('own-c2', 'common', BOOK_OWN),
    badge('own-c3', 'common', BOOK_OWN),
    badge('own-r1', 'rare', BOOK_OWN),
    badge('own-r2', 'rare', BOOK_OWN),
    badge('own-e1', 'epic', BOOK_OWN),
    badge('own-m1', 'mystic', BOOK_OWN),
    badge('own2-c1', 'common', BOOK_OWN_2),
    badge('own2-r1', 'rare', BOOK_OWN_2),
    badge('b-c1', 'common', BOOK_B),
    badge('b-r1', 'rare', BOOK_B),
    badge('b-e1', 'epic', BOOK_B),
    badge('b-m1', 'mystic', BOOK_B),
    ...extra,
  ]
}

function rollInput(
  materialRarity: TierUpRollInput<PoolBadge>['materialRarity'],
  overrides: Partial<TierUpRollInput<PoolBadge>> = {}
): TierUpRollInput<PoolBadge> {
  return { materialRarity, tierUpProbability: 0.7, tribeId: T_OWN, collectionId: BOOK_OWN, books: BOOKS, badges: pool(), now: NOW, ...overrides }
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
  it('기본값 0.7: 재료 등급 그대로 30%, 바로 위 등급 70%다 — Common·Rare·Epic 모두', () => {
    const cases = [
      ['common', 'rare'],
      ['rare', 'epic'],
      ['epic', 'mystic'],
    ] as const
    for (const [material, upper] of cases) {
      const rows = tierUpProbabilities(material, 0.7)
      expect(rows.map(([r]) => r)).toEqual([material, upper])
      expect(rows[0][1]).toBeCloseTo(0.3, 10)
      expect(rows[1][1]).toBeCloseTo(0.7, 10)
    }
  })

  it('낮은 등급(재료 등급 그대로)이 먼저, 바로 위 등급이 아래다 — 재료보다 낮은 등급과 두 칸 위 등급은 줄에 없다', () => {
    expect(tierUpProbabilities('rare', 0.7).map(([r]) => r)).toEqual(['rare', 'epic'])
    expect(tierUpProbabilities('common', 0.7).map(([r]) => r)).not.toContain('epic')
    expect(tierUpProbabilities('epic', 0.7).map(([r]) => r)).not.toContain('rare')
  })

  it.each(['common', 'rare', 'epic'] as const)('%s 재료의 확률 합은 1이다', (material) => {
    for (const p of [0, 0.2, 0.333, 0.5, 0.7, 1]) expect(sum(tierUpProbabilities(material, p))).toBeCloseTo(1, 10)
  })

  it('윗등급 확률을 바꾸면 표가 따라 바뀐다 (0.5, 0.333)', () => {
    expect(tierUpProbabilities('common', 0.5)).toEqual([
      ['common', 0.5],
      ['rare', 0.5],
    ])
    const third = tierUpProbabilities('rare', 0.333)
    expect(third[0][1]).toBeCloseTo(0.667, 10)
    expect(third[1][1]).toBeCloseTo(0.333, 10)
  })

  it('윗등급 확률 0: 같은 등급 100%, 윗등급 0% 줄을 지우지 않는다', () => {
    expect(tierUpProbabilities('rare', 0)).toEqual([
      ['rare', 1],
      ['epic', 0],
    ])
  })

  it('윗등급 확률 1: 같은 등급 0% 줄을 지우지 않고 윗등급 100%다', () => {
    expect(tierUpProbabilities('epic', 1)).toEqual([
      ['epic', 0],
      ['mystic', 1],
    ])
  })

  it('Mystic 재료는 지원하지 않는다', () => {
    expect(() => tierUpProbabilities('mystic' as never, 0.7)).toThrow()
  })

  it('isTierUpMaterialRarity — Common·Rare·Epic만 재료다', () => {
    expect(isTierUpMaterialRarity('common')).toBe(true)
    expect(isTierUpMaterialRarity('rare')).toBe(true)
    expect(isTierUpMaterialRarity('epic')).toBe(true)
    expect(isTierUpMaterialRarity('mystic')).toBe(false)
    expect(isTierUpMaterialRarity(null)).toBe(false)
    expect(isTierUpMaterialRarity('legend')).toBe(false)
  })

  it('tierUpUpperRarity — 재료 등급의 바로 위 등급이다', () => {
    expect(tierUpUpperRarity('common')).toBe('rare')
    expect(tierUpUpperRarity('rare')).toBe('epic')
    expect(tierUpUpperRarity('epic')).toBe('mystic')
  })

  it('collectionSupportsTierUp — 재료 등급과 바로 윗등급이 모두 있어야 true다 (한쪽만 있거나 두 칸 위·아래 등급만 있으면 false)', () => {
    expect(collectionSupportsTierUp(['common', 'rare'], 'common')).toBe(true)
    expect(collectionSupportsTierUp(['common', 'rare', 'epic', 'mystic'], 'common')).toBe(true)
    expect(collectionSupportsTierUp(['rare', 'epic'], 'rare')).toBe(true)
    expect(collectionSupportsTierUp(['epic', 'mystic'], 'epic')).toBe(true)
    // 윗등급만, 재료 등급만, 비어 있음
    expect(collectionSupportsTierUp(['rare'], 'common')).toBe(false)
    expect(collectionSupportsTierUp(['common'], 'common')).toBe(false)
    expect(collectionSupportsTierUp([], 'common')).toBe(false)
    // 두 칸 위 등급이나 아래 등급은 바로 윗등급이 아니다
    expect(collectionSupportsTierUp(['common', 'epic'], 'common')).toBe(false)
    expect(collectionSupportsTierUp(['common', 'rare'], 'rare')).toBe(false)
    expect(collectionSupportsTierUp(['epic'], 'epic')).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────
// 2. 굴림 (순수)
// ────────────────────────────────────────────────────────────

describe('rollTierUp — 난수 순서와 경계', () => {
  it('난수는 등급(1번) → 아이템(1번) 순서로 쓴다 — 트라이브 난수는 쓰지 않는다', () => {
    const rand = seq(0.5, 0.0)
    const result = rollTierUp(rollInput('common'), rand)

    expect(result?.rarity).toBe('rare')
    expect(result?.badge.id).toBe('own-r1')
    expect(rand.left()).toBe(0)
  })

  it('등급 경계 (0.7): 난수가 0.3 미만이면 재료 등급 그대로, 이상이면 바로 위 등급이다', () => {
    const roll = (material: 'common' | 'rare' | 'epic', u: number) => rollTierUp(rollInput(material), seq(u, 0.0))?.rarity
    expect(roll('common', 0.0)).toBe('common')
    expect(roll('common', 0.29)).toBe('common')
    expect(roll('common', 0.31)).toBe('rare')
    expect(roll('common', 0.999)).toBe('rare')
    expect(roll('rare', 0.29)).toBe('rare')
    expect(roll('rare', 0.31)).toBe('epic')
    expect(roll('epic', 0.29)).toBe('epic')
    expect(roll('epic', 0.31)).toBe('mystic')
  })

  it('윗등급 확률 0이면 늘 재료 등급 그대로, 1이면 늘 바로 위 등급이다', () => {
    for (const u of [0.0, 0.5, 0.999]) {
      expect(rollTierUp(rollInput('common', { tierUpProbability: 0 }), seq(u, 0.0))?.rarity).toBe('common')
      expect(rollTierUp(rollInput('common', { tierUpProbability: 1 }), seq(u, 0.0))?.rarity).toBe('rare')
    }
  })

  it('윗등급 확률 0.5의 경계: 0.49는 재료 등급 그대로, 0.51은 바로 위 등급이다', () => {
    expect(rollTierUp(rollInput('rare', { tierUpProbability: 0.5 }), seq(0.49, 0.0))?.rarity).toBe('rare')
    expect(rollTierUp(rollInput('rare', { tierUpProbability: 0.5 }), seq(0.51, 0.0))?.rarity).toBe('epic')
  })
})

describe('rollTierUp — 분포', () => {
  /** 등급 난수를 0~1에 고르게 훑어 얻은 등급별 비율 */
  function rarityFrequencies(
    material: TierUpRollInput<PoolBadge>['materialRarity'],
    tierUpProbability: number,
    samples = 10000
  ): Record<string, number> {
    const counts: Record<string, number> = {}
    for (let i = 0; i < samples; i++) {
      const u = (i + 0.5) / samples
      const rarity = rollTierUp(rollInput(material, { tierUpProbability }), seq(u, 0.0))?.rarity ?? 'none'
      counts[rarity] = (counts[rarity] ?? 0) + 1
    }
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / samples]))
  }

  it('Common 재료: Common 30% / Rare 70%이고 그 밖의 등급은 한 번도 나오지 않는다', () => {
    const f = rarityFrequencies('common', 0.7)
    expect(f.common).toBeCloseTo(0.3, 2)
    expect(f.rare).toBeCloseTo(0.7, 2)
    expect(f.epic).toBeUndefined()
    expect(f.mystic).toBeUndefined()
  })

  it('Rare 재료: Rare 30% / Epic 70%이고 Common이 한 번도 나오지 않는다', () => {
    const f = rarityFrequencies('rare', 0.7)
    expect(f.common).toBeUndefined()
    expect(f.rare).toBeCloseTo(0.3, 2)
    expect(f.epic).toBeCloseTo(0.7, 2)
    expect(f.mystic).toBeUndefined()
  })

  it('Epic 재료: Epic 30% / Mystic 70%다', () => {
    const f = rarityFrequencies('epic', 0.7)
    expect(f.epic).toBeCloseTo(0.3, 2)
    expect(f.mystic).toBeCloseTo(0.7, 2)
  })

  it('윗등급 확률을 바꾸면 분포가 따라 바뀐다 (0.4)', () => {
    const f = rarityFrequencies('common', 0.4)
    expect(f.common).toBeCloseTo(0.6, 2)
    expect(f.rare).toBeCloseTo(0.4, 2)
  })

  it('아이템은 고른 컬렉션 안에서 균등이다 — 그 등급 후보가 모두 같은 몫으로 나온다', () => {
    const counts: Record<string, number> = {}
    const samples = 3000
    for (let i = 0; i < samples; i++) {
      const u = (i + 0.5) / samples
      // 등급 0.5 → 바로 위(Rare). 고른 컬렉션의 Rare는 own-r1, own-r2 둘뿐이다(다른 컬렉션의 Rare는 나오지 않는다)
      const id = rollTierUp(rollInput('common'), seq(0.5, u))?.badge.id ?? 'none'
      counts[id] = (counts[id] ?? 0) + 1
    }
    expect(Object.keys(counts).sort()).toEqual(['own-r1', 'own-r2'])
    for (const id of Object.keys(counts)) expect(counts[id] / samples).toBeCloseTo(1 / 2, 2)
  })

  it('아이템 난수 경계: 0이면 첫 후보, 1에 가까우면 마지막 후보다', () => {
    expect(rollTierUp(rollInput('common'), seq(0.1, 0.0))?.badge.id).toBe('own-c1')
    expect(rollTierUp(rollInput('common'), seq(0.1, 0.9999))?.badge.id).toBe('own-c3')
  })
})

describe('rollTierUp — 고른 컬렉션', () => {
  it('고른 컬렉션의 아이템만 나온다 — 같은 트라이브의 다른 컬렉션 아이템은 나오지 않는다', () => {
    const own2 = rollTierUp(rollInput('common', { collectionId: BOOK_OWN_2 }), seq(0.5, 0.9999))
    expect(own2?.badge.id).toBe('own2-r1')
    const own = rollTierUp(rollInput('common', { collectionId: BOOK_OWN }), seq(0.5, 0.9999))
    expect(own?.badge.id).toBe('own-r2')
  })

  it('소속 트라이브가 아닌 트라이브의 컬렉션은 고를 수 없다 — null이다', () => {
    expect(rollTierUp(rollInput('common', { collectionId: BOOK_B }), seq(0.1, 0.0))).toBeNull()
  })

  it('모르는 컬렉션 id는 null이다', () => {
    expect(rollTierUp(rollInput('common', { collectionId: 'book-unknown' }), seq(0.1, 0.0))).toBeNull()
  })

  it('꺼졌거나 드랍 제외이거나 공개 기간 밖인 컬렉션은 null이다', () => {
    const books = [
      book('book-off', T_OWN, { is_active: false }),
      book('book-excluded', T_OWN, { drop_excluded: true }),
      book('book-future', T_OWN, { valid_from: '2026-11-01T00:00:00.000Z' }),
      book('book-ended', T_OWN, { valid_until: '2026-10-01T00:00:00.000Z' }),
    ]
    const badges = books.map((b) => badge(`${b.id}-c1`, 'common', b.id))
    for (const b of books) {
      expect(rollTierUp(rollInput('common', { collectionId: b.id, books, badges }), seq(0.1, 0.0)), b.id).toBeNull()
    }
  })

  it('삭제·드랍 제외·공개 기간 밖인 배지는 나오지 않는다', () => {
    const badges = [
      badge('ok-c1', 'common', BOOK_OWN),
      badge('deleted-c1', 'common', BOOK_OWN, { deleted_at: '2026-10-01T00:00:00.000Z' }),
      badge('dropx-c1', 'common', BOOK_OWN, { drop_excluded: true }),
      badge('future-c1', 'common', BOOK_OWN, { valid_from: '2026-11-01T00:00:00.000Z' }),
      badge('ended-c1', 'common', BOOK_OWN, { valid_until: '2026-10-01T00:00:00.000Z' }),
    ]
    for (let i = 0; i < 20; i++) {
      const u = (i + 0.5) / 20
      expect(rollTierUp(rollInput('common', { badges }), seq(0.1, u))?.badge.id).toBe('ok-c1')
    }
  })
})

describe('rollTierUp — 후보가 없을 때 (아래 등급으로 내려가지 않는다)', () => {
  it('정한 등급의 후보가 고른 컬렉션에 없으면 null이다 — 재료 등급으로 내려가지 않는다', () => {
    // 고른 컬렉션에 Common만 있다. 윗등급(Rare)이 나오면 후보가 없어 null
    const commonOnly = [badge('x-c1', 'common', BOOK_OWN), badge('x-c2', 'common', BOOK_OWN)]
    expect(rollTierUp(rollInput('common', { badges: commonOnly }), seq(0.5, 0.0))).toBeNull()
  })

  it('같은 등급이 정해지면 그 등급의 후보가 있으니 받는다', () => {
    const commonOnly = [badge('x-c1', 'common', BOOK_OWN)]
    const result = rollTierUp(rollInput('common', { badges: commonOnly }), seq(0.1, 0.0))
    expect(result?.rarity).toBe('common')
    expect(result?.badge.id).toBe('x-c1')
  })

  it('고른 컬렉션이 비어 있으면 어느 등급이 나와도 null이다', () => {
    expect(rollTierUp(rollInput('common', { badges: [] }), seq(0.1, 0.0))).toBeNull()
    expect(rollTierUp(rollInput('common', { badges: [] }), seq(0.5, 0.0))).toBeNull()
  })

  it('후보가 없으면 아이템 난수는 쓰지 않는다', () => {
    const rand = seq(0.5, 0.0)
    expect(rollTierUp(rollInput('common', { badges: [] }), rand)).toBeNull()
    expect(rand.left()).toBe(1)
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

function setPool(books: IssueBook[], badges: PoolBadge[]) {
  mocks.loadRollData.mockResolvedValue({
    tribeId: T_OWN,
    tribes: [
      { id: T_OWN, name: '내 트라이브' },
      { id: T_B, name: '다른 트라이브' },
    ],
    books,
    badges,
    commonStreak: 0,
    epicMiss: 0,
  })
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
  mocks.getCombinePolicy.mockResolvedValue({ ...COMBINE_POLICY })
  setPool(BOOKS, pool())
  mocks.burnMaterials.mockResolvedValue({ ok: true, destroyedCount: 5 })
  mocks.notifyInventorySlotsLow.mockResolvedValue(undefined)
  mocks.followUpCombineResultPoints.mockResolvedValue(undefined)
  mocks.awardServiceJam.mockResolvedValue({ ok: true, granted: 5, duplicate: false, capped: false })
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
  expect(mocks.awardServiceJam).not.toHaveBeenCalled()
}

describe('tierUp — 성공', () => {
  it('Common 5개와 컬렉션을 내면 소각하고 고른 컬렉션의 결과 1개를 지급하고 서비스 활동 잼을 한 번 준다 (난수 고정: 윗등급 굴림)', async () => {
    // 등급 0.5 → rare(윗등급), 아이템 0.0 → 고른 컬렉션의 첫 Rare(own-r1)
    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.5, 0.0), now: NOW })

    expect(result).toEqual({
      success: true,
      path: 'tier_up',
      materialRarity: 'common',
      resultBadges: [{ id: 'own-r1', name: '배지 own-r1', rarity: 'rare', imageUrl: null }],
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
      { fnName: 'combine_grant_results', args: { p_user_id: USER, p_recipe_id: null, p_badge_ids: ['own-r1'], p_locked: false } },
    ])
    // 후속 — 남은 칸 알림, 지급된 개체의 배지 포인트
    expect(mocks.notifyInventorySlotsLow).toHaveBeenCalledTimes(1)
    expect(mocks.followUpCombineResultPoints).toHaveBeenCalledWith(expect.anything(), USER, ['new-item-1'])
  })

  it('같은 등급이 정해지면 고른 컬렉션의 같은 등급 아이템을 받는다 (난수 고정: 등급 0.1)', async () => {
    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN_2, { rand: seq(0.1, 0.0) })

    expect(result.success && result.resultBadges[0]).toMatchObject({ id: 'own2-c1', rarity: 'common' })
  })

  it('결과 배지에 그림 주소(imageUrl)를 싣는다 — badges.image_url 그대로, 없으면 null', async () => {
    const withImage = badge('own-r1', 'rare', BOOK_OWN, { image_url: 'https://cdn.example/own-r1.png' })
    setPool(BOOKS, [withImage, badge('own-c1', 'common', BOOK_OWN)])

    // 윗등급 굴림 → 그림이 있는 배지
    const upper = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.5, 0.0) })
    expect(upper.success && upper.resultBadges).toEqual([
      { id: 'own-r1', name: '배지 own-r1', rarity: 'rare', imageUrl: 'https://cdn.example/own-r1.png' },
    ])

    // 같은 등급 굴림 → 그림이 없는 배지는 null (키가 빠지지 않는다)
    const same = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.1, 0.0) })
    expect(same.success && same.resultBadges).toEqual([{ id: 'own-c1', name: '배지 own-c1', rarity: 'common', imageUrl: null }])
  })

  it('서비스 활동 잼 «믹스 성공»(combine_success)은 새 UUID를 원천 id로 한 번만 준다 — 시도마다 다른 id다', async () => {
    await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.5, 0.0) })
    await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.5, 0.0) })

    expect(mocks.awardServiceJam).toHaveBeenCalledTimes(2)
    const [, first] = mocks.awardServiceJam.mock.calls[0] as [unknown, { userId: string; kind: string; sourceId: string }]
    const [, second] = mocks.awardServiceJam.mock.calls[1] as [unknown, { userId: string; kind: string; sourceId: string }]
    expect(first.userId).toBe(USER)
    expect(first.kind).toBe('combine_success')
    expect(first.sourceId).toMatch(UUID_PATTERN)
    expect(second.sourceId).toMatch(UUID_PATTERN)
    expect(second.sourceId).not.toBe(first.sourceId)
  })

  it('순서: 컬렉션 검사·굴림(풀 읽기, 정책 읽기)은 소각보다 앞이고, 소각 → 지급 → 후속 → 서비스 활동 잼이다', async () => {
    await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.5, 0.0) })

    expect(mocks.callOrder).toEqual([
      'createServiceClient',
      'assertNotSuspended',
      'getPendingCount',
      'loadRollData',
      'getCombinePolicy',
      'burnMaterials',
      'rpc:combine_grant_results',
      'notifyInventorySlotsLow',
      'followUpCombineResultPoints',
      'awardServiceJam',
    ])
  })

  it('결과 등급은 재료 등급 그대로이거나 바로 위다 — Epic 재료는 Epic 또는 Mystic이다', async () => {
    setMaterials('epic')
    const same = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.0, 0.0) })
    const upper = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.99, 0.0) })

    expect(same).toMatchObject({ success: true, materialRarity: 'epic' })
    expect(same.success && same.resultBadges[0].rarity).toBe('epic')
    expect(upper.success && upper.resultBadges[0].rarity).toBe('mystic')
  })

  it('믹스 정책의 윗등급 확률을 읽어 굴린다 — 칸을 바꾸면 결과 확률도 바뀐다 (1이면 늘 윗등급, 0이면 늘 같은 등급)', async () => {
    mocks.getCombinePolicy.mockResolvedValue({ ...COMBINE_POLICY, tier_up_probability: 1 })
    const always = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.0, 0.0) })
    expect(always.success && always.resultBadges[0].rarity).toBe('rare')

    mocks.getCombinePolicy.mockResolvedValue({ ...COMBINE_POLICY, tier_up_probability: 0 })
    const never = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.999, 0.0) })
    expect(never.success && never.resultBadges[0].rarity).toBe('common')
  })

  it('같은 배지의 개체 여러 개를 재료로 낼 수 있다 (배지 id가 겹쳐도 개수는 개체 기준이다)', async () => {
    db.items = ITEM_IDS.map((id) => ({ id, badge_id: 'mat-same', locked: false }))
    db.materialBadges = [{ id: 'mat-same', type: 'item', rarity: 'common' }]

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.5, 0.0) })

    expect(result.success).toBe(true)
  })

  it('JAM! 행동 지표나 레시피 성공 기록은 만들지 않는다 (rpc는 combine_grant_results 하나뿐)', async () => {
    await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.5, 0.0) })

    expect(db.rpcCalls.map((c) => c.fnName)).toEqual(['combine_grant_results'])
  })

  it('서비스 활동 잼 쪽이 실패해도(ok: false) 응답은 성공 그대로다', async () => {
    mocks.awardServiceJam.mockResolvedValue({ ok: false })

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.5, 0.0) })

    expect(result.success).toBe(true)
  })
})

describe('tierUp — 받지 않은 결과와 잠긴 결과', () => {
  it('빈칸이 모자라면 결과를 받지 않은 결과로 남기고 알림·배지 포인트 후속은 하지 않는다 (재료는 소각됨, 점수는 센다)', async () => {
    db.grant = { data: { ok: true, status: 'pending', itemIds: [], pendingCount: 1, free: 0, needed: 1 }, error: null }

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.5, 0.0) })

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
    expect(mocks.awardServiceJam).toHaveBeenCalledTimes(1)
  })

  it('잠김으로 만든 배지가 나오면 이름·id·그림을 가리고 필요한 양을 싣는다', async () => {
    const locked = badge('own-c1', 'common', BOOK_OWN, { always_locked: true, image_url: 'https://cdn.example/own-c1.png' })
    setPool(BOOKS, [locked, badge('own-r1', 'rare', BOOK_OWN)])
    mocks.readUnlockRequired.mockResolvedValue([5])

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.1, 0.0) })

    expect(result).toMatchObject({
      success: true,
      resultStatus: 'granted',
      resultBadges: [{ id: '', name: '', rarity: 'common', imageUrl: null, locked: true, unlockRequired: 5 }],
    })
    expect(mocks.readUnlockRequired).toHaveBeenCalledWith(expect.anything(), ['new-item-1'])
    // 지급은 열린 채 요청한다 — 잠김은 DB가 배지(always_locked)로 정한다
    expect(db.rpcCalls[0].args.p_locked).toBe(false)
  })

  it('필요한 양을 읽지 못하면 unlockRequired 칸을 뺀다', async () => {
    const locked = badge('own-c1', 'common', BOOK_OWN, { always_locked: true })
    setPool(BOOKS, [locked, badge('own-r1', 'rare', BOOK_OWN)])
    mocks.readUnlockRequired.mockResolvedValue([])

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.1, 0.0) })

    expect(result.success && result.resultBadges[0]).toEqual({ id: '', name: '', rarity: 'common', imageUrl: null, locked: true })
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
    const result = await tierUp(USER, ids, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_count', pointsAwarded: 0 })
    expectNothingChanged()
    expect(mocks.assertNotSuspended).not.toHaveBeenCalled()
  })

  it('재료 개수 상수는 5다', () => {
    expect(TIER_UP_MATERIAL_COUNT).toBe(5)
  })

  it('이용 정지 중이면 UserSuspendedError를 던지고 아무것도 하지 않는다', async () => {
    mocks.assertNotSuspended.mockRejectedValue(new UserSuspendedError({ reason: '운영 정책 위반', suspendedAt: '2026-10-01T00:00:00.000Z' }))

    await expect(tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })).rejects.toBeInstanceOf(UserSuspendedError)

    expectNothingChanged()
    expect(mocks.getPendingCount).not.toHaveBeenCalled()
  })

  it('받지 않은 결과가 있으면 pending_results_exist다', async () => {
    mocks.getPendingCount.mockResolvedValue(2)

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'pending_results_exist', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('받지 않은 결과 개수를 읽지 못하면 던진다 (있는데 없다고 보고 진행하지 않는다)', async () => {
    mocks.getPendingCount.mockRejectedValue(new Error('combine_pending_results 개수 조회 실패'))

    await expect(tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })).rejects.toThrow('개수 조회 실패')

    expectNothingChanged()
  })

  it('인벤토리가 없으면 items_not_found다', async () => {
    db.inventory = null

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'items_not_found', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('내 것이 아니거나 장착·드랍된 개체가 섞여 조회가 5개보다 적으면 items_not_found다', async () => {
    db.items = (db.items as unknown[]).slice(0, 4)

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'items_not_found', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('잠긴 개체가 하나라도 있으면 locked_item_not_allowed다', async () => {
    db.items = ITEM_IDS.map((id, i) => ({ id, badge_id: `mat-${i + 1}`, locked: i === 2 }))

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'locked_item_not_allowed', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('등급이 섞이면 invalid_materials다', async () => {
    db.materialBadges = ITEM_IDS.map((_, i) => ({ id: `mat-${i + 1}`, type: 'item', rarity: i === 4 ? 'rare' : 'common' }))

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_materials', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('Mystic 재료는 invalid_materials다', async () => {
    setMaterials('mystic')

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_materials', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('아이템 배지가 아닌 재료가 섞이면 invalid_materials다', async () => {
    db.materialBadges = ITEM_IDS.map((_, i) => ({ id: `mat-${i + 1}`, type: i === 0 ? 'activity' : 'item', rarity: 'common' }))

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_materials', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('등급 값이 없는 배지는 invalid_materials다', async () => {
    setMaterials(null)

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_materials', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('재료 배지 행을 찾지 못하면 invalid_materials다', async () => {
    db.materialBadges = (db.materialBadges as unknown[]).slice(0, 4)

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_materials', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('재료 배지를 읽지 못하면 던진다 (소각 전)', async () => {
    db.materialBadgesError = { message: 'db down' }

    await expect(tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })).rejects.toThrow('재료 배지 조회 실패')

    expectNothingChanged()
  })

  it('재료가 잘못됐으면 컬렉션이 틀려도 invalid_materials가 먼저다 (재료 검사 → 컬렉션 검사 순서)', async () => {
    setMaterials('mystic')

    const result = await tierUp(USER, ITEM_IDS, 'book-unknown', { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_materials', pointsAwarded: 0 })
    expect(mocks.loadRollData).not.toHaveBeenCalled()
  })

  it.each([
    ['빈 문자열', ''],
    ['없음(undefined)', undefined],
    ['문자열이 아님', 123],
  ])('컬렉션이 %s이면 풀을 읽지 않고 invalid_collection으로 거절한다', async (_label, collectionId) => {
    const result = await tierUp(USER, ITEM_IDS, collectionId as unknown as string, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expect(mocks.loadRollData).not.toHaveBeenCalled()
    expectNothingChanged()
  })

  it('모르는 컬렉션 id는 invalid_collection이다', async () => {
    const result = await tierUp(USER, ITEM_IDS, 'book-unknown', { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('다른 트라이브의 컬렉션은 invalid_collection이다 (소속 트라이브의 컬렉션만 고를 수 있다)', async () => {
    const result = await tierUp(USER, ITEM_IDS, BOOK_B, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it.each([
    ['꺼진 컬렉션', { is_active: false }],
    ['드랍 제외 컬렉션', { drop_excluded: true }],
    ['공개 전 컬렉션', { valid_from: '2026-11-01T00:00:00.000Z' }],
    ['공개가 끝난 컬렉션', { valid_until: '2026-10-01T00:00:00.000Z' }],
  ])('%s은 invalid_collection이다 (열린 컬렉션만 고를 수 있다)', async (_label, overrides) => {
    setPool([...BOOKS, book('book-closed', T_OWN, overrides)], [...pool(), badge('closed-c1', 'common', 'book-closed'), badge('closed-r1', 'rare', 'book-closed')])

    const result = await tierUp(USER, ITEM_IDS, 'book-closed', { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('고른 컬렉션이 비어 있으면 소각하지 않고 invalid_collection으로 거절한다', async () => {
    setPool(BOOKS, [])

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('고른 컬렉션에 윗등급이 없으면 invalid_collection이다 (같은 트라이브의 다른 컬렉션에 윗등급이 있어도 고른 컬렉션 밖에서는 뽑지 않는다)', async () => {
    setPool(BOOKS, [badge('own-c1', 'common', BOOK_OWN), badge('own2-r1', 'rare', BOOK_OWN_2)])

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('Common만 있는 컬렉션은 같은 등급이 정해지는 난수에서도 invalid_collection이다 (한쪽만 있는 컬렉션은 받지 않는다)', async () => {
    setPool(BOOKS, [badge('own-c1', 'common', BOOK_OWN)])

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('풀을 읽지 못하면 던진다 (소각 전)', async () => {
    mocks.loadRollData.mockRejectedValue(new Error('item_books 조회 실패'))

    await expect(tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq() })).rejects.toThrow('item_books 조회 실패')

    expectNothingChanged()
  })
})

describe('tierUp — 재료 등급과 바로 윗등급이 모두 있는 컬렉션만 받는다 (티켓 20261025_2011)', () => {
  /** 윗등급(Rare)만 있는 컬렉션 — Common 재료로는 받을 수 없다 */
  const BOOK_UPPER_ONLY = 'book-upper-only'
  /** 재료 등급(Common)만 있는 컬렉션 — 윗등급이 정해져도 받을 것이 없다 */
  const BOOK_SAME_ONLY = 'book-same-only'

  function setSplitPool(extraBooks: IssueBook[] = [], extraBadges: PoolBadge[] = []) {
    setPool(
      [...BOOKS, book(BOOK_UPPER_ONLY, T_OWN), book(BOOK_SAME_ONLY, T_OWN), ...extraBooks],
      [
        ...pool(),
        badge('up-r1', 'rare', BOOK_UPPER_ONLY),
        badge('up-r2', 'rare', BOOK_UPPER_ONLY),
        badge('same-c1', 'common', BOOK_SAME_ONLY),
        ...extraBadges,
      ]
    )
  }

  it('윗등급만 있는 컬렉션은 윗등급이 정해지는 난수에서도 invalid_collection이다 — 소각·지급 없음, 난수도 쓰지 않는다', async () => {
    setSplitPool()

    const result = await tierUp(USER, ITEM_IDS, BOOK_UPPER_ONLY, { rand: seq() })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('윗등급만 있는 컬렉션은 같은 등급이 정해지는 난수에서도 invalid_collection이다 (no_candidate가 아니다)', async () => {
    setSplitPool()

    const result = await tierUp(USER, ITEM_IDS, BOOK_UPPER_ONLY, { rand: () => 0.1 })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('재료 등급만 있는 컬렉션도 invalid_collection이다 — 윗등급이 정해지는 난수에서도 소각하지 않는다', async () => {
    setSplitPool()

    const result = await tierUp(USER, ITEM_IDS, BOOK_SAME_ONLY, { rand: () => 0.9 })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('윗등급만 있는 컬렉션으로 난수를 바꿔 100번 반복해도 한 번도 소각·지급되지 않고 윗등급이 나오지 않는다', async () => {
    setSplitPool()

    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await tierUp(USER, ITEM_IDS, BOOK_UPPER_ONLY, { rand: () => attempt / 100 })
      expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    }

    expectNothingChanged()
  })

  it.each([
    ['Rare 재료 — 윗등급(Epic)이 없는 컬렉션', 'rare', BOOK_OWN_2],
    ['Epic 재료 — 윗등급(Mystic)이 없는 컬렉션', 'epic', BOOK_OWN_2],
    ['Epic 재료 — Epic만 있고 Mystic이 없는 컬렉션', 'epic', 'book-epic-only'],
  ] as const)('%s은 invalid_collection이다', async (_label, rarity, bookId) => {
    setSplitPool([book('book-epic-only', T_OWN)], [badge('ep-e1', 'epic', 'book-epic-only')])
    setMaterials(rarity)

    const result = await tierUp(USER, ITEM_IDS, bookId, { rand: () => 0.9 })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it.each([
    ['삭제된 배지', { deleted_at: '2026-10-01T00:00:00.000Z' }],
    ['드랍 제외 배지', { drop_excluded: true }],
    ['공개 전 배지', { valid_from: '2026-11-01T00:00:00.000Z' }],
    ['공개가 끝난 배지', { valid_until: '2026-10-01T00:00:00.000Z' }],
  ])('윗등급 배지가 %s뿐이면 윗등급이 없는 것으로 보고 invalid_collection이다', async (_label, overrides) => {
    setSplitPool(
      [book('book-dead-upper', T_OWN)],
      [badge('dead-c1', 'common', 'book-dead-upper'), badge('dead-r1', 'rare', 'book-dead-upper', overrides)]
    )

    const result = await tierUp(USER, ITEM_IDS, 'book-dead-upper', { rand: () => 0.9 })

    expect(result).toEqual({ success: false, reason: 'invalid_collection', pointsAwarded: 0 })
    expectNothingChanged()
  })

  it('두 등급이 모두 있는 컬렉션은 어느 등급이 정해져도 받는다 (같은 등급 0.1 / 윗등급 0.9)', async () => {
    setSplitPool()

    const same = await tierUp(USER, ITEM_IDS, BOOK_OWN_2, { rand: seq(0.1, 0.0) })
    const upper = await tierUp(USER, ITEM_IDS, BOOK_OWN_2, { rand: seq(0.9, 0.0) })

    expect(same.success && same.resultBadges[0]).toMatchObject({ id: 'own2-c1', rarity: 'common' })
    expect(upper.success && upper.resultBadges[0]).toMatchObject({ id: 'own2-r1', rarity: 'rare' })
  })

  it.each(['common', 'rare', 'epic'] as const)(
    '믹스 화면의 목록(tierUpCollectionChoices)에 보이는 컬렉션만 서버도 받는다 — %s 재료',
    async (rarity) => {
      setSplitPool([book('book-epic-only', T_OWN)], [badge('ep-e1', 'epic', 'book-epic-only')])
      setMaterials(rarity)
      const poolData = (await mocks.loadRollData()) as { books: IssueBook[]; badges: PoolBadge[] }
      const books = poolData.books.map((b) => ({ ...b, name: b.id, image_url: null }))
      const options = buildTierUpCollectionOptions({ tribeId: T_OWN, books, badges: poolData.badges, now: NOW })
      const shown = new Set(tierUpCollectionChoices(options, rarity).map((option) => option.id))

      const mine = books.filter((b) => b.tribe_id === T_OWN)
      expect(mine.length).toBeGreaterThan(shown.size) // 보이지 않는 컬렉션도 섞여 있어야 비교가 의미 있다
      expect(shown.size).toBeGreaterThan(0)
      for (const mineBook of mine) {
        for (const roll of [0.1, 0.9]) {
          const result = await tierUp(USER, ITEM_IDS, mineBook.id, { rand: () => roll })
          const accepted = !(!result.success && (result.reason === 'invalid_collection' || result.reason === 'no_candidate'))
          expect(accepted, `${mineBook.id} / 난수 ${roll}`).toBe(shown.has(mineBook.id))
        }
      }
    }
  )
})

describe('tierUp — 소각 뒤', () => {
  it('소각이 동시 시도로 실패하면 items_not_found이고 지급·점수가 없다', async () => {
    mocks.burnMaterials.mockResolvedValue({ ok: false })

    const result = await tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.5, 0.0) })

    expect(result).toEqual({ success: false, reason: 'items_not_found', pointsAwarded: 0 })
    expect(db.rpcCalls).toEqual([])
    expect(mocks.awardServiceJam).not.toHaveBeenCalled()
  })

  it.each([
    ['RPC 오류', { data: null, error: { message: 'rpc down' } }],
    ['ok: false', { data: { ok: false, error: 'inventory_not_found' }, error: null }],
    ['지급할 결과 없음(status none)', { data: { ok: true, status: 'none', itemIds: [], pendingCount: 0 }, error: null }],
    ['빈 응답', { data: null, error: null }],
  ])('결과 지급이 실패하면(%s) 재료가 이미 소각된 뒤라 로그를 남기고 던진다 — 점수는 세지 않는다', async (_label, grant) => {
    db.grant = grant as typeof db.grant

    await expect(tierUp(USER, ITEM_IDS, BOOK_OWN, { rand: seq(0.5, 0.0) })).rejects.toThrow('재료는 이미 소각됐다')

    expect(mocks.burnMaterials).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      '[tierUp] combine_grant_results 실패 — 재료만 소각되고 결과가 지급되지 않음:',
      expect.objectContaining({ userId: USER, materialItemIds: ITEM_IDS })
    )
    expect(mocks.awardServiceJam).not.toHaveBeenCalled()
  })
})
