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
import { loadMissionTribeAccess, loadMissionVisibilityContext } from '@/lib/missions/visibility-server'
import { isMissionOpenToUser } from '@/lib/missions/tribe-access'
import { withoutHiddenRewardBadgeIds } from '@/lib/missions/reward-badges'
import { isMissionExposed, resolveMissionVisibility, type MissionVisibilityInput } from '@/lib/missions/visibility'
import { computeRankingModeResult, type RankingBoardResult } from '@/lib/ranking/rankingDataSource'
import { COMPLETION_BADGE_TYPES, computeBookCompletion, type CompletionBadgeInput } from '@/lib/itembook/completion-basis'
import { applyLaunchedItemBookFilter } from '@/lib/itembook/visibility'
import { recipeReleaseState } from '@/lib/combine/visibility'
import { resourceOfTemplate } from './cardView'
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
   * nullable로 좁혔다 — 새 틀은 JAM! 배지 1개 카드의 칩 줄에만 이 값을 그린다(타일에는 그리지 않는다).
   */
  rarity: string | null
  /**
   * 이 카드를 보는 유저가 **이미 보유한 배지인지** (티켓 20260905_0038 B).
   * 오늘 카드는 미획득 배지의 아트를 커버로 승격하면서 보유 여부를 한 번도 묻지 않아,
   * 아직 못 받은 배지가 「내 것」처럼 보였다. 미보유는 `grayscale(1)`로 표시한다
   * (2026-09-06 확정 규칙 — 실루엣으로 감추지 않는다).
   *
   * 값이 없으면(유저 정보가 없는 어드민 미리보기, 티켓 20261001_2208) 보유 여부를 모르는 것이라
   * 표시 데이터(`toCardView`)가 컬러로 그린다. 홈 조회(`getTodayCards`)는 늘 `true`/`false`를 싣는다.
   */
  earned?: boolean
}

/**
 * 미션 소개·자동 카드의 표시 데이터(`toCardView`)에 필요한 미션 값 (티켓 20261001_1357).
 * 화면 변환에 쓰는 값만 담는다 — 미션 행 전체를 카드에 싣지 않는다.
 */
export interface ResolvedMission {
  starts_at: string
  /** NULL = 상시 미션(종료일 없음) */
  ends_at: string | null
  reward_points: number | null
  /** `reward_badge_ids`의 개수(보상 줄 「배지 N개」) */
  reward_badge_count: number
  /** 옛 미션 소개 카드의 「이미지에 제목 있음」 판정에 쓴다(커버 주소와 같으면 제목이 이미지 안에 있다) */
  image_url: string | null
}

/** 컬렉션 소식 카드의 표시 데이터에 필요한 컬렉션 값 (티켓 20261001_1357) */
export interface ResolvedCollection {
  name: string
  /** 컬렉션 목록과 같은 기준(`computeBookCompletion`의 분모)으로 센 아이템 수. 개수를 읽지 못했으면 NULL */
  item_count: number | null
}

/**
 * 레시피 공개 카드(`recipe_reveal`)의 표시 데이터에 필요한 레시피 값 (티켓 20261006_1217, 1500 ⑫ 사용자 결정 Q3).
 *
 * **공개 전(`scheduled`)에는 재료 수와 공개 시각 두 값뿐이다.** 레시피 이름·슬롯 후보·보상은 서버가 읽고도 이 값에 싣지 않는다 — 공개 전 레시피는 일반 유저에게 없는
 * 레시피와 같아야 하기 때문이다(`lib/combine/visibility.ts`). 공개 뒤(`released`)에는 슬롯마다 대표 후보 하나를 타일로 싣는다.
 * 레시피가 끝났거나 없거나 읽지 못했으면 이 값 자체가 null이다(카드는 레시피 줄 없이 그려진다).
 */
export type ResolvedRecipe = ResolvedScheduledRecipe | ResolvedReleasedRecipe

export interface ResolvedScheduledRecipe {
  state: 'scheduled'
  /** 재료 수 = 슬롯 수 */
  ingredient_count: number
  /** 공개 시각(`valid_from`, ISO 문자열). 해석할 수 없는 값이면 화면이 공개일 줄만 생략한다 */
  release_at: string
}

export interface ResolvedReleasedRecipe {
  state: 'released'
  /** 재료 수 = 슬롯 수. 후보가 전부 삭제돼 타일을 못 그린 슬롯도 센다 */
  ingredient_count: number
  reward_points: number
  /** `reward_badge_ids`의 개수(보상 줄 「배지 N개」) */
  reward_badge_count: number
  /**
   * 슬롯 순서(`slot_order` 오름차순)대로 슬롯마다 대표 후보 배지 하나(후보를 펼치지 않는다). 대표는 유저가 가진 후보(`earned: true`)가 있으면 그것,
   * 없으면 `allowed_badge_ids` 순서의 첫 번째로 삭제되지 않은 후보(`earned: false`)다. 후보가 전부 삭제된 슬롯은 타일이 없다.
   */
  tiles: ResolvedBadge[]
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
  /**
   * 미션 소개 카드와 미션을 가리키는 자동 카드(`mission_id`가 있는 `progress_nudge`·`location_trend`)의 미션 값.
   * 표시 데이터(`toCardView`)가 기간·보상 줄을 만드는 데 쓴다. 그 밖의 카드이거나 미션을 찾지 못하면 null,
   * 손으로 만든 카드(어드민 미리보기 등)에는 없을 수 있다(티켓 20261001_1357).
   */
  resolved_mission?: ResolvedMission | null
  /** 컬렉션 소식 카드(`itembook_milestone`)의 컬렉션 값. 그 밖의 카드이거나 컬렉션을 찾지 못하면 null (티켓 20261001_1357) */
  resolved_collection?: ResolvedCollection | null
  /**
   * 레시피 공개 카드(`recipe_reveal`)의 레시피 값. 그 밖의 카드이거나 `recipe_id`가 비었거나 레시피가 없거나 끝났거나 읽지 못했으면 null,
   * 손으로 만든 카드(어드민 미리보기 등)에는 없을 수 있다(티켓 20261006_1217).
   */
  resolved_recipe?: ResolvedRecipe | null
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
  // 표시 데이터에 필요한 미션·컬렉션 값은 카드 수와 상관없이 한 번에 모아 읽는다(티켓 20261001_1357).
  // 미션 행은 아래 노출 판정(`filterMissionSpotlightCards`)도 함께 쓰므로 두 번 읽지 않는다.
  const missionsById = await fetchMissionsById(supabase, missionIdsToResolve(allCards))
  // 20260825_028: 미션 소개 카드도 미션 목록과 같은 노출 규칙을 따른다 —
  // 이미 완료했거나 아직 열리지 않은 미션은 오늘 카드로도 권하지 않는다.
  const spotlightFiltered = await filterMissionSpotlightCards(userId, allCards, missionsById)
  // 랭킹모드는 아래 트라이브 거름과 순위 계산이 함께 쓰므로 한 번만 읽어 둘에 나눠 준다(티켓 20261019_1445 4회, 예전에는 같은 행을 두 번 읽었다).
  const rankingModes = await fetchRankingModesById(supabase, rankingModeIdsOf(spotlightFiltered))
  // 티켓 20261019_1400: 트라이브 제한 미션의 랭킹 보드 카드는 대상이 아닌 트라이브 유저에게 내리지 않는다(5-1 규칙과 같다).
  const cards = await filterRankingBoardCardsByTribe(userId, spotlightFiltered, rankingModes)
  // 레시피 공개 카드의 레시피는 공개 뒤 재료 타일의 후보 배지 id를 알아야 배지 조회에 합칠 수 있어서 배지 조회보다 먼저 읽는다.
  // 레시피 공개 카드가 없으면 아무것도 읽지 않는다.
  const recipesById = await fetchRecipesById(supabase, recipeIdsToResolve(cards), now)
  const [badgesById, rankingByModeId, collectionsById] = await Promise.all([
    fetchBadgesById(supabase, [...cards.flatMap((c) => c.badge_ids ?? []), ...recipeCandidateBadgeIds(recipesById)], userId),
    // 보는 사람 id를 내려 이용 정지 중인 본인을 본인 화면의 순위에는 남긴다(티켓 20261019_1400).
    fetchRankingBoardData(supabase, cards, userId, rankingModes),
    fetchCollectionsById(supabase, collectionIdsToResolve(cards), nowIso),
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
      resolved_mission:
        mission && resourceNeedsMission(card) ? toResolvedMission(mission) : null,
      resolved_collection: card.item_book_id ? (collectionsById.get(card.item_book_id) ?? null) : null,
      resolved_recipe: resourceNeedsRecipe(card) ? toResolvedRecipe(recipesById.get(card.recipe_id as string), badgesById) : null,
    }
  })
}

/** ranking_board 카드가 가리키는 랭킹모드 id (중복 제거) */
function rankingModeIdsOf(cards: TodayCardRow[]): string[] {
  return [
    ...new Set(
      cards
        .filter((c) => c.template_type === 'ranking_board' && c.ranking_mode_id)
        .map((c) => c.ranking_mode_id as string)
    ),
  ]
}

/**
 * 랭킹모드를 id로 한 번에 읽는다 (티켓 20261019_1445 4회). 홈 한 번 로드에서 트라이브 거름(`filterRankingBoardCardsByTribe`)과
 * 순위 계산(`fetchRankingBoardData`)이 같은 `ranking_modes` 행을 두 번 읽던 것을 한 번으로 합친다.
 * 읽지 못하면 로그만 남기고 빈 맵을 돌려준다 — 두 쓰는 쪽이 읽기 오류를 받던 방식과 같다(트라이브 거름은 카드를 그대로 두고,
 * 순위 계산은 순위 없이 돌려준다). 없는 id는 맵에 없다.
 */
async function fetchRankingModesById(supabase: ServiceClient, modeIds: string[]): Promise<Map<string, RankingModeRow>> {
  const modesById = new Map<string, RankingModeRow>()
  if (modeIds.length === 0) return modesById
  const { data, error } = await supabase.from('ranking_modes').select('*').in('id', modeIds)
  if (error) {
    console.error('[fetchRankingModesById] 랭킹모드 조회 오류:', error.message)
    return modesById
  }
  for (const mode of (data ?? []) as RankingModeRow[]) modesById.set(mode.id, mode)
  return modesById
}

/**
 * ranking_board 카드가 참조하는 랭킹모드를 배치 조회해 순위를 계산한다(`fetchBadgesById`와
 * 같은 이유 — 카드마다 개별 조회하면 홈 피드 1회 로드에 N번 왕복한다). id → { mode, result } 맵.
 *
 * export하는 이유: 어드민 날짜별 미리보기(`lib/admin/todayPreview.ts`)도 같은 배치 조회가
 * 필요하다 — 그 파일은 유저 개인화(참가 여부 등)는 의도적으로 생략하지만, 랭킹 계산 자체는
 * 유저 컨텍스트가 필요 없어(팔로워 수·활동 이력 등은 대상 유저 자신의 것) 그대로 재사용할 수 있다.
 *
 * `viewerUserId`: 보는 사람 id. 미션 참가자 순위에서 이용 정지 중인 유저는 빠지지만 보는 사람 본인은 남는다(티켓 20261019_1400).
 * 어드민 미리보기는 넘기지 않는다 — 어느 유저의 화면도 아니므로 정지 유저를 모두 뺀다.
 *
 * `preloadedModes`: 호출자가 이미 읽은 랭킹모드(id → 행). 주면 `ranking_modes`를 다시 읽지 않는다(홈 조회가 트라이브 거름과 한 번에 읽어 나눠 준다,
 * 티켓 20261019_1445 4회). 이 카드들이 가리키는 모드 중 맵에 없는 것은 순위 없이 둔다. 어드민 미리보기는 넘기지 않아 예전처럼 직접 읽는다.
 */
export async function fetchRankingBoardData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cards: TodayCardRow[],
  viewerUserId?: string,
  preloadedModes?: ReadonlyMap<string, RankingModeRow>,
): Promise<Map<string, { mode: RankingModeRow; result: RankingBoardResult }>> {
  const modeIds = rankingModeIdsOf(cards)
  const map = new Map<string, { mode: RankingModeRow; result: RankingBoardResult }>()
  if (modeIds.length === 0) return map

  const modesById = preloadedModes ?? (await fetchRankingModesById(supabase, modeIds))
  const modes = modeIds.map((id) => modesById.get(id)).filter((mode): mode is RankingModeRow => mode !== undefined)
  await Promise.all(
    modes.map(async (mode) => {
      const result = await computeRankingModeResult(mode, supabase, { viewerUserId })
      map.set(mode.id, { mode, result })
    })
  )
  return map
}

/**
 * 트라이브 제한 미션을 가리키는 랭킹 보드 카드 중 보는 사람이 대상 트라이브가 아닌 카드를 내린다 (티켓 20261019_1400).
 *
 * 미션 목록·상세·참가·순위가 쓰는 규칙(`isMissionOpenToUser`)을 그대로 쓴다. 대상이 아니면 순위만 숨기는 것이 아니라 카드를 내린다 —
 * 카드를 눌러 미션으로 가면 상세가 404가 되는 상황을 없앤다(사용자 결정 2026-10-20, 미션 목록에서 숨기는 5-1 규칙과 같다).
 * 허용 트라이브가 없는 공통 미션과 미션 참가자 순위가 아닌 카드(수동 지정 유저 등)는 그대로 둔다.
 *
 * 접근 정보를 읽지 못하면 «제한 없음»으로 보지 않는다(fail-closed): 미션을 가리키는 랭킹 보드 카드를 이 유저에게는 내린다.
 * 랭킹 모드 자체를 읽지 못하면(`modesById`가 비어 온다) 순위 조회(`fetchRankingBoardData`)도 같은 맵을 받아 비므로 미션 링크·순위가 실리지 않아 카드를 그대로 둔다.
 */
async function filterRankingBoardCardsByTribe(
  userId: string,
  cards: TodayCardRow[],
  modesById: ReadonlyMap<string, RankingModeRow>,
): Promise<TodayCardRow[]> {
  const modeIds = rankingModeIdsOf(cards)
  if (modeIds.length === 0) return cards

  const missionIdByModeId = new Map<string, string>()
  for (const modeId of modeIds) {
    const mode = modesById.get(modeId)
    if (mode && mode.target_type === 'mission_participants' && mode.target_mission_id) {
      missionIdByModeId.set(mode.id, mode.target_mission_id)
    }
  }
  if (missionIdByModeId.size === 0) return cards

  let closedModeIds: Set<string>
  try {
    const access = await loadMissionTribeAccess(userId, [...missionIdByModeId.values()])
    closedModeIds = new Set(
      [...missionIdByModeId].filter(([, missionId]) => !isMissionOpenToUser(access, missionId)).map(([modeId]) => modeId)
    )
  } catch (err) {
    console.error('[filterRankingBoardCardsByTribe] 트라이브 접근 조회 오류 — 미션 랭킹 보드 카드를 내립니다:', err)
    closedModeIds = new Set(missionIdByModeId.keys())
  }
  if (closedModeIds.size === 0) return cards

  return cards.filter(
    (c) => !(c.template_type === 'ranking_board' && c.ranking_mode_id && closedModeIds.has(c.ranking_mode_id))
  )
}

/** 미션 행 중 이 파일이 읽는 칸 — 노출 판정(`MissionVisibilityInput`)과 표시 값을 함께 쓴다 */
type FetchedMission = MissionVisibilityInput & {
  starts_at: string
  ends_at: string | null
  reward_points: number | null
  reward_badge_ids: string[] | null
  image_url: string | null
  exposure_mode: import('@/types/database').MissionExposureMode | null | undefined
  exposure_at: string | null | undefined
}

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * 표시 데이터가 미션 값을 쓰는 카드인지 — 미션 소개 카드, 그리고 미션을 가리키는 자동 카드.
 * 자원 대응(`resourceOfTemplate`)을 따른다(그 밖의 템플릿은 `mission_id`가 있어도 기간·보상 줄이 없다).
 *
 * 이 아래 네 함수(`resourceNeedsMission`·`missionIdsToResolve`·`collectionIdsToResolve`·`toResolvedMission`)는
 * 어드민 날짜 미리보기(`lib/admin/todayPreview.ts`)가 같은 규칙으로 자원 값을 싣도록 export한다(티켓 20261001_2208).
 */
export function resourceNeedsMission(card: TodayCardRow): boolean {
  if (!card.mission_id) return false
  const resource = resourceOfTemplate(card.template_type)
  return resource === 'mission' || resource === 'auto'
}

/** 미션 값을 읽어야 하는 카드들의 미션 id (중복 제거) */
export function missionIdsToResolve(cards: TodayCardRow[]): string[] {
  return [...new Set(cards.filter(resourceNeedsMission).map((c) => c.mission_id as string))]
}

/** 컬렉션 값을 읽어야 하는 카드들의 컬렉션 id (중복 제거) — 컬렉션 소식 카드만 */
export function collectionIdsToResolve(cards: TodayCardRow[]): string[] {
  return [
    ...new Set(
      cards
        .filter((c) => c.item_book_id && resourceOfTemplate(c.template_type) === 'collection')
        .map((c) => c.item_book_id as string)
    ),
  ]
}

export function toResolvedMission(m: FetchedMission): ResolvedMission {
  return {
    starts_at: m.starts_at,
    ends_at: m.ends_at ?? null,
    reward_points: m.reward_points ?? null,
    reward_badge_count: m.reward_badge_ids?.length ?? 0,
    image_url: m.image_url ?? null,
  }
}

/**
 * 미션 행을 id 목록으로 한 번에 읽는다(카드마다 읽으면 홈 한 번 로드에 N번 왕복한다).
 * export하는 이유: 한 번에 읽는지(조회 횟수)를 시험이 확인한다.
 */
export async function fetchMissionsById(supabase: ServiceClient, missionIds: string[]): Promise<Map<string, FetchedMission>> {
  const map = new Map<string, FetchedMission>()
  if (missionIds.length === 0) return map

  // 판정에 필요한 컬럼을 이름으로 명시하지 않고 select('*')를 쓴다 — 게이트 미션 컬럼을
  // 더하는 마이그레이션 135가 아직 실행되지 않은 환경에서 없는 컬럼을 명시하면 쿼리 자체가
  // 실패해 오늘 카드가 통째로 사라진다(참가 API가 같은 이유로 select('*')를 쓴다).
  const { data, error } = await supabase.from('missions').select('*').in('id', missionIds)
  if (error) {
    console.error('[fetchMissionsById] 미션 조회 오류:', error.message)
    return map
  }
  const missions = (data ?? []) as unknown as FetchedMission[]

  // 숨김 보상 배지는 개수에도 넣지 않는다(티켓 20261019_1313 2회, 운영 로직 10.3절) — 카드가 «배지 N개»로 숨김 배지의 존재를 알리면 안 된다.
  // 보상 배지를 가진 미션이 있을 때만 한 번 더 읽는다. 읽지 못하면 어느 배지가 숨김인지 모르므로 보상 배지 개수를 싣지 않는다.
  // 삭제된 배지(deleted_at)도 일부러 거르지 않는다: 삭제된 숨김 배지의 id도 개수에 넣지 않아야 숨김 배지의 존재가 새지 않는다.
  const rewardIds = [...new Set(missions.flatMap((m) => m.reward_badge_ids ?? []))]
  let hiddenIds: ReadonlySet<string> = new Set()
  if (rewardIds.length > 0) {
    const { data: badgeRows, error: badgeError } = await supabase.from('badges').select('id, is_hidden').in('id', rewardIds)
    if (badgeError) {
      console.error('[fetchMissionsById] 보상 배지 숨김 조회 오류:', badgeError.message)
      hiddenIds = new Set(rewardIds)
    } else {
      hiddenIds = new Set(
        ((badgeRows ?? []) as { id: string; is_hidden?: boolean | null }[]).filter((b) => b.is_hidden === true).map((b) => b.id)
      )
    }
  }
  for (const m of missions) map.set(m.id, withoutHiddenRewardBadgeIds(m, hiddenIds))
  return map
}

/**
 * 컬렉션 이름과 아이템 수를 id 목록으로 한 번에 읽는다(컬렉션 한 개당 2번이 아니라 전체 2번).
 * 아이템 수는 컬렉션 목록 화면과 같은 기준(`computeBookCompletion`의 분모 — 드랍 제외 배지를 뺀 수)이다.
 * 공개된 컬렉션만 싣는다 — 비활성이거나 공개 시각(`valid_from`) 전인 컬렉션은 맵에 없어 이름·아이템 수가 카드에 실리지 않는다
 * (컬렉션 화면·목록 API와 같은 판정 `applyLaunchedItemBookFilter`, 티켓 20261001_1458). `nowIso`는 「지금」의 기준 시각이다.
 * 조회가 실패해도 카드 노출은 막지 않는다 — 이름을 못 읽으면 그 컬렉션은 빠지고, 수만 못 읽으면 `item_count`가 null이다.
 */
export async function fetchCollectionsById(
  supabase: ServiceClient,
  bookIds: string[],
  nowIso: string,
): Promise<Map<string, ResolvedCollection>> {
  const map = new Map<string, ResolvedCollection>()
  if (bookIds.length === 0) return map

  const [booksResult, badgesResult] = await Promise.all([
    applyLaunchedItemBookFilter(supabase.from('item_books').select('id, name, tier_mode').in('id', bookIds), nowIso),
    supabase
      .from('badges')
      .select('id, item_book_id, type, drop_excluded, name, rarity, deleted_at')
      .in('item_book_id', bookIds)
      .in('type', [...COMPLETION_BADGE_TYPES])
      .is('deleted_at', null),
  ])
  if (booksResult.error) {
    console.error('[fetchCollectionsById] 컬렉션 조회 오류:', booksResult.error.message)
    return map
  }

  const books = (booksResult.data ?? []) as { id: string; name: string; tier_mode?: boolean | null }[]
  let completionByBook: ReturnType<typeof computeBookCompletion> | null = null
  if (badgesResult.error) {
    console.error('[fetchCollectionsById] 컬렉션 아이템 조회 오류:', badgesResult.error.message)
  } else {
    // 분모만 쓰므로 분자는 비운다. 분모 규칙은 완성 판정 모듈이 정한다(티켓 20261016_2340 2회-나)
    completionByBook = computeBookCompletion((badgesResult.data ?? []) as CompletionBadgeInput[], new Set(), {
      tierModeBookIds: new Set(books.filter((b) => b.tier_mode).map((b) => b.id)),
    })
  }

  for (const book of books) {
    map.set(book.id, {
      name: book.name,
      item_count: completionByBook ? (completionByBook.get(book.id)?.total ?? 0) : null,
    })
  }
  return map
}

/**
 * 레시피 값을 읽어야 하는 카드인지 — 레시피 공개 카드(자원 `recipe`)이고 `recipe_id`가 있을 때. `recipe_id`가 비어 있으면(칼럼은 마이그레이션 217, 티켓 20261006_1218) 그 카드는
 * 레시피 줄 없이 그려진다. 자원 대응(`resourceOfTemplate`)을 따른다.
 */
export function resourceNeedsRecipe(card: TodayCardRow): boolean {
  return Boolean(card.recipe_id) && resourceOfTemplate(card.template_type) === 'recipe'
}

/** 레시피 값을 읽어야 하는 카드들의 레시피 id (중복 제거) */
export function recipeIdsToResolve(cards: TodayCardRow[]): string[] {
  return [...new Set(cards.filter(resourceNeedsRecipe).map((c) => c.recipe_id as string))]
}

/**
 * 읽어 온 레시피. 공개 전(`scheduled`)은 화면에 실을 값(재료 수·공개 시각)만 갖고 있다 — 슬롯 후보와 보상은 읽은 자리에서 버린다(사용자 결정 Q3).
 * 공개 뒤(`released`)만 슬롯별 후보 배지 id(`allowed_badge_ids` 순서 그대로)와 보상을 갖는다. 종료된 레시피는 맵에 없다.
 */
export type FetchedRecipe =
  | ResolvedScheduledRecipe
  | (Omit<ResolvedReleasedRecipe, 'tiles'> & {
      /** 슬롯 순서대로 슬롯마다 후보 배지 id */
      slot_candidates: string[][]
    })

/** 공개 뒤 레시피의 후보 배지 id 전부(배지 조회에 합친다). 공개 전 레시피의 후보는 읽지도 않으므로 여기 없다. */
export function recipeCandidateBadgeIds(recipes: ReadonlyMap<string, FetchedRecipe>): string[] {
  const ids: string[] = []
  for (const recipe of recipes.values()) {
    if (recipe.state === 'released') for (const candidates of recipe.slot_candidates) ids.push(...candidates)
  }
  return ids
}

/**
 * 레시피와 슬롯을 id 목록으로 한 번에 읽는다(레시피마다 읽으면 홈 한 번 로드에 N번 왕복한다). 레시피 읽기 한 번 + 슬롯 읽기 한 번이다.
 * 공개 상태는 믹스 화면·믹스 시도와 같은 판정 하나(`recipeReleaseState`, 기준 시각 `now`)로 가른다 — 종료된 레시피와 없는 레시피는 맵에 없다.
 * `valid_from`을 해석할 수 없으면 공개 전(fail-closed)이다.
 * 조회가 실패해도 카드 노출은 막지 않는다 — 실패하면 `console.error` 뒤 맵에서 빠지고 그 카드는 레시피 줄 없이 그려진다(`fetchCollectionsById`와 같은 방식).
 * 이 테이블은 RLS 정책이 없어 서비스 클라이언트로만 읽힌다. export하는 이유: 한 번에 읽는지(조회 횟수)를 시험이 확인한다.
 */
export async function fetchRecipesById(
  supabase: ServiceClient,
  recipeIds: string[],
  now: Date,
): Promise<Map<string, FetchedRecipe>> {
  const map = new Map<string, FetchedRecipe>()
  if (recipeIds.length === 0) return map

  const { data: recipeRows, error: recipesError } = await supabase
    .from('combination_recipes')
    .select('id, reward_points, reward_badge_ids, valid_from, valid_until')
    .in('id', recipeIds)
  if (recipesError) {
    console.error('[fetchRecipesById] 레시피 조회 오류:', recipesError.message)
    return map
  }

  const live = ((recipeRows ?? []) as RecipeRow[]).filter((r) => recipeReleaseState(r, now) !== 'ended')
  if (live.length === 0) return map

  const { data: slotRows, error: slotsError } = await supabase
    .from('combination_recipe_slots')
    .select('recipe_id, slot_order, allowed_badge_ids')
    .in(
      'recipe_id',
      live.map((r) => r.id),
    )
  if (slotsError) {
    console.error('[fetchRecipesById] 레시피 슬롯 조회 오류:', slotsError.message)
    return map
  }

  // 슬롯 순서는 여기서 정한다(`slot_order` 오름차순). 읽은 순서에 기대지 않는다.
  const slotsByRecipe = new Map<string, SlotRow[]>()
  for (const slot of (slotRows ?? []) as SlotRow[]) {
    const list = slotsByRecipe.get(slot.recipe_id) ?? []
    list.push(slot)
    slotsByRecipe.set(slot.recipe_id, list)
  }

  for (const recipe of live) {
    const slots = (slotsByRecipe.get(recipe.id) ?? []).sort((a, b) => a.slot_order - b.slot_order)
    if (recipeReleaseState(recipe, now) === 'scheduled') {
      // 공개 전: 재료 수와 공개 시각만 남긴다. 슬롯 후보·보상은 버린다.
      map.set(recipe.id, { state: 'scheduled', ingredient_count: slots.length, release_at: recipe.valid_from as string })
      continue
    }
    map.set(recipe.id, {
      state: 'released',
      ingredient_count: slots.length,
      reward_points: recipe.reward_points ?? 0,
      reward_badge_count: recipe.reward_badge_ids?.length ?? 0,
      slot_candidates: slots.map((s) => s.allowed_badge_ids ?? []),
    })
  }
  return map
}

type RecipeRow = {
  id: string
  reward_points: number | null
  reward_badge_ids: string[] | null
  valid_from: string | null
  valid_until: string | null
}

type SlotRow = { recipe_id: string; slot_order: number; allowed_badge_ids: string[] | null }

/**
 * 읽어 온 레시피를 카드에 실을 값으로 바꾼다. 공개 전은 그대로, 공개 뒤는 슬롯마다 대표 후보 하나를 타일로 고른다(후보를 펼치지 않는다):
 * 유저가 가진 후보가 있으면 `allowed_badge_ids` 순서로 그 첫 번째(`earned: true`), 없으면 삭제되지 않은 첫 번째 후보(`earned: false`)다.
 * 보유 여부는 `fetchBadgesById`의 판정(활동·체크인·인벤토리 아이템 3원)을 그대로 쓴다. 후보가 전부 삭제된 슬롯은 타일만 빠지고 재료 수에는 든다.
 * 레시피를 읽지 못했으면(`undefined`) null이다.
 */
export function toResolvedRecipe(
  recipe: FetchedRecipe | undefined,
  badgesById: ReadonlyMap<string, ResolvedBadge>,
): ResolvedRecipe | null {
  if (!recipe) return null
  if (recipe.state === 'scheduled') return recipe

  const tiles: ResolvedBadge[] = []
  for (const candidateIds of recipe.slot_candidates) {
    const candidates = candidateIds.map((id) => badgesById.get(id)).filter((b): b is ResolvedBadge => Boolean(b))
    const representative = candidates.find((b) => b.earned === true) ?? candidates[0]
    if (representative) tiles.push(representative)
  }
  return {
    state: 'released',
    ingredient_count: recipe.ingredient_count,
    reward_points: recipe.reward_points,
    reward_badge_count: recipe.reward_badge_count,
    tiles,
  }
}

/**
 * mission_spotlight 카드 중 유저에게 노출하면 안 되는 미션(완료/잠금/숨김)을 제외한다.
 * 판정은 미션 목록·상세·참가 API와 동일한 `resolveMissionVisibility`를 쓴다 (티켓 20260825_028).
 * mission_id가 없는 카드(/missions 목록으로 이동)는 그대로 둔다.
 *
 * 미션 행은 호출부가 미리 읽어 넘긴다(`fetchMissionsById`) — 표시 데이터용 조회와 같은 읽기를 쓰기 위해서다.
 */
async function filterMissionSpotlightCards(
  userId: string,
  cards: TodayCardRow[],
  missionsById: ReadonlyMap<string, FetchedMission>,
): Promise<TodayCardRow[]> {
  const missionIds = [...new Set(
    cards
      .filter((c) => c.template_type === 'mission_spotlight' && c.mission_id)
      .map((c) => c.mission_id as string)
  )]
  if (missionIds.length === 0) return cards

  const missions = missionIds.map((id) => missionsById.get(id)).filter((m): m is FetchedMission => Boolean(m))
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
