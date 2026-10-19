/**
 * 어드민 배지 삭제 화면의 참조 목록 — 미션 아이템 배지 보상 기록(`mission_item_rewards`)
 * (티켓 20261019_1313, 마이그레이션 250)
 *
 * 고정하는 것:
 * - `mission_item_rewards.badge_id`는 ON DELETE 규칙이 없어(NO ACTION) 삭제를 막는 참조다(`blocksDelete` true).
 * - `collectBadgeReferences`가 이 표를 세어 차단 합계에 넣고, 조회가 실패하면 fail-closed(`error`)다.
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/badge-references-mission-reward.test.ts
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

describe('BADGE_REFERENCE_SOURCES — 미션 아이템 배지 보상 기록', () => {
  it('삭제를 막는 참조다(연쇄 삭제도 연결 해제도 아니다)', () => {
    const source = BADGE_REFERENCE_SOURCE_BY_KEY.get('mission_item_rewards')

    expect(source?.location).toBe('mission_item_rewards.badge_id')
    expect(source?.blocksDelete).toBe(true)
    expect(source?.cascades).toBe(false)
    expect(source?.detachable).toBe(false)
  })
})

describe('collectBadgeReferences — 미션 아이템 배지 보상 기록', () => {
  it('보상 기록이 있으면 차단 합계에 들어간다', async () => {
    const report = await collectBadgeReferences(makeFake({ mission_item_rewards: 3 }), ['badge-1'])

    expect(report.error).toBeNull()
    expect(report.counts.mission_item_rewards).toBe(3)
    expect(report.blockingTotal).toBe(3)
  })

  it('보상 기록이 없으면 0이다', async () => {
    const report = await collectBadgeReferences(makeFake({}), ['badge-1'])

    expect(report.counts.mission_item_rewards).toBe(0)
    expect(report.blockingTotal).toBe(0)
  })

  it('조회가 실패하면 오류를 알린다(fail-closed)', async () => {
    const report = await collectBadgeReferences(makeFake({}, { mission_item_rewards: 'db down' }), ['badge-1'])

    expect(report.error).toContain('mission_item_rewards')
  })
})
