/**
 * 미션 노출 판정 — 목록·상세·참가 API·오늘카드가 공유하는 단일 규칙 (티켓 20260825_028)
 *
 * 순수 함수만 둔다(Supabase·React 의존 없음). 서버에서 필요한 데이터 조회는
 * `visibility-server.ts`가 담당하고, 판정 자체는 반드시 이 파일을 거치게 해서
 * 화면마다 규칙이 갈라지지 않게 한다.
 *
 * 판정 규칙
 *  1. `user_mission_completions`에 기록이 있으면 → `completed` (완료 판정의 단일 기준.
 *     "보상배지 보유"를 기준으로 쓰면 배지 소프트삭제로 지급이 스킵된 경우
 *     완료한 미션이 되살아난다 — 티켓 20260825_016·018)
 *  2. `gated_badge_id`가 없으면 → `open` (게이팅 없는 일반 기간형 미션)
 *  3. 게이트 배지 등급(gateTier)과 유저가 보유한 같은 이름 배지의 최고 등급(ownedTier) 비교
 *     - gateTier ≤ ownedTier + 1 → `open`   (바로 다음 1단계만 참가 가능)
 *     - gateTier = ownedTier + 2 → `locked` (그 다음 1단계는 잠금 카드로만 노출)
 *     - 그 위                    → `hidden` (목록에서 완전 제외)
 *     - 미보유(ownedTier=0)는 Common 보유(1)로 취급한다 — Common 배지가 없는 신규 유저에게도
 *       첫 레벨업 미션(Rare용)은 항상 노출한다는 요구사항(티켓 §2).
 *  4. 위 판정이 `hidden`이더라도 유저의 참가 이력(`user_mission_participations`)이 있으면
 *     `locked`로 완화한다 — 완전 숨김 상태에서는 유저가 자기 참가 이력을 어디서도 볼 수
 *     없기 때문이다(티켓 20260825_029). `open`/`completed`/`locked` 판정에는 관여하지 않는다.
 *
 * 완료 판정이 배지 보유보다 앞선다: 본 배지를 이미 받았더라도 완료 기록이 있으면 `completed`.
 */
import type { BadgeRarity } from '@/types/database'

/** 배지 등급 → 티어 값. badge-engine/index.ts의 RARITY_TIER와 같은 표(등급 체계는 하나뿐) */
export const RARITY_TIER: Record<string, number> = { common: 1, rare: 2, legend: 3, mythic: 4 }

/** 티어 값 → 배지 등급 (잠금 안내에 쓸 "먼저 획득해야 하는 등급" 역산용) */
const RARITY_BY_TIER: Record<number, BadgeRarity> = { 1: 'common', 2: 'rare', 3: 'legend', 4: 'mythic' }

/** 미보유 유저에게도 첫 레벨업 미션(Rare용)을 노출하기 위한 하한 티어 */
const MIN_EFFECTIVE_TIER = RARITY_TIER.common

export type MissionVisibility = 'open' | 'locked' | 'hidden' | 'completed'

/** 게이트가 걸린 본 배지 정보 */
export interface GatedBadgeInfo {
  id: string
  name: string
  rarity: BadgeRarity
}

/** 판정에 필요한 미션 필드만 추린 최소 형태 */
export interface MissionVisibilityInput {
  id: string
  gated_badge_id: string | null
}

export interface MissionVisibilityContext {
  /** 유저가 완료한 미션 id (user_mission_completions 기준) */
  completedMissionIds: ReadonlySet<string>
  /** gated_badge_id → 본 배지 정보. 없는 id(삭제된 배지 등)는 게이팅 없음으로 취급 */
  gatedBadges: ReadonlyMap<string, GatedBadgeInfo>
  /** 유저가 보유한 배지 이름별 최고 등급 티어 (미보유는 키 없음) */
  ownedTierByBadgeName: ReadonlyMap<string, number>
  /**
   * 유저가 참가한 적 있는 미션 id (user_mission_participations 기준).
   * `hidden` 판정을 `locked`로 완화하는 데만 쓴다 — open/completed/locked 우선순위는
   * 그대로 유지한다(티켓 20260825_029).
   */
  participatedMissionIds: ReadonlySet<string>
}

export interface MissionVisibilityResult {
  visibility: MissionVisibility
  /**
   * locked/hidden일 때 "이 미션을 열려면 먼저 획득해야 하는 배지".
   * 게이트 배지의 바로 아래 등급이다(예: 첫 숨결 Legend 게이트 → 첫 숨결 Rare).
   */
  requiredBadge: { name: string; rarity: BadgeRarity } | null
}

const OPEN: MissionVisibilityResult = { visibility: 'open', requiredBadge: null }

/** 미션 하나의 노출 상태를 판정한다. */
export function resolveMissionVisibility(
  mission: MissionVisibilityInput,
  ctx: MissionVisibilityContext,
): MissionVisibilityResult {
  if (ctx.completedMissionIds.has(mission.id)) {
    return { visibility: 'completed', requiredBadge: null }
  }

  if (!mission.gated_badge_id) return OPEN

  const gatedBadge = ctx.gatedBadges.get(mission.gated_badge_id)
  // 게이트 배지를 찾을 수 없으면(삭제·오설정) 게이팅을 적용하지 않는다 — 잘못된 연결 하나로
  // 미션이 통째로 사라지는 것보다 그대로 노출되는 쪽이 안전하다.
  if (!gatedBadge) return OPEN

  const gateTier = RARITY_TIER[gatedBadge.rarity] ?? 0
  if (gateTier <= MIN_EFFECTIVE_TIER) return OPEN

  const ownedTier = ctx.ownedTierByBadgeName.get(gatedBadge.name) ?? 0
  const effectiveOwnedTier = Math.max(ownedTier, MIN_EFFECTIVE_TIER)

  if (gateTier <= effectiveOwnedTier + 1) return OPEN

  const requiredBadge = {
    name: gatedBadge.name,
    rarity: RARITY_BY_TIER[gateTier - 1] ?? gatedBadge.rarity,
  }

  if (gateTier === effectiveOwnedTier + 2) {
    return { visibility: 'locked', requiredBadge }
  }

  // hidden 대상이더라도 참가 이력이 있으면 완전 숨김 대신 locked로 완화한다 — 자기 참가
  // 이력을 어디서도 볼 수 없게 되는 것을 막기 위함(티켓 20260825_029).
  if (ctx.participatedMissionIds.has(mission.id)) {
    return { visibility: 'locked', requiredBadge }
  }
  return { visibility: 'hidden', requiredBadge }
}

/** 미션 목록 전체를 한 번에 판정 — id → 결과 맵 */
export function resolveMissionVisibilityMap<T extends MissionVisibilityInput>(
  missions: readonly T[],
  ctx: MissionVisibilityContext,
): Map<string, MissionVisibilityResult> {
  const map = new Map<string, MissionVisibilityResult>()
  for (const m of missions) map.set(m.id, resolveMissionVisibility(m, ctx))
  return map
}

/** 참가(join) 가능 여부 — 목록/상세/API가 같은 기준을 쓰도록 이 함수 하나로 통일 */
export function isMissionJoinable(result: MissionVisibilityResult): boolean {
  return result.visibility === 'open'
}
