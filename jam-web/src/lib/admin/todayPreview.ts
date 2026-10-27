/**
 * 어드민 미리보기용 카드 값 싣기 (서버 사이드 전용).
 *
 * 카드 행에 표시 데이터(`toCardView`)가 필요로 하는 자원 값을 홈 조회(`src/lib/today/cards.ts`의 `getTodayCards()`)와 같은 규칙·함수로 싣는다.
 * 어떤 카드를 보일지(노출 판정)는 여기서 하지 않는다 — 홈피드 미리보기(`lib/admin/homePreview/load.ts`)가 `lib/today/cardSelection.ts`의 같은 규칙으로 고른다.
 * (예전에는 이 파일에 날짜만 고르는 「켜진 카드 전부」 조회 `getAdminTodayPreviewCards`가 있었으나, 티켓 20261026_2025 2회차에서 홈피드 미리보기로 합쳐 없앴다.)
 *
 * 미션 값(`resolved_mission`)과 컬렉션 값(`resolved_collection`)은 홈 조회와 같은 규칙으로 싣는다(티켓 20261001_2208). 레시피 값(`resolved_recipe`)도 홈과 같은 함수로 읽는다
 * (티켓 20261006_1218, 운영툴 PRD §6 「홈과 미리보기는 같은 값」). 배지는 보유 여부(`earned`)를 싣지 않는다 — 유저
 * 정보가 없는 미리보기라 표시 데이터가 컬러로 그린다. 레시피 공개 뒤 재료 타일도 그래서 슬롯마다 첫 후보로 고른다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { TodayCardRow } from '@/types/database'
import {
  resolveTargetHref,
  fetchRankingBoardData,
  fetchMissionsById,
  fetchCollectionsById,
  missionIdsToResolve,
  collectionIdsToResolve,
  fetchRecipesById,
  recipeIdsToResolve,
  recipeCandidateBadgeIds,
  resourceNeedsMission,
  resourceNeedsRecipe,
  toResolvedMission,
  toResolvedRecipe,
  type TodayCardWithHref,
  type ResolvedBadge,
} from '@/lib/today/cards'

/**
 * 카드 행에 표시 데이터용 자원 값(배지·랭킹·미션·컬렉션·레시피)과 이동 주소를 싣는다. 읽기는 카드 수와 상관없이 종류마다 한 번이다.
 * 홈피드 미리보기(`lib/admin/homePreview/load.ts`)가 쓴다(티켓 20261026_2025).
 * `baseTime`은 기준 시각 규칙(`previewBaseTime`)의 값이다 — 컬렉션·레시피 공개 판정의 기준 시각이다.
 */
export async function resolvePreviewCards(
  supabase: ReturnType<typeof createServiceClient>,
  cards: TodayCardRow[],
  baseTime: Date,
): Promise<TodayCardWithHref[]> {
  const baseIso = baseTime.toISOString()
  // 공개 뒤 레시피의 재료 타일이 쓰는 후보 배지는 이름·그림을 읽어야 하므로 배지 조회보다 먼저 레시피를 읽는다(홈 조회와 같은 순서).
  const recipesById = await fetchRecipesById(supabase, recipeIdsToResolve(cards), baseTime)
  const badgeIds = [...new Set([...cards.flatMap((c) => c.badge_ids ?? []), ...recipeCandidateBadgeIds(recipesById)])]

  const badgesById = new Map<string, ResolvedBadge>()
  if (badgeIds.length > 0) {
    const { data: badgesRaw } = await supabase
      .from('badges')
      .select('id, name, image_url, rarity')
      .in('id', badgeIds)
      .is('deleted_at', null)
    for (const b of (badgesRaw ?? []) as ResolvedBadge[]) badgesById.set(b.id, b)
  }

  // 랭킹 계산은 유저 개인화가 필요 없다(팔로워 수·활동 이력은 대상 유저 자신의 것) — 위 두
  // 가지 단순화(exposure_tags·참가여부 미필터링)와 달리 그대로 실제 값을 보여준다.
  const rankingByModeId = await fetchRankingBoardData(supabase, cards)

  // 미션·컬렉션 값은 홈 조회와 같은 함수·규칙으로 한 번에 읽는다(카드마다 읽지 않는다).
  const [missionsById, collectionsById] = await Promise.all([
    fetchMissionsById(supabase, missionIdsToResolve(cards)),
    fetchCollectionsById(supabase, collectionIdsToResolve(cards), baseIso),
  ])

  return cards.map((card) => {
    const ranking = card.ranking_mode_id ? rankingByModeId.get(card.ranking_mode_id) : undefined
    const mission = card.mission_id ? missionsById.get(card.mission_id) : undefined
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
      resolved_mission: mission && resourceNeedsMission(card) ? toResolvedMission(mission) : null,
      resolved_collection: card.item_book_id ? (collectionsById.get(card.item_book_id) ?? null) : null,
      resolved_recipe: resourceNeedsRecipe(card) ? toResolvedRecipe(recipesById.get(card.recipe_id as string), badgesById) : null,
    }
  })
}
