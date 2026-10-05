/**
 * 컬렉션별 아이템 얻을 길 계산 — 순수 함수 (티켓 20261004_1640, 상위 20260930_1503 ⑦a·Q5).
 *
 * 이미 읽어 온 컬렉션·아이템·레시피·미션 행과 기준 시각을 받아, 아이템마다 드랍·믹스·미션 세 길이 열려
 * 있는지 계산한다. DB를 읽지 않는다(읽기·API는 ⑦b, 「획득 경로가 막힌 컬렉션」 신호는 ⑧이 이 함수를 쓴다).
 *
 * 판정은 기존 함수를 그대로 다시 쓴다. 조건을 새로 베껴 쓰지 않는다.
 *
 * | 길 | 판정에 쓰는 기존 함수·조건 |
 * |---|---|
 * | 드랍 | 컬렉션: `isItemBookDroppable`(노출 중) + `drop_excluded` 아님. 아이템: 삭제 안 됨·`drop_excluded` 아님·유효기간 안 — `fetchDropStructure`와 같은 조건 |
 * | 믹스 | `isRecipeReleased`로 공개 중인 레시피의 `reward_badge_ids`에 그 아이템이 있다 |
 * | 미션 | `isMissionExposed`(노출) 그리고 `isMissionActive`(진행 중)인 미션의 `reward_badge_ids`에 그 아이템이 있다 |
 *
 * - 드랍 길은 활동 드랍 또는 앰비언트 드랍으로 보고, 누적 조건(`condition_json`)은 보지 않는다.
 * - 어드민 직접 지급·컬렉션 완성 보상은 길로 세지 않는다. 선착순 미션이 다 찬 경우도 이번에는 세지 않는다(열림).
 * - 경계는 각 기존 함수를 따른다: 레시피 종료 시각은 빼고(`<`), 컬렉션 종료 시각은 포함한다(`<=`).
 * - 아이템 유효기간은 전용 판정 함수가 없고 `fetchDropStructure`가 `valid_from > now`·`valid_until < now`로
 *   직접 거른다. 같은 경계(시작·종료 포함)를 가진 `isItemBookDroppable`에 `is_active: true`로 넘겨 다시 쓴다.
 * - 소프트 삭제된 아이템(`deleted_at`)은 결과에서 뺀다 — 드랍 쿼리가 `deleted_at IS NULL`로 거르는 것과 같다.
 */
import { isItemBookDroppable, isItemBookLaunched } from '@/lib/itembook/visibility'
import { recipeReleaseState } from '@/lib/combine/visibility'
import { isMissionExposed } from '@/lib/missions/visibility'
import { isMissionActive } from '@/lib/missions/checker'
import {
  ITEM_PATH_REASONS as R,
  type CollectionPathSummary,
  type ComputeItemPathsInput,
  type ComputeItemPathsResult,
  type DropPath,
  type ItemPathCollectionInput,
  type ItemPathItemInput,
  type ItemPathMissionInput,
  type ItemPathReason,
  type ItemPathRecipeInput,
  type ItemPathResult,
  type ItemPathStatus,
  type MissionPath,
  type MixPath,
} from './types'

/** 배열에서 중복을 없애고 처음 나온 순서를 지킨다 */
function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

/** 드랍 길 — 컬렉션과 아이템 양쪽 조건이 모두 맞아야 열린다 */
function computeDropPath(
  collection: ItemPathCollectionInput,
  item: ItemPathItemInput,
  nowIso: string,
): DropPath {
  const reasons: ItemPathReason[] = []

  if (!isItemBookDroppable(collection, nowIso)) {
    if (!collection.is_active) reasons.push(R.collectionInactive)
    else if (!isItemBookLaunched(collection, nowIso)) reasons.push(R.collectionNotLaunched)
    else reasons.push(R.collectionEnded)
  }
  if (collection.drop_excluded) reasons.push(R.collectionDropExcluded)
  if (item.drop_excluded) reasons.push(R.itemDropExcluded)
  if (!isItemBookDroppable({ is_active: true, valid_from: item.valid_from, valid_until: item.valid_until }, nowIso)) {
    reasons.push(R.itemOutOfPeriod)
  }

  return { open: reasons.length === 0, reasons }
}

/** 레시피 닫힘 사유 — 공개 전 / 종료 */
function recipeClosedReason(recipe: ItemPathRecipeInput, now: Date): ItemPathReason | null {
  const state = recipeReleaseState(recipe, now)
  if (state === 'released') return null
  return state === 'scheduled' ? R.recipeScheduled : R.recipeEnded
}

/** 미션 닫힘 사유 — 노출 판정이 먼저, 그다음 진행 판정(어드민 수동 노출 제어가 앞선 레이어다) */
function missionClosedReason(mission: ItemPathMissionInput, now: Date): ItemPathReason | null {
  if (!isMissionExposed(mission, now)) {
    // 노출 방식마다 닫힌 까닭이 다르다 — 숨김 / 노출 시각 전 / 시작일 전
    const mode = mission.exposure_mode ?? 'start_date'
    if (mode === 'hidden') return R.missionHidden
    return mode === 'scheduled' ? R.missionNotExposed : R.missionNotStarted
  }
  if (!isMissionActive(mission, now)) {
    return new Date(mission.starts_at) > now ? R.missionNotStarted : R.missionEnded
  }
  return null
}

/** 보상 배지 ID → 그 배지를 주는 행 목록 색인. 한 행에 같은 배지가 두 번 들어 있어도 한 번만 담는다 */
function indexByRewardBadge<T extends { id: string; reward_badge_ids: string[] | null }>(
  rows: readonly T[],
): Map<string, T[]> {
  const index = new Map<string, T[]>()
  for (const row of rows) {
    for (const badgeId of unique(row.reward_badge_ids ?? [])) {
      const list = index.get(badgeId)
      if (list) list.push(row)
      else index.set(badgeId, [row])
    }
  }
  return index
}

/**
 * 아이템 상태 분류 — 한 길이라도 열려 있으면 `open`.
 * 세 길이 모두 닫혔을 때, 컬렉션 또는 아이템이 `drop_excluded`이면 `drop_excluded`(다른 길이 없는 드랍 제외),
 * 아니면 `blocked`.
 */
export function classifyItem(
  paths: { drop: Pick<DropPath, 'open' | 'reasons'>; mix: Pick<MixPath, 'open'>; mission: Pick<MissionPath, 'open'> },
): ItemPathStatus {
  if (paths.drop.open || paths.mix.open || paths.mission.open) return 'open'
  const excluded =
    paths.drop.reasons.includes(R.collectionDropExcluded) || paths.drop.reasons.includes(R.itemDropExcluded)
  return excluded ? 'drop_excluded' : 'blocked'
}

/** 컬렉션 한 곳의 아이템 상태별 개수 */
export function summarizeCollection(
  collectionId: string,
  results: readonly Pick<ItemPathResult, 'collectionId' | 'status'>[],
): CollectionPathSummary {
  const summary: CollectionPathSummary = { collectionId, total: 0, open: 0, blocked: 0, dropExcluded: 0 }
  for (const r of results) {
    if (r.collectionId !== collectionId) continue
    summary.total += 1
    if (r.status === 'open') summary.open += 1
    else if (r.status === 'blocked') summary.blocked += 1
    else summary.dropExcluded += 1
  }
  return summary
}

/** 컬렉션별 아이템 얻을 길 계산. 입력 컬렉션에 속하지 않는 아이템과 소프트 삭제된 아이템은 결과에 없다 */
export function computeItemPaths(input: ComputeItemPathsInput): ComputeItemPathsResult {
  const { collections, items, recipes, missions, now } = input
  const nowIso = now.toISOString()

  const collectionById = new Map(collections.map((c) => [c.id, c]))
  const recipesByBadge = indexByRewardBadge(recipes)
  const missionsByBadge = indexByRewardBadge(missions)

  const results: ItemPathResult[] = []
  for (const item of items) {
    if (item.deleted_at !== null) continue
    const collection = item.item_book_id ? collectionById.get(item.item_book_id) : undefined
    if (!collection) continue

    const drop = computeDropPath(collection, item, nowIso)

    const recipesOfItem = recipesByBadge.get(item.id) ?? []
    const openRecipeIds: string[] = []
    const mixReasons: ItemPathReason[] = []
    for (const recipe of recipesOfItem) {
      const reason = recipeClosedReason(recipe, now)
      if (reason === null) openRecipeIds.push(recipe.id)
      else mixReasons.push(reason)
    }
    const mix: MixPath = {
      open: openRecipeIds.length > 0,
      recipeIds: openRecipeIds,
      reasons: openRecipeIds.length > 0 ? [] : recipesOfItem.length === 0 ? [R.noRecipe] : unique(mixReasons),
    }

    const missionsOfItem = missionsByBadge.get(item.id) ?? []
    const openMissionIds: string[] = []
    const missionReasons: ItemPathReason[] = []
    for (const mission of missionsOfItem) {
      const reason = missionClosedReason(mission, now)
      if (reason === null) openMissionIds.push(mission.id)
      else missionReasons.push(reason)
    }
    const mission: MissionPath = {
      open: openMissionIds.length > 0,
      missionIds: openMissionIds,
      reasons:
        openMissionIds.length > 0 ? [] : missionsOfItem.length === 0 ? [R.noMission] : unique(missionReasons),
    }

    results.push({
      itemId: item.id,
      collectionId: collection.id,
      status: classifyItem({ drop, mix, mission }),
      drop,
      mix,
      mission,
    })
  }

  return {
    items: results,
    collections: collections.map((c) => summarizeCollection(c.id, results)),
  }
}
