/**
 * 칸이 비면 대기 보상을 자동으로 지급하고, 지갑에 남은 잼으로 다음 캡슐을 채운다 (티켓 20261105_1438 R2, 상위 20261105_0100, 사용자 결정 Q10)
 *
 * `settleAfterSlotsFreed(supabase, userId)` — **절대 던지지 않는다.** 인벤토리 칸이 줄어드는 서버 경로(꽂기·내려놓기·조합 소각)가 응답 직전에 부르고,
 * 어떤 경로로 칸이 비었든 늦어도 다음 접속에는 지급되도록 홈 조회·캡슐 상태 조회·동기화 입구도 부른다(따라잡기).
 *
 * 순서
 *  1. 대기 보상이 없으면 바로 끝낸다(`capsule_receive_blocked` 한 번 — 막힘 판정과 같은 단일 원천이다).
 *  2. 빈칸이 대기 개수보다 적으면(`shortfall > 0`) 지급하지 않는다(부분 지급 없음). 대기 보상은 그대로 남는다.
 *  3. 빈칸이 충분하면 `claimPendingCapsules`로 지급한다(저장된 항목 그대로, 포인트·`recordIssuedRewards` 후속 처리는 열기와 같다). 이용 정지·소속 트라이브 없음이면 지급하지 않는다.
 *  4. 지급했고 대기 보상이 더 남지 않았으면 이어서 지갑에 남은 잼으로 캡슐을 채운다(`runSyncCapsuleAutoFill` — 채움·열기·챕터 오름·보지 않은 결과·소식은 기존 흐름 그대로).
 *  5. 지급은 캡슐 열기 기록(`capsule_opens`)으로 남으므로 행동 지표(캡슐 연 횟수 등)를 응답 뒤에 판정한다(`POST /api/capsule/claim`과 같다).
 *
 * 규칙
 *  - 지급 결과를 보여 주는 UI(연출·토스트·소식)는 없다. 인벤토리에 배지가 들어와 보이는 것으로 끝이다(사용자 결정 2026-11-05).
 *  - 같은 서버 프로세스에서 한 유저의 호출이 이미 돌고 있으면 아무 일도 하지 않는다(`auto-fill.ts`의 `busy` 방식). 다른 프로세스·인스턴스와의 동시 지급은 DB의 보류 줄 잠금이 막는다(이중 지급 없음).
 *  - 어떤 실패도 호출한 경로의 응답을 바꾸지 않는다. 지급 전 실패는 보류가 그대로 남아 다음 접속이 다시 시도한다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { JamActionTrigger } from '@/lib/badge-engine/jamActionBadges'
import { jamTriggersForCapsuleOpen } from '@/lib/badge-engine/jamActionProgressTriggers'
import { runJamActionEvaluation } from '@/lib/badge-engine/jamActionRoute'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { CapsuleError } from './capsule'
import { claimPendingCapsules } from './claim'
import { readCapsuleReceiveBlocked } from './receive-block'
import { runSyncCapsuleAutoFill } from './sync-auto-fill'

/** 지금 지급 중인 유저. 같은 프로세스 안의 중복 실행 방지에 쓴다(파일 머리말) */
const settlingUsers = new Set<string>()

/** 행동 지표 판정은 응답 뒤로 미룬다. 요청 범위 밖이라 `after`를 쓸 수 없으면 바로 판정한다. 던지지 않는다. */
async function scheduleJamActionEvaluation(userId: string, triggers: readonly JamActionTrigger[]): Promise<void> {
  const run = async (): Promise<void> => {
    try {
      await runJamActionEvaluation(userId, triggers)
    } catch (e) {
      console.error(`[capsule-settle] JAM! 행동 지표 판정 실패 (userId: ${userId}):`, e)
    }
  }
  try {
    after(run)
  } catch {
    await run()
  }
}

async function settle(supabase: SupabaseClient, userId: string): Promise<void> {
  // 1·2. 대기 보상이 없거나 빈칸이 모자라면 아무것도 하지 않는다
  const block = await readCapsuleReceiveBlocked(supabase, userId)
  if (!block.blocked || block.shortfall > 0) return

  // 3. 지급
  let claim: Awaited<ReturnType<typeof claimPendingCapsules>>
  try {
    claim = await claimPendingCapsules(supabase, userId)
  } catch (e) {
    // 이용 정지·소속 트라이브 없음은 지급하지 않는 정상 상황이다. 보류는 그대로 남는다.
    if (e instanceof UserSuspendedError || (e instanceof CapsuleError && (e.code === 'user_suspended' || e.code === 'no_tribe'))) return
    throw e
  }
  if (claim.claimed.length === 0) return

  const triggers: JamActionTrigger[] = [...jamTriggersForCapsuleOpen()]

  // 4. 지급했고 대기 보상이 더 없으면 지갑에 남은 잼으로 다음 캡슐을 채운다
  if (claim.remainingPending === 0) {
    const step = await runSyncCapsuleAutoFill(supabase, userId)
    if (step.opened || step.chapterRose) triggers.push('chapter_reached')
  }

  // 5. 행동 지표
  await scheduleJamActionEvaluation(userId, triggers)
}

/** 던지지 않는다. 칸이 줄어든 경로·따라잡기 지점이 부른다(파일 머리말). */
export async function settleAfterSlotsFreed(supabase: SupabaseClient, userId: string): Promise<void> {
  if (settlingUsers.has(userId)) return
  settlingUsers.add(userId)
  try {
    await settle(supabase, userId)
  } catch (e) {
    console.error(`[capsule-settle] 대기 보상 자동 지급 실패 — 보류는 남고 다음 접속이 다시 시도한다 (userId: ${userId}):`, e)
  } finally {
    settlingUsers.delete(userId)
  }
}
