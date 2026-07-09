import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import PoiForm from '../PoiForm'
import type { BadgeRow } from '@/types/database'

export default async function NewPoiPage() {
  const supabase = createServiceClient()
  const { data } = await supabase.from('badges').select('id, name').order('name')
  const badges = (data ?? []) as Pick<BadgeRow, 'id' | 'name'>[]

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/poi" className="text-white/40 hover:text-white text-sm transition-colors">
          ← POI 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">POI 등록</h1>
      </div>
      <PoiForm badges={badges} />
    </div>
  )
}
