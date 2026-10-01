import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { collectRecipeReferences } from '@/lib/admin/recipe-references'
import { recipeDeleteBlockedMessage } from '@/lib/admin/recipe-bulk'
import { assertValidFromChange, assertValidPeriod, buildRecipeRow, replaceRecipeSlots } from '@/lib/admin/recipe-write'
import { isUuid } from '@/lib/admin/uuid'

/**
 * 하드 삭제 — 참조 카운트 가드는 `lib/admin/recipe-references.ts`가 단일 출처다(티켓
 * 20260907_1138). 삭제되지 않은 배지가 조건 `recipe_first_success.recipe_id`로 이 레시피를
 * 가리키면 삭제를 막는다(티켓 20261001_1200). `badges`/`poi`와 같은 fail-closed 계약이라
 * 참조 조회가 실패해도 삭제를 막는다.
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
      { error: recipeDeleteBlockedMessage(references.total) },
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

  // 공개 시각 변경 가드(티켓 20261001_1158)와 공개·종료 시각 순서 가드(티켓 20261002_0710)를 위해 기존 행을
  // 먼저 읽는다. 없는 레시피는 404다.
  const { data: existing, error: existingError } = isUuid(id)
    ? await supabase.from('combination_recipes').select('id, valid_from, valid_until').eq('id', id).maybeSingle()
    : { data: null, error: null }
  if (existingError) {
    console.error('[recipes PATCH] 기존 레시피 조회 실패:', existingError)
    return NextResponse.json({ error: '레시피를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }
  if (!existing) return NextResponse.json({ error: '레시피를 찾을 수 없어요.' }, { status: 404 })

  // 티켓 20260910_1408: 이전에는 body를 `as never`로 캐스팅해 그대로 update했다. POST와 같은
  // 검증 규칙을 `buildRecipeRow()` 한 곳에서 공유한다. 티켓 20260917_1427: 슬롯 기반 재설계로
  // 재료 분류가 슬롯 배열 검증으로 바뀌었다 — 슬롯은 레시피 update 성공 후 전체 교체한다.
  const built = await buildRecipeRow(supabase, body)
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 })

  // 이미 공개된 레시피는 공개 시각을 바꿀 수 없다 — 예약 중일 때만 시각 변경·바로 공개 전환이 된다.
  const existingPeriod = existing as { valid_from: string | null; valid_until: string | null }
  const change = assertValidFromChange(existingPeriod, built.row.valid_from)
  if (!change.ok) return NextResponse.json({ error: change.error }, { status: 409 })

  // 종료 시각은 공개 뒤에도 바꿀 수 있다(앞당기기·늦추기·지우기, 티켓 20261002_0710). 제출하지 않은 쪽은 기존 값으로
  // 비교해 공개 시각보다 뒤인지만 본다.
  const period = assertValidPeriod(existingPeriod, built.row.valid_from, built.row.valid_until)
  if (!period.ok) return NextResponse.json({ error: period.error }, { status: 400 })

  const { data, error } = await supabase
    .from('combination_recipes')
    .update(built.row)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const slotResult = await replaceRecipeSlots(supabase, id, built.slots)
  if (!slotResult.ok) return NextResponse.json({ error: slotResult.error }, { status: 500 })

  return NextResponse.json({ ...data, slots: built.slots })
}
