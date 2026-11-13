import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

const ITEM_ROW_COUNT = 4
const MIN_LEN = 10
const MAX_LEN = 200

/** 형태 묘사 수정 (티켓 20261113_1411). 영어 문장 표는 건드리지 않는다(원문 지문이 달라져 stale이 된다) */
export async function PATCH(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as {
    bookId?: string
    itemName?: string
    formDescription?: string
  } | null
  if (!body?.bookId || !body.itemName || typeof body.formDescription !== 'string') {
    return NextResponse.json({ error: 'bookId, itemName, formDescription이 필요합니다.' }, { status: 400 })
  }
  const formDescription = body.formDescription.replace(/\s*[\r\n]+\s*/g, ' ').trim()
  if (formDescription.length < MIN_LEN || formDescription.length > MAX_LEN) {
    return NextResponse.json({ error: '형태 묘사는 10~200자로 적어 주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: rows, error: rowsErr } = await supabase
    .from('badges')
    .select('id')
    .eq('item_book_id', body.bookId)
    .eq('name', body.itemName)
    .not('form_description', 'is', null)
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 })
  if ((rows ?? []).length !== ITEM_ROW_COUNT) {
    return NextResponse.json(
      { error: `아이템 배지가 ${ITEM_ROW_COUNT}행이 아닙니다(${(rows ?? []).length}행). 반영하지 않았습니다.` },
      { status: 500 }
    )
  }
  const { data: updated, error: updErr } = await supabase
    .from('badges')
    .update({ form_description: formDescription })
    .in(
      'id',
      rows!.map((r) => r.id)
    )
    .select('id')
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  if ((updated ?? []).length !== ITEM_ROW_COUNT) {
    return NextResponse.json({ error: '형태 묘사를 일부 행에만 반영했습니다. 확인이 필요합니다.' }, { status: 500 })
  }
  return NextResponse.json({ formDescription })
}
