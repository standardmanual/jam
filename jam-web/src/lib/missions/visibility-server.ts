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
 * `gated_badge_id`가 있는 미션인데 조회 결과에 해당 배지가 없어 fail-open(open 처리)이
 * 발동하는 경우를 로그로 남긴다(티켓 20260825_029). 판정 자체(open 처리)는 바꾸지 않는다 —
 * 순수 함수(visibility.ts)의 fail-open 동작은 그대로 두고 여기서는 관측성만 추가한다.
 */
function warnMissingGatedBadges(
  gatedBadgeIds: readonly string[],
  gatedBadges: ReadonlyMap<string, GatedBadgeInfo>,
  missions: readonly MissionVisibilityInput[],
) {
  const missingIds = gatedBadgeIds.filter((id) => !gatedBadges.has(id))
  for (const badgeId of missingIds) {
    const affectedMissionIds = missions.filter((m) => m.gated_badge_id === badgeId).map((m) => m.id)
    console.warn(
      `[visibility-server] gated_badge_id=${badgeId} 배지를 찾을 수 없어 fail-open(open) 처리됨. ` +
        `영향받은 미션 id=[${affectedMissionIds.join(', ')}]`,
    )
  }
}

/**
 * 주어진 미션 목록을 판정하는 데 필요한 컨텍스트를 조회한다.
 *
 * @param userId 대상 유저
 * @param missions 판정 대상 미션 (gated_badge_id만 있으면 됨)
 * @param options.completedMissionIds 호출부가 이미 조회한 완료 기록이 있으면 재조회를 생략한다
 * @param options.participatedMissionIds 호출부가 이미 조회한 참가 기록이 있으면 재조회를 생략한다
 */
export async function loadMissionVisibilityContext(
  userId: string,
  missions: readonly MissionVisibilityInput[],
  options?: { completedMissionIds?: ReadonlySet<string>; participatedMissionIds?: ReadonlySet<string> },
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

  // ── 참가 이력 (hidden → locked 완화용, 티켓 20260825_029) ───────────────
  let participatedMissionIds = options?.participatedMissionIds
  if (!participatedMissionIds) {
    const { data } = await supabase
      .from('user_mission_participations')
      .select('mission_id')
      .eq('user_id', userId)
    participatedMissionIds = new Set(((data ?? []) as { mission_id: string }[]).map((r) => r.mission_id))
  }

  // ── 게이트 배지 정보 ────────────────────────────────────────────────────
  const gatedBadgeIds = [...new Set(missions.map((m) => m.gated_badge_id).filter((id): id is string => !!id))]
  if (gatedBadgeIds.length === 0) {
    // 게이팅이 걸린 미션이 하나도 없으면 배지 조회 자체가 불필요하다
    return { completedMissionIds, participatedMissionIds, ...emptyBadgeContext() }
  }

  const { data: gatedRaw } = await supabase
    .from('badges')
    .select('id, name, rarity')
    .in('id', gatedBadgeIds)
    .is('deleted_at', null) // 소프트삭제된 배지는 게이트로 쓰지 않는다(티켓 20260825_019·026 선례)

  const gatedBadges = new Map<string, GatedBadgeInfo>()
  for (const b of (gatedRaw ?? []) as GatedBadgeInfo[]) gatedBadges.set(b.id, b)
  warnMissingGatedBadges(gatedBadgeIds, gatedBadges, missions)

  const gatedNames = [...new Set([...gatedBadges.values()].map((b) => b.name))]
  if (gatedNames.length === 0) {
    return { completedMissionIds, participatedMissionIds, ...emptyBadgeContext() }
  }

  // ── 유저가 보유한 게이트 배지 이름의 최고 등급 ──────────────────────────
  // 티켓 20260825_029: 예전 구현은 user_activity_badges를 `.eq('user_id', userId)`로
  // 페이지네이션 없이 전량 조회했다 — 보유 배지가 PostgREST 기본 응답 상한(1000행)을
  // 넘는 유저는 최고 등급 배지가 잘려 ownedTier가 낮게 잡히고, 열려야 할 레벨업 미션이
  // locked로 잠기는 방향의 오판이 난다(현재는 유저당 최대 175행이라 실동작 영향은 없었으나
  // 구조적 결함). 쿼리 방향을 뒤집어 먼저 "게이트 배지와 같은 이름을 가진 badges 전체
  // 등급(최대 5트리×4등급=20개 안팎)"의 id를 구하고, 그 id로 user_activity_badges를
  // `.in('badge_id', ...)`으로 조회한다 — 유저 보유량과 무관하게 항상 게이트 배지 수(≤수십 개)
  // 만큼만 조회하므로 절단·in() URL 길이 문제가 동시에 해소된다.
  // 소프트삭제 필터를 걸지 않는다 — "이미 획득한 이력"은 삭제 여부와 무관하게 유효하다
  // (20260823_004 정책, 20260825_020/021에서 확정. badge-engine도 같은 기준)
  const { data: gatedNameVariantsRaw } = await supabase
    .from('badges')
    .select('id, name, rarity')
    .in('name', gatedNames)

  const gatedNameVariants = (gatedNameVariantsRaw ?? []) as { id: string; name: string; rarity: BadgeRarity }[]
  const gatedVariantById = new Map(gatedNameVariants.map((b) => [b.id, b] as const))
  const gatedVariantIds = gatedNameVariants.map((b) => b.id)

  const ownedTierByBadgeName = new Map<string, number>()
  if (gatedVariantIds.length > 0) {
    const { data: ownedRaw } = await supabase
      .from('user_activity_badges')
      .select('badge_id')
      .eq('user_id', userId)
      .in('badge_id', gatedVariantIds)

    for (const row of (ownedRaw ?? []) as { badge_id: string }[]) {
      const variant = gatedVariantById.get(row.badge_id)
      if (!variant) continue
      const tier = RARITY_TIER[variant.rarity] ?? 0
      if (tier > (ownedTierByBadgeName.get(variant.name) ?? 0)) ownedTierByBadgeName.set(variant.name, tier)
    }
  }

  return { completedMissionIds, participatedMissionIds, gatedBadges, ownedTierByBadgeName }
}
