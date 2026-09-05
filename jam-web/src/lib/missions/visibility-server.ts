/**
 * 미션 노출 판정에 필요한 데이터 조회 (서버 사이드 전용) — 티켓 20260825_028
 *
 * 판정 규칙 자체는 순수 함수인 `visibility.ts`에만 있다. 이 파일은 그 함수가 요구하는
 * 컨텍스트(완료 기록·게이트 배지 정보·유저 보유 등급·유저 보유 계열)를 DB에서 채워 넣는
 * 역할만 한다. (순수 함수 파일이 Supabase를 import하면 유닛테스트에서 next/headers까지 끌려온다)
 */
import { createServiceClient } from '@/lib/supabase/server'
import {
  type GatedBadgeInfo,
  type MissionVisibilityContext,
  type MissionVisibilityInput,
} from './visibility'
import { collectRuleFamilyKeys } from './gateMissions'
import { rarityTier } from '@/lib/rarity'
import { familyKeyOf } from '@/lib/badge-engine/badgeKind'
import type { BadgeRarity } from '@/types/database'

/**
 * PostgREST 기본 응답 상한(1000행) — `.limit()`을 아무리 크게 줘도 서버 설정이 우선해
 * **에러 없이 잘린 목록**이 돌아온다. 잘린 목록으로 보유 여부를 판정하면 열려야 할 미션이
 * 잠기거나(보유 배지가 잘림) 잠겨야 할 미션이 열린다.
 */
const PAGE_SIZE = 1000

/** 페이지를 끝까지 넘겨 전량을 가져온다 (`badge-families-query.ts`와 같은 패턴) */
async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('[visibility-server] 조회 실패 — 부분 목록으로 판정하지 않는다', error.message)
      return rows
    }
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

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

type BadgeIdentity = { id: string; name: string; rarity: BadgeRarity | null; family_key: string | null }

/**
 * 게이트 미션 노출 규칙이 가리키는 **계열**에 대해, 유저가 보유한 최고 등급 티어를 구한다
 * (티켓 20260905_0033).
 *
 * 조회 방향은 레거시 경로와 같다 — 먼저 「규칙이 가리키는 계열에 속한 배지 id」를 구하고,
 * 그 id로 `user_activity_badges`를 좁힌다. 유저 보유량과 무관하게 항상 규칙이 가리키는
 * 계열 크기만큼만 조회하므로 절단·`in()` URL 길이 문제가 함께 해소된다.
 *
 * 계열 그룹핑은 `familyKeyOf()`다 — 엔진·싱크·어드민 계열 화면·계열 정합성 트리거
 * (마이그레이션 134)가 전부 같은 규칙을 쓴다. `family_key`가 정본이고 비어 있을 때만
 * `#name:` 폴백으로 묶으므로, 폴백 키를 가리키는 규칙도 교차 게이트와 같게 판정된다.
 *
 * 소프트삭제 필터를 걸지 않는다 — "이미 획득한 이력"은 삭제 여부와 무관하게 유효하다
 * (20260823_004 정책, 20260825_020/021에서 확정. badge-engine도 같은 기준)
 */
async function loadOwnedFamilyTiers(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  familyKeys: readonly string[],
): Promise<Map<string, number>> {
  const ownedFamilyTiers = new Map<string, number>()
  if (familyKeys.length === 0) return ownedFamilyTiers

  // `#name:` 접두어는 `familyKeyOf()`의 폴백이다 — 그쪽은 `family_key IS NULL`인 배지를
  // 이름으로 묶으므로 조회 조건이 다르다.
  const realKeys = familyKeys.filter((k) => !k.startsWith('#name:'))
  const fallbackNames = familyKeys.filter((k) => k.startsWith('#name:')).map((k) => k.slice('#name:'.length))

  const columns = 'id, name, rarity, family_key'
  const familyBadges: BadgeIdentity[] = []
  if (realKeys.length > 0) {
    familyBadges.push(
      ...(await fetchAllPages<BadgeIdentity>((from, to) =>
        supabase.from('badges').select(columns).in('family_key', realKeys).order('id').range(from, to),
      )),
    )
  }
  if (fallbackNames.length > 0) {
    familyBadges.push(
      ...(await fetchAllPages<BadgeIdentity>((from, to) =>
        supabase
          .from('badges')
          .select(columns)
          .is('family_key', null)
          .in('name', fallbackNames)
          .order('id')
          .range(from, to),
      )),
    )
  }
  if (familyBadges.length === 0) return ownedFamilyTiers

  const badgeById = new Map(familyBadges.map((b) => [b.id, b] as const))
  const owned = await fetchAllPages<{ badge_id: string }>((from, to) =>
    supabase
      .from('user_activity_badges')
      .select('badge_id')
      .eq('user_id', userId)
      .in('badge_id', [...badgeById.keys()])
      .order('badge_id')
      .range(from, to),
  )

  for (const row of owned) {
    const badge = badgeById.get(row.badge_id)
    if (!badge) continue
    const key = familyKeyOf(badge)
    // 값 0은 「등급 없는 배지(무한레벨형)만 보유」다 — 키의 «존재»가 곧 보유를 뜻한다.
    const tier = rarityTier(badge.rarity)
    if (!ownedFamilyTiers.has(key) || tier > (ownedFamilyTiers.get(key) as number)) {
      ownedFamilyTiers.set(key, tier)
    }
  }
  return ownedFamilyTiers
}

/**
 * 주어진 미션 목록을 판정하는 데 필요한 컨텍스트를 조회한다.
 *
 * @param userId 대상 유저
 * @param missions 판정 대상 미션 (gated_badge_id · gate_axis · visibility_rule_json)
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
    const data = await fetchAllPages<{ mission_id: string }>((from, to) =>
      supabase
        .from('user_mission_completions')
        .select('mission_id')
        .eq('user_id', userId)
        .order('mission_id')
        .range(from, to),
    )
    completedMissionIds = new Set(data.map((r) => r.mission_id))
  }

  // ── 참가 이력 (hidden → locked 완화용, 티켓 20260825_029) ───────────────
  let participatedMissionIds = options?.participatedMissionIds
  if (!participatedMissionIds) {
    const data = await fetchAllPages<{ mission_id: string }>((from, to) =>
      supabase
        .from('user_mission_participations')
        .select('mission_id')
        .eq('user_id', userId)
        .order('mission_id')
        .range(from, to),
    )
    participatedMissionIds = new Set(data.map((r) => r.mission_id))
  }

  // ── 게이트 미션(v5) 노출 규칙이 가리키는 계열 ───────────────────────────
  const ownedFamilyTiers = await loadOwnedFamilyTiers(supabase, userId, collectRuleFamilyKeys(missions))

  // ── 레거시 게이트 배지 정보 ─────────────────────────────────────────────
  const gatedBadgeIds = [...new Set(missions.map((m) => m.gated_badge_id).filter((id): id is string => !!id))]
  if (gatedBadgeIds.length === 0) {
    // 레거시 게이팅이 걸린 미션이 하나도 없으면 배지 조회 자체가 불필요하다
    return { completedMissionIds, participatedMissionIds, ownedFamilyTiers, ...emptyBadgeContext() }
  }

  const gatedRaw = await fetchAllPages<GatedBadgeInfo>((from, to) =>
    supabase
      .from('badges')
      .select('id, name, rarity')
      .in('id', gatedBadgeIds)
      .is('deleted_at', null) // 소프트삭제된 배지는 게이트로 쓰지 않는다(티켓 20260825_019·026 선례)
      .order('id')
      .range(from, to),
  )

  const gatedBadges = new Map<string, GatedBadgeInfo>()
  for (const b of gatedRaw) gatedBadges.set(b.id, b)
  warnMissingGatedBadges(gatedBadgeIds, gatedBadges, missions)

  const gatedNames = [...new Set([...gatedBadges.values()].map((b) => b.name))]
  if (gatedNames.length === 0) {
    return { completedMissionIds, participatedMissionIds, ownedFamilyTiers, ...emptyBadgeContext() }
  }

  // ── 유저가 보유한 게이트 배지 이름의 최고 등급 (레거시 경로 전용) ────────
  // 티켓 20260825_029: 예전 구현은 user_activity_badges를 `.eq('user_id', userId)`로
  // 페이지네이션 없이 전량 조회했다 — 보유 배지가 PostgREST 기본 응답 상한(1000행)을
  // 넘는 유저는 최고 등급 배지가 잘려 ownedTier가 낮게 잡히고, 열려야 할 레벨업 미션이
  // locked로 잠기는 방향의 오판이 난다. 쿼리 방향을 뒤집어 먼저 "게이트 배지와 같은 이름을
  // 가진 badges 전체 등급"의 id를 구하고, 그 id로 user_activity_badges를 좁힌다.
  //
  // ⚠️ 티켓 20260905_0033: 예전 주석은 그 규모를 「최대 5트리×4등급=20개, 유저당 175행」으로
  // 적어 두고 그 전제 위에서 페이지네이션을 생략했다. v5 카탈로그(티켓 20260905_0035)가
  // 550종을 시딩하면 그 수가 무너지므로 **두 조회 모두 페이지를 끝까지 넘긴다** —
  // 「지금은 작으니까 괜찮다」는 전제를 코드에서 걷어낸다.
  //
  // 소프트삭제 필터를 걸지 않는다 — "이미 획득한 이력"은 삭제 여부와 무관하게 유효하다
  // (20260823_004 정책, 20260825_020/021에서 확정. badge-engine도 같은 기준)
  const gatedNameVariants = await fetchAllPages<{ id: string; name: string; rarity: BadgeRarity | null }>(
    (from, to) => supabase.from('badges').select('id, name, rarity').in('name', gatedNames).order('id').range(from, to),
  )
  const gatedVariantById = new Map(gatedNameVariants.map((b) => [b.id, b] as const))

  const ownedTierByBadgeName = new Map<string, number>()
  if (gatedVariantById.size > 0) {
    const ownedRaw = await fetchAllPages<{ badge_id: string }>((from, to) =>
      supabase
        .from('user_activity_badges')
        .select('badge_id')
        .eq('user_id', userId)
        .in('badge_id', [...gatedVariantById.keys()])
        .order('badge_id')
        .range(from, to),
    )

    for (const row of ownedRaw) {
      const variant = gatedVariantById.get(row.badge_id)
      if (!variant) continue
      // `rarityTier`는 등급이 없는 배지에 0을 준다 — 「서열의 맨 아래」가 아니라
      // 「이 서열에 속하지 않는다」는 뜻이므로 최고 등급 계산에 기여하지 않는다.
      const tier = rarityTier(variant.rarity)
      if (tier > (ownedTierByBadgeName.get(variant.name) ?? 0)) ownedTierByBadgeName.set(variant.name, tier)
    }
  }

  return { completedMissionIds, participatedMissionIds, ownedFamilyTiers, gatedBadges, ownedTierByBadgeName }
}
