// 미션 카드 상단 상태 라벨의 우선순위 판정 (티켓 20260924_1146)
// 사전·React 노드와 분리해 node 환경에서 테스트할 수 있게 한 순수 함수다.
// 우선순위: 완료 > 잠김 > 참가중 > 시작 전 > 기간(상시/종료/남은 시간)
export type MissionStatusKind = 'done' | 'locked' | 'joined' | 'upcoming' | 'period'

export function missionStatusKind(
  m: { done: boolean; locked: boolean; joined: boolean },
  started: boolean,
): MissionStatusKind {
  if (m.done) return 'done'
  if (m.locked) return 'locked'
  if (m.joined) return 'joined'
  if (!started) return 'upcoming'
  return 'period'
}
