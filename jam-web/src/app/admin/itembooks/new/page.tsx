import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import ItemBookForm from '../ItemBookForm'
import type { TribeRow } from '@/types/database'

export default async function NewItemBookPage() {
  const supabase = createServiceClient()
  const { data: tribesRaw } = await supabase
    .from('tribes')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')

  const tribes = (tribesRaw ?? []) as Pick<TribeRow, 'id' | 'name'>[]

  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <div className="mb-6">
        <Link href="/admin/itembooks" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 컬렉션
        </Link>
        <h1 className="text-2xl font-bold mt-2">컬렉션 등록</h1>
      </div>
      <ItemBookForm
        tribes={tribes}
        slottedBadges={[]}
      />
    </div>
  )
}
