/**
 * rankingCalculator.ts — 랭킹모드 순위 계산기 유닛테스트 (티켓 20260911_1440)
 *
 * 좋은 테스트의 기준(티켓 "테스트 결정"): 랭킹모드 정의와 대상 데이터가 주어졌을 때 계산된
 * 순위 목록만 검증한다. 데이터를 어떻게 가져오는지는 다루지 않는다(rankingDataSource.ts는
 * DB 의존이라 별도).
 */
import { describe, it, expect } from 'vitest'
import { rankByMetricValue } from '../rankingCalculator'

describe('rankByMetricValue', () => {
  it('기본값(direction 생략)은 값이 클수록 상위 순위다', () => {
    const ranked = rankByMetricValue([
      { userId: 'a', value: 10 },
      { userId: 'b', value: 30 },
      { userId: 'c', value: 20 },
    ])
    expect(ranked.map((r) => r.userId)).toEqual(['b', 'c', 'a'])
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  it("direction: 'lower'면 값이 작을수록 상위 순위다(레지스트리 확장 대비, 예: 페이스)", () => {
    const ranked = rankByMetricValue(
      [
        { userId: 'a', value: 300 },
        { userId: 'b', value: 250 },
        { userId: 'c', value: 280 },
      ],
      'lower'
    )
    expect(ranked.map((r) => r.userId)).toEqual(['b', 'c', 'a'])
  })

  it('동점은 입력 배열 순서대로 서로 다른 등수를 받는다(rankMissionParticipants와 동일 관례)', () => {
    const ranked = rankByMetricValue([
      { userId: 'a', value: 10 },
      { userId: 'b', value: 10 },
      { userId: 'c', value: 10 },
    ])
    expect(ranked.map((r) => r.userId)).toEqual(['a', 'b', 'c'])
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  it('빈 목록은 빈 목록을 돌려준다', () => {
    expect(rankByMetricValue([])).toEqual([])
  })

  it('원본 배열을 변경하지 않는다', () => {
    const input = [
      { userId: 'a', value: 1 },
      { userId: 'b', value: 2 },
    ]
    const copy = [...input]
    rankByMetricValue(input)
    expect(input).toEqual(copy)
  })
})
