import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { buildRecipeRow } from '@/lib/admin/recipe-write'

export async function GET() {
  const authError = await requireAdmin()
  if (authError) return authError

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('combination_recipes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/**
 * 티켓 20260910_1408: 이전에는 body를 검증 없이 그대로 insert했다. 지금은
 * `buildRecipeRow()`가 형식 검증 + 배지 타입 기준 자동 분류(소모/보유 조건)를 수행한다.
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않아요.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const built = await buildRecipeRow(supabase, body)
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 })

  const { data, error } = await supabase
    .from('combination_recipes')
    .insert(built.row)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
