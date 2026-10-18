/**
 * 잠긴 아이템 배지 조회 API (티켓 20261018_0053, 운영 로직 7.2·7.3절)
 *
 * GET /api/inventory/items/[itemId]/lock — 내 개체의 채운 양·필요량·남은 양·가진 잼·열 수 있는지.
 * 이름·그림·설명·컬렉션·트라이브·일련번호는 싣지 않는다(7.3절). 내 상태 보기라 이용 정지 중에도 막지 않는다.
 * 내 것이 아니거나 버려지거나 드랍된 개체는 404(`item_not_found`)다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
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
    return NextResponse.json(status)
  } catch (err) {
    if (err instanceof LockedItemError && err.code === 'item_not_found') return NextResponse.json(notFound, { status: 404 })
    console.error('[/api/inventory/items/[itemId]/lock] 조회 오류:', err)
    return NextResponse.json({ error: d.lockedItem.loadFailed }, { status: 500 })
  }
}
