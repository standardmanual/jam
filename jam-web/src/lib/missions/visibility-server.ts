/**
 * 미션 노출 판정에 필요한 데이터 조회 (서버 사이드 전용) — 티켓 20260825_028
 *
 * 판정 규칙 자체는 순수 함수인 `visibility.ts`에만 있다. 이 파일은 그 함수가 요구하는
 * 컨텍스트(완료 기록·게이트 배지 정보·유저 보유 등급)를 DB에서 채워 넣는 역할만 한다.
 * (순수 함수 파일이 Supabase를 import하면 유닛테스트에서 next/headers까지 끌려온다)
 */
import { createServiceClient } from '@/lib/supabase/server'
import {
  RARITY_TIER,
  type GatedBadgeInfo,
  type MissionVisibilityContext,
  type MissionVisibilityInput,
} from './visibility'
import type { BadgeRarity } from '@/types/database'

/** 게이팅 정보가 필요 없는 경우의 빈 값 (호출마다 새 Map — 공유 인스턴스 변조 방지) */
function emptyBadgeContext() {
  return {
    gatedBadges: new Map<string, GatedBadgeInfo>(),
    ownedTierByBadgeName: new Map<string, number>(),
  }
}

/**
 * 주어진 미션 목록을 판정하는 데 필요한 컨텍스트를 조회한다.
 *
 * @param userId 대상 유저
 * @param missions 판정 대상 미션 (gated_badge_id만 있으면 됨)
 * @param options.completedMissionIds 호출부가 이미 조회한 완료 기록이 있으면 재조회를 생략한다
 */
export async function loadMissionVisibilityContext(
  userId: string,
  missions: readonly MissionVisibilityInput[],
  options?: { completedMissionIds?: ReadonlySet<string> },
): Promise<MissionVisibilityContext> {
  const supabase = createServiceClient()

  // ── 완료 기록 (완료 판정의 단일 기준) ──────────────────────────────────
  let completedMissionIds = options?.completedMissionIds
  if (!completedMissionIds) {
    const { data } = await supabase
      .from('user_mission_completions')
      .select('mission_id')
      .eq('user_id', userId)
    completedMissionIds = new Set(((data ?? []) as { mission_id: string }[]).map((r) => r.mission_id))
  }

  // ── 게이트 배지 정보 ────────────────────────────────────────────────────
  const gatedBadgeIds = [...new Set(missions.map((m) => m.gated_badge_id).filter((id): id is string => !!id))]
  if (gatedBadgeIds.length === 0) {
    // 게이팅이 걸린 미션이 하나도 없으면 배지 조회 자체가 불필요하다
    return { completedMissionIds, ...emptyBadgeContext() }
  }

  const { data: gatedRaw } = await supabase
    .from('badges')
    .select('id, name, rarity')
    .in('id', gatedBadgeIds)
    .is('deleted_at', null) // 소프트삭제된 배지는 게이트로 쓰지 않는다(티켓 20260825_019·026 선례)

  const gatedBadges = new Map<string, GatedBadgeInfo>()
  for (const b of (gatedRaw ?? []) as GatedBadgeInfo[]) gatedBadges.set(b.id, b)

  const gatedNames = [...new Set([...gatedBadges.values()].map((b) => b.name))]
  if (gatedNames.length === 0) {
    return { completedMissionIds, ...emptyBadgeContext() }
  }

  // ── 유저가 보유한 게이트 배지 이름의 최고 등급 ──────────────────────────
  const { data: ownedRaw } = await supabase
    .from('user_activity_badges')
    .select('badge_id')
    .eq('user_id', userId)
  const ownedBadgeIds = [...new Set(((ownedRaw ?? []) as { badge_id: string }[]).map((r) => r.badge_id))]

  const ownedTierByBadgeName = new Map<string, number>()
  if (ownedBadgeIds.length > 0) {
    // 소프트삭제 필터를 걸지 않는다 — "이미 획득한 이력"은 삭제 여부와 무관하게 유효하다
    // (20260823_004 정책, 20260825_020/021에서 확정. badge-engine도 같은 기준)
    const { data: ownedDefsRaw } = await supabase
      .from('badges')
      .select('name, rarity')
      .in('id', ownedBadgeIds)
      .in('name', gatedNames)

    for (const b of (ownedDefsRaw ?? []) as { name: string; rarity: BadgeRarity }[]) {
      const tier = RARITY_TIER[b.rarity] ?? 0
      if (tier > (ownedTierByBadgeName.get(b.name) ?? 0)) ownedTierByBadgeName.set(b.name, tier)
    }
  }

  return { completedMissionIds, gatedBadges, ownedTierByBadgeName }
}
