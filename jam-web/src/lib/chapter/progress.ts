/**
 * 챕터 게이지 진행 계산 (티켓 20261127_1734, 필요 잼과 이번 챕터 진행값 기준)
 *
 * 진행 = 이번 챕터에서 모은 잼(`chapterJam`) / 지금 챕터를 마치는 데 필요한 잼(`requiredJam`)을 0 이상 1 이하로 자르고,
 * 소수 둘째 자리까지 **내린** 값이다(0.9992는 1이 아니라 0.99 — 다 찼다고 보이면 안 된다).
 *  - «다음 챕터»는 지금 챕터보다 번호가 큰 정의 가운데 가장 작은 번호다(번호가 연속이라고 가정하지 않는다).
 *  - 더 오를 수 없는 챕터(`isLastChapter`)는 지금 챕터보다 큰 정의가 없거나 지금 챕터의 `requiredJam`이 NULL인 챕터다
 *    (승급 함수 `chapter_jam_apply`가 같은 조건으로 승급하지 않는다). 이때 다음 챕터 번호·필요 잼·진행은 모두 null이다.
 *  - 필요 잼이 0 이하인 비정상 정의는 게이지가 찬 것(1)으로 본다. 0으로 나누지 않는다.
 *
 * 순수 함수다(서버 전용 코드를 가져오지 않는다).
 */

export interface ChapterDefinitionRow {
  chapterNo: number
  /** 그 챕터를 마치는 데 필요한 잼. 마지막 챕터는 null */
  requiredJam: number | null
}

export interface ChapterProgress {
  /** 다음 챕터 번호. 더 오를 수 없는 챕터이면 null */
  nextChapterNo: number | null
  /** 지금 챕터를 마치는 데 필요한 잼. 더 오를 수 없는 챕터이면 null */
  requiredJam: number | null
  /** 이번 챕터 진행(0~1, 소수 둘째 자리까지 내림). 더 오를 수 없는 챕터이면 null */
  progress: number | null
  /** 더 오를 수 없는 챕터인가 */
  isLastChapter: boolean
}

/**
 * 지금 챕터의 진행을 계산한다. 정의 목록에 지금 챕터가 없으면 계산할 수 없어 null이다
 * (유저의 챕터는 정의 표를 참조하므로 정상 데이터에서는 일어나지 않는다 — 호출부는 읽지 못함으로 다룬다).
 */
export function computeChapterProgress(
  chapterJam: number,
  chapterNo: number,
  definitions: readonly ChapterDefinitionRow[]
): ChapterProgress | null {
  const current = definitions.find((d) => d.chapterNo === chapterNo)
  if (!current) return null

  let next: ChapterDefinitionRow | null = null
  for (const d of definitions) {
    if (d.chapterNo > chapterNo && (next === null || d.chapterNo < next.chapterNo)) next = d
  }

  const required = current.requiredJam
  if (next === null || required === null) {
    return { nextChapterNo: null, requiredJam: null, progress: null, isLastChapter: true }
  }

  // 필요 잼이 0 이하인 비정상 정의는 게이지가 이미 찬 것으로 본다. 0으로 나누지 않는다
  if (required <= 0) return { nextChapterNo: next.chapterNo, requiredJam: required, progress: 1, isLastChapter: false }

  const gained = Math.min(Math.max(chapterJam, 0), required)
  // 소수 계산 오차(0.29가 28.999…로 내려가는 일)를 피하려고 정수끼리 곱한 뒤 나누고 내린다
  return {
    nextChapterNo: next.chapterNo,
    requiredJam: required,
    progress: Math.floor((gained * 100) / required) / 100,
    isLastChapter: false,
  }
}
