import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRarity, MissionRow, UserMissionCompletionRow, UserMissionParticipationRow } from '@/types/database'
import { loadMissionVisibilityContext } from '@/lib/missions/visibility-server'
import { isMissionExposed, resolveMissionVisibilityMap } from '@/lib/missions/visibility'
import { dedupeByRewardBadge } from '@/lib/missions/dedupeReward'
import { withoutHiddenRewardBadgeIds } from '@/lib/missions/reward-badges'
import { lockedRaritiesOf, splitRewardBadges, type RewardBadgeSourceRow } from '@/lib/missions/locked-rewards'
import MissionsListClient, { type MissionListItem, type RewardBadgeInfo } from './MissionsListClient'
import MissionsBrowseTracker from './MissionsBrowseTracker'
import { getOnboardingQuestGate } from '@/lib/onboarding-quest/screen-gate'

export default async function MissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const now = new Date().toISOString()
  // 결정 14·18(상위 20260927_2123): browse 차례일 때만 화면 진입 계측을 마운트한다.
  const questStep = await getOnboardingQuestGate(user.id, 'missions')
  const isBrowseQuestTurn = questStep === 'browse'

  // ends_at이 NULL이면 상시 미션(종료일 없음) — 항상 진행중 탭에 포함
  const [
    { data: ongoingRaw, error: ongoingError },
    { data: completionsRaw, error: completionsError },
    { data: participationsRaw, error: participationsError },
  ] = await Promise.all([
    service.from('missions').select('*').or(`ends_at.is.null,ends_at.gte.${now}`).order('ends_at', { ascending: true }),
    service.from('user_mission_completions').select('mission_id, completed_at').eq('user_id', user.id),
    service.from('user_mission_participations').select('mission_id, progress_value').eq('user_id', user.id),
  ])
  if (ongoingError) console.error('[missions/page] 진행중 미션 조회 실패', ongoingError)
  if (completionsError) console.error('[missions/page] user_mission_completions 조회 실패', completionsError)
  if (participationsError) console.error('[missions/page] user_mission_participations 조회 실패', participationsError)

  // 관리자 수동 노출 제어(티켓 20260912_0139) — 게이트 판정보다 먼저 걸러진다.
  // 'start_date' 모드가 기존에 빠져 있던 starts_at<=now 필터를 여기서 보강한다.
  const ongoingMissions = ((ongoingRaw ?? []) as MissionRow[]).filter((m) => isMissionExposed(m))
  const completions = (completionsRaw ?? []) as Pick<UserMissionCompletionRow, 'mission_id' | 'completed_at'>[]
  const participations = (participationsRaw ?? []) as Pick<UserMissionParticipationRow, 'mission_id' | 'progress_value'>[]

  const completionMap = new Map(completions.map((c) => [c.mission_id, c.completed_at]))
  const participationSet = new Set(participations.map((p) => p.mission_id))
  const completedIds = [...completionMap.keys()]

  // 종료 탭('완료/지난') 1: 내가 참여했던 미션 중 이미 종료된 것
  const participatedIds = Array.from(participationSet)
  const { data: endedRaw, error: endedError } = participatedIds.length > 0
    ? await service.from('missions').select('*').lt('ends_at', now).in('id', participatedIds).order('ends_at', { ascending: false })
    : { data: [], error: null }
  if (endedError) console.error('[missions/page] 종료된 참여 미션 조회 실패', endedError)
  const endedMissions = (endedRaw ?? []) as MissionRow[]

  // 종료 탭('완료/지난') 2: 내가 완료한 미션 — 상시 미션(ends_at NULL)은 종료 조건에 영원히
  // 걸리지 않아 위 조회로는 잡히지 않는다. 완료 이력이 사라지지 않도록 따로 합친다 (20260825_028).
  const endedIds = new Set(endedMissions.map((m) => m.id))
  const missingCompletedIds = completedIds.filter((id) => !endedIds.has(id))
  const { data: completedRaw, error: completedError } = missingCompletedIds.length > 0
    ? await service.from('missions').select('*').in('id', missingCompletedIds)
    : { data: [], error: null }
  if (completedError) console.error('[missions/page] 완료 미션(상시) 조회 실패', completedError)
  const completedMissions = (completedRaw ?? []) as MissionRow[]

  // ── 노출 판정 (목록·상세·참가 API·오늘카드 공통 규칙) ───────────────────
  const visibilityContext = await loadMissionVisibilityContext(
    user.id,
    ongoingMissions,
    { completedMissionIds: new Set(completedIds), participatedMissionIds: participationSet },
  )
  const visibilityMap = resolveMissionVisibilityMap(ongoingMissions, visibilityContext)

  // 진행중/참가중 탭 대상 — 완료(completed)·미해금 상위 단계(hidden)는 제외하고
  // 바로 다음 1단계(locked)까지만 잠금 카드로 내려보낸다.
  const visibleOngoingRaw = ongoingMissions.filter((m) => {
    const v = visibilityMap.get(m.id)?.visibility
    return v === 'open' || v === 'locked'
  })

  // 같은 보상 배지를 여러 축(gate_axis)에서 열 수 있는 게이트 미션이 카드로 중복
  // 노출되지 않도록 대표 1행만 남긴다 (ended 탭·미션 상세는 대상 아님, 티켓 20260907_0043)
  const visibleOngoing = dedupeByRewardBadge(visibleOngoingRaw, participationSet, visibilityMap)

  // 보상 배지 이름 일괄 fetch — 목록에서 "배지명 배지" 형식으로 표시하기 위해
  // 숨김 배지(badges.is_hidden)는 이름·id·개수를 내리지 않는다(티켓 20261019_1313 2회, 운영 로직 10.3절) — 이름 맵에서 빼고
  // 미션 행의 reward_badge_ids에서도 뺀다. 빼지 않으면 목록 화면이 «배지 1개» 폴백으로 숨김 배지의 개수를 알린다.
  // 잠김으로 만든 아이템 배지(badges.always_locked)도 이름·id를 내리지 않고 미션마다 등급만 `lockedRewardRarities`로 싣는다
  // (티켓 20261019_1317 2회, 운영 로직 7.3절). 숨김·잠김 판정은 미션 상세와 같은 `splitRewardBadges`가 한다.
  const allMissions = [...visibleOngoing, ...endedMissions, ...completedMissions]
  const allRewardBadgeIds = [...new Set(allMissions.flatMap((m) => (m.reward_badge_ids ?? []).filter(Boolean)))]
  let rewardBadgeNames: Record<string, RewardBadgeInfo> = {}
  let concealedRewardBadgeIds: ReadonlySet<string> = new Set()
  let lockedRarityById: ReadonlyMap<string, BadgeRarity | null> = new Map()
  if (allRewardBadgeIds.length > 0) {
    const { data: badgeRows, error: badgeRowsError } = await service.from('badges').select('id, name, rarity, level, is_hidden, always_locked').in('id', allRewardBadgeIds).is('deleted_at', null)
    if (badgeRowsError) console.error('[missions/page] 보상 배지 이름 조회 실패', badgeRowsError)
    const rows = (badgeRows ?? []) as (RewardBadgeSourceRow & { level: number | null })[]
    // 숨김·잠김 여부를 읽지 못했으면 어느 배지가 가릴 대상인지 모른다 — 모두 가리고 내리지 않는다.
    const split = splitRewardBadges(rows, allRewardBadgeIds, !!badgeRowsError)
    concealedRewardBadgeIds = split.concealedIds
    lockedRarityById = split.lockedRarityById
    rewardBadgeNames = Object.fromEntries(
      rows.filter((b) => !concealedRewardBadgeIds.has(b.id)).map((b) => [b.id, { name: b.name, rarity: b.rarity, level: b.level }]),
    )
  }

  const toItem = (m: MissionRow): MissionListItem => {
    const result = visibilityMap.get(m.id)
    return {
      ...withoutHiddenRewardBadgeIds(m, concealedRewardBadgeIds),
      joined: participationSet.has(m.id),
      done: completionMap.has(m.id),
      completedAt: completionMap.get(m.id) ?? null,
      locked: result?.visibility === 'locked',
      requiredBadge: result?.requiredBadge ?? null,
      lockedRewardRarities: lockedRaritiesOf(m.reward_badge_ids, lockedRarityById),
    }
  }

  return (
    <>
      {isBrowseQuestTurn && <MissionsBrowseTracker />}
      <MissionsListClient
        ongoing={visibleOngoing.map(toItem)}
        ended={[...completedMissions, ...endedMissions].map(toItem)}
        rewardBadgeNames={rewardBadgeNames}
      />
    </>
  )
}
