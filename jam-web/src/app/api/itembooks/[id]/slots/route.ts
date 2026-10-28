import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { d, t } from '@/lib/i18n'
import { INVENTORY_FULL_CODE } from '@/lib/inventory/locked-item-block'

// 티켓 20261028_1420: 한 컬렉션에 장착한 배지를 한 번에 모두 해제한다.
//
// 한 건의 해제는 기존 원자적 RPC `unslot_item_from_book`(마이그레이션 111)을 그대로 장착마다 순서대로 부른다 — 새 SQL 함수는 없다.
// 이 RPC는 «해제하면 인벤토리 칸을 하나 쓰므로 칸이 가득 차 있으면 거절»하므로, N개를 모두 풀려면 빈칸이 N칸 이상 있어야 한다.
// 사용자 결정(2026-10-28): 빈칸이 모자라면 앞부분만 풀지 않고 **아무것도 해제하지 않는다.** 아래 사전 확인이 그 판정이고,
// 확인과 해제 사이에 다른 요청이 빈칸을 써 버린 경합은 RPC가 `inventory_full`로 막는다. 그때는 풀린 것을 되돌리지 않고
// 해제한 수·남은 수를 응답에 담아 화면이 사실대로 알리게 한다(전부 아니면 전무가 필요하면 새 SQL 함수가 필요해 db 티켓으로 따로 다룬다).
//
// 대상: 요청한 유저가 이 컬렉션에 꽂은 장착 전부다(소프트 삭제된 배지에 꽂힌 장착 포함 — 화면에 칸이 없어 칸별 «해제»로 풀 수 없다).
// 다른 컬렉션·다른 유저의 장착은 건드리지 않는다. 장착을 풀어도 완성 기록은 지우지 않는다(111 RPC가 슬롯 행만 지운다).
//
// 응답: 성공 `{ ok: true, released, remaining: 0 }`. 실패는 `{ error, released, remaining }`이고, 가득 참(409)은 `code: INVENTORY_FULL_CODE`를 싣는다.
// `error`는 화면이 가공 없이 그대로 보인다 — 이 라우트가 `d.itembooks.*`로 최종 문구까지 완성한다(ADR 0001).
// 이용 정지 중에도 막지 않는다 — 해제는 완성을 만들지 않는다(`slot/route.ts` POST 주석과 같은 이유).

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: itemBookId } = await params
  const supabase = createServiceClient()

  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  // 실패 응답: 몇 개를 풀었고 몇 개가 남았는지를 항상 싣는다
  function failure(message: string, status: number, released: number, remaining: number, code?: string) {
    return NextResponse.json({ error: message, released, remaining, ...(code ? { code } : {}) }, { status })
  }

  // (a) 이 유저가 이 컬렉션에 꽂은 장착 전부
  const { data: slotRows, error: slotsError } = await supabase
    .from('user_item_book_slots')
    .select('id')
    .eq('user_id', user.id)
    .eq('item_book_id', itemBookId)
  if (slotsError) {
    console.error('[itembooks/slots] user_item_book_slots 조회 오류:', slotsError)
    return failure(d.itembooks.unslotAll.failed, 500, 0, 0)
  }
  const slotIds = ((slotRows ?? []) as { id: string }[]).map((row) => row.id)

  // 장착이 없으면 풀 것이 없다. 다른 탭에서 먼저 풀었거나 두 번 눌린 경우라 성공으로 본다(해제 0개)
  if (slotIds.length === 0) return NextResponse.json({ ok: true, released: 0, remaining: 0 })

  // (b) 빈칸 확인 — 풀면 장착마다 인벤토리 칸을 하나씩 쓴다. 모자라면 아무것도 풀지 않는다
  const { data: inventoryRaw, error: inventoryError } = await supabase
    .from('inventory')
    .select('used_slots, max_slots')
    .eq('user_id', user.id)
    .maybeSingle()
  if (inventoryError) {
    console.error('[itembooks/slots] inventory 조회 오류:', inventoryError)
    return failure(d.itembooks.unslotAll.failed, 500, 0, slotIds.length)
  }
  const inventory = inventoryRaw as { used_slots: number; max_slots: number } | null
  if (!inventory) return failure(d.itembooks.inventoryNotFound, 404, 0, slotIds.length)
  if (Math.max(0, inventory.max_slots - inventory.used_slots) < slotIds.length) {
    return failure(d.itembooks.unslotAll.shortNotice, 409, 0, slotIds.length, INVENTORY_FULL_CODE)
  }

  // (c) 장착마다 해제 RPC를 순서대로 부른다. 하나라도 실패하면 거기서 멈추고 푼 수를 돌려준다
  let released = 0
  for (const slotId of slotIds) {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('unslot_item_from_book', {
      p_user_id: user.id,
      p_slot_id: slotId,
    })
    const remaining = slotIds.length - released

    if (rpcError) {
      console.error('[itembooks/slots] unslot_item_from_book RPC 오류:', rpcError)
      return failure(d.itembooks.unslotAll.failed, 500, released, remaining)
    }

    const result = rpcResult as { ok: boolean; error?: string }
    if (result.ok) {
      released += 1
      continue
    }

    if (result.error === 'inventory_full') {
      // 사전 확인 뒤에 다른 요청이 빈칸을 써서 중간에 가득 찼다. 푼 것이 없으면 «아무것도 해제하지 못했어요», 있으면 해제한 수·남은 수를 알린다
      const message =
        released === 0
          ? d.itembooks.unslotAll.shortNotice
          : t(d.itembooks.unslotAll.partialNotice, { released, remaining })
      return failure(message, 409, released, remaining, INVENTORY_FULL_CODE)
    }

    console.error('[itembooks/slots] unslot_item_from_book 알 수 없는 에러 코드:', result.error)
    return failure(d.itembooks.unslotAll.failed, 500, released, remaining)
  }

  return NextResponse.json({ ok: true, released, remaining: 0 })
}
