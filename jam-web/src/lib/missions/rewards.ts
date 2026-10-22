/**
 * Phase 13: 미션 보상 지급 (서버 사이드 전용)
 *
 * 완료 판정 직후 호출. 배지 타입(badges.type)에 따라 지급 방식이 갈린다.
 *  - activity 배지 → user_activity_badges (이미 보유하면 건너뛴다)
 *  - item 배지     → `mission_grant_item_rewards` DB 함수 한 번(마이그레이션 250, 티켓 20261019_1313, 운영 로직 13.2절·6.4절):
 *      이미 가진 아이템 배지도 새 개체로 주고, 인벤토리 빈칸이 모두 들어갈 만큼 없으면 아무것도 주지 않고 «받지 않은 보상»으로
 *      기록한다(미션 상세에서 받는다). 잠김은 배지의 `always_locked` 설정을 따른다(미션에 잠김 칸 없음).
 *  - 그 밖의 유형(체크인 등)과 숨김 배지(`is_hidden`)는 보상으로 지급하지 않는다(경고만 남긴다).
 * 배지 자체 포인트(point_reward)와 미션 포인트(reward_points)를 별개 사유로 지급한다.
 * 아이템 배지의 포인트는 열린 개체만 받을 때 주고, 잠긴 개체는 열 때 준다(`itemRewardFollowUp.ts`).
 * 아이템 배지 보상이 «받지 않은 보상»으로 보류되면 미션마다 소식 한 건(`reward_pending`)을 보낸다(티켓 20261021_1249 6-3 5회, 운영 로직 15.4절).
 */
import { createServiceClient } from '@/lib/supabase/server'
import { awardPoints } from '@/lib/points'
import { createNotification } from '@/lib/notifications'
import { scopedGroupKey } from '@/lib/notifications/groupKey'
import { awardBadgeReceiveScore } from '@/lib/chapter/badgeReceive'
import { logEngineDecision } from '@/lib/engine-log'
import { parseGrantItemRewardsResult } from '@/lib/missions/claim-contract'
import { followUpItemRewards } from '@/lib/missions/itemRewardFollowUp'
import type { MissionRow } from '@/types/database'


export interface MissionRewardResult {
  /** 실제로 받은 배지 id. 잠긴 아이템 배지는 싣지 않는다 — 동기화 응답·피드가 이름을 풀어 쓰는 공개 경로라 7.3절 가림 원칙에 어긋난다 */
  awardedBadgeIds: string[]
  awardedBadgeNames: string[]
  /** 배지 자체 포인트 합 + 미션 포인트 — 피드/화면 표시용 */
  totalAwardedPoints: number
  /** 인벤토리 빈칸이 모자라 받지 않은 상태로 남은 아이템 배지 보상 id. 미션 상세에서 받는다 */
  pendingItemBadgeIds: string[]
  /** 위 가운데 잠긴 배지 id — 피드 같은 공개 기록에는 id도 싣지 않는다 */
  pendingLockedBadgeIds: string[]
}

type RewardMission = Pick<MissionRow, 'id' | 'title' | 'reward_badge_ids' | 'reward_points'>

/**
 * 받지 않은 보상이 생긴 미션마다 «받을 보상이 있어요» 소식 한 건. 던지지 않는다 — 소식이 실패해도 보상 결과(보류 기록)는 그대로다.
 * 묶음 키는 `reward_pending:{mission_id}` + `once`라 같은 미션을 다시 판정해도 소식은 한 번이다. 소식은 사건의 기록이라 보상을 받은 뒤에도 남는다.
 * 믹스 결과 보류와 동기화 보류는 이 경로가 아니므로 대상이 아니다.
 */
async function notifyRewardPending(userId: string, mission: RewardMission): Promise<void> {
  try {
    await createNotification({
      userId,
      type: 'reward_pending',
      payload: { mission_id: mission.id, mission_title: mission.title },
      groupKey: scopedGroupKey('reward_pending', mission.id),
      mode: 'once',
    })
  } catch (error) {
    console.error(`[grantMissionRewards] 받지 않은 보상 소식 실패 (mission: ${mission.id}):`, error)
  }
}

interface RewardBadge {
  id: string
  name: string
  type: 'activity' | 'item' | 'checkin'
  point_reward: number
  is_hidden: boolean
  always_locked: boolean
  /** «배지 받기» 챕터 점수의 제외 조건(팔로워·팔로잉·챕터) 판별에만 쓴다 — 티켓 20261019_1315 */
  condition_json: object | null
}

/**
 * 미션 완료 시 설정된 보상을 전부 지급.
 * - 활동 배지: user_activity_badges, 이미 보유 시 조용히 skip
 * - 아이템 배지: DB 함수 한 번 — 새 개체로 지급 또는 받지 않은 보상으로 기록(건너뛰지 않는다)
 * - 포인트: 지급된 배지의 point_reward 개별 지급(잠긴 개체 제외) + 미션 reward_points 추가 지급
 */
export async function grantMissionRewards(
  userId: string,
  mission: RewardMission
): Promise<MissionRewardResult> {
  const supabase = createServiceClient()

  const badgeIds = (mission.reward_badge_ids ?? []).filter(Boolean)
  const awardedBadgeIds: string[] = []
  const awardedBadgeNames: string[] = []
  const pendingItemBadgeIds: string[] = []
  const pendingLockedBadgeIds: string[] = []
  let totalAwardedPoints = 0

  if (badgeIds.length > 0) {
    // 1. 보상 배지 정보 조회
    const { data: badgesRaw, error: badgesRawError } = await supabase
      .from('badges')
      .select('id, name, type, point_reward, is_hidden, always_locked, condition_json')
      .in('id', badgeIds)
      .is('deleted_at', null) // 티켓 20260825_016: 소프트 삭제된 배지는 미션 보상 지급 대상에서 제외(조용히 skip)
    if (badgesRawError) console.error(`[grantMissionRewards] 보상 배지 조회 실패 (mission: ${mission.id}):`, badgesRawError)
    const badges = (badgesRaw ?? []) as RewardBadge[]

    // 조회된 배지가 요청보다 적으면 "삭제됨"과 "애초에 존재하지 않음"을 구분해 기록한다
    // (20260825_017 — 삭제 배지는 .is('deleted_at', null) 필터로 조용히 걸러지므로 흔적을 남겨야 함)
    if (badges.length < badgeIds.length) {
      const foundIds = new Set(badges.map((b) => b.id))
      const missingIds = badgeIds.filter((id) => !foundIds.has(id))
      const { data: missingRaw } = await supabase
        .from('badges')
        .select('id, deleted_at')
        .in('id', missingIds)
      const missingRows = (missingRaw ?? []) as { id: string; deleted_at: string | null }[]
      const deletedBadgeIds = missingRows.filter((r) => r.deleted_at !== null).map((r) => r.id)
      const foundMissingIds = new Set(missingRows.map((r) => r.id))
      const nonexistentBadgeIds = missingIds.filter((id) => !foundMissingIds.has(id))
      await logEngineDecision('badge', 'reward_badge_skipped', userId, {
        source: 'mission_reward',
        missionId: mission.id,
        deletedBadgeIds,
        nonexistentBadgeIds,
      })
    }

    // 보상으로 줄 수 없는 배지를 거른다 — 숨김 배지와 액티비티·아이템 외 유형(체크인 등, 13.2절 «보상은 액티비티 배지, 포인트, 아이템 배지»).
    // 저장 단계에서 막는 것이 원칙이지만(티켓 20261019_1313 2회), 이미 저장된 값과 우회 경로에 대비해 지급에서도 막는다.
    const hiddenBadgeIds = badges.filter((b) => b.is_hidden).map((b) => b.id)
    const unsupportedTypeBadgeIds = badges.filter((b) => !b.is_hidden && b.type !== 'activity' && b.type !== 'item').map((b) => b.id)
    if (hiddenBadgeIds.length > 0 || unsupportedTypeBadgeIds.length > 0) {
      console.warn(
        `[grantMissionRewards] 보상으로 줄 수 없는 배지를 건너뜀 (mission: ${mission.id}) — 숨김: ${hiddenBadgeIds.join(',') || '-'}, 유형 외: ${unsupportedTypeBadgeIds.join(',') || '-'}`
      )
      await logEngineDecision('badge', 'reward_badge_skipped', userId, {
        source: 'mission_reward',
        missionId: mission.id,
        hiddenBadgeIds,
        unsupportedTypeBadgeIds,
      })
    }
    const grantable = badges.filter((b) => !b.is_hidden && (b.type === 'activity' || b.type === 'item'))

    // 유저의 기존 활동배지 보유 목록 (중복 지급 방지)
    const { data: ownedRaw } = await supabase
      .from('user_activity_badges')
      .select('badge_id')
      .eq('user_id', userId)
    const ownedActivityBadgeIds = new Set((ownedRaw ?? []).map((r: { badge_id: string }) => r.badge_id))

    for (const badge of grantable.filter((b) => b.type === 'activity')) {
      if (ownedActivityBadgeIds.has(badge.id)) continue // 이미 보유 → skip
      const { error } = await supabase
        .from('user_activity_badges')
        .insert({ user_id: userId, badge_id: badge.id, triggered_by: `mission_reward:${mission.id}` })
      if (error) {
        if (error.code === '23505') continue
        console.error(`[grantMissionRewards] 활동배지 지급 오류 (badge: ${badge.id}):`, error)
        continue
      }
      ownedActivityBadgeIds.add(badge.id)
      awardedBadgeIds.push(badge.id)
      awardedBadgeNames.push(badge.name)
      // 챕터 점수 «배지 받기» (티켓 20261019_1315 2a회, 운영 로직 12.2절). 새 행을 실제로 넣은 보상만 여기 온다(이미 보유·23505는 위에서 건너뛰었다).
      // 숨김 배지는 보상으로 줄 수 없어 이미 걸러졌고, 팔로워·팔로잉·챕터 조건 배지는 공용 함수가 거른다. 던지지 않아 보상 결과를 바꾸지 않는다.
      await awardBadgeReceiveScore(supabase, { userId, badge, origin: { triggeredBy: `mission_reward:${mission.id}` } })
      // 배지 자체 포인트 지급 (badge-engine/drop-engine과 동일하게 코드에서 명시적 재현)
      const pr = badge.point_reward ?? 0
      if (pr > 0) {
        // sourceMissionId를 함께 넘기는 이유 두 가지 (티켓 20260824_019 3차)
        //  ① 소식 #5(포인트 적립)의 트리거가 「badge_point_reward 중 **미션 보상 경유가
        //     아닌 것**」이다(PRD §3 ①). #22(미션 완료)가 이미 "배지 1개와 500P"로 보상을
        //     전부 서술하므로, 미션 경유분이 #5로도 가면 한 사건이 두 줄이 되고 #5의
        //     하루 합계 금액까지 부풀려진다. notifyPointChange()가 이 값으로 걸러낸다.
        //  ② 원장(point_transactions)에서 이 지급의 미션 귀속이 살아난다.
        //     reason은 badge_point_reward 그대로라 /points·어드민의 표시 분기는 바뀌지 않는다.
        await awardPoints(userId, pr, 'badge_point_reward', {
          sourceBadgeId: badge.id,
          sourceMissionId: mission.id,
        })
        totalAwardedPoints += pr
      }
    }

    // 아이템 배지 → DB 함수 한 번. 이미 가진 배지도 새 개체로 주고, 모두 들어갈 빈칸이 없으면 전부 받지 않은 보상으로 기록한다.
    // 같은 미션·배지는 함수가 한 번만 기록하므로 다시 불러도 중복 지급이 없다.
    const itemBadges = grantable.filter((b) => b.type === 'item')
    if (itemBadges.length > 0) {
      const { data: rpcRaw, error: rpcError } = await supabase.rpc('mission_grant_item_rewards', {
        p_user_id: userId,
        p_mission_id: mission.id,
        p_badge_ids: itemBadges.map((b) => b.id),
      })
      const grant = rpcError ? null : parseGrantItemRewardsResult(rpcRaw)
      if (rpcError) {
        console.error(`[grantMissionRewards] mission_grant_item_rewards RPC 오류 (mission: ${mission.id}):`, rpcError)
      } else if (!grant) {
        console.error(`[grantMissionRewards] mission_grant_item_rewards 응답이 계약과 다름 (mission: ${mission.id}):`, rpcRaw)
      } else if (!grant.ok) {
        if (grant.error === 'inventory_not_found') {
          // 정상 가입이면 인벤토리는 항상 있어야 함(20260811_001 인시던트 참고) — 조용히 넘어가지 않고 기록
          await logEngineDecision('drop', 'drop_attempt', userId, {
            outcome: 'no_inventory',
            source: 'mission_reward',
            missionId: mission.id,
            badgeIds: itemBadges.map((b) => b.id),
          })
        } else {
          console.error(`[grantMissionRewards] 아이템 배지 지급 실패 (mission: ${mission.id}): ${grant.error}`)
        }
      } else if (grant.status === 'granted') {
        const followUp = await followUpItemRewards(supabase, { userId, missionId: mission.id, itemIds: grant.itemIds })
        for (const b of followUp.openBadges) {
          awardedBadgeIds.push(b.id)
          awardedBadgeNames.push(b.name)
        }
        totalAwardedPoints += followUp.awardedPoints
      } else if (grant.status === 'pending') {
        // 아무것도 주지 않았다. 미션 상세에서 받는다(포인트도 그때 준다).
        for (const b of itemBadges) {
          pendingItemBadgeIds.push(b.id)
          if (b.always_locked) pendingLockedBadgeIds.push(b.id)
        }
        await notifyRewardPending(userId, mission)
      }
    }
  }

  // 미션 자체 포인트 — 배지 포인트와 별개 사유로 추가 지급
  const missionPoints = mission.reward_points ?? 0
  if (missionPoints > 0) {
    await awardPoints(userId, missionPoints, 'mission_point_reward', { sourceMissionId: mission.id })
    totalAwardedPoints += missionPoints
  }

  return { awardedBadgeIds, awardedBadgeNames, totalAwardedPoints, pendingItemBadgeIds, pendingLockedBadgeIds }
}
