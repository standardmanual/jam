/**
 * 잠긴 아이템 배지 채우기 API (티켓 20261018_0053, 운영 로직 7.2절)
 *
 * POST /api/inventory/items/[itemId]/fill { amount?: number } — 잼을 잠긴 개체 하나에 채운다. 규칙은 캡슐 채우기와 같다:
 * 생략하면 남은 양이고, 가진 잼이 모자라면 가진 만큼 채우고, 나눠 채울 수 있다.
 *
 * 세션으로 유저를 확인하고(401) 서비스 클라이언트로 부른다. 대상은 세션 유저의 개체뿐이라 본문의 `userId`는 무시한다.
 * `amount`는 양의 정수만 받는다(상한은 필요량 이내인지 DB가 판정한다). 본문이 비어 있으면 `amount` 생략과 같다.
 * 이용 정지 중이면 403(`code: 'user_suspended'`)이고 잼은 줄지 않는다.
 * 거절 코드: `already_full`·`exceeds_remaining`·`invalid_amount` 400, `insufficient_jam`·`not_locked` 409, `item_not_found` 404, 그 밖의 오류는 500.
 * 응답에는 이름·그림 등 개체를 알 수 있는 값을 싣지 않는다(7.3절).
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { CAPSULE_AMOUNT_MAX } from '@/lib/capsule/capsule-contract'
import { fillLockedItem, LockedItemError } from '@/lib/inventory/lockedItemFill'
import { isLockedItemId, type LockedItemErrorResponse, type LockedItemFillErrorCode } from '@/lib/inventory/lockedItemFill-contract'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE, type UserSuspendedResponse } from '@/lib/suspension/suspension-contract'

export const dynamic = 'force-dynamic'

const FILL_ERRORS: Record<Exclude<LockedItemFillErrorCode, 'user_suspended'>, { status: number; message: string }> = {
  already_full: { status: 400, message: d.lockedItem.fill.alreadyFull },
  exceeds_remaining: { status: 400, message: d.lockedItem.fill.exceedsRemaining },
  invalid_amount: { status: 400, message: d.lockedItem.fill.invalidAmount },
  insufficient_jam: { status: 409, message: d.lockedItem.fill.insufficientJam },
  not_locked: { status: 409, message: d.lockedItem.notLocked },
  item_not_found: { status: 404, message: d.lockedItem.itemNotFound },
}

type ParsedAmount = { ok: true; amount: number | undefined } | { ok: false }

/** 본문이 비었으면 `amount` 생략, JSON 객체면 `amount`가 생략됐거나 양의 정수(상한 이하)일 때만 통과시킨다. */
async function parseAmount(request: Request): Promise<ParsedAmount> {
  const text = await request.text()
  if (text.trim() === '') return { ok: true, amount: undefined }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false }
  const amount = (body as { amount?: unknown }).amount
  if (amount === undefined) return { ok: true, amount: undefined }
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > CAPSULE_AMOUNT_MAX) return { ok: false }
  return { ok: true, amount }
}

export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
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

  const parsed = await parseAmount(request)
  if (!parsed.ok) {
    const body: LockedItemErrorResponse = { error: d.lockedItem.fill.invalidAmount, code: 'invalid_amount' }
    return NextResponse.json(body, { status: 400 })
  }

  try {
    const payload = await fillLockedItem(createServiceClient(), user.id, itemId, parsed.amount)
    return NextResponse.json(payload)
  } catch (err) {
    const suspended = err instanceof UserSuspendedError || (err instanceof LockedItemError && err.code === 'user_suspended')
    if (suspended) {
      const body: UserSuspendedResponse = { error: d.suspension.lockedItemFillBlocked, code: USER_SUSPENDED_CODE }
      return NextResponse.json(body, { status: 403 })
    }
    // 열기 거절 코드(`not_full`)는 채우기에서 나오지 않는다. 나오면 500으로 둔다.
    if (err instanceof LockedItemError && err.code in FILL_ERRORS) {
      const { status, message } = FILL_ERRORS[err.code as keyof typeof FILL_ERRORS]
      const body: LockedItemErrorResponse = {
        error: message,
        code: err.code,
        ...(err.remaining !== undefined ? { remaining: err.remaining } : {}),
      }
      return NextResponse.json(body, { status })
    }
    console.error('[/api/inventory/items/[itemId]/fill] 채우기 오류:', err)
    return NextResponse.json({ error: d.lockedItem.fill.failed }, { status: 500 })
  }
}
