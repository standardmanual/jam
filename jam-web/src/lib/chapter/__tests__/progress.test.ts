/**
 * lib/chapter/progress — 챕터 게이지 진행 계산 (티켓 20261127_1734)
 *
 * 고정하는 것:
 * - 진행 = 이번 챕터에서 모은 잼 / 지금 챕터 필요 잼, 0~1로 자르고 소수 둘째 자리까지 내린다.
 * - 막 올라온 0, 중간은 중간값, 다 차기 직전은 올림이 아니라 내림이라 1이 아니다(0.99), 넘친 잼은 1로 잘린다.
 * - 마지막 챕터(다음 정의 없음, `required_jam` NULL)는 필요 잼·다음 챕터·진행이 null이고 `isLastChapter`가 true다.
 * - 다음 챕터는 «번호가 큰 정의 가운데 가장 작은 번호»다 (번호가 건너뛰어도, 입력 순서가 섞여도 같다).
 * - 지금 챕터의 정의가 없으면 null이다. 필요 잼이 0 이하인 비정상 정의는 0으로 나누지 않고 찬 것(1)으로 본다.
 * - 결과의 키 목록을 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/progress.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computeChapterProgress, type ChapterDefinitionRow } from '../progress'

/** 챕터 1~9의 필요 잼, 챕터 10은 마지막이라 NULL */
const REQUIRED = [870, 1120, 1260, 1600, 1980, 2205, 2700, 3300, 3960, null]
const DEFINITIONS: ChapterDefinitionRow[] = REQUIRED.map((requiredJam, i) => ({ chapterNo: i + 1, requiredJam }))

describe('computeChapterProgress — 비율 계산', () => {
  it('막 올라왔으면 0이다', () => {
    expect(computeChapterProgress(0, 2, DEFINITIONS)).toEqual({ nextChapterNo: 3, requiredJam: 1120, progress: 0, isLastChapter: false })
  })

  it('중간이면 중간값이다', () => {
    expect(computeChapterProgress(560, 2, DEFINITIONS)).toEqual({ nextChapterNo: 3, requiredJam: 1120, progress: 0.5, isLastChapter: false })
  })

  it('다 차기 직전은 올림이 아니라 내림이라 1이 아니다', () => {
    // 1119 / 1120 = 0.99910…
    expect(computeChapterProgress(1119, 2, DEFINITIONS)).toEqual({ nextChapterNo: 3, requiredJam: 1120, progress: 0.99, isLastChapter: false })
  })

  it('소수 둘째 자리까지 내린다', () => {
    // 373 / 1120 = 0.33303… → 0.33
    expect(computeChapterProgress(373, 2, DEFINITIONS)?.progress).toBe(0.33)
  })

  it('소수 계산 오차로 한 칸 덜 나오지 않는다 (29/100 = 0.29)', () => {
    const definitions: ChapterDefinitionRow[] = [
      { chapterNo: 1, requiredJam: 100 },
      { chapterNo: 2, requiredJam: null },
    ]
    expect(computeChapterProgress(29, 1, definitions)?.progress).toBe(0.29)
    expect(computeChapterProgress(57, 1, definitions)?.progress).toBe(0.57)
    expect(computeChapterProgress(58, 1, definitions)?.progress).toBe(0.58)
  })

  it('챕터 1도 필요 잼으로 계산한다', () => {
    expect(computeChapterProgress(435, 1, DEFINITIONS)).toEqual({ nextChapterNo: 2, requiredJam: 870, progress: 0.5, isLastChapter: false })
  })
})

describe('computeChapterProgress — 잘림', () => {
  it('모은 잼이 필요 잼보다 커도 1로 잘린다 (다음 챕터 번호는 그대로)', () => {
    expect(computeChapterProgress(5000, 2, DEFINITIONS)).toEqual({ nextChapterNo: 3, requiredJam: 1120, progress: 1, isLastChapter: false })
  })

  it('모은 잼이 음수여도 0으로 잘린다', () => {
    expect(computeChapterProgress(-10, 2, DEFINITIONS)?.progress).toBe(0)
  })

  it('필요 잼에 딱 맞는 값은 1이다', () => {
    expect(computeChapterProgress(1120, 2, DEFINITIONS)?.progress).toBe(1)
  })
})

describe('computeChapterProgress — 더 오를 수 없는 챕터', () => {
  it('마지막 챕터이면 필요 잼·다음 챕터·진행이 null이고 isLastChapter가 true다', () => {
    expect(computeChapterProgress(99999, 10, DEFINITIONS)).toEqual({ nextChapterNo: null, requiredJam: null, progress: null, isLastChapter: true })
  })

  it('정의가 하나뿐이면 (챕터 1만) 더 오를 수 없다', () => {
    expect(computeChapterProgress(300, 1, [{ chapterNo: 1, requiredJam: 870 }])).toEqual({
      nextChapterNo: null,
      requiredJam: null,
      progress: null,
      isLastChapter: true,
    })
  })

  it('required_jam이 NULL이면 더 큰 챕터가 있어도 더 오를 수 없다 (승급 함수와 같은 조건)', () => {
    const definitions: ChapterDefinitionRow[] = [
      { chapterNo: 1, requiredJam: null },
      { chapterNo: 2, requiredJam: 500 },
    ]
    expect(computeChapterProgress(100, 1, definitions)).toEqual({ nextChapterNo: null, requiredJam: null, progress: null, isLastChapter: true })
  })
})

describe('computeChapterProgress — 정의 목록의 모양', () => {
  it('다음 챕터는 번호가 큰 정의 가운데 가장 작은 번호다 (번호가 건너뛰어도)', () => {
    const definitions: ChapterDefinitionRow[] = [
      { chapterNo: 1, requiredJam: 500 },
      { chapterNo: 2, requiredJam: 1000 },
      { chapterNo: 5, requiredJam: null },
    ]
    expect(computeChapterProgress(500, 2, definitions)).toEqual({ nextChapterNo: 5, requiredJam: 1000, progress: 0.5, isLastChapter: false })
  })

  it('입력 순서가 섞여도 같다', () => {
    const shuffled = [...DEFINITIONS].reverse()
    expect(computeChapterProgress(560, 2, shuffled)).toEqual({ nextChapterNo: 3, requiredJam: 1120, progress: 0.5, isLastChapter: false })
  })

  it('지금 챕터의 정의가 없으면 계산할 수 없어 null이다', () => {
    expect(computeChapterProgress(100, 4, [{ chapterNo: 1, requiredJam: 870 }])).toBeNull()
    expect(computeChapterProgress(100, 1, [])).toBeNull()
  })

  it('필요 잼이 0 이하인 비정상 정의는 0으로 나누지 않고 찬 것으로 본다', () => {
    const definitions: ChapterDefinitionRow[] = [
      { chapterNo: 1, requiredJam: 0 },
      { chapterNo: 2, requiredJam: null },
    ]
    expect(computeChapterProgress(0, 1, definitions)).toEqual({ nextChapterNo: 2, requiredJam: 0, progress: 1, isLastChapter: false })
    expect(computeChapterProgress(5, 1, [{ chapterNo: 1, requiredJam: -3 }, { chapterNo: 2, requiredJam: null }])?.progress).toBe(1)
  })
})

describe('computeChapterProgress — 결과의 키 목록', () => {
  it('키는 isLastChapter, nextChapterNo, progress, requiredJam뿐이다', () => {
    const keys = ['isLastChapter', 'nextChapterNo', 'progress', 'requiredJam']
    expect(Object.keys(computeChapterProgress(777, 2, DEFINITIONS) ?? {}).sort()).toEqual(keys)
    expect(Object.keys(computeChapterProgress(99999, 10, DEFINITIONS) ?? {}).sort()).toEqual(keys)
  })
})
