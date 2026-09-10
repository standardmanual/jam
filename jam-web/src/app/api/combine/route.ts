/**
 * POST /api/combine
 * Body: { item_ids: string[] } — 인벤토리 아이템 ID 2~10개
 *
 * 응답은 `CombineResult`를 그대로 내려준다(마이그레이션 153 이후):
 *  - 성공: { success: true, path: 'recipe', resultBadges, pointsAwarded }
 *  - 실패: { success: false, reason: 'no_recipe_match'|'items_not_found'|'invalid_count', pointsAwarded }
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

  if (!Array.isArray(itemIds) || itemIds.length < 2 || itemIds.length > 10) {
    return NextResponse.json({ error: '아이템 2~10개를 선택해주세요.' }, { status: 400 })
  }

  const result = await combineItems(user.id, itemIds as string[])
  return NextResponse.json(result)
}
