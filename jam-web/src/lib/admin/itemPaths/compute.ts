/**
 * 컬렉션별 아이템 얻을 길 계산 — 순수 함수 (티켓 20261004_1640, 상위 20260930_1503 ⑦a, 동기화·캡슐·등급 올리기 길은 티켓 20261022_1136 2회).
 *
 * 이미 읽어 온 컬렉션·아이템·레시피·미션 행과 기준 시각을 받아, 아이템마다 드랍·믹스·미션·동기화와 캡슐·등급 올리기 다섯 길이 열려
 * 있는지 계산한다. DB를 읽지 않는다(읽기·API는 ⑦b, 「획득 경로가 막힌 컬렉션」 신호는 ⑧이 이 함수를 쓴다).
 *
 * 판정은 기존 함수를 그대로 다시 쓴다. 조건을 새로 베껴 쓰지 않는다.
 *
 * | 길 | 판정에 쓰는 기존 함수·조건 |
 * |---|---|
 * | 드랍 | 컬렉션: `isItemBookDroppable`(노출 중) + `drop_excluded` 아님. 아이템: 삭제 안 됨·`drop_excluded` 아님·유효기간 안 |
 * | 믹스 | `isRecipeReleased`로 공개 중인 레시피의 `reward_badge_ids`에 그 아이템이 있다 |
 * | 미션 | `isMissionExposed`(노출) 그리고 `isMissionActive`(진행 중)인 미션의 `reward_badge_ids`에 그 아이템이 있다 |
 * | 동기화·캡슐 | `drop-engine/syncIssue.ts`의 `listIssueCandidates`(안에서 `isIssuableBook`)가 그 아이템을 후보로 돌려준다. 컬렉션의 `tribe_id`가 그 풀의 트라이브다 |
 * | 등급 올리기 | 위 동기화·캡슐 길이 열려 있고, 컬렉션이 `combine/tierUpCollections.ts`의 `issuableRaritiesByBook`과 `combine/tierUpOdds.ts`의 `collectionSupportsTierUp`으로 그 등급이 나올 재료 등급을 받는다 |
 *
 * ## 드랍 길과 동기화·캡슐 길은 무엇이 같고 다른가
 *
 * - 같은 점: 컬렉션이 활성이고 공개 기간 안, 컬렉션과 아이템이 `drop_excluded`가 아님, 아이템이 삭제되지 않고 유효기간 안이다. 닫힌 사유도 같은 상수를 쓴다.
 * - 다른 점 1: 동기화와 캡슐은 **유저의 소속 트라이브 컬렉션**에서만 고른다. 이 계산의 드랍 길은 트라이브를 보지 않는다. 그래서 `tribe_id`가 없는 컬렉션은
 *   동기화·캡슐이 닫히고(`collection_no_tribe`) 드랍 길만 남을 수 있다.
 * - 다른 점 2: 동기화와 캡슐은 등급을 먼저 뽑고 **그 등급의 아이템 중에서** 고른다. 등급이 없는 아이템은 나올 수 없다(`item_no_rarity`).
 * - 그 결과 지금 정의에서는 동기화·캡슐이 열린 아이템은 드랍 길도 늘 열려 있다(동기화·캡슐 ⊂ 드랍). 새 길은 아이템의 상태(열림/막힘/드랍 제외)를 바꾸지 않고
 *   「어느 길로 얻는가」를 보이게 한다. 이 포함 관계는 시험이 격자로 지킨다(드랍 길 정의가 바뀌면 그때 상태가 달라질 수 있다).
 * - 누적 조건(`condition_json`)과 보너스 굴림 같은 확률·정책 값은 읽지 않는다. 뽑힐 수 있는지(가용성)만 본다.
 *
 * ## 등급 올리기 길
 *
 * 결과 등급은 재료 등급 그대로 또는 바로 위 등급이다(`combine/tierUp.ts`). 재료가 될 수 있는 등급은 Common·Rare·Epic이라 결과로 나올 수 있는 등급은 Common부터 Mystic까지다
 * (Common은 Common 재료의 «같은 등급» 결과). 어떤 아이템의 등급이 어떤 재료 등급(M)의 결과로 나올 수 있고, 컬렉션에서 지금 나올 수 있는 등급이 M과 M의 바로 윗등급을
 * 모두 갖고 있으면 열린다(믹스 화면 목록과 서버의 `invalid_collection` 검사가 같은 `collectionSupportsTierUp`을 쓴다). 윗등급 확률(`tier_up_probability`)은 읽지 않는다 —
 * 0이나 1로 정하면 한쪽 결과가 안 나오지만 그건 가용성이 아니라 확률 설정이다.
 *
 * ## 잠긴 배지 (길이 아니다)
 *
 * 잠김으로 만든 아이템 배지(`always_locked`)는 어느 길로 얻어도 잠긴 채 받는다(`drop-engine/lockAssignment.ts`). 가용성이 아니라 «얻는 모습»이라 열림 판정에 더하지 않고
 * 결과의 `lock`에만 싣는다. 필요한 양(`unlock_required`)은 배지에 정한 값만 싣고, 없으면 null(등급 기본값)이다. 정책 표(`locked_min_*`)는 읽지 않는다.
 *
 * ## 그 밖의 규칙
 *
 * - 드랍 길은 활동 드랍 또는 앰비언트 드랍으로 보고, 누적 조건(`condition_json`)은 보지 않는다.
 * - 어드민 직접 지급·컬렉션 완성 보상은 길로 세지 않는다. 선착순 미션이 다 찬 경우도 이번에는 세지 않는다(열림).
 * - 경계는 각 기존 함수를 따른다: 레시피 종료 시각은 빼고(`<`), 컬렉션 종료 시각은 포함한다(`<=`).
 * - 아이템 유효기간은 전용 판정 함수가 없고 활동 드랍이 `valid_from > now`·`valid_until < now`로
 *   직접 거른다. 같은 경계(시작·종료 포함)를 가진 `isItemBookDroppable`에 `is_active: true`로 넘겨 다시 쓴다.
 * - 소프트 삭제된 아이템(`deleted_at`)은 결과에서 뺀다 — 드랍 쿼리가 `deleted_at IS NULL`로 거르는 것과 같다.
 */
import { isItemBookDroppable, isItemBookLaunched } from '@/lib/itembook/visibility'
import { recipeReleaseState } from '@/lib/combine/visibility'
import { issuableRaritiesByBook } from '@/lib/combine/tierUpCollections'
import { TIER_UP_MATERIAL_RARITIES, collectionSupportsTierUp, tierUpUpperRarity } from '@/lib/combine/tierUpOdds'
import { listIssueCandidates } from '@/lib/drop-engine/syncIssue'
import { isMissionExposed } from '@/lib/missions/visibility'
import { isMissionActive } from '@/lib/missions/checker'
import type { BadgeRarity } from '@/types/database'
import {
  ITEM_PATH_REASONS as R,
  type CollectionPathSummary,
  type ComputeItemPathsInput,
  type ComputeItemPathsResult,
  type DropPath,
  type ItemLockInfo,
  type ItemPathCollectionInput,
  type ItemPathItemInput,
  type ItemPathMissionInput,
  type ItemPathReason,
  type ItemPathRecipeInput,
  type ItemPathResult,
  type ItemPathStatus,
  type MissionPath,
  type MixPath,
  type SyncCapsulePath,
  type TierUpPath,
} from './types'

/** 배열에서 중복을 없애고 처음 나온 순서를 지킨다 */
function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

/**
 * 컬렉션과 아이템의 «풀에 드는가» 닫힘 사유 — 컬렉션 공개·기간, 컬렉션·아이템 드랍 제외, 아이템 유효기간.
 * 드랍 길과 동기화·캡슐·등급 올리기 길이 같은 사유 목록을 쓴다(위 머리 주석의 «같은 점»).
 */
function poolClosedReasons(
  collection: ItemPathCollectionInput,
  item: ItemPathItemInput,
  nowIso: string,
): ItemPathReason[] {
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

  return reasons
}

/** 드랍 길 — 컬렉션과 아이템 양쪽 조건이 모두 맞아야 열린다 */
function computeDropPath(
  collection: ItemPathCollectionInput,
  item: ItemPathItemInput,
  nowIso: string,
): DropPath {
  const reasons = poolClosedReasons(collection, item, nowIso)
  return { open: reasons.length === 0, reasons }
}

/**
 * 동기화·캡슐 길 — 소속 트라이브 유저의 발급 풀(`listIssueCandidates`)에 이 아이템이 드는가.
 * 열림은 그 함수가 정한다. 닫혔을 때의 사유만 «풀에 드는가» 사유에 트라이브·등급 사유를 더해 만든다.
 */
function computeSyncCapsulePath(
  collection: ItemPathCollectionInput,
  item: ItemPathItemInput,
  now: Date,
  nowIso: string,
): SyncCapsulePath {
  const tribeId = collection.tribe_id
  if (tribeId && item.rarity) {
    const candidates = listIssueCandidates({ tribeId, rarity: item.rarity, books: [collection], badges: [item], now })
    if (candidates.length > 0) return { open: true, reasons: [] }
  }
  const reasons = poolClosedReasons(collection, item, nowIso)
  if (!tribeId) reasons.push(R.collectionNoTribe)
  if (!item.rarity) reasons.push(R.itemNoRarity)
  return { open: false, reasons }
}

/**
 * 등급 올리기의 결과로 이 등급이 나올 수 있는가 — 재료 등급(M)마다 결과는 M 또는 M의 바로 윗등급이고,
 * 컬렉션이 M으로 받을 수 있어야(`collectionSupportsTierUp`: M과 바로 윗등급이 모두 나올 수 있음) 한다.
 */
function tierUpReachable(rarity: BadgeRarity, collectionRarities: ReadonlySet<BadgeRarity>): boolean {
  const available = [...collectionRarities]
  return TIER_UP_MATERIAL_RARITIES.some(
    (material) =>
      (rarity === material || rarity === tierUpUpperRarity(material)) && collectionSupportsTierUp(available, material),
  )
}

/** 등급 올리기 길 — 아이템이 발급 풀에 들고(동기화·캡슐 길이 열림) 컬렉션이 그 등급을 낼 재료 등급을 받아야 열린다 */
function computeTierUpPath(
  syncCapsule: SyncCapsulePath,
  item: ItemPathItemInput,
  collectionRarities: ReadonlySet<BadgeRarity>,
): TierUpPath {
  if (!syncCapsule.open || !item.rarity) return { open: false, reasons: syncCapsule.reasons }
  if (tierUpReachable(item.rarity, collectionRarities)) return { open: true, reasons: [] }
  return { open: false, reasons: [R.tierUpRarityPairMissing] }
}

/** 받는 모습 — 필요한 양은 양의 정수로 정한 값만 인정한다(`lockAssignment.resolveUnlockRequired`와 같은 기준, 시험이 둘을 맞춰 본다) */
export function lockInfoOf(item: Pick<ItemPathItemInput, 'always_locked' | 'unlock_required'>): ItemLockInfo {
  if (!item.always_locked) return { receivedLocked: false, unlockRequired: null }
  const value = item.unlock_required
  return { receivedLocked: true, unlockRequired: value !== null && Number.isInteger(value) && value >= 1 ? value : null }
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
 * 다섯 길이 모두 닫혔을 때, 컬렉션 또는 아이템이 `drop_excluded`이면 `drop_excluded`(다른 길이 없는 드랍 제외),
 * 아니면 `blocked`. 동기화·캡슐과 등급 올리기도 `drop_excluded`를 거르므로 제외 여부는 드랍 길 사유로 본다.
 */
export function classifyItem(
  paths: {
    drop: Pick<DropPath, 'open' | 'reasons'>
    mix: Pick<MixPath, 'open'>
    mission: Pick<MissionPath, 'open'>
    syncCapsule: Pick<SyncCapsulePath, 'open'>
    tierUp: Pick<TierUpPath, 'open'>
  },
): ItemPathStatus {
  if (paths.drop.open || paths.mix.open || paths.mission.open || paths.syncCapsule.open || paths.tierUp.open) return 'open'
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

/**
 * 컬렉션마다 «지금 동기화·캡슐로 나올 수 있는 등급» — 등급 올리기 길이 쓴다. 소속 트라이브가 없는 컬렉션은 맵에 없다.
 * 믹스 화면의 목록과 서버가 쓰는 `issuableRaritiesByBook`을 컬렉션 하나씩 그대로 부른다.
 */
function issuableRaritiesOf(
  collections: readonly ItemPathCollectionInput[],
  items: readonly ItemPathItemInput[],
  now: Date,
): Map<string, Set<BadgeRarity>> {
  const itemsByBook = new Map<string, ItemPathItemInput[]>()
  for (const item of items) {
    if (item.deleted_at !== null || item.item_book_id === null) continue
    const list = itemsByBook.get(item.item_book_id)
    if (list) list.push(item)
    else itemsByBook.set(item.item_book_id, [item])
  }
  const result = new Map<string, Set<BadgeRarity>>()
  for (const collection of collections) {
    if (!collection.tribe_id) continue
    const rarities = issuableRaritiesByBook({
      tribeId: collection.tribe_id,
      books: [collection],
      badges: itemsByBook.get(collection.id) ?? [],
      now,
    }).get(collection.id)
    if (rarities) result.set(collection.id, rarities)
  }
  return result
}

/** 컬렉션별 아이템 얻을 길 계산. 입력 컬렉션에 속하지 않는 아이템과 소프트 삭제된 아이템은 결과에 없다 */
export function computeItemPaths(input: ComputeItemPathsInput): ComputeItemPathsResult {
  const { collections, items, recipes, missions, now } = input
  const nowIso = now.toISOString()

  const collectionById = new Map(collections.map((c) => [c.id, c]))
  const raritiesByCollection = issuableRaritiesOf(collections, items, now)
  const recipesByBadge = indexByRewardBadge(recipes)
  const missionsByBadge = indexByRewardBadge(missions)

  const results: ItemPathResult[] = []
  for (const item of items) {
    if (item.deleted_at !== null) continue
    const collection = item.item_book_id ? collectionById.get(item.item_book_id) : undefined
    if (!collection) continue

    const drop = computeDropPath(collection, item, nowIso)
    const syncCapsule = computeSyncCapsulePath(collection, item, now, nowIso)
    const tierUp = computeTierUpPath(syncCapsule, item, raritiesByCollection.get(collection.id) ?? new Set())

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
      rarity: item.rarity,
      status: classifyItem({ drop, mix, mission, syncCapsule, tierUp }),
      drop,
      mix,
      mission,
      syncCapsule,
      tierUp,
      lock: lockInfoOf(item),
    })
  }

  return {
    items: results,
    collections: collections.map((c) => summarizeCollection(c.id, results)),
  }
}
