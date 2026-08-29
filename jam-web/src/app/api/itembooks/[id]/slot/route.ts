import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 티켓 20260830_0057: 장착/해제는 각각 원자적 RPC(slot_item_into_book/
// unslot_item_from_book, SELECT ... FOR UPDATE 기반) 한 번 호출로 처리한다.
// 이 라우트는 인증 확인 + RPC 호출 + 에러 코드 → HTTP 상태 매핑만 담당한다
// (마이그레이션 111_item_slot_atomic_rpc.sql). 기존 에러 메시지·상태 코드는
// 그대로 보존해 클라이언트 계약을 깨지 않는다.

const SLOT_ERROR_STATUS_MAP: Record<string, { status: number; message: string }> = {
  inventory_not_found: { status: 404, message: '인벤토리를 찾을 수 없습니다.' },
  item_not_found: { status: 404, message: '인벤토리 아이템을 찾을 수 없습니다.' },
  already_dropped: { status: 409, message: '이미 드랍된 아이템입니다.' },
  not_owner: { status: 403, message: '본인의 아이템만 슬롯에 넣을 수 있습니다.' },
  already_slotted: { status: 409, message: '이미 슬롯에 장착된 아이템입니다.' },
  badge_not_found: { status: 404, message: '배지를 찾을 수 없습니다.' },
  wrong_item_book: { status: 400, message: '이 배지는 해당 컬렉션에 속하지 않아요.' },
  slot_insert_failed: { status: 500, message: '슬롯 등록에 실패했습니다.' },
}

const UNSLOT_ERROR_STATUS_MAP: Record<string, { status: number; message: string }> = {
  slot_not_found: { status: 404, message: '슬롯을 찾을 수 없습니다.' },
  inventory_not_found: { status: 404, message: '인벤토리를 찾을 수 없습니다.' },
  inventory_full: {
    status: 409,
    message: '인벤토리가 꽉 차 해제할 수 없어요. 인벤토리를 늘려보세요.',
  },
  item_not_found: { status: 404, message: '인벤토리 아이템을 찾을 수 없습니다.' },
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: itemBookId } = await params
  const supabase = createServiceClient()

  // 현재 요청한 유저 확인 (Authorization 헤더 기반)
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // service_role 클라이언트로 유저 확인
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { inventory_item_id } = body

  if (!inventory_item_id) {
    return NextResponse.json({ error: 'inventory_item_id가 필요합니다.' }, { status: 400 })
  }

  const rpcArgs = {
    p_user_id: user.id,
    p_item_book_id: itemBookId,
    p_inventory_item_id: inventory_item_id,
  }
  // @ts-expect-error 'slot_item_into_book' RPC 함수가 src/types/database.ts의 Functions에
  // 미등록(기존 create_user_drop/pickup_drop과 동일한 상황 — 별도 티켓으로 타입 등록 필요)
  const { data: rpcResult, error: rpcError } = await supabase.rpc('slot_item_into_book', rpcArgs)

  if (rpcError) {
    console.error('[itembooks/slot] slot_item_into_book RPC 오류:', rpcError)
    return NextResponse.json({ error: '슬롯 등록에 실패했습니다.' }, { status: 500 })
  }

  const result = rpcResult as { ok: boolean; error?: string; slot?: unknown }

  if (!result.ok) {
    const mapped = SLOT_ERROR_STATUS_MAP[result.error ?? '']
    if (!mapped) {
      console.error('[itembooks/slot] slot_item_into_book 알 수 없는 에러 코드:', result.error)
      return NextResponse.json({ error: '슬롯 등록에 실패했습니다.' }, { status: 500 })
    }
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  return NextResponse.json({ slot: result.slot }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: itemBookId } = await params
  const supabase = createServiceClient()

  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { slot_id } = body

  if (!slot_id) return NextResponse.json({ error: 'slot_id가 필요합니다.' }, { status: 400 })

  const rpcArgs = { p_user_id: user.id, p_slot_id: slot_id }
  // @ts-expect-error 'unslot_item_from_book' RPC 함수가 src/types/database.ts의 Functions에
  // 미등록(기존 create_user_drop/pickup_drop과 동일한 상황 — 별도 티켓으로 타입 등록 필요)
  const { data: rpcResult, error: rpcError } = await supabase.rpc('unslot_item_from_book', rpcArgs)

  if (rpcError) {
    console.error('[itembooks/slot] unslot_item_from_book RPC 오류:', rpcError)
    return NextResponse.json({ error: '슬롯 해제에 실패했습니다.' }, { status: 500 })
  }

  const result = rpcResult as { ok: boolean; error?: string }

  if (!result.ok) {
    const mapped = UNSLOT_ERROR_STATUS_MAP[result.error ?? '']
    if (!mapped) {
      console.error('[itembooks/slot] unslot_item_from_book 알 수 없는 에러 코드:', result.error)
      return NextResponse.json({ error: '슬롯 해제에 실패했습니다.' }, { status: 500 })
    }
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  // DELETE에서 itemBookId 사용이 없어도 파라미터는 유지 (라우트 일관성)
  void itemBookId

  return NextResponse.json({ ok: true })
}
