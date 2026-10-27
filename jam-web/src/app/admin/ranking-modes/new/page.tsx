import { createServiceClient } from '@/lib/supabase/server'
import { fetchRankingMissionOptions } from '@/lib/admin/ranking-mode-mission-guard'
import RankingModeForm from '../RankingModeForm'

export default async function NewRankingModePage() {
  const supabase = createServiceClient()
  // User Story 2 — 랭킹형이 아닌 미션(성취형·개인형)은 목록에 아예 안 뜨게 한다.
  // 기간 동안 모은 잼 미션도 뺀다(티켓 20261019_1445 3-B, 홈 보드가 그 미션의 순위를 비워 둔다).
  const missions = await fetchRankingMissionOptions(supabase)

  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <h1 className="mb-6 text-2xl font-bold">랭킹 규칙 추가</h1>
      <RankingModeForm missions={missions} initialTargetUsers={[]} />
    </div>
  )
}
