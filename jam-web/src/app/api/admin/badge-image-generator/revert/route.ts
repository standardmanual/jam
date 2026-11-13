import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

const ITEM_ROW_COUNT = 4

/** 적용 되돌리기 (티켓 20261113_1131 6번). 같은 아이템의 최신 적용분만 되돌릴 수 있다. */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { generationId?: string } | null
  if (!body?.generationId) return NextResponse.json({ error: 'generationId가 필요합니다.' }, { status: 400 })
  const supabase = createServiceClient()

  const { data: gen, error: genErr } = await supabase
    .from('badge_image_generations')
    .select('*')
    .eq('id', body.generationId)
    .maybeSingle()
  if (genErr) return NextResponse.json({ error: genErr.message }, { status: 500 })
  if (!gen) return NextResponse.json({ error: '생성 기록을 찾을 수 없습니다.' }, { status: 404 })
  if (gen.status !== 'applied' || !gen.applied_at) {
    return NextResponse.json({ error: '적용된 기록만 되돌릴 수 있습니다.' }, { status: 409 })
  }

  const { data: later, error: laterErr } = await supabase
    .from('badge_image_generations')
    .select('id')
    .eq('item_book_id', gen.item_book_id)
    .eq('item_name', gen.item_name)
    .eq('status', 'applied')
    .gt('applied_at', gen.applied_at)
    .limit(1)
  if (laterErr) return NextResponse.json({ error: laterErr.message }, { status: 500 })
  if ((later ?? []).length > 0) {
    return NextResponse.json({ error: '이후에 적용된 기록이 있어 최신 적용분부터 되돌려야 합니다.' }, { status: 409 })
  }

  const { data: updated, error: updErr } = await supabase
    .from('badges')
    .update({ image_url: gen.previous_image_url })
    .eq('item_book_id', gen.item_book_id)
    .eq('name', gen.item_name)
    .select('id')
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  if ((updated ?? []).length !== ITEM_ROW_COUNT) {
    return NextResponse.json({ error: `${ITEM_ROW_COUNT}행 갱신이 완료되지 않았습니다.` }, { status: 500 })
  }

  const { error: recErr } = await supabase
    .from('badge_image_generations')
    .update({ status: 'reverted' })
    .eq('id', gen.id)
  if (recErr) {
    return NextResponse.json({ error: `이미지는 되돌렸지만 기록에 실패했습니다: ${recErr.message}` }, { status: 500 })
  }
  return NextResponse.json({ imageUrl: gen.previous_image_url })
}
