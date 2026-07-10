import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'

export default async function AdminBadgesPage() {
  const supabase = createServiceClient()
  const { data: badges, error } = await supabase
    .from('badges')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">배지 관리</h2>
        <Link
          href="/admin/badges/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + 새 배지 추가
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-4 text-red-300">
          오류: {error.message}
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="text-left px-4 py-3 font-medium text-white/70">이름</th>
              <th className="text-left px-4 py-3 font-medium text-white/70">타입</th>
              <th className="text-left px-4 py-3 font-medium text-white/70">Rarity</th>
              <th className="text-left px-4 py-3 font-medium text-white/70">생성일</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {badges && badges.length > 0 ? (
              badges.map((badge) => (
                <tr key={badge.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-medium">{badge.name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs bg-white/10">{badge.type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      badge.rarity === 'mythic' ? 'bg-purple-500/30 text-purple-300' :
                      badge.rarity === 'legendary' ? 'bg-yellow-500/30 text-yellow-300' :
                      badge.rarity === 'rare' ? 'bg-blue-500/30 text-blue-300' :
                      'bg-white/10 text-white/70'
                    }`}>
                      {badge.rarity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/50">
                    {new Date(badge.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/badges/${badge.id}`}
                      className="text-blue-400 hover:text-blue-300 text-xs"
                    >
                      수정
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-white/40">
                  배지가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
