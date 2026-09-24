import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { TribeRow } from '@/types/database'
import { TribesTable } from './TribesTable'
import { fetchTribeListCounts, tribeDeleteBlockReason } from '@/lib/admin/tribe-list'

export default async function AdminTribesPage() {
  const supabase = createServiceClient()
  const { data } = await supabase.from('tribes').select('*').order('sort_order', { ascending: true })
  const tribes = (data ?? []) as TribeRow[]

  // 배지·컬렉션 수와 삭제를 막는 참조 건수를 정확히 센다 — 행을 통째로 불러 세면 PostgREST
  // 1,000행 상한에서 조용히 잘린다(티켓 20260924_0945).
  const { badgeCounts, bookCounts, blockingCounts } = await fetchTribeListCounts(
    supabase,
    tribes.map((t) => t.id)
  )
  const deleteBlockReasons: Record<string, string | null> = Object.fromEntries(
    tribes.map((t) => [t.id, tribeDeleteBlockReason(blockingCounts[t.id] ?? {})])
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">트라이브 관리</h1>
        <Link
          href="/admin/tribes/new"
          className="bg-primary text-white font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-colors text-sm"
        >
          + 트라이브 등록
        </Link>
      </div>

      <TribesTable
        tribes={tribes}
        badgeCounts={badgeCounts}
        bookCounts={bookCounts}
        deleteBlockReasons={deleteBlockReasons}
      />
    </div>
  )
}
