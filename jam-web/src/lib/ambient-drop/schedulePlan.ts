/**
 * 앰비언트 드랍 예약의 배치 계획 — 순수 함수 (티켓 20261001_2051)
 *
 * 읽어 온 대상(`scheduleTargets.ts`)과 예약 내용에서 「어느 지점에 어느 배지를 놓을지」 쌍의 목록을 만든다.
 * DB 호출이 없어 결정값(`pick`, `Math.random` 모킹)으로 테스트한다.
 *
 * - 지점 직접(`list`): 지점마다 `per_poi_count`개를 놓는다. 활성 드랍이 있어도 한도 없이 **겹쳐** 놓고
 *   겹친 지점 수를 센다(사용자 결정 Q3). `max_active_per_poi`를 쓰지 않는다
 * - 종류+개수(`category`): 정기 배포와 같은 분산(`distributePoiSlots`) — 활성 0인 지점 우선, 한도
 *   `max_active_per_poi` 미만 지점으로 흩는다. 자리가 모자라면 있는 만큼만 놓는다
 * - 아이템 직접(`items`): 섞은 풀을 자리 순서대로 돌려가며 배정해 고르게 놓는다
 * - 컬렉션(`collections`): 정기 배포와 같은 `weightedPickRarity` → `fallbackPickBadge`. 등급 분포는
 *   읽기 전용 설정값이다(예약이 설정을 쓰지 않는다)
 */
import type { BadgeRarity } from '@/types/database'
import { distributePoiSlots, type AmbientPlacementRow } from './placement'
import { fallbackPickBadge, weightedPickRarity, type RarityDistribution } from './rarity'
import type { AmbientDropScheduleSpec } from './scheduleSpec'
import type { ScheduleTargets } from './scheduleTargets'

export interface PlanScheduleDropsInput {
  spec: AmbientDropScheduleSpec
  targets: Pick<ScheduleTargets, 'pois' | 'badgePool'>
  /** 컬렉션 모드에서 등급 추첨에 쓴다. 컬렉션 모드가 아니면 생략 가능 */
  rarity?: { distribution: RarityDistribution }
  /** 종류+개수 모드의 지점당 한도(`ambient_drop_config.max_active_per_poi`, 읽기 전용). 그 모드가 아니면 생략 가능 */
  maxActivePerPoi?: number
  /** 배열에서 하나를 고른다(비었으면 null). 지점 분산과 아이템 섞기에 쓴다. 운영은 `pickRandom` */
  pick: (ids: readonly string[]) => string | null
}

export interface ScheduledDropPlan {
  rows: AmbientPlacementRow[]
  /** 지점 직접 모드에서 이미 활성 시스템 드랍이 있는데 겹쳐 놓는 지점 수 */
  overlappedPoiCount: number
  /** 놓을 수 있다고 본 지점 수(지점 직접은 활성 지점 수, 종류+개수는 한도 미만 지점 수) */
  eligiblePoiCount: number
  /** 자리를 하나도 못 만든 사유 — `rows`가 비었을 때만 있다 */
  reason?: 'no_eligible_poi' | 'no_candidate_badges'
}

/** `pick`으로 순서를 섞는다(비복원 추출) — 결정값 `pick`이면 순서가 결정적이다 */
function shuffleWithPick<T extends { id: string }>(items: readonly T[], pick: (ids: readonly string[]) => string | null): T[] {
  const remaining = [...items]
  const out: T[] = []
  while (remaining.length > 0) {
    const pickedId = pick(remaining.map((r) => r.id))
    const index = pickedId === null ? -1 : remaining.findIndex((r) => r.id === pickedId)
    if (index < 0) break
    out.push(remaining[index])
    remaining.splice(index, 1)
  }
  return out
}

/**
 * 자리마다 놓을 배지를 정하는 함수를 만든다. 아이템 직접은 섞은 풀을 순환하고, 컬렉션은 등급 추첨 후
 * 폴백 규칙으로 고른다. 후보 배지가 하나도 없으면 함수 대신 `null`을 돌려준다.
 */
function makeBadgeChooser(input: PlanScheduleDropsInput): (() => string | null) | null {
  const { spec, targets, rarity, pick } = input

  if (spec.itemMode === 'items') {
    const shuffled = shuffleWithPick(targets.badgePool, pick)
    if (shuffled.length === 0) return null
    let cursor = 0
    return () => shuffled[cursor++ % shuffled.length].id
  }

  if (!rarity) throw new Error('컬렉션 모드의 배치 계획에는 등급 분포(rarity)가 필요해요')
  // 등급 없는 배지(무한레벨형)는 등급별 드랍 테이블에 자리가 없다 — 정기 배포와 같다
  const byRarity: Record<BadgeRarity, { id: string }[]> = { common: [], rare: [], epic: [], mystic: [] }
  for (const badge of targets.badgePool) {
    if (badge.rarity) byRarity[badge.rarity].push({ id: badge.id })
  }
  const total = Object.values(byRarity).reduce((sum, arr) => sum + arr.length, 0)
  if (total === 0) return null
  return () => fallbackPickBadge(byRarity, weightedPickRarity(rarity.distribution))?.id ?? null
}

export function planScheduleDrops(input: PlanScheduleDropsInput): ScheduledDropPlan {
  const { spec, targets, maxActivePerPoi, pick } = input

  const chooseBadge = makeBadgeChooser(input)

  // 지점 쪽 자리 정하기
  let poiSlots: string[]
  let overlappedPoiCount = 0
  let eligiblePoiCount: number
  if (spec.poiMode === 'list') {
    eligiblePoiCount = targets.pois.length
    poiSlots = targets.pois.flatMap((poi) => Array.from({ length: spec.perPoiCount }, () => poi.id))
    overlappedPoiCount = targets.pois.filter((poi) => poi.activeSystemCount > 0).length
  } else {
    if (maxActivePerPoi === undefined) throw new Error('종류+개수 모드의 배치 계획에는 지점당 한도(maxActivePerPoi)가 필요해요')
    const activeByPoi = new Map(targets.pois.map((poi) => [poi.id, poi.activeSystemCount]))
    const candidatePoiIds = targets.pois.filter((poi) => poi.activeSystemCount < maxActivePerPoi).map((poi) => poi.id)
    eligiblePoiCount = candidatePoiIds.length
    poiSlots = distributePoiSlots({ candidatePoiIds, activeByPoi, maxActivePerPoi, count: spec.totalCount, pick })
  }

  if (poiSlots.length === 0) {
    return { rows: [], overlappedPoiCount: 0, eligiblePoiCount, reason: 'no_eligible_poi' }
  }
  if (!chooseBadge) {
    return { rows: [], overlappedPoiCount: 0, eligiblePoiCount, reason: 'no_candidate_badges' }
  }

  const rows: AmbientPlacementRow[] = []
  for (const poiId of poiSlots) {
    const badgeId = chooseBadge()
    if (!badgeId) break // 후보 배지 자체가 없음(위 검사로 이론상 도달하지 않는다)
    rows.push({ poi_id: poiId, badge_id: badgeId })
  }
  if (rows.length === 0) return { rows, overlappedPoiCount: 0, eligiblePoiCount, reason: 'no_candidate_badges' }

  return { rows, overlappedPoiCount, eligiblePoiCount }
}
