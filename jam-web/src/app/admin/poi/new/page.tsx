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
        <h1 className="text-2xl font-bold mt-2">POI 임시등록</h1>
        <p className="text-sm text-muted-foreground mt-1">
          자동수집은 중단됐습니다(티켓 20260907_1811). 새 POI는 여기서 임시등록한 뒤 검토
          큐에서 확인·수정하고 명시적으로 활성화해 주세요.
        </p>
      </div>
      <PoiForm categories={categories} />
    </div>
  )
}
