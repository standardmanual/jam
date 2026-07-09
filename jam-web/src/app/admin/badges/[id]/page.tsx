import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import BadgeForm from '../BadgeForm'
import type { BadgeRow } from '@/types/database'

export default async function EditBadgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data } = await supabase.from('badges').select('*').eq('id', id).single()
  if (!data) notFound()

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/badges" className="text-white/40 hover:text-white text-sm transition-colors">
          ← 배지 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">배지 수정</h1>
      </div>
      <BadgeForm badge={data as BadgeRow} />
    </div>
  )
}
