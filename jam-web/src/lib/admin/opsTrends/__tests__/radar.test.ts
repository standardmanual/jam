/**
 * 트렌드 레이더 계산 (티켓 20261026_2033 2회차)
 *
 * 지키는 것:
 * - 묶음 `trends` 읽기: 모양이 틀린 원소는 빠지고 `index`는 원래 자리, 출처 번호는 정수·정수 문자열만
 * - 연결 항목: 기획 이유 `trend`의 출처 번호가 트렌드 출처에 드는 항목만, 반려·취소 항목은 뺀다
 * - 14일 창, 시험 묶음 제외·포함, 받은 시각 내림차순, 요약 건수
 * - `?trend=` 걸러 보기 값(범위 밖·숫자 아님·연결 항목 없음은 null)
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/opsTrends/__tests__/radar.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { Json } from '@/types/database.generated'
import {
  buildTrendFilter,
  collectRadar,
  readBundleTrends,
  readSourceNo,
  trendLinkedItemIds,
  type RadarBundle,
  type RadarItem,
} from '../radar'

const NOW = new Date('2026-10-27T03:00:00Z')

function trend(overrides: Record<string, Json> = {}): Json {
  return { label: '러닝 크루', source_ids: [1], summary: '크루 모집 글이 늘고 있어요', outcome: 'used', ...overrides }
}

function item(id: string, sourceId: Json | undefined, extra: Partial<RadarItem> = {}, kind = 'trend'): RadarItem {
  return {
    id,
    status: 'reviewing',
    original: { rationale: sourceId === undefined ? [] : [{ kind, label: '트렌드', source_id: sourceId }] },
    edited: null,
    ...extra,
  }
}

function bundle(overrides: Partial<RadarBundle> = {}): RadarBundle {
  return {
    id: 'bundle-1',
    week: '2026-W44',
    title: '비 오는 날 러닝',
    receivedAt: '2026-10-26T00:00:00Z',
    trends: [trend()],
    isSample: false,
    items: [],
    ...overrides,
  }
}

describe('readSourceNo', () => {
  it('정수와 정수 문자열만 번호로 본다', () => {
    expect(readSourceNo(3)).toBe(3)
    expect(readSourceNo('3')).toBe(3)
    expect(readSourceNo(' 12 ')).toBe(12)
    expect(readSourceNo(0)).toBeNull()
    expect(readSourceNo(1.5)).toBeNull()
    expect(readSourceNo('A-1')).toBeNull()
    expect(readSourceNo(null)).toBeNull()
  })
})

describe('readBundleTrends', () => {
  it('배열이 아니면 빈 배열이다', () => {
    expect(readBundleTrends(null)).toEqual([])
    expect(readBundleTrends({ label: 'x' })).toEqual([])
  })

  it('모양이 틀린 원소는 빼고, index는 원래 자리를 지킨다', () => {
    const result = readBundleTrends([
      'x',
      trend({ label: '' }),
      trend({ outcome: 'unknown' }),
      trend({ label: '살아남은 것', outcome: 'held' }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ index: 3, label: '살아남은 것', outcome: 'held' })
  })

  it('출처 번호는 정수 문자열을 숫자로 읽고 중복·잘못된 값은 뺀다', () => {
    const [read] = readBundleTrends([trend({ source_ids: ['2', 2, 5, 'x', 0] })])
    expect(read.sourceNos).toEqual([2, 5])
  })

  it('series는 숫자 14개 이하일 때만 읽고, 아니면 null이다', () => {
    expect(readBundleTrends([trend({ series: [1, 2, 3] })])[0].series).toEqual([1, 2, 3])
    expect(readBundleTrends([trend({ series: Array.from({ length: 15 }, () => 1) })])[0].series).toBeNull()
    expect(readBundleTrends([trend({ series: [1, 'a'] })])[0].series).toBeNull()
    expect(readBundleTrends([trend()])[0].series).toBeNull()
  })

  it('자동 제외의 범주를 outcomeReason으로 읽는다', () => {
    const [read] = readBundleTrends([trend({ outcome: 'excluded', outcome_reason: '정치' })])
    expect(read.outcomeReason).toBe('정치')
  })
})

describe('trendLinkedItemIds', () => {
  const read = (sourceIds: Json[]) => readBundleTrends([trend({ source_ids: sourceIds })])[0]

  it('기획 이유 trend의 출처 번호가 트렌드 출처에 드는 항목만 잇는다(문자열 번호 포함)', () => {
    const items = [item('a', 1), item('b', '1'), item('c', 2), item('d', 1, {}, 'season'), item('e', undefined)]
    expect(trendLinkedItemIds(read([1]), items)).toEqual(['a', 'b'])
  })

  it('수정본이 있으면 수정본의 기획 이유를 본다', () => {
    const edited = item('a', 2).original
    expect(trendLinkedItemIds(read([2]), [item('a', 1, { edited })])).toEqual(['a'])
  })

  it('반려·취소 항목은 뺀다', () => {
    const items = [item('a', 1), item('b', 1, { status: 'rejected' }), item('c', 1, { status: 'cancelled' }), item('d', 1, { status: 'approved' })]
    expect(trendLinkedItemIds(read([1]), items)).toEqual(['a', 'd'])
  })

  it('출처가 없는 트렌드는 잇는 항목이 없다', () => {
    expect(trendLinkedItemIds(read([]), [item('a', 1)])).toEqual([])
  })
})

describe('collectRadar', () => {
  it('최근 14일 밖에 받은 묶음은 모으지 않는다', () => {
    const old = bundle({ id: 'old', receivedAt: '2026-10-10T00:00:00Z' })
    const recent = bundle({ id: 'recent', receivedAt: '2026-10-14T04:00:00Z' })
    const result = collectRadar({ bundles: [old, recent], now: NOW, includeSample: false })
    expect(result.entries.map((entry) => entry.bundleId)).toEqual(['recent'])
  })

  it('시험 묶음은 includeSample일 때만 센다', () => {
    const sample = bundle({ id: 'sample', isSample: true })
    expect(collectRadar({ bundles: [sample], now: NOW, includeSample: false }).entries).toEqual([])
    expect(collectRadar({ bundles: [sample], now: NOW, includeSample: true }).entries).toHaveLength(1)
  })

  it('받은 시각 내림차순으로 모으고, 같은 묶음 안에서는 원래 순서를 지킨다', () => {
    const first = bundle({ id: 'first', receivedAt: '2026-10-20T00:00:00Z' })
    const second = bundle({
      id: 'second',
      receivedAt: '2026-10-25T00:00:00Z',
      trends: [trend({ label: 'A' }), trend({ label: 'B' })],
    })
    const result = collectRadar({ bundles: [first, second], now: NOW, includeSample: false })
    expect(result.entries.map((entry) => `${entry.bundleId}:${entry.trend.label}`)).toEqual(['second:A', 'second:B', 'first:러닝 크루'])
  })

  it('결과별 건수와 연결 항목 수를 센다', () => {
    const result = collectRadar({
      bundles: [
        bundle({
          trends: [
            trend({ source_ids: [1], outcome: 'used' }),
            trend({ outcome: 'held' }),
            trend({ outcome: 'excluded', outcome_reason: '정치' }),
            trend({ outcome: 'excluded', outcome_reason: '사고' }),
          ],
          items: [item('a', 1), item('b', 1, { status: 'rejected' })],
        }),
      ],
      now: NOW,
      includeSample: false,
    })
    expect(result.summary).toEqual({ used: 1, held: 1, excluded: 2 })
    expect(result.entries[0].linkedItemCount).toBe(1)
  })

  it('제목이 없으면 주차 이름, 주차도 없으면 고정 문장을 쓴다', () => {
    const noTitle = collectRadar({ bundles: [bundle({ title: null })], now: NOW, includeSample: false })
    expect(noTitle.entries[0].bundleTitle).toBe('44주차')
    const none = collectRadar({ bundles: [bundle({ title: ' ', week: null })], now: NOW, includeSample: false })
    expect(none.entries[0].bundleTitle).toBe('제목 없는 기획')
  })

  it('받은 시각을 읽을 수 없는 묶음은 뺀다', () => {
    expect(collectRadar({ bundles: [bundle({ receivedAt: 'nope' })], now: NOW, includeSample: false }).entries).toEqual([])
  })
})

describe('buildTrendFilter', () => {
  const trends: Json = [trend({ label: '건너뜀', summary: '' }), trend({ label: '러닝 크루', source_ids: [1] }), trend({ label: '연결 없음', source_ids: [9] })]
  const items = [item('a', 1), item('b', 2)]

  it('원래 자리 번호로 트렌드를 찾아 연결 항목 ID를 돌려준다', () => {
    expect(buildTrendFilter('1', trends, items)).toEqual({ label: '러닝 크루', itemIds: ['a'] })
  })

  it('숫자가 아니거나 범위 밖이거나 빠진 원소를 가리키면 null이다', () => {
    expect(buildTrendFilter(undefined, trends, items)).toBeNull()
    expect(buildTrendFilter('x', trends, items)).toBeNull()
    expect(buildTrendFilter('-1', trends, items)).toBeNull()
    expect(buildTrendFilter('7', trends, items)).toBeNull()
    expect(buildTrendFilter('0', trends, items)).toBeNull()
  })

  it('연결 항목이 하나도 없으면 null이다', () => {
    expect(buildTrendFilter('2', trends, items)).toBeNull()
  })
})
