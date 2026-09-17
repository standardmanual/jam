import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { buildRecipeRow, replaceRecipeSlots } from '@/lib/admin/recipe-write'
import type { CombinationRecipeSlotRow } from '@/types/database'

export async function GET() {
  const authError = await requireAdmin()
  if (authError) return authError

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('combination_recipes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const recipes = data ?? []
  const recipeIds = recipes.map((r) => (r as { id: string }).id)
  const { data: slotsRaw, error: slotsError } =
    recipeIds.length > 0
      ? await supabase
          .from('combination_recipe_slots')
          .select('*')
          .in('recipe_id', recipeIds)
          .order('slot_order', { ascending: true })
      : { data: [] as CombinationRecipeSlotRow[], error: null }
  if (slotsError) return NextResponse.json({ error: slotsError.message }, { status: 500 })

  const slots = (slotsRaw ?? []) as CombinationRecipeSlotRow[]
  const slotsByRecipe = new Map<string, CombinationRecipeSlotRow[]>()
  for (const slot of slots) {
    const list = slotsByRecipe.get(slot.recipe_id) ?? []
    list.push(slot)
    slotsByRecipe.set(slot.recipe_id, list)
  }

  return NextResponse.json(
    recipes.map((r) => ({ ...r, slots: slotsByRecipe.get((r as { id: string }).id) ?? [] }))
  )
}

/**
 * 티켓 20260917_1427: 슬롯 기반 OR 매칭으로 재설계 — `buildRecipeRow()`가 형식 검증 +
 * 슬롯별 배지 실제 타입 일치 검증을 수행하고, 레시피 upsert 성공 후 `replaceRecipeSlots()`가
 * 슬롯 전체를 delete-then-insert 한다(레시피 id가 먼저 확정돼야 슬롯의 recipe_id를 채울 수
 * 있어 신규 생성 시 두 단계로 분리된다).
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

  const recipe = data as { id: string }
  const slotResult = await replaceRecipeSlots(supabase, recipe.id, built.slots)
  if (!slotResult.ok) {
    // 슬롯 저장 실패 — 레시피 행만 남는 반쪽 상태를 방지하기 위해 되돌린다.
    await supabase.from('combination_recipes').delete().eq('id', recipe.id)
    return NextResponse.json({ error: slotResult.error }, { status: 500 })
  }

  return NextResponse.json({ ...data, slots: built.slots })
}
