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

  // 이 미션이 참조하는 배지(reward_badge_ids/gated_badge_id/condition_json.badge_id)의 표시용
  // 라벨 조회 — 이름·등급·포인트를 보여주려면 필요하다(예전 missions/page.tsx의 bounded 조회
  // 패턴을 그대로 옮김, 20260826_011 A1·A2). `condition_json.badge_id`는 티켓 20260911_2118이
  // 추가했다 — 아이템 픽업(item_collect) 타입의 목표 배지 필드 빌더가 기존 값을 라벨로 되돌리는 데 쓴다.
  type BadgeLabelRow = { id: string; name: string; point_reward: number; rarity: string; type: string }
  const conditionBadgeId = typeof mission.condition_json?.badge_id === 'string' ? mission.condition_json.badge_id : null
  const referencedBadgeIds = [
    ...new Set(
      [...(mission.reward_badge_ids ?? []), mission.gated_badge_id, conditionBadgeId].filter(
        (id): id is string => !!id
      )
    ),
  ]
  const { data: badgeLabelsRaw } = referencedBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name, point_reward, rarity, type').in('id', referencedBadgeIds)
    : { data: [] as BadgeLabelRow[] }
  const badgeLabels = (badgeLabelsRaw ?? []) as BadgeLabelRow[]

  // 체크인(checkin) 타입의 목표 지점(condition_json.poi_id) 표시용 이름 — 필드 빌더가 기존 값을
  // 라벨로 되돌리는 데 쓴다(티켓 20260911_2118).
  const conditionPoiId = typeof mission.condition_json?.poi_id === 'string' ? mission.condition_json.poi_id : null
  const { data: poiRow } = conditionPoiId
    ? await supabase.from('poi').select('name, category').eq('id', conditionPoiId).maybeSingle()
    : { data: null }
  const poiLabel = poiRow ? `${poiRow.name} [${poiRow.category}]` : undefined

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/missions" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 미션 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">미션 수정</h1>
      </div>
      <MissionForm mission={mission} badgeLabels={badgeLabels} poiLabel={poiLabel} />
    </div>
  )
}
