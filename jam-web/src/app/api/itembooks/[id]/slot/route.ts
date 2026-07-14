import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

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

  // 1) inventory_item 조회 → badge_id 확인
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invItemRaw, error: invErr } = await (supabase as any)
    .from('inventory_items')
    .select('id, badge_id, inventory_id, slotted_in')
    .eq('id', inventory_item_id)
    .single()
  const invItem = invItemRaw as { id: string; badge_id: string; inventory_id: string; slotted_in: string | null } | null

  if (invErr || !invItem) return NextResponse.json({ error: '인벤토리 아이템을 찾을 수 없습니다.' }, { status: 404 })

  // 소유자 확인: inventory.user_id === 현재 유저
  const { data: invRaw } = await supabase
    .from('inventory')
    .select('user_id')
    .eq('id', invItem.inventory_id)
    .single()
  const inv = invRaw as { user_id: string } | null
  if (!inv || inv.user_id !== user.id) {
    return NextResponse.json({ error: '본인의 아이템만 슬롯에 넣을 수 있습니다.' }, { status: 403 })
  }

  if (invItem.slotted_in) return NextResponse.json({ error: '이미 슬롯에 장착된 아이템입니다.' }, { status: 409 })

  // 2) 아이템이 이 아이템북 소속인지 확인 (badges.item_book_id)
  const { data: badgeRaw, error: badgeErr } = await supabase
    .from('badges')
    .select('id, item_book_id')
    .eq('id', invItem.badge_id)
    .single()
  const badge = badgeRaw as { id: string; item_book_id: string | null } | null

  if (badgeErr || !badge) return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })
  if (badge.item_book_id !== itemBookId) {
    return NextResponse.json({ error: '이 배지는 해당 아이템북에 속하지 않습니다.' }, { status: 400 })
  }

  // 3) user_item_book_slots INSERT
  const { data: slot, error: slotErr } = await supabase
    .from('user_item_book_slots')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      user_id: user.id,
      item_book_id: itemBookId,
      badge_id: invItem.badge_id,
      inventory_item_id,
    } as any)
    .select()
    .single()

  if (slotErr) return NextResponse.json({ error: slotErr.message }, { status: 500 })

  // 4) inventory_items.slotted_in 업데이트
  await supabase
    .from('inventory_items')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ slotted_in: slot.id })
    .eq('id', inventory_item_id)

  // 5) 완성 체크: 이 아이템북에 필요한 배지 수 vs 현재 슬롯 수
  const [{ count: totalBadges }, { count: slottedCount }] = await Promise.all([
    supabase.from('badges').select('id', { count: 'exact', head: true }).eq('item_book_id', itemBookId),
    supabase
      .from('user_item_book_slots')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('item_book_id', itemBookId),
  ])

  if (totalBadges && slottedCount && slottedCount >= totalBadges) {
    // 아이템북 완성! — 이미 완성된 경우 무시 (upsert + ignoreDuplicates)
    await supabase
      .from('user_item_book_completions')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert({ user_id: user.id, item_book_id: itemBookId } as any, {
        onConflict: 'user_id,item_book_id',
        ignoreDuplicates: true,
      })
  }

  return NextResponse.json({ slot }, { status: 201 })
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

  // slot 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: slotRaw, error: slotErr } = await (supabase as any)
    .from('user_item_book_slots')
    .select('id, inventory_item_id, user_id')
    .eq('id', slot_id)
    .eq('user_id', user.id)
    .single()
  const slot = slotRaw as { id: string; inventory_item_id: string; user_id: string } | null

  if (slotErr || !slot) return NextResponse.json({ error: '슬롯을 찾을 수 없습니다.' }, { status: 404 })

  // inventory_items.slotted_in = NULL
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('inventory_items')
    .update({ slotted_in: null })
    .eq('id', slot.inventory_item_id)

  // slot row 삭제
  const { error: delErr } = await supabase.from('user_item_book_slots').delete().eq('id', slot_id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // DELETE에서 itemBookId 사용이 없어도 파라미터는 유지 (라우트 일관성)
  void itemBookId

  return NextResponse.json({ ok: true })
}
