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

  // 미션 보상으로 배지를 고를 때 "그 배지가 포인트를 포함하는지" 경고에 쓸 목록.
  // 게이트 배지(gated_badge_id) 선택에도 같은 목록을 쓴다 — 등급(rarity)이 노출 판정 기준이라 함께 조회.
  // 소프트 삭제된 배지는 제외한다(티켓 20260825_019·026 선례).
  const { data: badgesRaw } = await supabase
    .from('badges')
    .select('id, name, point_reward, rarity')
    .is('deleted_at', null)
    .order('name')
  const badges = (badgesRaw ?? []) as { id: string; name: string; point_reward: number; rarity: string }[]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">미션 관리</h1>
          <p className="text-[#6b7280] text-sm mt-1">다이나믹 미션 생성 및 모니터링</p>
        </div>
      </div>
      <MissionList missions={missions} completionCounts={completionCounts} badges={badges} />
    </div>
  )
}
