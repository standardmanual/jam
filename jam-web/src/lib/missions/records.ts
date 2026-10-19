/**
 * 미션 기록 읽기 — 티켓 20261019_1313 3회 (운영 로직 13.2절 «소식과 기록»)
 *
 * 한 유저의 한 미션에 대해 참가·완료·받은 보상·받지 않은 보상·참가 취소를 한 번에 읽는다. **읽기 전용**이다.
 * 어드민 유저 상세와 미션 결과 화면(5-7)이 쓴다.
 *
 * 진행은 시점별 이력을 두지 않는다(결정 5-b). 지금 값(`progressValue`)만 참가 행에 있고, 참가가 취소됐다면 취소 당시 값이
 * 취소 기록에 남는다. 50%·80% 돌파는 소식(`mission_milestone`)이 갖는다.
 *
 * 보상은 **아이템 배지 보상**(`mission_item_rewards`)만 담는다. 액티비티 배지와 포인트 보상은 미션과 연결해 두는 표가 없어 여기서 읽지 않는다.
 *
 * **반환값은 서버 안에서만 쓴다.** 보상 행은 `locked`와 상관없이 `badgeId`를 그대로 담는다. 유저 화면으로 내릴 때는
 * 잠긴 보상의 `badgeId`를 빼고 등급과 `locked`만 싣는다(미션 상세 페이지의 `pendingRewards`와 같은 규칙, 운영 로직 7.3절).
 *
 * 읽지 못하면 «기록 없음»으로 보지 않고 던진다 — 어드민이 기록이 없다고 잘못 판단하지 않도록 한다. 던지는 오류에는 DB 원문을 싣지 않고
 * 원문은 `console.error`로만 남긴다. 서버 전용이다(service_role 클라이언트).
 */
import { createServiceClient } from '@/lib/supabase/server'

/** 참가. 참가 행이 없으면(참가한 적이 없거나 트라이브 변경으로 취소됐으면) 기록 전체에서 null이다 */
export interface MissionParticipationRecord {
  joinedAt: string
  /** 지금 진행 값. 시점별 이력은 두지 않는다 */
  progressValue: number
}

export interface MissionCompletionRecord {
  completedAt: string
}

/** 아이템 배지 보상 한 건 */
export interface MissionItemRewardRecord {
  /** 서버 안에서만 쓴다 — 유저 화면으로 내릴 때 `locked`면 빼야 한다 */
  badgeId: string
  /** 기록할 때 고정한 잠김. 배지 설정이 나중에 바뀌어도 그대로다 */
  locked: boolean
  /** 보상을 기록한 때 */
  recordedAt: string
  /** 받은 때. 받지 않은 보상은 null */
  receivedAt: string | null
  /** 받아서 생긴 개체. 받지 않은 보상은 null */
  inventoryItemId: string | null
}

export interface MissionCancellationRecord {
  cancelledAt: string
  joinedAt: string
  /** 취소 당시 진행 값 */
  progressValue: number
  /** 취소 당시 완료 여부. 완료한 미션의 참가도 취소되지만 완료 기록과 받은 보상은 남는다 */
  wasCompleted: boolean
  reason: string
}

export interface MissionRecords {
  participation: MissionParticipationRecord | null
  completion: MissionCompletionRecord | null
  /** 받은(`claimed`) 아이템 배지 보상. 기록한 순서 */
  receivedRewards: MissionItemRewardRecord[]
  /** 받지 않은(`pending`) 아이템 배지 보상. 기록한 순서 */
  pendingRewards: MissionItemRewardRecord[]
  /** 참가 취소. 가장 최근 취소가 앞이다 */
  cancellations: MissionCancellationRecord[]
}

/** 기록을 읽다가 실패했을 때 던지는 오류. 메시지에 DB 원문을 싣지 않는다 */
export class MissionRecordsReadError extends Error {
  constructor() {
    super('mission_records_read_failed')
    this.name = 'MissionRecordsReadError'
  }
}

interface RewardRow {
  badge_id: string
  locked: boolean
  status: string
  created_at: string
  resolved_at: string | null
  inventory_item_id: string | null
}

export async function loadMissionRecords(userId: string, missionId: string): Promise<MissionRecords> {
  const service = createServiceClient()

  const [participation, completion, rewards, cancellations] = await Promise.all([
    service
      .from('user_mission_participations')
      .select('joined_at, progress_value')
      .eq('user_id', userId)
      .eq('mission_id', missionId)
      .maybeSingle(),
    service
      .from('user_mission_completions')
      .select('completed_at')
      .eq('user_id', userId)
      .eq('mission_id', missionId)
      .maybeSingle(),
    service
      .from('mission_item_rewards')
      .select('badge_id, locked, status, created_at, resolved_at, inventory_item_id')
      .eq('user_id', userId)
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true }),
    service
      .from('mission_participation_cancellations')
      .select('cancelled_at, joined_at, progress_value, was_completed, reason')
      .eq('user_id', userId)
      .eq('mission_id', missionId)
      .order('cancelled_at', { ascending: false }),
  ])

  const failed = [
    ['참가', participation.error],
    ['완료', completion.error],
    ['보상', rewards.error],
    ['참가 취소', cancellations.error],
  ] as const
  const failures = failed.filter(([, error]) => error)
  if (failures.length > 0) {
    for (const [what, error] of failures) {
      console.error(`[missions/records] ${what} 기록 조회 실패 (userId: ${userId}, missionId: ${missionId}):`, error)
    }
    throw new MissionRecordsReadError()
  }

  const rewardRows = (rewards.data ?? []) as RewardRow[]
  const toReward = (row: RewardRow): MissionItemRewardRecord => ({
    badgeId: row.badge_id,
    locked: row.locked,
    recordedAt: row.created_at,
    receivedAt: row.resolved_at,
    inventoryItemId: row.inventory_item_id,
  })

  return {
    participation: participation.data
      ? { joinedAt: participation.data.joined_at, progressValue: participation.data.progress_value }
      : null,
    completion: completion.data ? { completedAt: completion.data.completed_at } : null,
    receivedRewards: rewardRows.filter((row) => row.status === 'claimed').map(toReward),
    pendingRewards: rewardRows.filter((row) => row.status === 'pending').map(toReward),
    cancellations: (cancellations.data ?? []).map((row) => ({
      cancelledAt: row.cancelled_at,
      joinedAt: row.joined_at,
      progressValue: row.progress_value,
      wasCompleted: row.was_completed,
      reason: row.reason,
    })),
  }
}
