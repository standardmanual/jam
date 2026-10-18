/**
 * 받지 않은 믹스 결과 API (티켓 20261018_0055, 운영 로직 6.4·8.4절)
 *
 * GET  /api/combine/pending — 로그인한 유저의 받지 않은 결과 목록과 지금 인벤토리 빈칸 수
 *      열기 전 잠긴 결과는 이름·그림을 싣지 않는다(7.3절). 등급과 필요한 양만 보인다.
 * POST /api/combine/pending — 받지 않은 결과를 모두 받는다. 모두 들어갈 빈칸이 있어야 한다(없으면 409 `insufficient_slots`와
 *      `free`·`needed`). 지급·받음 표시는 `combine_claim_pending` 한 번이라 같은 결과를 두 번 지급하지 않는다.
 *
 * POST(받기)만 이용 정지를 검사한다(403 `user_suspended`). GET은 정지 중에도 허용한다 — 내 기록 보기는 막지 않는다.
 *
 * `combine_claim_pending`은 service_role만 실행할 수 있다. 세션으로 유저를 확인한 뒤 서버 클라이언트(service role)로
 * 호출하고, 대상은 세션 유저뿐이다. 요청 본문은 쓰지 않는다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { notifyInventorySlotsLow } from '@/lib/inventory/slotAlert'
import { claimPendingResults, listPendingResults, type ClaimPendingErrorCode } from '@/lib/combine/pending'
import { assertNotSuspended, UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE, type UserSuspendedResponse } from '@/lib/suspension/suspension-contract'

export const dynamic = 'force-dynamic'

const CLAIM_ERRORS: Record<Exclude<ClaimPendingErrorCode, 'user_suspended'>, { status: number; message: string }> = {
  no_pending: { status: 409, message: d.combine.claim.noPending },
  insufficient_slots: { status: 409, message: d.combine.claim.insufficientSlots },
  inventory_not_found: { status: 404, message: d.combine.claim.inventoryNotFound },
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  try {
    const payload = await listPendingResults(createServiceClient(), user.id)
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/combine/pending] 목록 조회 오류:', err)
    return NextResponse.json({ error: d.combine.claim.loadFailed }, { status: 500 })
  }
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  const suspendedResponse = () => {
    const body: UserSuspendedResponse = { error: d.suspension.combineClaimBlocked, code: USER_SUSPENDED_CODE }
    return NextResponse.json(body, { status: 403 })
  }

  try {
    const service = createServiceClient()
    // 이용 정지 중이면 받지 않은 결과를 받을 수 없다. 정지 여부를 읽지 못하면 던져 받지 않는다(아래 catch가 500).
    await assertNotSuspended(service, user.id)
    const result = await claimPendingResults(service, user.id)
    if (!result.ok) {
      // DB 함수도 정지를 검사한다(방어). 위 검사와 이 호출 사이에 정지가 걸린 경우다.
      if (result.error === 'user_suspended') return suspendedResponse()
      const { status, message } = CLAIM_ERRORS[result.error]
      return NextResponse.json(
        {
          error: message,
          code: result.error,
          ...(result.free !== undefined ? { free: result.free } : {}),
          ...(result.needed !== undefined ? { needed: result.needed } : {}),
        },
        { status }
      )
    }
    // 받은 만큼 칸이 찼으니 남은 칸 알림을 검사한다(티켓 20261018_0056). 던지지 않는다.
    if (result.granted > 0) await notifyInventorySlotsLow(user.id, service)
    return NextResponse.json({ granted: result.granted, itemIds: result.itemIds })
  } catch (err) {
    if (err instanceof UserSuspendedError) return suspendedResponse()
    console.error('[/api/combine/pending] 받기 오류:', err)
    return NextResponse.json({ error: d.combine.claim.failed }, { status: 500 })
  }
}
