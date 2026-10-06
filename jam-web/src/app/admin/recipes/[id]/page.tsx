import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, CombinationRecipeRow, CombinationRecipeSlotRow } from '@/types/database'
import { collectRecipeReferences } from '@/lib/admin/recipe-references'
import RecipeForm from '../RecipeForm'

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data } = await supabase.from('combination_recipes').select('*').eq('id', id).single()
  if (!data) notFound()
  const recipe = data as CombinationRecipeRow

  // 티켓 20260917_1427: 재료·보유 조건이 `combination_recipe_slots`로 이관됐다.
  const { data: slotsRaw } = await supabase
    .from('combination_recipe_slots')
    .select('*')
    .eq('recipe_id', id)
    .order('slot_order', { ascending: true })
  const slots = (slotsRaw ?? []) as CombinationRecipeSlotRow[]

  // 이 레시피가 쓰는 배지 id만 골라 조회한다(recipes/page.tsx의 usedBadgeIds 패턴과 동일).
  const usedBadgeIds = [
    ...new Set(
      [...slots.flatMap((s) => s.allowed_badge_ids), ...(recipe.reward_badge_ids ?? [])].filter(
        (bid): bid is string => !!bid
      )
    ),
  ]
  const { data: usedBadgesRaw } = usedBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name, rarity, type').in('id', usedBadgeIds)
    : { data: [] as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[] }
  const badges = (usedBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[]

  const [{ data: tribesRaw }, { data: itemBooksRaw }, references] = await Promise.all([
    supabase.from('tribes').select('id, name').order('name'),
    supabase.from('item_books').select('id, name').order('name'),
    // 이 레시피를 가리키는 홈 카드 수 — 예약 취소 확인 문구에 안내로만 쓴다(티켓 20261006_1342).
    collectRecipeReferences(supabase, [id]),
  ])
  const tribes = (tribesRaw ?? []) as { id: string; name: string }[]
  const itemBooks = (itemBooksRaw ?? []) as { id: string; name: string }[]
  // 조회가 실패하면 안내만 뺀다. 예약 취소 가능 여부와 삭제 판정은 서버가 따로 하므로 화면은 그대로 연다.
  const cardCount = references.error ? 0 : references.noticeTotal

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/recipes" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 레시피 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">레시피 수정</h1>
      </div>
      <RecipeForm recipe={recipe} slots={slots} badges={badges} tribes={tribes} itemBooks={itemBooks} cardCount={cardCount} />
    </div>
  )
}
