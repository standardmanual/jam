import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import PoiForm from '../PoiForm'
import type { PoiCategoryRow } from '@/types/database'

export default async function NewPoiPage() {
  const supabase = createServiceClient()
  const { data: categoriesRaw } = await supabase.from('poi_categories').select('*').order('slug')
  // 20260907_1243: keywords가 text[]→jsonb로 바뀌어 생성 타입(여전히 string[]로 인식)과
  // 어긋난다 — unknown 경유로 좁게 우회한다.
  const categories = (categoriesRaw ?? []) as unknown as PoiCategoryRow[]

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/poi" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← POI 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">POI 등록</h1>
      </div>
      <PoiForm categories={categories} />
    </div>
  )
}
