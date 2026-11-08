/**
 * 레벨형 액티비티 배지 접기 — 화면 전용 (티켓 20261108_1622)
 *
 * 레벨형은 «같은 이름의 배지 하나가 레벨이 오르는 것»이다. 엔진은 한 번의 동기화로 여러 레벨
 * 조건을 넘으면 레벨마다 행을 따로 쓰므로(DB 구조는 그대로 둔다), 화면에서 계열당 최고 레벨만 남긴다.
 * 클라이언트 컴포넌트(FeedSection)에서 import하므로 서버 전용 모듈을 끌어오지 않는다.
 */
import type { ActivityFeedRow, BadgeRow } from '@/types/database'
import { familyKeyOf, isLeveledBadge } from '@/lib/badge-engine/badgeKind'

/** 같은 동기화로 볼 최대 간격 — 바로 앞 멤버와의 간격이 이 값 이하면 같은 묶음(연쇄) */
export const LEVELED_BURST_GAP_MS = 10 * 60 * 1000

/** 피드 메타데이터에서 계열 키를 꺼낸다. 비어 있으면 `familyKeyOf`와 같은 이름 폴백 */
export function leveledFamilyKey(meta: Record<string, unknown>): string {
  const name = typeof meta.badge_name === 'string' ? meta.badge_name : ''
  const familyKey = typeof meta.family_key === 'string' && meta.family_key ? meta.family_key : null
  return familyKeyOf({ name, family_key: familyKey })
}

function isLeveledEarn(item: ActivityFeedRow): boolean {
  if (item.event_type !== 'badge_earned') return false
  const meta = item.metadata as Record<string, unknown>
  return typeof meta.level === 'number'
}

function metaOf(item: ActivityFeedRow): Record<string, unknown> {
  return item.metadata as Record<string, unknown>
}

function rewardOf(item: ActivityFeedRow): number {
  const r = metaOf(item).point_reward
  return typeof r === 'number' ? r : 0
}

/**
 * 같은 유저·같은 계열의 레벨 획득이 10분 이하 간격으로 이어지면 최고 레벨 한 건만 남긴다.
 * 입력(created_at 내림차순)의 순서를 유지하고, 남긴 행은 원래 자리에 둔다.
 * 접힌 행의 point_reward는 남긴 행에 더한다.
 */
export function collapseLeveledBadgeBursts(items: ActivityFeedRow[]): ActivityFeedRow[] {
  const groups = new Map<string, number[]>()
  items.forEach((item, idx) => {
    if (!isLeveledEarn(item)) return
    const key = `${item.user_id}|${leveledFamilyKey(metaOf(item))}`
    const list = groups.get(key)
    if (list) list.push(idx)
    else groups.set(key, [idx])
  })

  const dropped = new Set<number>()
  const replaced = new Map<number, ActivityFeedRow>()

  const flush = (burst: number[]) => {
    if (burst.length < 2) return
    let top = burst[0]
    let reward = 0
    for (const i of burst) {
      if ((metaOf(items[i]).level as number) > (metaOf(items[top]).level as number)) top = i
      reward += rewardOf(items[i])
    }
    for (const i of burst) if (i !== top) dropped.add(i)
    const meta = { ...metaOf(items[top]) }
    if (reward > 0) meta.point_reward = reward
    else delete meta.point_reward
    replaced.set(top, { ...items[top], metadata: meta } as ActivityFeedRow)
  }

  for (const indices of groups.values()) {
    if (indices.length < 2) continue
    const sorted = [...indices].sort(
      (a, b) => new Date(items[a].created_at).getTime() - new Date(items[b].created_at).getTime(),
    )
    let burst: number[] = []
    let prevTime = 0
    for (const i of sorted) {
      const t = new Date(items[i].created_at).getTime()
      if (burst.length > 0 && t - prevTime > LEVELED_BURST_GAP_MS) {
        flush(burst)
        burst = []
      }
      burst.push(i)
      prevTime = t
    }
    flush(burst)
  }

  if (dropped.size === 0) return items
  return items.flatMap((item, idx) => (dropped.has(idx) ? [] : [replaced.get(idx) ?? item]))
}

/** 배지함용 — 레벨형은 계열당 level이 가장 높은 행만 남긴다. 등급형·반복형은 그대로, 순서 유지 */
export function pickHighestLevelPerFamily<T extends { badge: BadgeRow }>(rows: T[]): T[] {
  const best = new Map<string, T>()
  for (const row of rows) {
    if (!isLeveledBadge(row.badge)) continue
    const key = familyKeyOf(row.badge)
    const cur = best.get(key)
    if (!cur || (row.badge.level ?? 0) > (cur.badge.level ?? 0)) best.set(key, row)
  }
  return rows.filter((row) => !isLeveledBadge(row.badge) || best.get(familyKeyOf(row.badge)) === row)
}
