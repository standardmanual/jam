/**
 * 보류된 캡슐 보상 받기 API (티켓 20261028_1734 2회, 상위 20261028_1730 D9)
 *
 * POST /api/capsule/claim — 캡슐이 가득 찼을 때 인벤토리 빈칸이 모자라 보류된 보상을 오래된 순서로 받을 수 있는 만큼 받는다.
 *      받을 때 추첨해 지급하고 그 보류를 지운다. 빈칸이 모자라면 거기서 멈추고 못 받은 보상은 보류로 남는다(전부 아니면 전무가 아니다).
 *
 * 세션으로 유저를 확인하고(401) 서비스 클라이언트로 부른다. 대상은 세션 유저뿐이라 본문은 읽지 않는다.
 * 응답
 *  - 200: 받은 것이 하나 이상. `claimed`(받은 순서대로 열기 기록 id·챕터·나온 개체), `remainingPending`(남은 보류 수), `stopped`(`none`·`insufficient_slots`·`error`).
 *         일부만 받고 빈칸이 모자라 멈췄으면 `stopped: 'insufficient_slots'`와 `freeSlots`·`neededSlots`가 같이 온다.
 *  - 403: 이용 정지(`code: 'user_suspended'`). 추첨하지 않고 보류는 그대로다.
 *  - 409 `no_pending`: 받을 보류가 없다(이미 받았다). 409 `insufficient_slots`: 하나도 받지 못했다(`freeSlots`·`neededSlots`). 409 `no_tribe`·`capsule_changed`.
 *  - 500: 그 밖의 오류. 내부 오류 원문은 싣지 않는다. 보상은 보류로 그대로 남는다.
 * 미션 보상 받기(`/api/missions/[id]/claim`)의 구조와 오류 매핑을 따른다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { CapsuleError } from '@/lib/capsule/capsule'
import { claimPendingCapsules } from '@/lib/capsule/claim'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE, type UserSuspendedResponse } from '@/lib/suspension/suspension-contract'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  const suspendedResponse = () => {
    const body: UserSuspendedResponse = { error: d.suspension.capsuleClaimBlocked, code: USER_SUSPENDED_CODE }
    return NextResponse.json(body, { status: 403 })
  }

  try {
    const result = await claimPendingCapsules(createServiceClient(), user.id)

    if (result.pendingBefore === 0) {
      return NextResponse.json({ error: d.capsule.claimNoPending, code: 'no_pending' }, { status: 409 })
    }
    if (result.claimed.length === 0 && result.stopped === 'insufficient_slots') {
      return NextResponse.json(
        {
          error: d.capsule.claimInsufficientSlots,
          code: 'insufficient_slots',
          freeSlots: result.freeSlots ?? 0,
          neededSlots: result.neededSlots ?? 0,
        },
        { status: 409 }
      )
    }
    if (result.claimed.length === 0) {
      // 보류는 있었는데 다른 요청이 먼저 모두 받았다
      return NextResponse.json({ error: d.capsule.claimNoPending, code: 'no_pending' }, { status: 409 })
    }

    return NextResponse.json({
      claimed: result.claimed.map((c) => ({ openId: c.openId, chapterNo: c.chapterNo, items: c.items })),
      remainingPending: result.remainingPending,
      stopped: result.stopped,
      ...(result.stopped === 'insufficient_slots' ? { freeSlots: result.freeSlots ?? 0, neededSlots: result.neededSlots ?? 0 } : {}),
    })
  } catch (err) {
    if (err instanceof UserSuspendedError || (err instanceof CapsuleError && err.code === 'user_suspended')) return suspendedResponse()
    if (err instanceof CapsuleError && err.code === 'no_tribe') {
      return NextResponse.json({ error: d.capsule.claimNoTribe, code: 'no_tribe' }, { status: 409 })
    }
    if (err instanceof CapsuleError && err.code === 'capsule_changed') {
      return NextResponse.json({ error: d.capsule.changed, code: 'capsule_changed' }, { status: 409 })
    }
    console.error('[/api/capsule/claim] 받기 오류:', err)
    return NextResponse.json({ error: d.capsule.claimFailed }, { status: 500 })
  }
}
