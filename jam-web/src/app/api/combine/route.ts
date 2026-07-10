/**
 * POST /api/combine
 * Body: { item_ids: string[] } — 인벤토리 아이템 ID 2~3개
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { combineItems } from '@/lib/combine/index'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const itemIds: unknown = body?.item_ids

  if (!Array.isArray(itemIds) || itemIds.length < 2 || itemIds.length > 3) {
    return NextResponse.json({ error: '아이템 2~3개를 선택해주세요.' }, { status: 400 })
  }

  const result = await combineItems(user.id, itemIds as string[])
  return NextResponse.json(result)
}
