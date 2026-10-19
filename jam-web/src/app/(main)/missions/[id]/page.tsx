import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { MissionRow, UserMissionParticipationRow, UserMissionCompletionRow } from '@/types/database'
import { loadMissionVisibilityContext } from '@/lib/missions/visibility-server'
import { isMissionExposed, resolveMissionVisibility } from '@/lib/missions/visibility'
import { isMissionOpenToUser } from '@/lib/missions/tribe-access'
import { withoutHiddenRewardBadgeIds } from '@/lib/missions/reward-badges'
import MissionDetailClient, { type PendingRewardInfo } from './MissionDetailClient'

type Props = { params: Promise<{ id: string }> }

export default async function MissionDetailPage({ params }: Props) {
  const { id: missionId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const [{ data: missionRaw }, { data: participationRaw }, { data: completionRaw }, { data: pendingRowsRaw, error: pendingRowsError }] = await Promise.all([
    service.from('missions').select('*').eq('id', missionId).single(),
    service.from('user_mission_participations').select('*').eq('user_id', user.id).eq('mission_id', missionId).maybeSingle(),
    service.from('user_mission_completions').select('id').eq('user_id', user.id).eq('mission_id', missionId).maybeSingle(),
    // 내가 아직 받지 않은 아이템 보상(티켓 20261019_1313 3회) — 인벤토리 빈칸이 모자라 보류된 것
    service.from('mission_item_rewards').select('badge_id, locked').eq('user_id', user.id).eq('mission_id', missionId).eq('status', 'pending').order('created_at', { ascending: true }),
  ])

  if (!missionRaw) notFound()

  const mission = missionRaw as MissionRow

  // 관리자 수동 노출 제어(티켓 20260912_0139) — URL 직접 진입도 목록과 같은 기준으로
  // 걸러야 「숨김」이 무조건 숨김이 된다. 게이트 판정보다 먼저 확인한다.
  if (!isMissionExposed(mission)) notFound()
  const participation = participationRaw as UserMissionParticipationRow | null
  const completion = completionRaw as Pick<UserMissionCompletionRow, 'id'> | null

  // 보상 배지 정보 조회 (표시용)
  // 소프트 삭제된 배지(badges.deleted_at)는 보상 카드 목록에서 제외한다(20260824_007) —
  // 해당 배지 카드만 빠지고 나머지 보상(포인트·다른 배지)은 그대로 보인다.
  // 숨김 배지(badges.is_hidden)는 받기 전에 이름·그림·id·개수를 내리지 않는다(티켓 20261019_1313 2회, 운영 로직 10.3절).
  // 지금은 숨김 배지를 보상으로 저장하지 못하게 막지만, 막기 전에 들어간 값이 있어도 화면에는 내리지 않는다.
  const rewardBadgeIds = (mission.reward_badge_ids ?? []).filter((id): id is string => !!id)
  const { data: rewardBadgesRaw, error: rewardBadgesError } = rewardBadgeIds.length > 0
    ? await service.from('badges').select('id, name, image_url, rarity, is_hidden').in('id', rewardBadgeIds).is('deleted_at', null)
    : { data: [], error: null }
  if (rewardBadgesError) console.error('[missions/[id]/page] 보상 배지 조회 실패', rewardBadgesError)
  const rewardBadgeRows = (rewardBadgesRaw ?? []) as { id: string; name: string; image_url: string | null; rarity: import('@/types/database').BadgeRarity; is_hidden?: boolean | null }[]
  // 숨김 여부를 읽지 못했으면 어느 배지가 숨김인지 모른다 — 모두 숨김으로 보고 내리지 않는다.
  const hiddenRewardBadgeIds = new Set(
    rewardBadgesError ? rewardBadgeIds : rewardBadgeRows.filter((b) => b.is_hidden === true).map((b) => b.id)
  )
  const rewardBadges = rewardBadgeRows
    .filter((b) => !hiddenRewardBadgeIds.has(b.id))
    .map(({ id, name, image_url, rarity }) => ({ id, name, image_url, rarity }))
  const clientMission = withoutHiddenRewardBadgeIds(mission, hiddenRewardBadgeIds)

  // 받지 않은 아이템 보상 — 잠긴 보상은 받기 전에 어떤 배지인지 알 수 있는 값을 내리지 않는다(운영 로직 7.3절).
  // 잠김은 보상을 기록할 때 고정한 값(`mission_item_rewards.locked`)을 따른다. 잠긴 보상에는 등급과 locked만 싣고
  // 이름·그림·설명·배지 id는 싣지 않는다. 열린 보상은 이름·그림을 싣는다.
  // 소프트 삭제 배지(deleted_at)도 거르지 않는다 — 받기 함수(`mission_claim_item_rewards`)가 삭제 여부를 보지 않고 모두 주고
  // 필요한 칸 수에도 세므로, 목록도 같은 보상을 보여 줘야 «받을 보상 N개»와 «필요한 칸»이 어긋나지 않는다.
  if (pendingRowsError) console.error('[missions/[id]/page] 받지 않은 보상 조회 실패', pendingRowsError)
  const pendingRows = (pendingRowsRaw ?? []) as { badge_id: string; locked: boolean }[]
  const pendingBadgeIds = [...new Set(pendingRows.map((row) => row.badge_id))]
  const { data: pendingBadgesRaw, error: pendingBadgesError } = pendingBadgeIds.length > 0
    ? await service.from('badges').select('id, name, image_url, rarity').in('id', pendingBadgeIds)
    : { data: [], error: null }
  if (pendingBadgesError) console.error('[missions/[id]/page] 받지 않은 보상 배지 조회 실패', pendingBadgesError)
  // 배지를 읽지 못하면 맵이 비어 열린 보상은 빠지고(이름을 모른다) 잠긴 보상은 등급 없이 남는다
  const pendingBadgeById = new Map(
    ((pendingBadgesError ? [] : pendingBadgesRaw ?? []) as { id: string; name: string; image_url: string | null; rarity: import('@/types/database').BadgeRarity | null }[])
      .map((badge) => [badge.id, badge])
  )
  const pendingRewards: PendingRewardInfo[] = pendingRows.flatMap((row): PendingRewardInfo[] => {
    const badge = pendingBadgeById.get(row.badge_id)
    if (row.locked) return [{ locked: true, rarity: badge?.rarity ?? null }]
    if (!badge) return []
    return [{ locked: false, id: badge.id, name: badge.name, image_url: badge.image_url, rarity: badge.rarity ?? null }]
  })

  // 20260825_028: 목록에서 숨기더라도 URL 직접 진입은 막지 못하므로 상세에서도 같은 규칙으로
  // 잠금 여부를 판정한다(locked·hidden 모두 참가 불가 상태로 렌더).
  const visibilityContext = await loadMissionVisibilityContext(user.id, [mission], {
    participatedMissionIds: new Set(participation ? [mission.id] : []),
  })
  // 참가할 수 있는 트라이브가 아닌 미션은 «없는 미션»이다(티켓 20261019_1311) — 존재를 알리지 않는다.
  // 이미 완료한 미션은 트라이브가 바뀌어도 완료 이력으로 본다(resolveMissionVisibility의 completed 우선).
  if (
    visibilityContext.tribeAccess &&
    !visibilityContext.completedMissionIds.has(mission.id) &&
    !isMissionOpenToUser(visibilityContext.tribeAccess, mission.id)
  ) {
    notFound()
  }
  const visibilityResult = resolveMissionVisibility(mission, visibilityContext)
  const locked = visibilityResult.visibility === 'locked' || visibilityResult.visibility === 'hidden'

  return (
    <MissionDetailClient
      mission={clientMission}
      isParticipating={!!participation}
      isCompleted={!!completion}
      progressValue={participation?.progress_value ?? 0}
      rewardBadges={rewardBadges}
      pendingRewards={pendingRewards}
      locked={locked}
      requiredBadge={visibilityResult.requiredBadge}
    />
  )
}
