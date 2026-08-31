/**
 * ④ 미션 배치 — #21 마감 임박 / #23 순위 상승 / #24 종료 결과 (티켓 20260825_002)
 * 스펙: PRD §3 ④
 *
 * ## #23이 스냅샷 테이블을 필요로 하는 이유
 *
 * 순위는 어디에도 저장되지 않고 `/api/missions/[id]/status`가 매번 계산한다. 그런데 #23은
 * **"상승 시만"**이 조건이라 직전 순위를 모르면 판정 자체가 불가능하다. 기존 소식 행에서
 * 직전 순위를 읽는 방법은 "첫 기준선을 만들 수 없다"는 문제로 영원히 발화하지 않는다.
 * 그래서 `mission_rank_snapshots`(마이그레이션 099)에 매 배치의 순위를 남기고 다음 배치가
 * 그것과 비교한다. **첫 배치는 기준선만 남기고 소식을 만들지 않는다** — 순위가 오르지도
 * 않은 유저에게 "5위로 올라섰어요"가 나가면 거짓말이다.
 *
 * 테이블이 아직 없는 환경(마이그레이션 미적용)에서는 이 단계만 실패하고 나머지 10종은
 * 그대로 생성된다(`runStep` 격리).
 */
import { groupedTargetsKey, scopedGroupKey } from '@/lib/notifications/groupKey'
import { kstDateString } from '@/lib/notifications/kst'
import { MISSION_PROGRESS_UNIT, getTarget } from '@/lib/missions/checker'
import { rankMissionParticipants } from '@/lib/missions/ranking'
import type { MissionCondition, MissionStatusDisplayType, MissionType } from '@/types/database'
import {
  DAY_MS,
  fetchAllRows,
  foldTargets,
  kstDateOffset,
  type BatchContext,
  type NotificationDraft,
  type StepOutput,
} from './shared'

/** 마감 임박 고지 시점 — PRD §3 ④가 D-2로 규정 */
export const MISSION_DEADLINE_DAYS = 2

/** 종료 결과(#24) 소급 창 — 이보다 오래 전에 끝난 미션은 이제 와서 알릴 이유가 없다 */
export const MISSION_ENDED_LOOKBACK_DAYS = 2

export interface BatchMission {
  id: string
  title: string
  mission_type: MissionType
  condition_json: MissionCondition
  status_display_type: MissionStatusDisplayType
  starts_at: string
  ends_at: string | null
}

export interface MissionParticipation {
  userId: string
  missionId: string
  progressValue: number
}

export interface MissionDeadlineInput {
  missions: BatchMission[]
  participations: MissionParticipation[]
  /** `{missionId}:{userId}` 완료 집합 */
  completedPairs: Set<string>
  /** 배치 시작 시각 기준 KST 날짜 */
  today: string
  /** D-2에 해당하는 KST 날짜 */
  deadlineDate: string
}

/**
 * #21 마감 임박 (순수 함수 — 테스트 대상).
 *
 * **`remaining`이 0 이하면 만들지 않는다**(§3-3). 목표를 이미 채웠는데 완료 처리가 아직
 * 안 된 경우 "0km 남았어요"가 그대로 나간다.
 *
 * 단위가 없는 달성형(checkin·item_collect)은 제외한다 — 문구가 "1 남았어요"가 되어
 * 의미를 잃는다. #20(마일스톤)이 같은 이유로 이미 제외하고 있다.
 */
export function selectMissionDeadlineDrafts(input: MissionDeadlineInput): NotificationDraft[] {
  const drafts: NotificationDraft[] = []
  const byMission = new Map(input.missions.map((m) => [m.id, m]))

  for (const p of input.participations) {
    const mission = byMission.get(p.missionId)
    if (!mission || !mission.ends_at) continue
    if (kstDateString(mission.ends_at) !== input.deadlineDate) continue
    if (input.completedPairs.has(`${p.missionId}:${p.userId}`)) continue

    const unit = MISSION_PROGRESS_UNIT[mission.mission_type] ?? ''
    if (unit === '') continue

    const target = getTarget(mission.mission_type, mission.condition_json)
    const remaining = Math.round((target - p.progressValue) * 10) / 10
    if (remaining <= 0) continue

    drafts.push({
      userId: p.userId,
      type: 'mission_deadline',
      payload: {
        mission_id: mission.id,
        mission_title: mission.title,
        days: MISSION_DEADLINE_DAYS,
        remaining,
        unit,
      },
      groupKey: scopedGroupKey('mission_deadline', mission.id, input.today),
      mode: 'once',
    })
  }

  // R11 — 미션 2건 이상이면 한 행. **잔여량이 사라지는 것은 규칙을 하나로 유지하는 값**이다
  // (12km·3일·2곳은 단위가 달라 합칠 수도 없다 — 티켓 「주요 의사결정」에서 수용).
  // 배치가 D-2만 잡으므로 묶음에서도 「이틀 뒤」는 항상 같다.
  return foldTargets(drafts, (group) => ({
    userId: group[0].userId,
    type: 'mission_deadline',
    payload: { days: MISSION_DEADLINE_DAYS, target_count: group.length },
    groupKey: groupedTargetsKey(
      'mission_deadline',
      group.map((g) => (g.type === 'mission_deadline' ? g.payload.mission_id ?? '' : '')),
      input.today
    ),
    mode: 'once',
  }))
}

export interface MissionEndedInput {
  missions: BatchMission[]
  participations: MissionParticipation[]
  /** `{missionId}:{userId}` 완료 집합 — 완료자에게만 축하한다 */
  completedPairs: Set<string>
  startedAt: Date
}

/**
 * #24 종료 결과 — 참가자 전원에게. `once` + 미션당 1키라 재실행해도 중복이 없다.
 *
 * **완료 여부로 문구가 갈린다.** 목표를 못 채운 참가자에게 「축하해요!」가 나가면 조롱이
 * 되고, PRD §3 ④ 주석("#24도 미완료 종료 시 질책 없이 담백하게")과 정면 충돌한다.
 */
export function selectMissionEndedDrafts(input: MissionEndedInput): NotificationDraft[] {
  const now = input.startedAt.getTime()
  const lookbackFrom = now - MISSION_ENDED_LOOKBACK_DAYS * DAY_MS
  const ended = new Map(
    input.missions
      .filter((m) => {
        if (!m.ends_at) return false
        const at = new Date(m.ends_at).getTime()
        if (Number.isNaN(at)) return false
        return at <= now && at > lookbackFrom
      })
      .map((m) => [m.id, m])
  )
  if (ended.size === 0) return []

  const drafts: NotificationDraft[] = []
  for (const p of input.participations) {
    const mission = ended.get(p.missionId)
    if (!mission) continue
    drafts.push({
      userId: p.userId,
      type: 'mission_ended',
      payload: {
        mission_id: mission.id,
        mission_title: mission.title,
        completed: input.completedPairs.has(`${p.missionId}:${p.userId}`),
      },
      groupKey: scopedGroupKey('mission_ended', mission.id),
      mode: 'once',
    })
  }

  // R11 — 묶음에서 **하나라도 미완료면 축하를 뺀다.** 섞인 상태에서 축하하면 못 끝낸
  // 미션까지 축하하는 문장이 된다.
  return foldTargets(drafts, (group) => ({
    userId: group[0].userId,
    type: 'mission_ended',
    payload: {
      target_count: group.length,
      all_completed: group.every((g) => g.type === 'mission_ended' && g.payload.completed === true),
    },
    groupKey: groupedTargetsKey(
      'mission_ended',
      group.map((g) => (g.type === 'mission_ended' ? g.payload.mission_id ?? '' : ''))
    ),
    mode: 'once',
  }))
}

export interface MissionRankInput {
  missions: BatchMission[]
  participations: MissionParticipation[]
  /** `{missionId}:{userId}` → 완료 시각 */
  completedAt: Map<string, string>
  /** `{missionId}:{userId}` → 직전 배치가 남긴 순위 */
  previousRank: Map<string, number>
  startedAt: Date
  today: string
}

export interface MissionRankOutput {
  drafts: NotificationDraft[]
  /** 다음 배치의 기준선으로 저장할 순위 */
  snapshots: { mission_id: string; user_id: string; rank: number }[]
}

/**
 * #23 순위 상승 (순수 함수 — 테스트 대상).
 *
 * - `status_display_type='ranking'`이고 진행 중인 미션만
 * - **직전 순위가 없으면 소식을 만들지 않는다** (기준선만 남긴다)
 * - **하락 소식은 만들지 않는다** — 리더보드 하위권 이탈을 가속한다(PRD §3 ④)
 * - `rank`가 0이면 만들지 않는다(§3-3) — 순위는 1부터라 0은 정의상 버그다
 */
export function selectMissionRankDrafts(input: MissionRankInput): MissionRankOutput {
  const drafts: NotificationDraft[] = []
  const snapshots: MissionRankOutput['snapshots'] = []

  const active = input.missions.filter((m) => {
    if (m.status_display_type !== 'ranking') return false
    if (new Date(m.starts_at).getTime() > input.startedAt.getTime()) return false
    if (!m.ends_at) return true
    return new Date(m.ends_at).getTime() >= input.startedAt.getTime()
  })
  if (active.length === 0) return { drafts, snapshots }

  const byMission = new Map<string, MissionParticipation[]>()
  for (const p of input.participations) {
    const list = byMission.get(p.missionId) ?? []
    list.push(p)
    byMission.set(p.missionId, list)
  }

  for (const mission of active) {
    const list = byMission.get(mission.id) ?? []
    if (list.length === 0) continue

    const ranked = rankMissionParticipants(
      list.map((p) => ({
        userId: p.userId,
        progressValue: p.progressValue,
        completedAt: input.completedAt.get(`${mission.id}:${p.userId}`) ?? null,
      }))
    )

    for (const entry of ranked) {
      const pairKey = `${mission.id}:${entry.userId}`
      snapshots.push({ mission_id: mission.id, user_id: entry.userId, rank: entry.rank })

      const prev = input.previousRank.get(pairKey)
      if (prev === undefined) continue // 첫 관측 — 기준선만 남긴다
      if (entry.rank >= prev) continue // 유지·하락은 알리지 않는다
      if (entry.rank <= 0) continue

      drafts.push({
        userId: entry.userId,
        type: 'mission_rank_up',
        payload: { mission_id: mission.id, mission_title: mission.title, rank: entry.rank },
        // "개별·일 1회 상한"(PRD §3 ④) + cron 재시도 멱등성
        groupKey: scopedGroupKey('mission_rank_up', mission.id, input.today),
        mode: 'once',
      })
    }
  }

  // R11 — 미션 2건 이상이면 「미션 N개에서 순위가 올랐어요」 한 행
  const folded = foldTargets(drafts, (group) => ({
    userId: group[0].userId,
    type: 'mission_rank_up',
    payload: { target_count: group.length },
    groupKey: groupedTargetsKey(
      'mission_rank_up',
      group.map((g) => (g.type === 'mission_rank_up' ? g.payload.mission_id ?? '' : '')),
      input.today
    ),
    mode: 'once',
  }))

  return { drafts: folded, snapshots }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB 로더
// ─────────────────────────────────────────────────────────────────────────────

interface MissionData {
  missions: BatchMission[]
  participations: MissionParticipation[]
  completedAt: Map<string, string>
}

/**
 * #21·#24와 #23이 같은 3개 테이블을 본다. 배치 1회 안에서는 같은 데이터를 재사용한다
 * (같은 실행 안에서 두 번 읽으면 두 단계가 서로 다른 스냅샷으로 판정할 수도 있다).
 */
const missionDataCache = new WeakMap<BatchContext, Promise<MissionData>>()

function loadMissionData(ctx: BatchContext): Promise<MissionData> {
  const cached = missionDataCache.get(ctx)
  if (cached) return cached
  const promise = loadMissionDataUncached(ctx)
  missionDataCache.set(ctx, promise)
  return promise
}

async function loadMissionDataUncached(ctx: BatchContext): Promise<MissionData> {
  const { supabase } = ctx
  const [missions, participationRows, completionRows] = await Promise.all([
    fetchAllRows<BatchMission>('missions', 'id', () =>
      supabase
        .from('missions')
        .select('id, title, mission_type, condition_json, status_display_type, starts_at, ends_at')
    ),
    fetchAllRows<{ user_id: string; mission_id: string; progress_value: number }>(
      'user_mission_participations',
      'id',
      () => supabase.from('user_mission_participations').select('user_id, mission_id, progress_value')
    ),
    fetchAllRows<{ user_id: string; mission_id: string; completed_at: string }>(
      'user_mission_completions',
      'id',
      () => supabase.from('user_mission_completions').select('user_id, mission_id, completed_at')
    ),
  ])

  const participations = participationRows.map((p) => ({
    userId: p.user_id,
    missionId: p.mission_id,
    progressValue: p.progress_value ?? 0,
  }))
  const completedAt = new Map(
    completionRows.map((c) => [`${c.mission_id}:${c.user_id}`, c.completed_at])
  )
  return { missions, participations, completedAt }
}

/**
 * #21 + #24 — 한 번의 조회로 둘 다 만든다.
 *
 * `scanned`는 **미션 참가 행 수**다. 참가자가 있는데 초안이 0인 날이 이어지면 마감 D-2
 * 계산이나 종료 판정이 깨진 것이다(참가가 0이면 0건이 정상).
 */
export async function buildMissionDrafts(ctx: BatchContext): Promise<StepOutput> {
  const { missions, participations, completedAt } = await loadMissionData(ctx)
  if (missions.length === 0) return { drafts: [], scanned: 0 }

  const completedPairs = new Set(completedAt.keys())

  return {
    drafts: [
      ...selectMissionDeadlineDrafts({
        missions,
        participations,
        completedPairs,
        today: ctx.today,
        deadlineDate: kstDateOffset(ctx.startedAt, MISSION_DEADLINE_DAYS),
      }),
      ...selectMissionEndedDrafts({
        missions,
        participations,
        completedPairs,
        startedAt: ctx.startedAt,
      }),
    ],
    scanned: participations.length,
  }
}

interface RankSnapshotRow {
  mission_id: string
  user_id: string
  rank: number
}

/**
 * #23 — 직전 스냅샷과 비교해 상승분만 소식으로 만들고, 이번 순위를 다시 저장한다.
 *
 * 스냅샷 저장이 실패해도 소식은 이미 만들어진 뒤다(다음 배치가 옛 기준선으로 비교하지만
 * `once` 일자 키가 같은 날 중복을 막는다).
 */
export async function buildMissionRankDrafts(ctx: BatchContext): Promise<StepOutput> {
  const { supabase } = ctx
  const { missions, participations, completedAt } = await loadMissionData(ctx)
  if (missions.length === 0) return { drafts: [], scanned: 0 }

  // 복합 PK (mission_id, user_id) — 한쪽만으로 정렬하면 동순위 안에서 순서가 다시 흔들린다
  const snapshotRows = await fetchAllRows<RankSnapshotRow>(
    'mission_rank_snapshots',
    ['mission_id', 'user_id'],
    () => supabase.from('mission_rank_snapshots').select('mission_id, user_id, rank')
  )
  const previousRank = new Map(snapshotRows.map((r) => [`${r.mission_id}:${r.user_id}`, r.rank]))

  const { drafts, snapshots } = selectMissionRankDrafts({
    missions,
    participations,
    completedAt,
    previousRank,
    startedAt: ctx.startedAt,
    today: ctx.today,
  })

  if (snapshots.length > 0) {
    const rows = snapshots.map((s) => ({ ...s, captured_at: ctx.startedAt.toISOString() }))
    const table = supabase.from('mission_rank_snapshots')
    const { error } = await table.upsert(rows, { onConflict: 'mission_id,user_id' })
    if (error) {
      // 소식 생성은 이미 판정이 끝났다. 저장 실패는 다음 배치의 기준선만 낡게 만든다.
      console.error('[notifications-batch] mission_rank_snapshots 저장 실패:', error)
    }
  }

  // scanned는 **활성 랭킹 미션의 참가자 수**다. 랭킹 미션이 없으면 0이 정상이고,
  // 참가자가 있는데 초안이 0인 상태가 이어지면 스냅샷 비교가 깨진 것이다.
  return { drafts, scanned: snapshots.length }
}
