import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createRecipeWithSlots } from '@/lib/admin/recipe-write'
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
 * 티켓 20260917_1427: 슬롯 기반 OR 매칭으로 재설계 — 검증·행 insert·슬롯 저장은
 * `createRecipeWithSlots()`가 한다(티켓 20261001_1158: 운영툴 자원 연결과 같은 함수를 쓰도록 옮겼다).
 * 공개 시각(`valid_from`)은 비우면 바로 공개, 값이 있으면 시간대가 포함된 미래 시각이어야 한다.
 * 종료 시각(`valid_until`, 티켓 20261002_0710)은 비우면 상시, 값이 있으면 시간대가 포함된 시각이고 공개 시각보다
 * 뒤여야 한다(어기면 400, 기간 확인은 `createRecipeWithSlots()` 안에서 한다).
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않아요.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const created = await createRecipeWithSlots(supabase, body)
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status })

  return NextResponse.json({ ...created.recipe, slots: created.slots })
}
