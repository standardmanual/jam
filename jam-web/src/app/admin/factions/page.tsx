import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { FactionRow } from '@/types/database'

export default async function AdminFactionsPage() {
  const supabase = createServiceClient()
  const [{ data }, { data: badgesRaw }, { data: booksRaw }] = await Promise.all([
    supabase.from('factions').select('*').order('sort_order', { ascending: true }),
    supabase.from('badges').select('faction_id').not('faction_id', 'is', null),
    supabase.from('item_books').select('faction_id').not('faction_id', 'is', null),
  ])
  const factions = (data ?? []) as FactionRow[]

  const badgeCountMap = new Map<string, number>()
  for (const b of (badgesRaw ?? []) as { faction_id: string }[]) {
    badgeCountMap.set(b.faction_id, (badgeCountMap.get(b.faction_id) ?? 0) + 1)
  }
  const bookCountMap = new Map<string, number>()
  for (const b of (booksRaw ?? []) as { faction_id: string }[]) {
    bookCountMap.set(b.faction_id, (bookCountMap.get(b.faction_id) ?? 0) + 1)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">세계관 관리</h1>
        <Link
          href="/admin/factions/new"
          className="bg-[#AEEA00] text-black font-bold px-5 py-2.5 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm"
        >
          + 세계관 등록
        </Link>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
              <th className="text-left px-5 py-3">이름</th>
              <th className="text-left px-5 py-3">태그라인</th>
              <th className="text-center px-5 py-3">드랍 가중치</th>
              <th className="text-center px-5 py-3">배지 수</th>
              <th className="text-center px-5 py-3">아이템북 수</th>
              <th className="text-center px-5 py-3">정렬</th>
              <th className="text-center px-5 py-3">상태</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {factions.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-10 text-white/30">
                  등록된 세계관이 없습니다.
                </td>
              </tr>
            )}
            {factions.map((f) => (
              <tr key={f.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-5 py-3.5 font-medium">{f.name}</td>
                <td className="px-5 py-3.5 text-white/50">{f.tagline ?? '—'}</td>
                <td className="px-5 py-3.5 text-center">{f.drop_weight.toFixed(1)}</td>
                <td className="px-5 py-3.5 text-center text-white/60">{badgeCountMap.get(f.id) ?? 0}</td>
                <td className="px-5 py-3.5 text-center text-white/60">{bookCountMap.get(f.id) ?? 0}</td>
                <td className="px-5 py-3.5 text-center text-white/40">{f.sort_order}</td>
                <td className="px-5 py-3.5 text-center">
                  <span
                    className={[
                      'inline-block px-2.5 py-1 rounded-full text-xs font-semibold',
                      f.is_active
                        ? 'bg-[#AEEA00]/10 text-[#AEEA00]'
                        : 'bg-white/5 text-white/30',
                    ].join(' ')}
                  >
                    {f.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Link
                    href={`/admin/factions/${f.id}`}
                    className="text-xs text-white/40 hover:text-white transition-colors"
                  >
                    편집
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
