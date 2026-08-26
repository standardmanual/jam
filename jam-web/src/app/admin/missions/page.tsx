import { createServiceClient } from '@/lib/supabase/server'
import type { MissionRow, UserMissionCompletionRow } from '@/types/database'
import MissionList from './MissionList'

export default async function AdminMissionsPage() {
  const supabase = createServiceClient()

  const { data: missionsRaw } = await supabase
    .from('missions')
    .select('*')
    .order('created_at', { ascending: false })

  const missions = (missionsRaw ?? []) as MissionRow[]

  // 각 미션별 완료 수
  const missionIds = missions.map((m) => m.id)
  const { data: completionsRaw } = missionIds.length > 0
    ? await supabase
        .from('user_mission_completions')
        .select('mission_id')
        .in('mission_id', missionIds)
    : { data: [] }

  const completionCounts = new Map<string, number>()
  ;(completionsRaw ?? []).forEach((c: Pick<UserMissionCompletionRow, 'mission_id'>) => {
    completionCounts.set(c.mission_id, (completionCounts.get(c.mission_id) ?? 0) + 1)
  })

  // 미션이 이미 참조하는 배지(reward_badge_ids/gated_badge_id)의 표시용 라벨 조회 — 이름·등급·
  // 포인트를 보여주려면 필요하다. 이전에는 배지 2172건 전량을 range-loop로 끌어온 뒤 클라이언트
  // 필터링했지만(PostgREST 1000행 상한 방지, 티켓 20260825_028), 저작 폼의 배지 검색 UI가
  // /api/admin/badges/search 기반 컴포넌트로 바뀌면서(20260826_011 A1·A2) 더 이상 전량이
  // 필요 없다 — 실제로 참조되는 id만 bounded로 조회한다(admin/itembooks/page.tsx의 labelIds
  // 패턴과 동일).
  type BadgeLabelRow = { id: string; name: string; point_reward: number; rarity: string; type: string }
  const referencedBadgeIds = [
    ...new Set(
      missions.flatMap((m) => [...(m.reward_badge_ids ?? []), m.gated_badge_id]).filter((id): id is string => !!id)
    ),
  ]
  const { data: badgeLabelsRaw } = referencedBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name, point_reward, rarity, type').in('id', referencedBadgeIds)
    : { data: [] as BadgeLabelRow[] }
  const badgeLabels = (badgeLabelsRaw ?? []) as BadgeLabelRow[]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">미션 관리</h1>
          <p className="text-[#6b7280] text-sm mt-1">다이나믹 미션 생성 및 모니터링</p>
        </div>
      </div>
      <MissionList missions={missions} completionCounts={completionCounts} badgeLabels={badgeLabels} />
    </div>
  )
}
