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
  // ⚠️ PostgREST 기본 응답 상한(1000행) 때문에 단발 select로는 미삭제 배지 2172건 중 1000건만
  //    돌아온다. name 오름차순 1000행 안에는 5개 레벨업 트리 중 '동네 산책러'만 들어와
  //    ('첫 숨결'은 1905번째) 게이트 배지·보상 배지 검색에서 나머지 4개 트리를 찾을 수 없었다.
  //    range로 페이지를 끝까지 넘겨 전량을 가져온다 (티켓 20260825_028).
  //    정렬에 id를 tie-break로 덧붙이는 이유: 동명 배지가 등급별로 여러 행 존재하므로
  //    name만으로는 페이지 경계에서 순서가 흔들려 중복·누락이 생길 수 있다.
  const BADGE_PAGE_SIZE = 1000
  type BadgeOptionRow = { id: string; name: string; point_reward: number; rarity: string }
  const badges: BadgeOptionRow[] = []
  for (let from = 0; ; from += BADGE_PAGE_SIZE) {
    const { data: pageRaw, error } = await supabase
      .from('badges')
      .select('id, name, point_reward, rarity')
      .is('deleted_at', null)
      .order('name')
      .order('id')
      .range(from, from + BADGE_PAGE_SIZE - 1)

    if (error) {
      console.error('[admin/missions] 배지 목록 조회 실패:', error)
      break
    }
    const page = (pageRaw ?? []) as BadgeOptionRow[]
    badges.push(...page)
    if (page.length < BADGE_PAGE_SIZE) break
  }

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
