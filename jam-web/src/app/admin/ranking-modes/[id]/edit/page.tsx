import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchRankingMissionOptions } from '@/lib/admin/ranking-mode-mission-guard'
import RankingModeForm from '../../RankingModeForm'
import type { RankingModeRow } from '@/types/database'
import type { UserSearchResult } from '@/components/admin/UserMultiSearchSelect'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditRankingModePage({ params }: Props) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: modeRaw } = await supabase.from('ranking_modes').select('*').eq('id', id).maybeSingle()
  const mode = modeRaw as RankingModeRow | null
  if (!mode) notFound()

  // 기간 동안 모은 잼 미션은 선택 목록에서 뺀다(티켓 20261019_1445 3-B, 홈 보드가 그 미션의 순위를 비워 둔다). 다만 지금 이 규칙에 이미
  // 연결된 그런 미션은 «연결할 수 없는 미션»이라는 표시와 함께 남겨 선택 칸이 비어 보이지 않게 한다(4회) — 저장하면 그 연결은 그대로 거절된다.
  const missions = await fetchRankingMissionOptions(supabase, mode.target_mission_id)

  // 이미 지정된 유저들의 표시용 정보만 bounded 조회(TodayCardForm.tsx의 badgeLabels와 동일 패턴)
  let initialTargetUsers: UserSearchResult[] = []
  if (mode.target_user_ids.length > 0) {
    const { data: usersRaw } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', mode.target_user_ids)
    initialTargetUsers = (usersRaw ?? []) as UserSearchResult[]
  }

  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <h1 className="mb-6 text-2xl font-bold">랭킹 규칙 수정</h1>
      <RankingModeForm mode={mode} missions={missions} initialTargetUsers={initialTargetUsers} />
    </div>
  )
}
