import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { collectRecipeReferences } from '@/lib/admin/recipe-references'
import { buildRecipeRow } from '@/lib/admin/recipe-write'

/**
 * 하드 삭제 — 참조 카운트 가드는 `lib/admin/recipe-references.ts`가 단일 출처다(티켓
 * 20260907_1138). 실제 스키마 재검증 결과 `combination_recipes.id`를 가리키는 인바운드
 * 참조가 없어 현재는 항상 "참조 없음" 경로만 타지만, `badges`/`poi`와 같은 fail-closed
 * 계약을 그대로 유지해 향후 인바운드 참조가 생겨도 이 라우트가 자동으로 막는다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const supabase = createServiceClient()

  const { data: existing, error: fetchError } = await supabase
    .from('combination_recipes')
    .select('id')
    .eq('id', id)
    .single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: '레시피를 찾을 수 없습니다.' }, { status: 404 })
  }

  const references = await collectRecipeReferences(supabase, [id])

  // fail-closed: 조회 자체가 실패하면 부분 카운트로 "참조 0건"을 오판하지 않도록 삭제를 막는다.
  if (references.error) {
    console.error('[recipes DELETE] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', references.error)
    return NextResponse.json(
      { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }

  if (references.total > 0) {
    console.error(`[recipes DELETE] 참조가 있어 하드 삭제를 차단합니다 (recipe=${id})`)
    return NextResponse.json(
      { error: `삭제할 수 없습니다. 이 레시피를 가리키는 참조가 ${references.total}건 있습니다.` },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('combination_recipes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않아요.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  // 티켓 20260910_1408: 이전에는 body를 `as never`로 캐스팅해 그대로 update했다. POST와 같은
  // 검증·자동 분류 규칙을 `buildRecipeRow()` 한 곳에서 공유한다.
  const built = await buildRecipeRow(supabase, body)
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 })

  const { data, error } = await supabase
    .from('combination_recipes')
    .update(built.row)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
