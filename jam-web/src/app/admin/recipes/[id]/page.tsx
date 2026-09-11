import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, CombinationRecipeRow } from '@/types/database'
import RecipeForm from '../RecipeForm'

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data } = await supabase.from('combination_recipes').select('*').eq('id', id).single()
  if (!data) notFound()
  const recipe = data as CombinationRecipeRow

  // 이 레시피가 쓰는 배지 id만 골라 조회한다(recipes/page.tsx의 usedBadgeIds 패턴과 동일).
  const usedBadgeIds = [
    ...new Set(
      [...recipe.ingredient_badge_ids, ...(recipe.required_badge_ids ?? []), ...(recipe.reward_badge_ids ?? [])].filter(
        (bid): bid is string => !!bid
      )
    ),
  ]
  const { data: usedBadgesRaw } = usedBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name, rarity, type').in('id', usedBadgeIds)
    : { data: [] as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[] }
  const badges = (usedBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[]

  const [{ data: tribesRaw }, { data: itemBooksRaw }] = await Promise.all([
    supabase.from('tribes').select('id, name').order('name'),
    supabase.from('item_books').select('id, name').order('name'),
  ])
  const tribes = (tribesRaw ?? []) as { id: string; name: string }[]
  const itemBooks = (itemBooksRaw ?? []) as { id: string; name: string }[]

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/recipes" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 레시피 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">레시피 수정</h1>
      </div>
      <RecipeForm recipe={recipe} badges={badges} tribes={tribes} itemBooks={itemBooks} />
    </div>
  )
}
