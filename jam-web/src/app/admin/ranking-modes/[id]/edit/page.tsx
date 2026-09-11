import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import RankingModeForm from '../../RankingModeForm'
import type { RankingModeRow } from '@/types/database'
import type { UserSearchResult } from '@/components/admin/UserMultiSearchSelect'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditRankingModePage({ params }: Props) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: modeRaw }, { data: missionsRaw }] = await Promise.all([
    supabase.from('ranking_modes').select('*').eq('id', id).maybeSingle(),
    supabase.from('missions').select('id, title').eq('status_display_type', 'ranking').order('title'),
  ])

  const mode = modeRaw as RankingModeRow | null
  if (!mode) notFound()

  const missions = (missionsRaw ?? []) as { id: string; title: string }[]

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
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold">랭킹 규칙 수정</h1>
      <RankingModeForm mode={mode} missions={missions} initialTargetUsers={initialTargetUsers} />
    </div>
  )
}
