/**
 * 드랍으로 사라질 채운 양 조회 API (티켓 20261018_1812, 운영 로직 7.2절)
 *
 * GET /api/inventory/items/[itemId]/drop-loss — 내 개체를 드랍하면 사라질 채운 양을 `{ lostFill }`로 돌려준다.
 * 잠긴 개체만 채운 양이 사라지고, 열린 개체이거나 채운 양이 0이면 0이다. 드랍 API는 확인 값을 받지 않으므로 화면(4-6)이 드랍 전에 읽는다.
 * 이름·그림·설명·컬렉션·트라이브·일련번호는 읽어 싣지 않는다(7.3절). 보기만 하는 조회라 이용 정지 중에도 막지 않는다.
 * 내 것이 아니거나 버려지거나 이미 드랍된 개체와 UUID가 아닌 id는 404(`item_not_found`)다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { computeLostFill, type DropLossPayload } from '@/lib/drop/drop-loss-contract'
import { getLockedItemStatus, LockedItemError } from '@/lib/inventory/lockedItemFill'
import { isLockedItemId, type LockedItemErrorResponse } from '@/lib/inventory/lockedItemFill-contract'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  const { itemId } = await params
  const notFound: LockedItemErrorResponse = { error: d.lockedItem.itemNotFound, code: 'item_not_found' }
  if (!isLockedItemId(itemId)) return NextResponse.json(notFound, { status: 404 })

  try {
    const status = await getLockedItemStatus(createServiceClient(), user.id, itemId)
    const body: DropLossPayload = { lostFill: computeLostFill(status) }
    return NextResponse.json(body)
  } catch (err) {
    if (err instanceof LockedItemError && err.code === 'item_not_found') return NextResponse.json(notFound, { status: 404 })
    console.error('[/api/inventory/items/[itemId]/drop-loss] 조회 오류:', err)
    return NextResponse.json({ error: d.lockedItem.loadFailed }, { status: 500 })
  }
}
