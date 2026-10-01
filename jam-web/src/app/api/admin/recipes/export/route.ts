import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { parseExportIds } from '@/lib/admin/export-ids'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import { RECIPE_LIST_COLUMNS, type RecipeListRow } from '@/lib/admin/recipe-list'
import type { CombinationRecipeSlotRow } from '@/types/database'

/**
 * 선택된 믹스 레시피를 CSV로 내보낸다(티켓 20260924_0949, 상위 티켓 §4.1). ID 목록을
 * 본문으로 받는다 — 최대 1,000건(전체 선택 상한)까지도 GET 쿼리스트링 16KB 상한에 걸릴 수
 * 있어 POST로 받는다(`api/admin/poi/export`와 같은 이유).
 */
const CHUNK_SIZE = 200

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1603). 현상 → 원인 → 해결책 순서.
const READ_ERROR_MESSAGE = '내보낼 레시피 정보를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const parsed = parseExportIds(body, '내보낼 레시피를 선택해주세요.')
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

  const uniqueIds = parsed.ids

  const supabase = createServiceClient()
  const rows: RecipeListRow[] = []
  const slots: CombinationRecipeSlotRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const [recipeResult, slotResult] = await Promise.all([
      supabase.from('combination_recipes').select(RECIPE_LIST_COLUMNS).in('id', chunk),
      supabase.from('combination_recipe_slots').select('*').in('recipe_id', chunk),
    ])
    if (recipeResult.error) {
      console.error('[recipes export] 레시피 조회 오류:', recipeResult.error.message)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
    if (slotResult.error) {
      console.error('[recipes export] 슬롯 조회 오류:', slotResult.error.message)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
    rows.push(...((recipeResult.data ?? []) as RecipeListRow[]))
    slots.push(...((slotResult.data ?? []) as CombinationRecipeSlotRow[]))
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))

  const slotsByRecipe = new Map<string, CombinationRecipeSlotRow[]>()
  for (const slot of slots) {
    const list = slotsByRecipe.get(slot.recipe_id) ?? []
    list.push(slot)
    slotsByRecipe.set(slot.recipe_id, list)
  }

  const badgeIds = [
    ...new Set([
      ...slots.flatMap((s) => s.allowed_badge_ids),
      ...rows.flatMap((r) => r.reward_badge_ids ?? []),
    ]),
  ]
  const badgeNameById = new Map<string, string>()
  for (let i = 0; i < badgeIds.length; i += CHUNK_SIZE) {
    const { data } = await supabase.from('badges').select('id, name').in('id', badgeIds.slice(i, i + CHUNK_SIZE))
    for (const b of (data ?? []) as { id: string; name: string }[]) badgeNameById.set(b.id, b.name)
  }
  const nameOf = (id: string) => badgeNameById.get(id) ?? id

  const csv = toCsv(rows, [
    { header: 'ID', value: (r) => r.id },
    { header: '이름', value: (r) => r.name },
    { header: '슬롯 수', value: (r) => (slotsByRecipe.get(r.id) ?? []).length },
    {
      header: '슬롯 상세',
      value: (r) =>
        [...(slotsByRecipe.get(r.id) ?? [])]
          .sort((a, b) => a.slot_order - b.slot_order)
          .map((s) => s.allowed_badge_ids.map(nameOf).join('/'))
          .join(' + '),
    },
    { header: '보상 포인트', value: (r) => r.reward_points },
    { header: '보상 배지', value: (r) => (r.reward_badge_ids ?? []).map(nameOf).join(', ') },
    // 비어 있으면 처음부터 공개된 레시피다(티켓 20261001_1158). 시각은 KST로 적는다.
    { header: '공개 시각', value: (r) => (r.valid_from ? formatKstYmdHm(r.valid_from) : '') },
    { header: '등록일', value: (r) => kstDateString(r.created_at) },
  ])

  const filename = `recipes_${kstDateString().replace(/-/g, '')}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
