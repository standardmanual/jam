/**
 * 받지 않은 미션 보상 받기 API (티켓 20261019_1313, 운영 로직 13.2절·6.4절)
 *
 * POST /api/missions/[id]/claim — 이 미션에서 인벤토리 빈칸이 모자라 받지 않은 아이템 배지 보상을 모두 받는다.
 *      모두 들어갈 빈칸이 있어야 한다(일부만 받기 없음). 없으면 409 `insufficient_slots`와 `free`·`needed`.
 *      지급·받음 표시는 `mission_claim_item_rewards` 한 번이라 같은 보상을 두 번 지급하지 않는다. 미션 기간이 끝난 뒤에도 기한이 없다.
 *
 * 이용 정지 중이면 DB 함수를 부르기 전에 403 `user_suspended`로 막는다. 받기에는 트라이브 접근 검사를 하지 않는다 —
 * 완료한 유저는 상세를 계속 볼 수 있다(5-1 규칙, 티켓 20261019_1313 결정 5-d).
 *
 * `mission_claim_item_rewards`는 service_role만 실행할 수 있다. 세션으로 유저를 확인한 뒤 서버 클라이언트(service role)로
 * 호출하고, 대상은 세션 유저뿐이다. 요청 본문은 쓰지 않는다. 오류 응답에 내부 정보를 싣지 않는다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { isUuid } from '@/lib/admin/uuid'
import { followUpItemRewards } from '@/lib/missions/itemRewardFollowUp'
import {
  CLAIM_ITEM_REWARDS_ERROR_STATUS,
  parseClaimItemRewardsResult,
  type ClaimItemRewardsErrorCode,
} from '@/lib/missions/claim-contract'
import { assertNotSuspended, UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE, type UserSuspendedResponse } from '@/lib/suspension/suspension-contract'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const CLAIM_ERROR_MESSAGES: Record<Exclude<ClaimItemRewardsErrorCode, 'user_suspended'>, string> = {
  no_pending: d.missions.claim.noPending,
  insufficient_slots: d.missions.claim.insufficientSlots,
  inventory_not_found: d.missions.claim.inventoryNotFound,
}

export async function POST(_req: Request, { params }: Params) {
  const { id: missionId } = await params
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  // 형식이 틀린 id는 DB에 넘기지 않는다(Postgres 오류 원문이 응답에 실릴 수 있다) — 없는 미션과 같은 404다
  if (!isUuid(missionId)) {
    return NextResponse.json({ error: d.missions.missionNotFound }, { status: 404 })
  }

  const suspendedResponse = () => {
    const body: UserSuspendedResponse = { error: d.suspension.missionClaimBlocked, code: USER_SUSPENDED_CODE }
    return NextResponse.json(body, { status: 403 })
  }

  try {
    const service = createServiceClient()
    // 이용 정지 중이면 받지 않은 보상을 받을 수 없다. 정지 여부를 읽지 못하면 던져 받지 않는다(아래 catch가 500).
    await assertNotSuspended(service, user.id)

    const { data: raw, error: rpcError } = await service.rpc('mission_claim_item_rewards', {
      p_user_id: user.id,
      p_mission_id: missionId,
    })
    if (rpcError) throw new Error(`mission_claim_item_rewards RPC 오류: ${rpcError.message}`)
    const result = parseClaimItemRewardsResult(raw)
    if (!result) throw new Error('mission_claim_item_rewards 응답을 해석할 수 없다')

    if (!result.ok) {
      // DB 함수도 정지를 검사한다(방어). 위 검사와 이 호출 사이에 정지가 걸린 경우다.
      if (result.error === 'user_suspended') return suspendedResponse()
      return NextResponse.json(
        {
          error: CLAIM_ERROR_MESSAGES[result.error],
          code: result.error,
          ...(result.free !== undefined ? { free: result.free } : {}),
          ...(result.needed !== undefined ? { needed: result.needed } : {}),
        },
        { status: CLAIM_ITEM_REWARDS_ERROR_STATUS[result.error] }
      )
    }

    // 받은 개체의 배지 포인트(열린 개체만)와 남은 칸 알림. 던지지 않는다.
    await followUpItemRewards(service, { userId: user.id, missionId, itemIds: result.itemIds })
    return NextResponse.json({ granted: result.granted, itemIds: result.itemIds })
  } catch (err) {
    if (err instanceof UserSuspendedError) return suspendedResponse()
    console.error('[/api/missions/[id]/claim] 받기 오류:', err)
    return NextResponse.json({ error: d.missions.claim.failed }, { status: 500 })
  }
}
