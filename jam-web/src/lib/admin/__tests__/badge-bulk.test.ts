/**
 * 배지 일괄 작업 순수 판정 회귀 테스트 (티켓 20260905_0034)
 *
 * 여기서 고정하는 것은 «확인 없이는 쓰지 않는다»는 규칙이다 — 토큰·확인 문구·건너뜀 판정.
 * DB 접근은 API가 하고, 이 파일이 다루는 함수는 전부 순수 함수다.
 */
import { describe, it, expect } from 'vitest'
import {
  buildBulkPlan,
  bulkConfirmPhrase,
  bulkImpactCount,
  findBulkConfirmError,
  type BulkTargetBadge,
} from '@/lib/admin/badge-bulk'
import { BADGE_REFERENCE_SOURCES, type BadgeReferenceKey, type BadgeReferenceReport } from '@/lib/admin/badge-references'

function makeReport(overrides: Partial<Record<BadgeReferenceKey, number>> = {}, error: string | null = null) {
  const counts = {} as Record<BadgeReferenceKey, number>
  for (const source of BADGE_REFERENCE_SOURCES) counts[source.key] = overrides[source.key] ?? 0

  let earnTotal = 0
  let ledgerTotal = 0
  let contentTotal = 0
  let blockingTotal = 0
  let cascadeTotal = 0
  for (const source of BADGE_REFERENCE_SOURCES) {
    const value = counts[source.key]
    if (source.group === 'earn') earnTotal += value
    else if (source.group === 'ledger') ledgerTotal += value
    else contentTotal += value
    if (source.blocksDelete) blockingTotal += value
    if (source.cascades) cascadeTotal += value
  }

  const report: BadgeReferenceReport = {
    counts,
    earnTotal,
    ledgerTotal,
    contentTotal,
    blockingTotal,
    cascadeTotal,
    total: earnTotal + ledgerTotal + contentTotal,
    rows: [],
    error,
  }
  return report
}

const badge = (id: string, deleted_at: string | null = null): BulkTargetBadge => ({
  id,
  name: `배지 ${id}`,
  type: 'activity',
  rarity: 'common',
  level: null,
  family_key: 'walking:테스트',
  deleted_at,
})

describe('buildBulkPlan', () => {
  it('폐기는 이미 폐기된 배지를 건너뛴다', () => {
    const plan = buildBulkPlan('deactivate', [badge('a'), badge('b', '2026-09-01T00:00:00Z')], makeReport())
    expect(plan.actionableIds).toEqual(['a'])
    expect(plan.skipped).toHaveLength(1)
    expect(plan.badgeIds).toEqual(['a', 'b'])
  })

  it('되살리기는 이미 살아 있는 배지를 건너뛴다', () => {
    const plan = buildBulkPlan('restore', [badge('a'), badge('b', '2026-09-01T00:00:00Z')], makeReport())
    expect(plan.actionableIds).toEqual(['b'])
    expect(plan.skipped).toHaveLength(1)
  })

  it('확인 문구는 «실제 처리 대상/영향 건수»로 만들어진다', () => {
    const report = makeReport({ user_activity_badges: 40, today_cards: 2 })
    const plan = buildBulkPlan('deactivate', [badge('a'), badge('b')], report)
    expect(plan.impactCount).toBe(42)
    expect(plan.requiredPhrase).toBe(bulkConfirmPhrase('deactivate', 2, 42))
    expect(plan.requiredPhrase).toBe('폐기 2/42')
  })

  it('이력 삭제의 영향 건수는 «지워질 획득 이력»만 센다', () => {
    const report = makeReport({ user_activity_badges: 10, user_checkin_badge_earns: 5, point_transactions: 7 })
    expect(bulkImpactCount('purge_earns', report)).toBe(15)
    expect(bulkImpactCount('deactivate', report)).toBe(22)
  })
})

describe('findBulkConfirmError', () => {
  const plan = buildBulkPlan('deactivate', [badge('a')], makeReport({ user_activity_badges: 3 }))

  it('토큰이 없으면 막는다', () => {
    expect(findBulkConfirmError(plan, undefined, plan.requiredPhrase)).toContain('영향 분석을 먼저')
  })

  it('토큰이 다르면 막는다 (분석 뒤 대상·참조가 바뀐 경우)', () => {
    expect(findBulkConfirmError(plan, 'deadbeefdeadbeef', plan.requiredPhrase)).toContain('바뀌었습니다')
  })

  it('확인 문구가 다르면 막는다', () => {
    expect(findBulkConfirmError(plan, plan.token, '폐기')).toContain('확인 문구')
  })

  it('토큰·문구가 맞으면 통과한다', () => {
    expect(findBulkConfirmError(plan, plan.token, ` ${plan.requiredPhrase} `)).toBeNull()
  })

  it('참조 조회가 실패한 계획은 실행할 수 없다 (부분 건수 fail-closed)', () => {
    const broken = buildBulkPlan('deactivate', [badge('a')], makeReport({}, 'point_transactions: timeout'))
    expect(findBulkConfirmError(broken, broken.token, broken.requiredPhrase)).toContain('다 세지 못했어요')
  })

  it('처리할 대상이 없으면 실행하지 않는다', () => {
    const nothing = buildBulkPlan('restore', [badge('a')], makeReport())
    expect(findBulkConfirmError(nothing, nothing.token, nothing.requiredPhrase)).toContain('실행할 것이 없습니다')
  })

  it('참조 건수가 달라지면 토큰이 달라진다', () => {
    const before = buildBulkPlan('deactivate', [badge('a')], makeReport({ user_activity_badges: 3 }))
    const after = buildBulkPlan('deactivate', [badge('a')], makeReport({ user_activity_badges: 4 }))
    expect(after.token).not.toBe(before.token)
  })
})
