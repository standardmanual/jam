import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { PoiRow, BadgeRow } from '@/types/database'

export default async function AdminPoiPage() {
  const supabase = createServiceClient()
  const [{ data: poisRaw }, { data: badgesRaw }] = await Promise.all([
    supabase.from('poi').select('*').order('created_at', { ascending: false }),
    supabase.from('badges').select('id, name'),
  ])

  const pois = (poisRaw ?? []) as PoiRow[]
  const badges = (badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]
  const badgeMap = new Map(badges.map((b) => [b.id, b.name]))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">POI 관리</h1>
        <Link
          href="/admin/poi/new"
          className="bg-[#AEEA00] text-black font-bold px-4 py-2 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm"
        >
          + POI 등록
        </Link>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-left">
              <th className="px-5 py-3 font-medium">이름</th>
              <th className="px-5 py-3 font-medium">카테고리</th>
              <th className="px-5 py-3 font-medium">위도 / 경도</th>
              <th className="px-5 py-3 font-medium">반경</th>
              <th className="px-5 py-3 font-medium">연결 배지</th>
            </tr>
          </thead>
          <tbody>
            {pois.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-white/30">
                  등록된 POI가 없습니다.
                </td>
              </tr>
            )}
            {pois.map((poi) => (
              <tr key={poi.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/poi/${poi.id}`}
                    className="font-medium hover:text-[#AEEA00] transition-colors"
                  >
                    {poi.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-white/60">{poi.category}</td>
                <td className="px-5 py-3 text-white/60 font-mono text-xs">
                  {poi.latitude.toFixed(4)}, {poi.longitude.toFixed(4)}
                </td>
                <td className="px-5 py-3 text-white/60">{poi.radius_meters}m</td>
                <td className="px-5 py-3 text-white/60">
                  {poi.linked_badge_id ? badgeMap.get(poi.linked_badge_id) ?? poi.linked_badge_id : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
