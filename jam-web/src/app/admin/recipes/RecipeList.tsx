'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CombinationRecipeRow } from '@/types/database'
import { RecipeTable } from './RecipeTable'

interface Props {
  recipes: CombinationRecipeRow[]
  badgeMap: Map<string, string>
}

/**
 * 레시피 목록(티켓 20260911_2035) — 상세/수정은 `/admin/recipes/[id]` 페이지 이동으로 연다
 * (예전에는 이 컴포넌트 안에서 폼을 토글했다 — 저작 폼 자체는 `RecipeForm.tsx`로 옮겼다).
 */
export default function RecipeList({ recipes, badgeMap }: Props) {
  const router = useRouter()

  const startEdit = useCallback(
    (r: CombinationRecipeRow) => {
      router.push(`/admin/recipes/${r.id}`)
    },
    [router]
  )

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/admin/recipes/${id}`, { method: 'DELETE' })
    router.refresh()
  }, [router])

  return (
    <div className="space-y-6">
      {/* 등록 페이지 이동 */}
      <div>
        <Link
          href="/admin/recipes/new"
          className="inline-block bg-primary text-white font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm"
        >
          + 레시피 등록
        </Link>
      </div>

      {/* 레시피 목록 */}
      <RecipeTable recipes={recipes} badgeMap={badgeMap} onEdit={startEdit} onDelete={handleDelete} />
    </div>
  )
}
