/**
 * lib/chapter/progress — 다음 챕터까지의 진행 비율 (티켓 20261019_1316 2회)
 *
 * 고정하는 것:
 * - 비율 = (누적 점수 − 지금 챕터 필요 점수) / (다음 챕터 필요 점수 − 지금 챕터 필요 점수), 0~1로 자르고 소수 둘째 자리까지 내린다.
 * - 챕터 2에 막 도달하면 0, 중간은 중간값, 다음 챕터 직전은 올림이 아니라 내림이라 1이 아니다(0.99).
 * - 점수가 다음 챕터 정의보다 커도 1로 잘린다. 다음 챕터 번호는 그대로 돌려준다.
 * - 마지막 챕터·정의가 하나뿐이면 다음 챕터 번호와 비율이 null이다.
 * - 다음 챕터는 «번호가 큰 정의 가운데 가장 작은 번호»다 (번호가 건너뛰어도, 입력 순서가 섞여도 같다).
 * - 지금 챕터의 정의가 없으면 계산할 수 없어 null이다. 필요 점수 차이가 0 이하인 비정상 정의도 0으로 나누지 않는다.
 * - 결과에는 점수 값이 실리지 않는다 (키 목록 고정).
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/progress.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computeChapterProgress, type ChapterDefinitionRow } from '../progress'

/** 운영 로직 12.4절의 챕터 1~10 필요 점수 */
const DEFINITIONS: ChapterDefinitionRow[] = [0, 1000, 2300, 3800, 5700, 8500, 11500, 15000, 19000, 23000].map((requiredScore, i) => ({
  chapterNo: i + 1,
  requiredScore,
}))

describe('computeChapterProgress — 비율 계산', () => {
  it('챕터 2에 막 도달하면 0이다 (챕터 3까지 1300점 구간)', () => {
    expect(computeChapterProgress(1000, 2, DEFINITIONS)).toEqual({ nextChapterNo: 3, progress: 0 })
  })

  it('중간이면 중간값이다', () => {
    // (1650 − 1000) / (2300 − 1000) = 0.5
    expect(computeChapterProgress(1650, 2, DEFINITIONS)).toEqual({ nextChapterNo: 3, progress: 0.5 })
  })

  it('다음 챕터 직전은 올림이 아니라 내림이라 1이 아니다', () => {
    // (2299 − 1000) / 1300 = 0.99923…
    expect(computeChapterProgress(2299, 2, DEFINITIONS)).toEqual({ nextChapterNo: 3, progress: 0.99 })
  })

  it('소수 둘째 자리까지 내린다', () => {
    // (1000 + 433 − 1000) / 1300 = 0.33307… → 0.33
    expect(computeChapterProgress(1433, 2, DEFINITIONS)).toEqual({ nextChapterNo: 3, progress: 0.33 })
  })

  it('소수 계산 오차로 한 칸 덜 나오지 않는다 (29/100 = 0.29)', () => {
    const definitions: ChapterDefinitionRow[] = [
      { chapterNo: 1, requiredScore: 0 },
      { chapterNo: 2, requiredScore: 100 },
    ]
    expect(computeChapterProgress(29, 1, definitions)).toEqual({ nextChapterNo: 2, progress: 0.29 })
    expect(computeChapterProgress(57, 1, definitions)).toEqual({ nextChapterNo: 2, progress: 0.57 })
    expect(computeChapterProgress(58, 1, definitions)).toEqual({ nextChapterNo: 2, progress: 0.58 })
  })

  it('챕터 1은 필요 점수 0에서 시작한다', () => {
    expect(computeChapterProgress(500, 1, DEFINITIONS)).toEqual({ nextChapterNo: 2, progress: 0.5 })
  })
})

describe('computeChapterProgress — 잘림', () => {
  it('점수가 다음 챕터 정의보다 커도 1로 잘린다 (다음 챕터 번호는 그대로)', () => {
    expect(computeChapterProgress(5000, 2, DEFINITIONS)).toEqual({ nextChapterNo: 3, progress: 1 })
  })

  it('점수가 지금 챕터 정의보다 작아도 0으로 잘린다', () => {
    expect(computeChapterProgress(10, 2, DEFINITIONS)).toEqual({ nextChapterNo: 3, progress: 0 })
  })

  it('다음 챕터에 딱 맞는 점수는 1이다', () => {
    expect(computeChapterProgress(2300, 2, DEFINITIONS)).toEqual({ nextChapterNo: 3, progress: 1 })
  })
})

describe('computeChapterProgress — 다음 챕터가 없을 때', () => {
  it('마지막 챕터이면 다음 챕터 번호와 비율이 null이다', () => {
    expect(computeChapterProgress(99999, 10, DEFINITIONS)).toEqual({ nextChapterNo: null, progress: null })
  })

  it('정의가 하나뿐이면 (챕터 1만) 다음 챕터가 없다', () => {
    expect(computeChapterProgress(300, 1, [{ chapterNo: 1, requiredScore: 0 }])).toEqual({ nextChapterNo: null, progress: null })
  })
})

describe('computeChapterProgress — 정의 목록의 모양', () => {
  it('다음 챕터는 번호가 큰 정의 가운데 가장 작은 번호다 (번호가 건너뛰어도)', () => {
    const definitions: ChapterDefinitionRow[] = [
      { chapterNo: 1, requiredScore: 0 },
      { chapterNo: 2, requiredScore: 1000 },
      { chapterNo: 5, requiredScore: 3000 },
    ]
    expect(computeChapterProgress(2000, 2, definitions)).toEqual({ nextChapterNo: 5, progress: 0.5 })
  })

  it('입력 순서가 섞여도 같다', () => {
    const shuffled = [...DEFINITIONS].reverse()
    expect(computeChapterProgress(1650, 2, shuffled)).toEqual({ nextChapterNo: 3, progress: 0.5 })
  })

  it('지금 챕터의 정의가 없으면 계산할 수 없어 null이다', () => {
    expect(computeChapterProgress(100, 4, [{ chapterNo: 1, requiredScore: 0 }])).toBeNull()
    expect(computeChapterProgress(100, 1, [])).toBeNull()
  })

  it('필요 점수 차이가 0 이하인 비정상 정의는 0으로 나누지 않고 찬 것으로 본다', () => {
    const definitions: ChapterDefinitionRow[] = [
      { chapterNo: 1, requiredScore: 500 },
      { chapterNo: 2, requiredScore: 500 },
    ]
    expect(computeChapterProgress(500, 1, definitions)).toEqual({ nextChapterNo: 2, progress: 1 })
  })
})

describe('computeChapterProgress — 점수 값을 싣지 않는다 (운영 로직 12.3절)', () => {
  it('결과의 키는 nextChapterNo와 progress뿐이다', () => {
    const result = computeChapterProgress(1777, 2, DEFINITIONS)
    expect(Object.keys(result ?? {}).sort()).toEqual(['nextChapterNo', 'progress'])
    expect(Object.keys(computeChapterProgress(99999, 10, DEFINITIONS) ?? {}).sort()).toEqual(['nextChapterNo', 'progress'])
  })
})
