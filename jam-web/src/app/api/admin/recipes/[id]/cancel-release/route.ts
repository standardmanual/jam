import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { cancelScheduledRecipe } from '@/lib/admin/recipe-write'

/**
 * 공개 전(예약 중) 레시피 취소 = 삭제(티켓 20261001_1158). 삭제 가드와 «공개 전에만» 조건은
 * `cancelScheduledRecipe()`가 단일 출처다 — 없는 레시피는 404, 이미 공개됐거나 배지가 가리키는 레시피는
 * 409, 취소되면 200이다. 공개된 레시피를 내릴 때는 `DELETE /api/admin/recipes/[id]`를 쓴다.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const result = await cancelScheduledRecipe(createServiceClient(), id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ ok: true })
}
