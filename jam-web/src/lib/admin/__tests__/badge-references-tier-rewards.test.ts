/**
 * 어드민 배지 삭제 화면의 참조 목록 — 컬렉션 등급별 보상 배지(`item_book_tier_rewards.reward_badge_id`) (티켓 20261022_1139 2회, 2340 정리 ②)
 *
 * 고정하는 것:
 * - 등급별 보상 배지가 참조 목록에 있다. 기존 «컬렉션 완성 보상»(`item_books_reward`)과 같은 방식이다: 콘텐츠 연결 묶음이고,
 *   외래키는 `ON DELETE SET NULL`이라 삭제가 실패하지 않으므로 `blocksDelete`·`cascades`가 모두 false다.
 * - `collectBadgeReferences`가 이 표를 센다. 센 수는 콘텐츠 연결 합계와 전체 합계에 들어가 단건 하드 삭제 가드(`total > 0`이면 409)가 이 참조를 먼저 보이게 한다.
 *   FK 위반으로 실패하는 자리(`blockingTotal`)나 연쇄 삭제(`cascadeTotal`)에는 넣지 않는다.
 * - 조회가 실패하면 fail-closed(`error`)다.
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/badge-references-tier-rewards.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'
import {
  BADGE_REFERENCE_SOURCES,
  BADGE_REFERENCE_SOURCE_BY_KEY,
  collectBadgeReferences,
} from '@/lib/admin/badge-references'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 표별 건수를 돌려주는 가짜 클라이언트. 작은 테이블(행 조회)은 빈 목록이다. 건수 조회가 어느 칼럼에 `.in()`을 걸었는지도 기록한다. */
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

describe('BADGE_REFERENCE_SOURCES — item_book_tier_rewards', () => {
  it('등급별 보상 표가 목록에 있고 «컬렉션 완성 보상»과 같은 방식(콘텐츠 연결, 삭제를 막지 않음)이다', () => {
    const source = BADGE_REFERENCE_SOURCE_BY_KEY.get('item_book_tier_rewards')
    const sibling = BADGE_REFERENCE_SOURCE_BY_KEY.get('item_books_reward')

    expect(source).toBeDefined()
    expect(source?.location).toBe('item_book_tier_rewards.reward_badge_id')
    expect(source?.group).toBe('content')
    expect(source?.blocksDelete).toBe(false)
    expect(source?.cascades).toBe(false)
    expect(source?.detachable).toBe(false)
    expect(sibling && source && [source.group, source.blocksDelete, source.cascades, source.detachable]).toEqual([
      sibling?.group,
      sibling?.blocksDelete,
      sibling?.cascades,
      sibling?.detachable,
    ])
    expect(BADGE_REFERENCE_SOURCES.filter((s) => s.key === 'item_book_tier_rewards')).toHaveLength(1)
  })
})

describe('collectBadgeReferences — item_book_tier_rewards', () => {
  it('보상 배지로 쓰인 행 수를 reward_badge_id로 세어 콘텐츠 연결 합계와 전체 합계에 넣는다', async () => {
    const { client, inCalls } = makeFake({ item_book_tier_rewards: 2 })
    const report = await collectBadgeReferences(client, ['badge-1'])

    expect(report.error).toBeNull()
    expect(report.counts.item_book_tier_rewards).toBe(2)
    expect(report.contentTotal).toBe(2)
    expect(report.total).toBe(2)
    expect(inCalls).toContainEqual({ table: 'item_book_tier_rewards', column: 'reward_badge_id' })
  })

  it('삭제를 막는 FK 합계와 연쇄 삭제 합계에는 들어가지 않는다', async () => {
    const report = await collectBadgeReferences(makeFake({ item_book_tier_rewards: 3 }).client, ['badge-1'])

    expect(report.blockingTotal).toBe(0)
    expect(report.cascadeTotal).toBe(0)
    expect(report.earnTotal).toBe(0)
    expect(report.ledgerTotal).toBe(0)
  })

  it('«컬렉션 완성 보상»과 등급별 보상은 서로 따로 센다', async () => {
    // 가짜 클라이언트의 작은 테이블(item_books)은 빈 목록이라 완성 보상은 0이다 — 등급별 보상만 세어진다.
    const report = await collectBadgeReferences(makeFake({ item_book_tier_rewards: 1 }).client, ['badge-1'])

    expect(report.counts.item_books_reward).toBe(0)
    expect(report.counts.item_book_tier_rewards).toBe(1)
  })

  it('보상 행이 없으면 0이다', async () => {
    const report = await collectBadgeReferences(makeFake({}).client, ['badge-1'])

    expect(report.counts.item_book_tier_rewards).toBe(0)
    expect(report.total).toBe(0)
  })

  it('배지 id가 없으면 이 표를 읽지 않는다', async () => {
    const { client, inCalls } = makeFake({ item_book_tier_rewards: 5 })
    const report = await collectBadgeReferences(client, [])

    expect(report.counts.item_book_tier_rewards).toBe(0)
    expect(inCalls).toEqual([])
  })

  it('조회가 실패하면 error를 채운다(fail-closed)', async () => {
    const report = await collectBadgeReferences(makeFake({}, { item_book_tier_rewards: 'db down' }).client, ['badge-1'])

    expect(report.error).toContain('item_book_tier_rewards')
  })
})
