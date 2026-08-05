import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, FactionRow } from '@/types/database'
import BadgeList from '@/components/admin/badges/BadgeList'

export default async function AdminBadgesPage() {
  const supabase = createServiceClient()

  // 모든 배지 및 팩션 조회 (클라이언트에서 필터링)
  const [{ data: badgesRaw }, { data: factionsRaw }] = await Promise.all([
    supabase.from('badges').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('factions').select('id, name'),
  ])

  const badges = (badgesRaw ?? []) as BadgeRow[]
  const factionMap = new Map(
    ((factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]).map((f) => [f.id, f.name])
  )

  return (
    <div className="p-4 md:p-8">
      <BadgeList badges={badges} factionMap={factionMap} />
    </div>
  )
}
