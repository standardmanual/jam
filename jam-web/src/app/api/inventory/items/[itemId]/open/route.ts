/**
 * 잠긴 아이템 배지 열기 API (티켓 20261018_0053, 운영 로직 7.2·7.3절)
 *
 * POST /api/inventory/items/[itemId]/open — 가득 찬 잠긴 개체를 연다. 같은 개체가 열린 상태가 되고(일련번호 그대로) 새로 뽑지 않는다.
 * 인벤토리 빈칸은 필요 없다(이미 칸을 차지한다). 배지에 포인트가 있으면 연 유저에게 한 번만 준다(DB 함수 안에서).
 *
 * 세션으로 유저를 확인하고(401) 서비스 클라이언트로 부른다. 대상은 세션 유저의 개체뿐이라 본문은 읽지 않는다.
 * 이용 정지 중이면 403(`code: 'user_suspended'`)이고 열지 않는다. 채운 잼은 거절·오류에서 그대로 남는다.
 * 거절: `not_full`(응답에 채운 양 `filled`·필요한 양 `required`)·`not_locked` 409, `item_not_found` 404, 그 밖의 오류는 500이고 내부 오류 원문은 싣지 않는다.
 * 열기 성공 응답에만 이름·그림 등 개체 정보를 싣는다. 거절 응답에는 싣지 않는다(7.3절).
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { LockedItemError, openLockedItem } from '@/lib/inventory/lockedItemFill'
import { isLockedItemId, type LockedItemErrorResponse } from '@/lib/inventory/lockedItemFill-contract'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE, type UserSuspendedResponse } from '@/lib/suspension/suspension-contract'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  const { itemId } = await params
  if (!isLockedItemId(itemId)) {
    const body: LockedItemErrorResponse = { error: d.lockedItem.itemNotFound, code: 'item_not_found' }
    return NextResponse.json(body, { status: 404 })
  }

  try {
    const payload = await openLockedItem(createServiceClient(), user.id, itemId)
    return NextResponse.json(payload)
  } catch (err) {
    const suspended = err instanceof UserSuspendedError || (err instanceof LockedItemError && err.code === 'user_suspended')
    if (suspended) {
      const body: UserSuspendedResponse = { error: d.suspension.lockedItemOpenBlocked, code: USER_SUSPENDED_CODE }
      return NextResponse.json(body, { status: 403 })
    }
    if (err instanceof LockedItemError && err.code === 'not_full') {
      const body: LockedItemErrorResponse = {
        error: d.lockedItem.open.notFull,
        code: err.code,
        ...(err.required !== undefined ? { required: err.required } : {}),
        ...(err.filled !== undefined ? { filled: err.filled } : {}),
      }
      return NextResponse.json(body, { status: 409 })
    }
    if (err instanceof LockedItemError && err.code === 'not_locked') {
      const body: LockedItemErrorResponse = { error: d.lockedItem.notLocked, code: err.code }
      return NextResponse.json(body, { status: 409 })
    }
    if (err instanceof LockedItemError && err.code === 'item_not_found') {
      const body: LockedItemErrorResponse = { error: d.lockedItem.itemNotFound, code: err.code }
      return NextResponse.json(body, { status: 404 })
    }
    console.error('[/api/inventory/items/[itemId]/open] 열기 오류:', err)
    return NextResponse.json({ error: d.lockedItem.open.failed }, { status: 500 })
  }
}
