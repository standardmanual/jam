/**
 * 다음 챕터까지의 진행 비율 계산 (티켓 20261019_1316 2회, 운영 로직 12.3절)
 *
 * 비율 = (누적 점수 − 지금 챕터의 required_score) / (다음 챕터의 required_score − 지금 챕터의 required_score)를 0 이상 1 이하로 자르고,
 * 소수 둘째 자리까지 **내린** 값이다(0.9992는 1이 아니라 0.99 — 다 찼다고 보이면 안 된다).
 *  - «다음 챕터»는 지금 챕터보다 번호가 큰 정의 가운데 가장 작은 번호다(DB 함수 `chapter_add_score`가 오르는 기준과 같다. 번호가 연속이라고 가정하지 않는다).
 *  - 다음 챕터 정의가 없으면(마지막 챕터) 다음 챕터 번호와 비율이 모두 null이다 — 화면이 «더 오를 챕터가 없음»을 구분한다.
 *  - 점수는 이 함수 안에서만 쓰이고 결과에 실리지 않는다(운영 로직 12.3절 «점수의 숫자는 보여 주지 않는다»).
 *
 * 순수 함수다(서버 전용 코드를 가져오지 않는다).
 */

export interface ChapterDefinitionRow {
  chapterNo: number
  /** 그 챕터에 오르는 데 필요한 누적 점수 */
  requiredScore: number
}

export interface ChapterProgress {
  /** 다음 챕터 번호. 마지막 챕터이면 null */
  nextChapterNo: number | null
  /** 다음 챕터까지의 비율(0~1, 소수 둘째 자리까지 내림). 마지막 챕터이면 null */
  progress: number | null
}

/**
 * 지금 챕터의 진행을 계산한다. 정의 목록에 지금 챕터가 없으면 계산할 수 없어 null이다
 * (유저의 챕터는 정의 표를 참조하므로 정상 데이터에서는 일어나지 않는다 — 호출부는 읽지 못함으로 다룬다).
 */
export function computeChapterProgress(
  totalScore: number,
  chapterNo: number,
  definitions: readonly ChapterDefinitionRow[]
): ChapterProgress | null {
  const current = definitions.find((d) => d.chapterNo === chapterNo)
  if (!current) return null

  let next: ChapterDefinitionRow | null = null
  for (const d of definitions) {
    if (d.chapterNo > chapterNo && (next === null || d.chapterNo < next.chapterNo)) next = d
  }
  if (!next) return { nextChapterNo: null, progress: null }

  const span = next.requiredScore - current.requiredScore
  // 다음 챕터가 더 높은 점수를 요구하지 않는 정의(비정상)는 게이지가 이미 찬 것으로 본다. 0으로 나누지 않는다
  if (span <= 0) return { nextChapterNo: next.chapterNo, progress: 1 }

  const gained = Math.min(Math.max(totalScore - current.requiredScore, 0), span)
  // 소수 계산 오차(0.29가 28.999…로 내려가는 일)를 피하려고 정수끼리 곱한 뒤 나누고 내린다
  return { nextChapterNo: next.chapterNo, progress: Math.floor((gained * 100) / span) / 100 }
}
