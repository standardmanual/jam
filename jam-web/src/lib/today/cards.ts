/**
 * JAM! Phase 15 — 투데이 카드 조회 + target_href 자동생성 (서버 사이드 전용)
 *
 * 조회 규칙 (PRD/Phase15_02_DATA_MODEL.md §4):
 *   is_active = TRUE AND starts_at <= now <= ends_at
 *   AND exposure_tags && [유저태그 + 'all']  (배열 겹침 = OR 매칭)
 *   ORDER BY sort_order ASC, starts_at DESC
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { RankingModeRow, TodayCardRow } from '@/types/database'
import { computeUserExposureTags } from './exposure'
import { loadMissionVisibilityContext } from '@/lib/missions/visibility-server'
import { isMissionExposed, resolveMissionVisibility, type MissionVisibilityInput } from '@/lib/missions/visibility'
import { computeRankingModeResult, type RankingBoardResult } from '@/lib/ranking/rankingDataSource'
/**
 * 순수 함수라 서버 전용 의존이 없는 `targetHref.ts`로 옮겼다(티켓 20260911_1454) — 이 파일
 * 안(`getTodayCards` 등)에서 쓰기 위해 값으로 import하고, 기존 호출부가 그대로
 * `@/lib/today/cards`에서 가져다 쓸 수 있도록 재수출한다. 클라이언트 컴포넌트(어드민 투데이
 * 카드 폼·조회 화면)는 이 파일이 아니라 `targetHref.ts`를 직접 import한다 — 이 파일을 값으로
 * import하면 위 `@/lib/supabase/server`(→ `next/headers`)까지 클라이언트 번들에 딸려 들어가
 * 빌드 오류가 난다.
 */
import { resolveTargetHref } from './targetHref'

export { resolveTargetHref }

export interface ResolvedBadge {
  id: string
  name: string
  image_url: string | null
  /**
   * 무한레벨형 배지는 등급이 없다(마이그레이션 130 — `badges.rarity` nullable).
   * 티켓 20260905_0027이 지목한 «컴파일이 잡지 못하는 경계» 3곳 중 하나라 여기서 명시적으로
   * nullable로 좁혔다 — 현재 `TodayCardStack`은 이 값을 그리지 않는다(등급 칩 없음).
   */
  rarity: string | null
  /**
   * 이 카드를 보는 유저가 **이미 보유한 배지인지** (티켓 20260905_0038 B).
   * 오늘 카드는 미획득 배지의 아트를 커버로 승격하면서 보유 여부를 한 번도 묻지 않아,
   * 아직 못 받은 배지가 「내 것」처럼 보였다. 미보유는 `grayscale(1)`로 표시한다
   * (2026-09-06 확정 규칙 — 실루엣으로 감추지 않는다).
   */
  earned: boolean
}

/** resolveTargetHref 를 적용한 카드 (UI에서 바로 링크로 사용) */
export type TodayCardWithHref = TodayCardRow & {
  resolved_href: string
  /** badge_ids 를 실제 배지 정보로 조회한 결과 (badge_gallery 레이아웃 렌더링용, badge_ids 없으면 빈 배열) */
  resolved_badges: ResolvedBadge[]
  /**
   * ranking_board 카드가 참조하는 랭킹모드를 서버가 미리 계산한 순위 목록(티켓 20260911_1440).
   * ranking_list 레이아웃 렌더링용 — ranking_board가 아니거나 ranking_mode_id가 비어있거나
   * 랭킹모드를 찾지 못하면 null.
   */
  resolved_ranking: RankingBoardResult | null
}

/**
 * 유저에게 지금 노출할 투데이 카드 목록을 조회한다.
 * @param userId 대상 유저
 * @param userCreatedAt users.created_at (new_user 태그 판정용, 있으면 전달)
 * @param now 기준 시각 (기본: 현재)
 */
export async function getTodayCards(
  userId: string,
  userCreatedAt?: string | null,
  now: Date = new Date(),
): Promise<TodayCardWithHref[]> {
  const tags = await computeUserExposureTags(userId, now, userCreatedAt)
  const supabase = createServiceClient()
  const nowIso = now.toISOString()

  const { data, error } = await supabase
    .from('today_cards')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .overlaps('exposure_tags', tags)
    .order('sort_order', { ascending: true })
    .order('starts_at', { ascending: false })

  if (error) {
    console.error('[getTodayCards] 조회 오류:', error.message)
    return []
  }

  const allCards = (data ?? []) as TodayCardRow[]
  // 20260825_028: 미션 소개 카드도 미션 목록과 같은 노출 규칙을 따른다 —
  // 이미 완료했거나 아직 열리지 않은 미션은 오늘 카드로도 권하지 않는다.
  const cards = await filterMissionSpotlightCards(userId, allCards)
  const badgesById = await fetchBadgesById(supabase, cards.flatMap((c) => c.badge_ids ?? []), userId)
  const rankingByModeId = await fetchRankingBoardData(supabase, cards)

  return cards.map((card) => {
    const ranking = card.ranking_mode_id ? rankingByModeId.get(card.ranking_mode_id) : undefined
    return {
      ...card,
      resolved_href: resolveTargetHref(
        card,
        ranking?.mode.target_type === 'mission_participants'
          ? { rankingModeTargetMissionId: ranking.mode.target_mission_id }
          : {}
      ),
      resolved_badges: (card.badge_ids ?? []).map((id) => badgesById.get(id)).filter((b): b is ResolvedBadge => Boolean(b)),
      resolved_ranking: ranking?.result ?? null,
    }
  })
}

/**
 * ranking_board 카드가 참조하는 랭킹모드를 배치 조회해 순위를 계산한다(`fetchBadgesById`와
 * 같은 이유 — 카드마다 개별 조회하면 홈 피드 1회 로드에 N번 왕복한다). id → { mode, result } 맵.
 *
 * export하는 이유: 어드민 날짜별 미리보기(`lib/admin/todayPreview.ts`)도 같은 배치 조회가
 * 필요하다 — 그 파일은 유저 개인화(참가 여부 등)는 의도적으로 생략하지만, 랭킹 계산 자체는
 * 유저 컨텍스트가 필요 없어(팔로워 수·활동 이력 등은 대상 유저 자신의 것) 그대로 재사용할 수 있다.
 */
export async function fetchRankingBoardData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cards: TodayCardRow[],
): Promise<Map<string, { mode: RankingModeRow; result: RankingBoardResult }>> {
  const modeIds = [
    ...new Set(
      cards
        .filter((c) => c.template_type === 'ranking_board' && c.ranking_mode_id)
        .map((c) => c.ranking_mode_id as string)
    ),
  ]
  const map = new Map<string, { mode: RankingModeRow; result: RankingBoardResult }>()
  if (modeIds.length === 0) return map

  const { data, error } = await supabase.from('ranking_modes').select('*').in('id', modeIds)
  if (error) {
    console.error('[fetchRankingBoardData] 랭킹모드 조회 오류:', error.message)
    return map
  }

  const modes = (data ?? []) as RankingModeRow[]
  await Promise.all(
    modes.map(async (mode) => {
      const result = await computeRankingModeResult(mode, supabase)
      map.set(mode.id, { mode, result })
    })
  )
  return map
}

/**
 * mission_spotlight 카드 중 유저에게 노출하면 안 되는 미션(완료/잠금/숨김)을 제외한다.
 * 판정은 미션 목록·상세·참가 API와 동일한 `resolveMissionVisibility`를 쓴다 (티켓 20260825_028).
 * mission_id가 없는 카드(/missions 목록으로 이동)는 그대로 둔다.
 */
async function filterMissionSpotlightCards(userId: string, cards: TodayCardRow[]): Promise<TodayCardRow[]> {
  const missionIds = [...new Set(
    cards
      .filter((c) => c.template_type === 'mission_spotlight' && c.mission_id)
      .map((c) => c.mission_id as string)
  )]
  if (missionIds.length === 0) return cards

  const supabase = createServiceClient()
  // 판정에 필요한 컬럼을 이름으로 명시하지 않고 select('*')를 쓴다 — 게이트 미션 컬럼을
  // 더하는 마이그레이션 135가 아직 실행되지 않은 환경에서 없는 컬럼을 명시하면 쿼리 자체가
  // 실패해 오늘 카드가 통째로 사라진다(참가 API가 같은 이유로 select('*')를 쓴다).
  const { data } = await supabase.from('missions').select('*').in('id', missionIds)
  type SpotlightMission = MissionVisibilityInput & {
    starts_at: string
    exposure_mode: import('@/types/database').MissionExposureMode | null | undefined
    exposure_at: string | null | undefined
  }
  const missions = (data ?? []) as unknown as SpotlightMission[]
  if (missions.length === 0) return cards

  // 관리자 수동 노출 제어(티켓 20260912_0139) — 게이트 판정보다 먼저 걸러진다.
  const exposedMissions = missions.filter((m) => isMissionExposed(m))

  const ctx = await loadMissionVisibilityContext(userId, exposedMissions)
  const openMissionIds = new Set(
    exposedMissions.filter((m) => resolveMissionVisibility(m, ctx).visibility === 'open').map((m) => m.id)
  )

  return cards.filter((c) => {
    if (c.template_type !== 'mission_spotlight' || !c.mission_id) return true
    return openMissionIds.has(c.mission_id)
  })
}

/**
 * badge_ids 배열(중복 포함 가능)을 한 번에 조회해 id → 배지정보 맵으로 반환.
 *
 * 보유 여부는 배지 종류마다 소유 기록이 다른 테이블에 있어 세 곳을 함께 본다
 * (`badges/page.tsx`가 배지함에서 쓰는 것과 같은 3원 구조 — 티켓 20260905_0038 B):
 *   활동·미션·컬렉션 보상 → `user_activity_badges` / 체크인 → `user_checkin_badge_earns` /
 *   아이템 → `inventory_items`(드랍해 넘긴 개체는 제외).
 * 한 곳만 보면 「보유한 배지를 미보유로 표시」하는 **틀린 사실**이 화면에 나간다.
 */
async function fetchBadgesById(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  badgeIds: string[],
  userId: string,
): Promise<Map<string, ResolvedBadge>> {
  const uniqueIds = [...new Set(badgeIds)]
  if (uniqueIds.length === 0) return new Map()

  const [{ data }, activityOwned, checkinOwned, itemOwned] = await Promise.all([
    supabase.from('badges').select('id, name, image_url, rarity').in('id', uniqueIds).is('deleted_at', null),
    supabase.from('user_activity_badges').select('badge_id').eq('user_id', userId).in('badge_id', uniqueIds),
    supabase.from('user_checkin_badge_earns').select('badge_id').eq('user_id', userId).in('badge_id', uniqueIds),
    supabase
      .from('inventory_items')
      .select('badge_id, inventory!inner(user_id)')
      .eq('inventory.user_id', userId)
      .is('dropped_at', null)
      .in('badge_id', uniqueIds),
  ])

  const ownedIds = new Set<string>()
  for (const result of [activityOwned, checkinOwned, itemOwned]) {
    if (result?.error) {
      // 보유 판정 실패는 카드 노출 자체를 막지 않는다 — 그 배지가 «미보유»로 그려질 뿐이다.
      console.error('[fetchBadgesById] 배지 보유 여부 조회 오류:', result.error.message)
      continue
    }
    for (const row of (result?.data ?? []) as { badge_id: string }[]) ownedIds.add(row.badge_id)
  }

  const map = new Map<string, ResolvedBadge>()
  for (const b of (data ?? []) as Omit<ResolvedBadge, 'earned'>[]) {
    map.set(b.id, { ...b, earned: ownedIds.has(b.id) })
  }
  return map
}

/**
 * editorial_article 아티클 페이지용 단건 조회.
 * is_active 이고 조회 시점이 starts_at~ends_at 구간 안일 때만 반환(기간 밖/비활성 → null).
 * 예약발행/종료 카드에 직링크로 접근하는 것을 차단한다.
 */
export async function getPublishedArticleCard(
  cardId: string,
  now: Date = new Date(),
): Promise<TodayCardRow | null> {
  const supabase = createServiceClient()
  const nowIso = now.toISOString()

  const { data } = await supabase
    .from('today_cards')
    .select('*')
    .eq('id', cardId)
    .eq('template_type', 'editorial_article')
    .eq('is_active', true)
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .maybeSingle()

  return (data as TodayCardRow | null) ?? null
}
