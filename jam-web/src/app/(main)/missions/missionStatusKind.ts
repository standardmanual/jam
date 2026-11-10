// 미션 카드 상단 상태 라벨의 우선순위 판정 (티켓 20260924_1146)
// 사전·React 노드와 분리해 node 환경에서 테스트할 수 있게 한 순수 함수다.
// 우선순위: 완료 > 잠김 > 참가종료(종료 탭에서 참가한 미션) > 참가중 > 시작 전 > 기간(상시/종료/남은 시간)
export type MissionStatusKind = 'done' | 'locked' | 'joinedEnded' | 'joined' | 'upcoming' | 'period'

export function missionStatusKind(
  m: { done: boolean; locked: boolean; joined: boolean },
  started: boolean,
  ended = false,
): MissionStatusKind {
  if (m.done) return 'done'
  if (m.locked) return 'locked'
  // 종료 탭의 미션은 더 이상 진행하지 않으므로 «참가중»이 아니라 «종료»로 알린다.
  if (m.joined && ended) return 'joinedEnded'
  if (m.joined) return 'joined'
  if (!started) return 'upcoming'
  return 'period'
}
