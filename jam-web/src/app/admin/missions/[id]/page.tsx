import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { MissionRow } from '@/types/database'
import MissionForm from '../MissionForm'

export default async function EditMissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data } = await supabase.from('missions').select('*').eq('id', id).single()
  if (!data) notFound()
  const mission = data as MissionRow

  // 이 미션이 참조하는 배지(reward_badge_ids/gated_badge_id)의 표시용 라벨 조회 — 이름·등급·
  // 포인트를 보여주려면 필요하다(예전 missions/page.tsx의 bounded 조회 패턴을 그대로 옮김,
  // 20260826_011 A1·A2).
  type BadgeLabelRow = { id: string; name: string; point_reward: number; rarity: string; type: string }
  const referencedBadgeIds = [
    ...new Set([...(mission.reward_badge_ids ?? []), mission.gated_badge_id].filter((id): id is string => !!id)),
  ]
  const { data: badgeLabelsRaw } = referencedBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name, point_reward, rarity, type').in('id', referencedBadgeIds)
    : { data: [] as BadgeLabelRow[] }
  const badgeLabels = (badgeLabelsRaw ?? []) as BadgeLabelRow[]

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/missions" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 미션 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">미션 수정</h1>
      </div>
      <MissionForm mission={mission} badgeLabels={badgeLabels} />
    </div>
  )
}
