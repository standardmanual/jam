/**
 * 랭킹모드 순위 계산기 — 순수 함수 (티켓 20260911_1440)
 *
 * "랭킹모드 정의 + 대상 데이터"를 받아 "순위가 매겨진 목록"을 돌려주는 계산 계층. 대상
 * 선정 방식(미션 참가자 / 수동 지정 유저)과 정렬 지표(미션 진행도 / 레지스트리 필드 /
 * 배지 보유 개수)를 서로 독립적으로 조합할 수 있게 나눈다.
 *
 * - **미션 참가자 + 미션 진행도**: 새로 만들지 않는다. `lib/missions/ranking.ts`의
 *   `rankMissionParticipants`(완료 여부 → 완료 시각 → 진행도)를 그대로 감싸 재사용한다 —
 *   이 파일은 그 결과를 그대로 통과시키는 것 외에 아무 로직도 추가하지 않는다(`rankingDataSource.ts`가
 *   직접 호출한다).
 * - **수동 지정 유저 + 지표 값**: 이 파일이 새로 담당하는 부분 — `rankByMetricValue()`.
 *
 * DB·Supabase 의존이 없다 — 이 계층의 입력은 이미 조회된 값(유저별 지표 값)이다.
 */

export interface RankableValueEntry {
  userId: string
  /** 정렬 지표의 현재값(예: 누적 거리, 배지 보유 개수, 팔로워 수) */
  value: number
}

export interface RankedValueEntry extends RankableValueEntry {
  /** 1부터. 동률 처리는 아래 참고 */
  rank: number
}

/**
 * 지표 값 기준으로 순위를 매긴다.
 *
 * - `direction: 'higher'`(기본) — 값이 클수록 상위 순위(누적 거리·배지 개수·팔로워 수 등,
 *   1차 지원 지표는 전부 이 방향이다 — `conditionRegistry.ts`의 해당 필드가 전부
 *   `direction: 'higher'`로 선언돼 있다).
 * - `direction: 'lower'` — 값이 작을수록 상위 순위(예: 페이스). 1차 지원 지표 중에는 없지만
 *   레지스트리 확장에 대비해 계산기 자체는 방향을 받는다.
 *
 * 동점 처리: 배열 순서를 그대로 유지한 채 서로 다른 등수를 받는다(`rankMissionParticipants`와
 * 동일한 관례). `Array.prototype.sort`는 안정 정렬(stable, ES2019+)이라 입력 순서가 동점자
 * 사이의 순위를 결정한다 — 호출부가 원하는 타이브레이크(예: 이름순)가 있다면 이 함수를
 * 부르기 전에 미리 정렬해서 넘긴다.
 */
export function rankByMetricValue(
  entries: RankableValueEntry[],
  direction: 'higher' | 'lower' = 'higher'
): RankedValueEntry[] {
  return [...entries]
    .sort((a, b) => (direction === 'higher' ? b.value - a.value : a.value - b.value))
    .map((e, i) => ({ ...e, rank: i + 1 }))
}
