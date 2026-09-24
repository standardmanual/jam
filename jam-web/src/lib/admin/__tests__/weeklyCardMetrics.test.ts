/**
 * weeklyCardMetrics.ts — 카드×KST날짜 반응 집계와 표시 문구 순수 함수 유닛테스트(티켓 20260924_0908)
 *
 * 지키는 것:
 * 1. KST 자정 경계 — 23:59:59.999(KST)는 그날, 00:00:00.000(KST)은 다음 날로 센다
 * 2. 여러 날에 걸친 카드는 날짜별로 따로 센다
 * 3. `followup`·알 수 없는 이벤트는 세지 않는다
 * 4. 문구 규칙 — 오늘 이전·오늘: `노출 N · 열람 N`, 수집 시작 전: `집계 전`, 오늘보다 뒤: 표시 없음
 * 5. 이벤트가 하나도 없으면(수집 시작일 없음) 모든 날짜가 `집계 전`이다(미래 날짜는 표시 없음)
 */
import { describe, it, expect } from 'vitest'
import { bucketCardEvents, cardMetricKey, formatCardMetricsNote } from '../weeklyCardMetrics'

// KST 2026-09-24 00:00:00.000 = UTC 2026-09-23T15:00:00.000Z
const row = (card_id: string, event: string, occurred_at: string) => ({ card_id, event, occurred_at })

describe('bucketCardEvents', () => {
  it('KST 자정 경계: 23:59:59.999는 그날, 00:00:00.000은 다음 날로 센다', () => {
    const buckets = bucketCardEvents([
      row('a', 'impression', '2026-09-24T14:59:59.999Z'), // KST 09-24 23:59:59.999
      row('a', 'impression', '2026-09-24T15:00:00.000Z'), // KST 09-25 00:00:00.000
    ])
    expect(buckets.get(cardMetricKey('a', '2026-09-24'))).toEqual({ impression: 1, click: 0 })
    expect(buckets.get(cardMetricKey('a', '2026-09-25'))).toEqual({ impression: 1, click: 0 })
  })

  it('여러 날에 걸친 카드는 날짜별로 따로 센다', () => {
    const buckets = bucketCardEvents([
      row('a', 'impression', '2026-09-27T16:00:00.000Z'), // KST 09-28 01:00
      row('a', 'impression', '2026-09-28T01:00:00.000Z'), // KST 09-28 10:00
      row('a', 'click', '2026-09-28T02:00:00.000Z'), // KST 09-28 11:00
      row('a', 'impression', '2026-09-29T01:00:00.000Z'), // KST 09-29 10:00
    ])
    expect(buckets.get(cardMetricKey('a', '2026-09-28'))).toEqual({ impression: 2, click: 1 })
    expect(buckets.get(cardMetricKey('a', '2026-09-29'))).toEqual({ impression: 1, click: 0 })
  })

  it('카드별로 나눠 센다', () => {
    const buckets = bucketCardEvents([
      row('a', 'impression', '2026-09-28T01:00:00.000Z'),
      row('b', 'click', '2026-09-28T01:00:00.000Z'),
    ])
    expect(buckets.get(cardMetricKey('a', '2026-09-28'))).toEqual({ impression: 1, click: 0 })
    expect(buckets.get(cardMetricKey('b', '2026-09-28'))).toEqual({ impression: 0, click: 1 })
  })

  it('followup과 알 수 없는 이벤트는 무시한다', () => {
    const buckets = bucketCardEvents([
      row('a', 'followup', '2026-09-28T01:00:00.000Z'),
      row('a', 'unknown', '2026-09-28T01:00:00.000Z'),
    ])
    expect(buckets.size).toBe(0)
  })
})

describe('formatCardMetricsNote', () => {
  const today = '2026-09-28'
  const firstEventDate = '2026-09-24'

  it('오늘 이전(수집 시작일 이후)은 노출·열람 수를 보여 준다, 0도 0으로 표시한다', () => {
    expect(
      formatCardMetricsNote({ date: '2026-09-26', today, firstEventDate, counts: { impression: 5, click: 2 } })
    ).toBe('노출 5 · 열람 2')
    expect(formatCardMetricsNote({ date: '2026-09-26', today, firstEventDate, counts: undefined })).toBe(
      '노출 0 · 열람 0'
    )
  })

  it('수집 시작일보다 이전 날짜는 집계 전이다', () => {
    expect(
      formatCardMetricsNote({ date: '2026-09-23', today, firstEventDate, counts: { impression: 9, click: 9 } })
    ).toBe('집계 전')
  })

  it('수집 시작일 당일은 수치를 보여 준다', () => {
    expect(formatCardMetricsNote({ date: firstEventDate, today, firstEventDate, counts: undefined })).toBe(
      '노출 0 · 열람 0'
    )
  })

  it('오늘은 수치를 보여 준다', () => {
    expect(formatCardMetricsNote({ date: today, today, firstEventDate, counts: { impression: 1, click: 0 } })).toBe(
      '노출 1 · 열람 0'
    )
  })

  it('오늘보다 뒤 날짜는 표시하지 않는다', () => {
    expect(formatCardMetricsNote({ date: '2026-09-29', today, firstEventDate, counts: undefined })).toBeNull()
  })

  it('이벤트가 하나도 없으면 오늘 이전은 모두 집계 전, 미래는 표시 없음', () => {
    expect(formatCardMetricsNote({ date: '2026-09-26', today, firstEventDate: null, counts: undefined })).toBe(
      '집계 전'
    )
    expect(formatCardMetricsNote({ date: today, today, firstEventDate: null, counts: undefined })).toBe('집계 전')
    expect(formatCardMetricsNote({ date: '2026-09-29', today, firstEventDate: null, counts: undefined })).toBeNull()
  })

  it('표본 판정 문구를 붙이지 않는다', () => {
    const note = formatCardMetricsNote({ date: today, today, firstEventDate, counts: { impression: 1, click: 0 } })
    expect(note).not.toContain('표본')
    expect(note).not.toContain('후속')
  })
})
