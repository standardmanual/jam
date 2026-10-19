/**
 * 트라이브 변경에 따른 미션 참가 취소 소식 — 티켓 20261019_1313 (운영 로직 13.2절)
 *
 * `mission_cancel_for_tribe_change`(마이그레이션 249)가 참가를 취소하고 돌려준 (미션 id, 이름) 목록으로 소식 한 행을 만든다.
 * 그 함수는 호출한 쪽이 소식을 보내도록 목록만 돌려주기 때문이다.
 *
 * **부르는 곳은 아직 없다.** 유저의 트라이브를 바꾸는 경로가 생기는 묶음 6에서 `mission_cancel_for_tribe_change`를 부른 직후 이 함수를 부른다.
 *
 * - 한 번의 변경으로 취소된 미션은 **한 행**이다(R11). 여러 개여도 행은 하나이고 문구는 개수로 접힌다.
 * - 키는 `once`다. 같은 날 같은 미션 묶음은 한 번만 만든다. 날이 다르면 새 상태로 보아 다시 만든다 — 같은 미션이 나중에 다시
 *   취소될 수 있어(다시 참가한 뒤 또 트라이브가 바뀜) 날짜 없는 키는 두 번째부터 조용히 사라진다.
 * - **던지지 않는다.** 소식은 트라이브 변경의 곁다리라 실패해도 변경을 깨지 않는다(`createNotification`이 실패를 로그로 남기고 null을 돌려준다).
 *
 * 서버 전용이다. 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import { createNotification } from '@/lib/notifications'
import { groupedTargetsKey, scopedGroupKey } from '@/lib/notifications/groupKey'
import { kstDateString } from '@/lib/notifications/kst'

/** `mission_cancel_for_tribe_change`가 돌려준 한 행 — `out_mission_id`·`out_mission_title`을 `{ id, title }`로 옮긴 값 */
export interface CancelledMission {
  id: string
  title: string
}

/**
 * 취소된 미션 목록으로 소식 한 행을 만든다. 목록이 비면(취소된 미션이 없으면) 아무것도 만들지 않는다.
 */
export async function notifyMissionParticipationCancelled(
  userId: string,
  cancelled: readonly CancelledMission[]
): Promise<void> {
  // 같은 미션이 두 번 오면 한 번만 센다 — 개수는 배열 길이로 세므로 중복이 곧 거짓 개수가 된다
  const seen = new Set<string>()
  const missions: { mission_id: string; title: string }[] = []
  for (const item of cancelled) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    missions.push({ mission_id: item.id, title: item.title ?? '' })
  }
  if (missions.length === 0) return

  const today = kstDateString()
  const ids = missions.map((m) => m.mission_id)
  const groupKey =
    missions.length === 1
      ? scopedGroupKey('mission_participation_cancelled', ids[0], today)
      : groupedTargetsKey('mission_participation_cancelled', ids, today)

  await createNotification({
    userId,
    type: 'mission_participation_cancelled',
    payload: { missions },
    groupKey,
    mode: 'once',
  })
}
