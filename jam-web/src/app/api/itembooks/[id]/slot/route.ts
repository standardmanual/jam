import { NextRequest, NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runJamActionEvaluation } from '@/lib/badge-engine/jamActionRoute'
import { runSlotRewardIssue } from '@/lib/itembook/slotReward'
import { jamTriggersForSlot } from '@/lib/badge-engine/jamActionProgressTriggers'
import { isItemBookLaunched, type ItemBookVisibilityFields } from '@/lib/itembook/visibility'
import { d } from '@/lib/i18n'
import { findLockedItemIds, isLockedItemTriggerError, LOCKED_ITEM_NOT_ALLOWED_CODE } from '@/lib/inventory/lockedItem'

// 티켓 20260830_0057: 장착/해제는 각각 원자적 RPC(slot_item_into_book/
// unslot_item_from_book, SELECT ... FOR UPDATE 기반) 한 번 호출로 처리한다.
// 이 라우트는 인증 확인 + RPC 호출 + 에러 코드 → HTTP 상태 매핑만 담당한다
// (마이그레이션 111_item_slot_atomic_rpc.sql). 기존 에러 메시지·상태 코드는
// 그대로 보존해 클라이언트 계약을 깨지 않는다.
//
// [티켓 20260915_2239] 이 라우트가 응답 바디에 담는 `error`는 클라이언트(SlotGrid.tsx)가
// 가공 없이 그대로 화면에 노출한다 — ADR 0001에 따라 이 라우트가 `d.itembooks.*`를 직접
// 참조해 최종 문구까지 완성한다. §1.3 고정 용어 "장착(EQUIP)" — 데이터 모델 내부 명칭
// 「슬롯」은 사용자 노출 문구에 쓰지 않는다.

const SLOT_ERROR_STATUS_MAP: Record<string, { status: number; message: string }> = {
  inventory_not_found: { status: 404, message: d.itembooks.inventoryNotFound },
  item_not_found: { status: 404, message: d.itembooks.itemNotFound },
  already_dropped: { status: 409, message: d.itembooks.alreadyDropped },
  not_owner: { status: 403, message: d.itembooks.notOwner },
  already_slotted: { status: 409, message: d.itembooks.alreadySlotted },
  badge_not_found: { status: 404, message: d.itembooks.badgeNotFound },
  // 컬렉션이 없거나 공개되지 않았다 — RPC 코드가 아니라 아래 POST의 사전 확인이 쓴다(티켓 20260930_1516)
  item_book_not_found: { status: 404, message: d.itembooks.itemBookNotFound },
  wrong_item_book: { status: 400, message: d.itembooks.wrongItemBook },
  // 등급별 컬렉션(tier_mode) 장착 함수만 돌려주는 코드(티켓 20261016_2340, 마이그레이션 222)
  tier_mismatch: { status: 409, message: d.itembooks.tierMismatch },
  tier_mode_off: { status: 409, message: d.itembooks.tierModeOff },
  slot_insert_failed: { status: 500, message: d.itembooks.slotFailed },
}

// 잠긴 개체는 장착·교체할 수 없다(티켓 20261018_0051). 서버가 RPC 전에 거르고, 마이그레이션 231 트리거가 마지막 방어선이다.
// 트리거가 올린 오류(`locked_item_cannot_be_slotted`)도 같은 코드로 내려 클라이언트가 한 가지로만 처리하게 한다.
function lockedItemResponse() {
  return NextResponse.json({ error: d.lockedItem.slot, code: LOCKED_ITEM_NOT_ALLOWED_CODE }, { status: 409 })
}

const UNSLOT_ERROR_STATUS_MAP: Record<string, { status: number; message: string }> = {
  slot_not_found: { status: 404, message: d.itembooks.slotNotFound },
  inventory_not_found: { status: 404, message: d.itembooks.inventoryNotFound },
  inventory_full: { status: 409, message: d.itembooks.inventoryFullForUnslot },
  item_not_found: { status: 404, message: d.itembooks.itemNotFound },
}

// 티켓 20260910_0015: 교체는 "해제 → 장착" 순차 호출이 아니라 원자적 RPC
// swap_item_in_book() 한 번으로 처리한다(마이그레이션 151). 이유는 마이그레이션
// 파일 상단 주석 참고 — user_item_book_slots의 UNIQUE(user_id, item_book_id,
// badge_id) 제약 때문에 순차 호출로 흉내내면 두 번째 호출이 slot_insert_failed로
// 실패할 수 있고, 그 경우 슬롯이 빈 채로 남는다.
const SWAP_ERROR_STATUS_MAP: Record<string, { status: number; message: string }> = {
  slot_not_found: { status: 404, message: d.itembooks.slotNotFound },
  item_not_found: { status: 404, message: d.itembooks.itemNotFound },
  already_dropped: { status: 409, message: d.itembooks.alreadyDropped },
  not_owner: { status: 403, message: d.itembooks.notOwner },
  already_slotted: { status: 409, message: d.itembooks.alreadySlotted },
  wrong_badge: { status: 400, message: d.itembooks.wrongBadge },
  same_item: { status: 409, message: d.itembooks.sameItem },
  // 등급별 컬렉션(tier_mode) 교환 함수만 돌려주는 코드(티켓 20261016_2340, 마이그레이션 222)
  tier_mismatch: { status: 409, message: d.itembooks.tierMismatch },
  tier_mode_off: { status: 409, message: d.itembooks.tierModeOff },
  item_book_not_found: { status: 404, message: d.itembooks.itemBookNotFound },
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: itemBookId } = await params
  const supabase = createServiceClient()

  // 현재 요청한 유저 확인 (Authorization 헤더 기반)
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  // service_role 클라이언트로 유저 확인
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  const body = await req.json()
  const { inventory_item_id } = body

  if (!inventory_item_id) {
    return NextResponse.json({ error: d.itembooks.slotMissingInventoryItemId }, { status: 400 })
  }

  // 공개되지 않은 컬렉션(없음·비활성·시작 전)에는 장착할 수 없다 — 장착 RPC는 컬렉션 노출을 보지
  // 않아, 이 확인이 없으면 주소를 직접 호출해 공개 전 컬렉션을 완성할 수 있다(티켓 20260930_1516).
  // 기간이 끝난 컬렉션은 보유자가 계속 쓸 수 있어 막지 않는다(결정 E1, 판정은 visibility.ts).
  const { data: bookRaw, error: bookError } = await supabase
    .from('item_books')
    .select('is_active, valid_from, valid_until, tier_mode')
    .eq('id', itemBookId)
    .maybeSingle()
  if (bookError) {
    console.error('[itembooks/slot] item_books 조회 오류:', bookError)
    return NextResponse.json({ error: d.itembooks.slotFailed }, { status: 500 })
  }
  const book = bookRaw as (ItemBookVisibilityFields & { tier_mode: boolean | null }) | null
  if (!book || !isItemBookLaunched(book, new Date().toISOString())) {
    const notFound = SLOT_ERROR_STATUS_MAP.item_book_not_found
    return NextResponse.json({ error: notFound.message }, { status: notFound.status })
  }

  try {
    if ((await findLockedItemIds(supabase, [inventory_item_id])).length > 0) return lockedItemResponse()
  } catch (lockCheckError) {
    console.error('[itembooks/slot] 잠긴 개체 조회 오류:', lockCheckError)
    return NextResponse.json({ error: d.itembooks.slotFailed }, { status: 500 })
  }

  const rpcArgs = {
    p_user_id: user.id,
    p_item_book_id: itemBookId,
    p_inventory_item_id: inventory_item_id,
  }
  // 등급별 구조(tier_mode)가 켜진 컬렉션만 새 함수를 부른다. 꺼진 컬렉션은 이전과 같은 함수·인자다
  // (프로덕션 옛 코드도 같은 함수를 부르므로 옛 함수는 바꾸지 않는다, 티켓 20261016_2340).
  const rpcName = book.tier_mode ? 'slot_item_into_book_tiered' : 'slot_item_into_book'
  const { data: rpcResult, error: rpcError } = await supabase.rpc(rpcName, rpcArgs)

  if (rpcError) {
    if (isLockedItemTriggerError(rpcError)) return lockedItemResponse()
    console.error(`[itembooks/slot] ${rpcName} RPC 오류:`, rpcError)
    return NextResponse.json({ error: d.itembooks.slotFailed }, { status: 500 })
  }

  const result = rpcResult as { ok: boolean; error?: string; slot?: unknown; completed_tier?: string | null }

  if (!result.ok) {
    const mapped = SLOT_ERROR_STATUS_MAP[result.error ?? '']
    if (!mapped) {
      console.error(`[itembooks/slot] ${rpcName} 알 수 없는 에러 코드:`, result.error)
      return NextResponse.json({ error: d.itembooks.slotFailed }, { status: 500 })
    }
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  // 응답을 보낸 뒤에 장착한 사람의 배지를 발급·판정한다. 성공 분기에서만 예약한다(해제·교체·실패에서는 예약하지 않는다).
  // 두 함수 모두 예외를 던지지 않아 장착 응답은 그대로다.
  // 1) 컬렉션 보상 배지(티켓 20261001_0635) — 장착 RPC는 완성 포인트만 주고 보상 배지는 주지 않는다. 완성 기록이
  //    있고 `reward_badge_id`가 있을 때만 발급하며, 동기화 보정과 같은 발급 함수를 써서 한 번만 나간다.
  // 2) JAM! 행동 지표(완성한 컬렉션 수)(티켓 20261001_0633) — 장착 RPC가 완성 여부를 돌려주지 않아 장착이
  //    성공할 때마다 판정하지만, 완성이 아닌 장착이면 값이 그대로라 잘못 발급되지 않는다.
  // 순서: 보상 배지를 먼저 발급해 두 결과를 따로 알린다(한 장착이 둘 다 내면 결산이 두 행일 수 있다 — 드문 경우라 합치지 않는다).
  // 등급별 컬렉션은 이번 장착으로 새로 완성한 등급(`completed_tier`)을 돌려준다. 그 등급을 세 번째 인자로 넘겨 등급
  // 보상 배지를 발급하고, 새로 완성한 등급이 없으면 발급할 것이 없어 부르지 않는다. 옛 컬렉션은 인자 없이 이전과 같이 부른다.
  const tierMode = Boolean(book.tier_mode)
  const completedTier = result.completed_tier ?? null
  after(async () => {
    if (!tierMode) await runSlotRewardIssue(user.id, itemBookId)
    else if (completedTier) await runSlotRewardIssue(user.id, itemBookId, completedTier)
    await runJamActionEvaluation(user.id, jamTriggersForSlot())
  })

  return NextResponse.json({ slot: result.slot }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: itemBookId } = await params
  const supabase = createServiceClient()

  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  const body = await req.json()
  const { slot_id } = body

  if (!slot_id) return NextResponse.json({ error: d.itembooks.unslotMissingSlotId }, { status: 400 })

  const rpcArgs = { p_user_id: user.id, p_slot_id: slot_id }
  const { data: rpcResult, error: rpcError } = await supabase.rpc('unslot_item_from_book', rpcArgs)

  if (rpcError) {
    console.error('[itembooks/slot] unslot_item_from_book RPC 오류:', rpcError)
    return NextResponse.json({ error: d.itembooks.unslotFailed }, { status: 500 })
  }

  const result = rpcResult as { ok: boolean; error?: string }

  if (!result.ok) {
    const mapped = UNSLOT_ERROR_STATUS_MAP[result.error ?? '']
    if (!mapped) {
      console.error('[itembooks/slot] unslot_item_from_book 알 수 없는 에러 코드:', result.error)
      return NextResponse.json({ error: d.itembooks.unslotFailed }, { status: 500 })
    }
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  // DELETE에서 itemBookId 사용이 없어도 파라미터는 유지 (라우트 일관성)
  void itemBookId

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: itemBookId } = await params
  const supabase = createServiceClient()

  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  const body = await req.json()
  const { slot_id, new_inventory_item_id } = body

  if (!slot_id || !new_inventory_item_id) {
    return NextResponse.json({ error: d.itembooks.swapMissingParams }, { status: 400 })
  }

  // 등급별 구조(tier_mode)가 켜진 컬렉션은 같은 등급끼리만 바꾸는 새 함수를 부른다(티켓 20261016_2340).
  // 컬렉션이 없으면 옛 함수로 보내 이전과 같은 응답을 받는다(교환은 공개 여부를 보지 않는다).
  const { data: tierBookRaw, error: tierBookError } = await supabase
    .from('item_books')
    .select('tier_mode')
    .eq('id', itemBookId)
    .maybeSingle()
  if (tierBookError) {
    console.error('[itembooks/slot] item_books 조회 오류:', tierBookError)
    return NextResponse.json({ error: d.itembooks.swapFailed }, { status: 500 })
  }
  const swapRpcName = (tierBookRaw as { tier_mode: boolean | null } | null)?.tier_mode
    ? 'swap_item_in_book_tiered'
    : 'swap_item_in_book'

  try {
    if ((await findLockedItemIds(supabase, [new_inventory_item_id])).length > 0) return lockedItemResponse()
  } catch (lockCheckError) {
    console.error('[itembooks/slot] 잠긴 개체 조회 오류:', lockCheckError)
    return NextResponse.json({ error: d.itembooks.swapFailed }, { status: 500 })
  }

  const rpcArgs = {
    p_user_id: user.id,
    p_item_book_id: itemBookId,
    p_slot_id: slot_id,
    p_new_inventory_item_id: new_inventory_item_id,
  }
  const { data: rpcResult, error: rpcError } = await supabase.rpc(swapRpcName, rpcArgs)

  if (rpcError) {
    if (isLockedItemTriggerError(rpcError)) return lockedItemResponse()
    console.error(`[itembooks/slot] ${swapRpcName} RPC 오류:`, rpcError)
    return NextResponse.json({ error: d.itembooks.swapFailed }, { status: 500 })
  }

  const result = rpcResult as { ok: boolean; error?: string; slot?: unknown }

  if (!result.ok) {
    const mapped = SWAP_ERROR_STATUS_MAP[result.error ?? '']
    if (!mapped) {
      console.error(`[itembooks/slot] ${swapRpcName} 알 수 없는 에러 코드:`, result.error)
      return NextResponse.json({ error: d.itembooks.swapFailed }, { status: 500 })
    }
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  return NextResponse.json({ slot: result.slot })
}
