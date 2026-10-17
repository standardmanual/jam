/**
 * 어드민 배지 삭제 화면의 참조 목록 — 동기화 보류(`sync_pending_items`) (티켓 20261017_1425 2회, 서버 보정 b)
 *
 * 고정하는 것:
 * - `sync_pending_items.badge_id`(ON DELETE CASCADE)가 참조 목록에 있다. FK 위반으로 삭제를 실패시키지는 않으므로(`blocksDelete` false)
 *   «삭제를 막는 FK»로 세지 않고, 보류가 배지와 함께 조용히 사라지는 기록이라 `cascades`로 보여 준다.
 * - `collectBadgeReferences`가 이 표를 센다(참조 수가 `counts.sync_pending_items`와 합계에 들어간다).
 * - 조회가 실패하면 fail-closed(`error`)다.
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/badge-references-sync-pending.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'
import {
  BADGE_REFERENCE_SOURCES,
  BADGE_REFERENCE_SOURCE_BY_KEY,
  collectBadgeReferences,
} from '@/lib/admin/badge-references'

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

describe('BADGE_REFERENCE_SOURCES — sync_pending_items', () => {
  it('보류 표가 목록에 있고 삭제를 막는 FK가 아니라 연쇄 삭제(cascades)로 표시된다', () => {
    const source = BADGE_REFERENCE_SOURCE_BY_KEY.get('sync_pending_items')

    expect(source).toBeDefined()
    expect(source?.location).toBe('sync_pending_items.badge_id')
    expect(source?.blocksDelete).toBe(false)
    expect(source?.cascades).toBe(true)
    expect(source?.detachable).toBe(false)
    expect(BADGE_REFERENCE_SOURCES.filter((s) => s.key === 'sync_pending_items')).toHaveLength(1)
  })
})

describe('collectBadgeReferences — sync_pending_items', () => {
  it('보류 건수를 세어 연쇄 합계와 전체 합계에 넣는다', async () => {
    const report = await collectBadgeReferences(makeFake({ sync_pending_items: 3 }), ['badge-1'])

    expect(report.error).toBeNull()
    expect(report.counts.sync_pending_items).toBe(3)
    expect(report.cascadeTotal).toBe(3)
    expect(report.blockingTotal).toBe(0)
    expect(report.total).toBe(3)
  })

  it('보류가 없으면 0이다', async () => {
    const report = await collectBadgeReferences(makeFake({}), ['badge-1'])

    expect(report.counts.sync_pending_items).toBe(0)
    expect(report.total).toBe(0)
  })

  it('보류 조회가 실패하면 error를 채운다(fail-closed)', async () => {
    const report = await collectBadgeReferences(makeFake({}, { sync_pending_items: 'db down' }), ['badge-1'])

    expect(report.error).toContain('sync_pending_items')
  })
})
