/**
 * 컬렉션별 아이템 얻을 길 계산의 입력·결과 타입과 사유 상수 (티켓 20261004_1640, 상위 20260930_1503 ⑦a).
 *
 * 입력은 이미 읽어 온 행에서 판정에 필요한 컬럼만 추린 최소 형태다(DB 읽기는 이 모듈 밖, ⑦b가 한다).
 * 판정 자체는 기존 함수(`isItemBookDroppable`·`isRecipeReleased`·`isMissionActive`·`isMissionExposed`)를
 * `compute.ts`가 그대로 다시 쓴다 — 여기에는 조건을 두지 않는다.
 */
import type { MissionExposureMode } from '@/types/database'

/** 컬렉션(`item_books`) 행 — 노출 판정(`ItemBookVisibilityFields`)에 `drop_excluded`를 더한 것 */
export interface ItemPathCollectionInput {
  id: string
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  drop_excluded: boolean
}

/** 아이템 배지(`badges`, type='item') 행 — 소프트 삭제된 행(`deleted_at`)은 계산 대상에서 뺀다 */
export interface ItemPathItemInput {
  id: string
  item_book_id: string | null
  deleted_at: string | null
  drop_excluded: boolean
  valid_from: string | null
  valid_until: string | null
}

/** 믹스 레시피(`combination_recipes`) 행 */
export interface ItemPathRecipeInput {
  id: string
  reward_badge_ids: string[] | null
  valid_from: string | null
  valid_until: string | null
}

/** 미션(`missions`) 행 */
export interface ItemPathMissionInput {
  id: string
  reward_badge_ids: string[] | null
  starts_at: string
  ends_at: string | null
  exposure_mode: MissionExposureMode | null | undefined
  exposure_at: string | null | undefined
}

/** 길이 닫힌 사유 */
export const ITEM_PATH_REASONS = {
  // 드랍 길
  collectionInactive: 'collection_inactive',
  collectionNotLaunched: 'collection_not_launched',
  collectionEnded: 'collection_ended',
  collectionDropExcluded: 'collection_drop_excluded',
  itemDropExcluded: 'item_drop_excluded',
  itemOutOfPeriod: 'item_out_of_period',
  // 믹스 길
  noRecipe: 'no_recipe',
  recipeScheduled: 'recipe_scheduled',
  recipeEnded: 'recipe_ended',
  // 미션 길
  noMission: 'no_mission',
  missionHidden: 'mission_hidden',
  missionNotExposed: 'mission_not_exposed',
  missionNotStarted: 'mission_not_started',
  missionEnded: 'mission_ended',
} as const

export type ItemPathReason = (typeof ITEM_PATH_REASONS)[keyof typeof ITEM_PATH_REASONS]

/** 아이템 상태 — 열림(한 길이라도 열림) / 막힘(세 길 모두 닫힘) / 드랍 제외(제외 설정이고 다른 길이 없음) */
export type ItemPathStatus = 'open' | 'blocked' | 'drop_excluded'

/** 드랍 길 — 활동 드랍 또는 앰비언트 드랍으로 본다(누적 조건은 보지 않는다) */
export interface DropPath {
  open: boolean
  /** 닫혔을 때만 채운다(열렸으면 빈 배열) */
  reasons: ItemPathReason[]
}

/** 믹스 길 */
export interface MixPath {
  open: boolean
  /** 이 아이템을 보상으로 주는 공개 중 레시피 ID — 중복 없음, 입력 순서 */
  recipeIds: string[]
  /** 닫혔을 때만 채운다. 이 아이템을 보상으로 주지만 공개 중이 아닌 레시피가 있으면 그 사유도 담는다 */
  reasons: ItemPathReason[]
}

/** 미션 길 */
export interface MissionPath {
  open: boolean
  /** 이 아이템을 보상으로 주는 진행 중·노출 중 미션 ID — 중복 없음, 입력 순서 */
  missionIds: string[]
  reasons: ItemPathReason[]
}

export interface ItemPathResult {
  itemId: string
  collectionId: string
  status: ItemPathStatus
  drop: DropPath
  mix: MixPath
  mission: MissionPath
}

export interface CollectionPathSummary {
  collectionId: string
  /** 컬렉션에 속한(삭제되지 않은) 아이템 수 */
  total: number
  open: number
  blocked: number
  dropExcluded: number
}

export interface ComputeItemPathsInput {
  collections: readonly ItemPathCollectionInput[]
  items: readonly ItemPathItemInput[]
  recipes: readonly ItemPathRecipeInput[]
  missions: readonly ItemPathMissionInput[]
  /** 「지금」의 기준 시각 — 호출하는 쪽이 정해 넘긴다 */
  now: Date
}

export interface ComputeItemPathsResult {
  items: ItemPathResult[]
  collections: CollectionPathSummary[]
}
