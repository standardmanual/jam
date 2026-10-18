/**
 * 어드민 배지 삭제 화면의 참조 목록 — 받지 않은 믹스 결과(`combine_pending_results`)·개체 이력(`inventory_item_events`)
 * (티켓 20261018_0055, 마이그레이션 235·236)
 *
 * 고정하는 것:
 * - `combine_pending_results.badge_id`는 ON DELETE 규칙이 없어(NO ACTION) 삭제를 막는 참조다(`blocksDelete` true).
 * - `inventory_item_events.badge_id`는 ON DELETE SET NULL이라 삭제를 막지 않는다(`item_issue_log`와 같은 모양).
 * - `collectBadgeReferences`가 두 표를 세어 합계에 넣고, 조회가 실패하면 fail-closed(`error`)다.
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/badge-references-combine.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'
import { BADGE_REFERENCE_SOURCE_BY_KEY, collectBadgeReferences } from '@/lib/admin/badge-references'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 표별 건수를 돌려주는 가짜 클라이언트. 작은 테이블(행 조회)은 빈 목록이다. */
function makeFake(counts: Record<string, number>, errors: Record<string, string> = {}): ServiceClient {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      in: () => builder,
      order: () => builder,
      range: () => Promise.resolve({ data: [], error: null }),
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const error = errors[table] ? { message: errors[table] } : null
        return Promise.resolve({ count: counts[table] ?? 0, error }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  return { from } as unknown as ServiceClient
}

describe('BADGE_REFERENCE_SOURCES — 믹스 참조', () => {
  it('받지 않은 믹스 결과는 삭제를 막는 참조다', () => {
    const source = BADGE_REFERENCE_SOURCE_BY_KEY.get('combine_pending_results')

    expect(source?.location).toBe('combine_pending_results.badge_id')
    expect(source?.blocksDelete).toBe(true)
    expect(source?.cascades).toBe(false)
  })

  it('개체 이력은 삭제를 막지도 연쇄 삭제하지도 않는다', () => {
    const source = BADGE_REFERENCE_SOURCE_BY_KEY.get('inventory_item_events')

    expect(source?.location).toBe('inventory_item_events.badge_id')
    expect(source?.blocksDelete).toBe(false)
    expect(source?.cascades).toBe(false)
  })
})

describe('collectBadgeReferences — 믹스 참조', () => {
  it('받지 않은 믹스 결과는 차단 합계에, 개체 이력은 차단 없이 전체 합계에만 들어간다', async () => {
    const report = await collectBadgeReferences(
      makeFake({ combine_pending_results: 2, inventory_item_events: 5 }),
      ['badge-1']
    )

    expect(report.error).toBeNull()
    expect(report.counts.combine_pending_results).toBe(2)
    expect(report.counts.inventory_item_events).toBe(5)
    expect(report.blockingTotal).toBe(2)
    expect(report.total).toBe(7)
  })

  it('참조가 없으면 0이다', async () => {
    const report = await collectBadgeReferences(makeFake({}), ['badge-1'])

    expect(report.counts.combine_pending_results).toBe(0)
    expect(report.counts.inventory_item_events).toBe(0)
    expect(report.total).toBe(0)
  })

  it('조회가 실패하면 error를 채운다(fail-closed)', async () => {
    const report = await collectBadgeReferences(
      makeFake({}, { combine_pending_results: 'db down', inventory_item_events: 'db down' }),
      ['badge-1']
    )

    expect(report.error).toContain('combine_pending_results')
    expect(report.error).toContain('inventory_item_events')
  })
})
