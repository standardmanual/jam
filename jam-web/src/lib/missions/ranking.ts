/**
 * 미션 랭킹 정렬 — 단일 진실 (티켓 20260825_002)
 *
 * `/api/missions/[id]/status`(화면)와 025 배치의 소식 #23(순위 상승)이 **같은 순위**를
 * 말해야 한다. 정렬 규칙이 두 곳에 복사돼 있으면 "5위로 올라섰어요" 소식을 누르고 들어간
 * 화면이 6위를 보여주는 조용한 어긋남이 생긴다. 그래서 비교 함수를 여기 한 곳에 둔다.
 *
 * 규칙: 완료자 우선 → 먼저 완료한 순 → 진행도 높은 순
 */
export interface RankableParticipant {
  userId: string
  progressValue: number
  /** 완료 시각(ISO). 미완료면 null */
  completedAt: string | null
}

export interface RankedParticipant extends RankableParticipant {
  isCompleted: boolean
  /** 1부터. 동률도 배열 순서대로 서로 다른 등수를 받는다(기존 status 라우트 동작 유지) */
  rank: number
}

/** 완료 여부 → 완료 시각 → 진행도 순 비교 */
export function compareMissionRank(
  a: { progressValue: number; completedAt: string | null },
  b: { progressValue: number; completedAt: string | null }
): number {
  const aDone = a.completedAt !== null
  const bDone = b.completedAt !== null
  if (aDone !== bDone) return aDone ? -1 : 1
  if (aDone && bDone) return (a.completedAt ?? '').localeCompare(b.completedAt ?? '')
  return b.progressValue - a.progressValue
}

export function rankMissionParticipants(list: RankableParticipant[]): RankedParticipant[] {
  return [...list]
    .sort(compareMissionRank)
    .map((e, i) => ({ ...e, isCompleted: e.completedAt !== null, rank: i + 1 }))
}
