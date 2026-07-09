import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { BadgeRow } from '@/types/database'

const rarityColor: Record<string, string> = {
  common: 'text-white/50',
  rare: 'text-blue-400',
  legendary: 'text-purple-400',
  mythic: 'text-yellow-400',
}

export default async function AdminBadgesPage() {
  const supabase = createServiceClient()
  const { data: badgesRaw } = await supabase
    .from('badges')
    .select('*')
    .order('created_at', { ascending: false })

  const badges = (badgesRaw ?? []) as BadgeRow[]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">배지 관리</h1>
        <Link
          href="/admin/badges/new"
          className="bg-[#AEEA00] text-black font-bold px-4 py-2 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm"
        >
          + 배지 등록
        </Link>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-left">
              <th className="px-5 py-3 font-medium">이미지</th>
              <th className="px-5 py-3 font-medium">이름</th>
              <th className="px-5 py-3 font-medium">타입</th>
              <th className="px-5 py-3 font-medium">희귀도</th>
              <th className="px-5 py-3 font-medium">활동 종류</th>
              <th className="px-5 py-3 font-medium">조건</th>
              <th className="px-5 py-3 font-medium">패치</th>
            </tr>
          </thead>
          <tbody>
            {badges.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-white/30">
                  등록된 배지가 없습니다.
                </td>
              </tr>
            )}
            {badges.map((badge) => (
              <tr
                key={badge.id}
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                <td className="px-5 py-3">
                  <Link href={`/admin/badges/${badge.id}`}>
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden">
                      {badge.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={badge.image_url}
                          alt={badge.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-white/20 text-xs">—</span>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/badges/${badge.id}`}
                    className="font-medium hover:text-[#AEEA00] transition-colors"
                  >
                    {badge.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-white/60">{badge.type}</td>
                <td className={`px-5 py-3 font-medium ${rarityColor[badge.rarity] ?? ''}`}>
                  {badge.rarity}
                </td>
                <td className="px-5 py-3 text-white/60 text-xs">
                  {badge.activity_types?.join(', ') || '—'}
                </td>
                <td className="px-5 py-3">
                  {badge.condition_json ? (
                    <span className="text-[#AEEA00]/70 text-xs">있음</span>
                  ) : (
                    <span className="text-white/20 text-xs">없음</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {badge.patch_available ? (
                    <span className="text-green-400 text-xs">
                      {badge.patch_price_krw?.toLocaleString()}원
                    </span>
                  ) : (
                    <span className="text-white/20 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
