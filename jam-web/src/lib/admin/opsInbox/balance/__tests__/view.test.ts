/**
 * 밸런스 평가 결과의 화면 모양 (티켓 20260930_1459 조각 A)
 *
 * 행 칩 · 5번째 탭 숫자 · 묶음 알림 건수가 같은 줄에서 세어져 서로 맞는지(채원 완료 조건), 줄 순서, 평가 실패를 지킨다.
 */
import { describe, it, expect } from 'vitest'
import type { BalanceWarning } from '../evaluate'
import { balanceItemIdSet, buildBalanceView, itemBalanceInfoOf, rowChipOf, type OpsBundleBalance } from '../view'

function warning(overrides: Partial<BalanceWarning>): BalanceWarning {
  return {
    ruleKey: 'point_reward_max',
    level: 'warn',
    itemId: 'a',
    message: '문장',
    measured: 1,
    limit: 0,
    provisional: false,
    ...overrides,
  }
}

function ok(partial: { warnings?: BalanceWarning[]; unreadable?: BalanceWarning[] }, checked: Record<string, number> = {}): OpsBundleBalance {
  return {
    status: 'ok',
    warnings: partial.warnings ?? [],
    unreadable: partial.unreadable ?? [],
    checkedRuleCountByItem: checked,
    openCollectionsNow: 30,
  }
}

describe('buildBalanceView', () => {
  it('결과가 없으면 밸런스를 표시하지 않는 빈 모양이다', () => {
    const view = buildBalanceView(undefined)
    expect(view.available).toBe(false)
    expect(itemBalanceInfoOf(view, 'a')).toBeUndefined()
  })

  it('평가 실패는 available·failed이고 줄이 없다', () => {
    const view = buildBalanceView({ status: 'failed' })
    expect(view).toMatchObject({ available: true, failed: true, totals: { warn: 0, info: 0 }, bundleLines: [] })
    expect(itemBalanceInfoOf(view, 'a')).toMatchObject({ failed: true, lines: [] })
  })

  it('항목 줄은 주의 → 참고 → 점검 못 함 순이고 같은 종류 안은 규칙 순서를 지킨다', () => {
    const view = buildBalanceView(
      ok({
        warnings: [
          warning({ ruleKey: 'open_collections_max', level: 'info', message: 'r1 참고' }),
          warning({ ruleKey: 'point_reward_max', level: 'warn', message: 'r5 주의' }),
          warning({ ruleKey: 'economy_keys', level: 'warn', message: 'r8 주의' }),
        ],
        unreadable: [warning({ ruleKey: 'launch_lead_days_min', level: 'info', message: 'r4 점검 못 함' })],
      })
    )
    expect(view.linesByItem.a.map((line) => [line.kind, line.warning.message])).toEqual([
      ['warn', 'r5 주의'],
      ['warn', 'r8 주의'],
      ['info', 'r1 참고'],
      ['unreadable', 'r4 점검 못 함'],
    ])
  })

  it('항목 키가 없는 줄은 묶음 줄이고 항목 줄에 들어가지 않는다', () => {
    const view = buildBalanceView(
      ok({
        warnings: [warning({ itemId: null, ruleKey: 'weekly_new_collections_max' }), warning({ itemId: 'b' })],
        unreadable: [warning({ itemId: null, ruleKey: 'economy_keys', level: 'info' })],
      })
    )
    expect(view.bundleLines.map((line) => line.kind)).toEqual(['warn', 'unreadable'])
    expect(Object.keys(view.linesByItem)).toEqual(['b'])
  })

  it('묶음 알림 건수: 주의는 warn 줄, 참고는 참고 줄과 점검 못 함 줄의 합(항목 줄과 묶음 줄 모두)', () => {
    const view = buildBalanceView(
      ok({
        warnings: [
          warning({ itemId: 'a' }),
          warning({ itemId: null }), // 묶음 주의
          warning({ itemId: 'b', level: 'info' }),
        ],
        unreadable: [warning({ itemId: 'c', level: 'info' }), warning({ itemId: null, level: 'info' })],
      })
    )
    expect(view.totals).toEqual({ warn: 2, info: 3 })
  })

  it('행 칩 · 탭 숫자 · 묶음 알림 건수가 같은 줄에서 나와 서로 맞는다', () => {
    const view = buildBalanceView(
      ok({
        warnings: [
          warning({ itemId: 'a' }),
          warning({ itemId: 'a', ruleKey: 'economy_keys' }),
          warning({ itemId: 'b', level: 'info' }),
          warning({ itemId: null, ruleKey: 'rolling_new_collections_max' }),
        ],
        unreadable: [warning({ itemId: 'c', level: 'info' }), warning({ itemId: 'b', level: 'info' })],
      })
    )
    // 행 칩
    expect(rowChipOf(view.linesByItem.a)).toEqual({ level: 'warn', count: 2 })
    expect(rowChipOf(view.linesByItem.b)).toEqual({ level: 'info', count: 2 }) // 참고 1 + 점검 못 함 1
    expect(rowChipOf(view.linesByItem.c)).toEqual({ level: 'info', count: 1 })
    expect(rowChipOf(view.linesByItem.none)).toBeNull()
    // 탭 숫자: 항목 줄이 있는 항목 수(묶음 줄은 세지 않는다)
    expect(balanceItemIdSet(view).size).toBe(3)
    // 묶음 알림 건수: 항목 줄 5개 + 묶음 줄 1개
    expect(view.totals.warn + view.totals.info).toBe(6)
  })

  it('주의가 하나라도 있으면 행 칩은 주의 개수만 센다(참고는 합치지 않는다)', () => {
    const view = buildBalanceView(
      ok({ warnings: [warning({ itemId: 'a' }), warning({ itemId: 'a', level: 'info' })], unreadable: [warning({ itemId: 'a', level: 'info' })] })
    )
    expect(rowChipOf(view.linesByItem.a)).toEqual({ level: 'warn', count: 1 })
  })

  it('항목 상세 정보: 줄과 확인한 규칙 수, 지금 열린 컬렉션 수', () => {
    const view = buildBalanceView(ok({ warnings: [warning({ itemId: 'a' })] }, { a: 7, b: 3 }))
    expect(itemBalanceInfoOf(view, 'a')).toMatchObject({ failed: false, checkedRuleCount: 7, openCollectionsNow: 30 })
    expect(itemBalanceInfoOf(view, 'b')).toMatchObject({ lines: [], checkedRuleCount: 3 })
    expect(itemBalanceInfoOf(view, 'zzz')).toMatchObject({ lines: [], checkedRuleCount: 0 })
  })
})
