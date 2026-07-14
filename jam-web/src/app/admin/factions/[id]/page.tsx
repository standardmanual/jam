import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import FactionForm from '../FactionForm'
import type { FactionRow } from '@/types/database'

export default async function EditFactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data } = await supabase.from('factions').select('*').eq('id', id).single()
  if (!data) notFound()

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/factions" className="text-white/40 hover:text-white text-sm transition-colors">
          ← 세계관 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">세계관 수정</h1>
      </div>
      <FactionForm faction={data as FactionRow} />
    </div>
  )
}
