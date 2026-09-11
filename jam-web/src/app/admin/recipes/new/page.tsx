import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import RecipeForm from '../RecipeForm'

export default async function NewRecipePage() {
  const supabase = createServiceClient()

  // 보상 배지 다중 선택의 후보 좁히기 필터(트라이브·컬렉션) 선택지 — 목록 자체는 소규모다
  // (트라이브 10종, 활성 컬렉션 30종).
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
        <h1 className="text-2xl font-bold mt-2">새 레시피</h1>
      </div>
      <RecipeForm badges={[]} tribes={tribes} itemBooks={itemBooks} />
    </div>
  )
}
