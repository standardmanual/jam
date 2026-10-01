/**
 * JAM! 행동 지표 판정의 API 라우트용 래퍼 (서버 사이드 전용, 티켓 20261001_0631)
 *
 * 라우트(믹스 `/api/combine`, 드랍·픽업 라우트, 컬렉션 장착 `/api/itembooks/[id]/slot`)가 «행동이 끝난 뒤» 이 함수
 * 한 줄로 배지 판정·발급과 알림 생성을 처리한다. 동기화(`sync.ts`)는 이 파일이 아니라 `sync.ts` 안의
 * `evaluateJamActionSafely`(→ `evaluateJamActionBadges`)를 쓴다 — 이 파일이 `sync.ts`의
 * `notifyActivityBadgesEarned`를 import하므로 `sync.ts`가 이 파일을 import하면 순환이 생기고, 동기화는 획득
 * 배지를 자기 결산에 직접 합치기 때문이다. `evaluateJamActionSafely`는 새 활동이 있는 동기화가 끝날 때 주 키 5개
 * (`JAM_SYNC_TRIGGERS`), 새 활동이 없는 동기화가 끝날 때 가입 경과일(`JAM_EMPTY_SYNC_TRIGGERS`)을 판정한다.
 *
 * **어떤 예외도 밖으로 던지지 않는다.** 배지 판정·알림이 실패해도 원본 행동(믹스 결과·드랍·픽업)의
 * 응답은 그대로여야 하기 때문이다(팔로우 API `follows/route.ts`의 `try/catch`와 같은 원칙).
 *
 * 획득한 배지는 새 알림 타입 없이 기존 `activity_recap` 결산으로 알린다(`notifyActivityBadgesEarned`,
 * 귀속시킬 Strava 활동이 없어 `activityIds`는 빈 배열). 즉시 획득 연출 화면은 이 티켓의 범위 밖이다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { notifyActivityBadgesEarned } from '@/lib/strava/sync'
import { evaluateJamActionBadges, type JamActionTrigger } from './jamActionBadges'

export async function runJamActionEvaluation(userId: string, triggers: readonly JamActionTrigger[]): Promise<void> {
  try {
    if (triggers.length === 0) return
    const service = createServiceClient()
    const earned = await evaluateJamActionBadges(userId, triggers, service)
    if (earned.length === 0) return
    await notifyActivityBadgesEarned(
      service,
      userId,
      earned.map((b) => b.id),
      []
    )
  } catch (error) {
    console.error(`[runJamActionEvaluation] JAM! 행동 지표 판정 실패 (userId: ${userId}, triggers: ${triggers.join(',')}):`, error)
  }
}
