/**
 * 이용 정지·풀림 소식 — 서버 전용 (티켓 20261021_1249 6-3 5회, 운영 로직 15.4·16장)
 *
 * 어드민이 정지를 걸거나 푼 **직후**(`suspension-write.ts`의 DB 쓰기가 성공한 뒤) 유저에게 소식 한 건을 보낸다.
 *
 * - **던지지 않는다.** 소식은 정지·풀림의 곁다리라 실패해도 이미 끝난 결과(정지 줄, 푼 시각)를 바꾸지 않는다. `createNotification`이 실패를 로그로 남기고 null을 돌려주며, 예외가 올라와도 여기서 로그만 남기고 삼킨다.
 * - **payload에 사유 글, 어드민 이메일, 상담 메모를 싣지 않는다.** 소식 행은 `notifications_select_own` 정책으로 유저 브라우저에서 읽히고, 사유 복사본은 이후 수정과 어긋난 채 영구히 남는다.
 *   유저가 까닭을 보는 곳은 홈의 정지 안내 배너 하나다(그래서 소식의 착지가 홈이다).
 * - **한 번만 만든다.** 묶음 키는 `suspension_started:{정지 줄 id}`·`suspension_lifted:{정지 줄 id}` + `once`다. 풀고 다시 걸면 정지 줄이 새로 생기므로 소식도 새로 생긴다.
 * - 정지 중인 유저도 소식은 볼 수 있다(운영 로직 16.4).
 */
import { createNotification } from '@/lib/notifications'
import { scopedGroupKey } from '@/lib/notifications/groupKey'

/** 정지를 건 직후 «이용이 정지됐어요» 소식 한 건. 던지지 않는다 */
export async function notifySuspensionStarted(input: {
  userId: string
  suspensionId: string
  suspendedAt: string
}): Promise<void> {
  try {
    await createNotification({
      userId: input.userId,
      type: 'suspension_started',
      payload: { suspension_id: input.suspensionId, suspended_at: input.suspendedAt },
      groupKey: scopedGroupKey('suspension_started', input.suspensionId),
      mode: 'once',
    })
  } catch (error) {
    console.error(`[suspension] 정지 소식 실패 — userId: ${input.userId}, suspensionId: ${input.suspensionId}:`, error)
  }
}

/** 정지를 푼 직후 «이용 정지가 해제됐어요» 소식 한 건. 던지지 않는다 */
export async function notifySuspensionLifted(input: {
  userId: string
  suspensionId: string
  liftedAt: string
}): Promise<void> {
  try {
    await createNotification({
      userId: input.userId,
      type: 'suspension_lifted',
      payload: { suspension_id: input.suspensionId, lifted_at: input.liftedAt },
      groupKey: scopedGroupKey('suspension_lifted', input.suspensionId),
      mode: 'once',
    })
  } catch (error) {
    console.error(`[suspension] 풀림 소식 실패 — userId: ${input.userId}, suspensionId: ${input.suspensionId}:`, error)
  }
}
