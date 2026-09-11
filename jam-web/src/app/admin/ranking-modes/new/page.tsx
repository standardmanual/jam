import { createServiceClient } from '@/lib/supabase/server'
import RankingModeForm from '../RankingModeForm'

export default async function NewRankingModePage() {
  const supabase = createServiceClient()
  // User Story 2 — 랭킹형이 아닌 미션(성취형·개인형)은 목록에 아예 안 뜨게 한다.
  const { data } = await supabase.from('missions').select('id, title').eq('status_display_type', 'ranking').order('title')
  const missions = (data ?? []) as { id: string; title: string }[]

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold">랭킹 규칙 추가</h1>
      <RankingModeForm missions={missions} initialTargetUsers={[]} />
    </div>
  )
}
