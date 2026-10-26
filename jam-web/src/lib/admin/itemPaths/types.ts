/**
 * 컬렉션별 아이템 얻을 길 계산의 입력·결과 타입과 사유 상수 (티켓 20261004_1640, 상위 20260930_1503 ⑦a).
 *
 * 입력은 이미 읽어 온 행에서 판정에 필요한 컬럼만 추린 최소 형태다(DB 읽기는 이 모듈 밖, ⑦b가 한다).
 * 판정 자체는 기존 함수(`isItemBookDroppable`·`isRecipeReleased`·`isMissionActive`·`isMissionExposed`,
 * 동기화·캡슐과 등급 올리기는 `listIssueCandidates`·`issuableRaritiesByBook`)를 `compute.ts`가 그대로 다시 쓴다 — 여기에는 조건을 두지 않는다.
 */
import type { BadgeRarity, MissionExposureMode } from '@/types/database'

/**
 * 컬렉션(`item_books`) 행 — 노출 판정(`ItemBookVisibilityFields`)에 `drop_excluded`와 소속 트라이브(`tribe_id`)를 더한 것.
 * `drop-engine/syncIssue.ts`의 `IssueBook`과 같은 칸이라 그 함수에 그대로 넘긴다.
 */
export interface ItemPathCollectionInput {
  id: string
  /** 소속 트라이브 — 동기화·캡슐과 등급 올리기는 유저의 소속 트라이브 컬렉션만 푼다. 없으면 두 길이 닫힌다 */
  tribe_id: string | null
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  drop_excluded: boolean
}

/**
 * 아이템 배지(`badges`, type='item') 행 — 소프트 삭제된 행(`deleted_at`)은 계산 대상에서 뺀다.
 * `rarity`·`always_locked`·`unlock_required`를 더한 칸까지 `syncIssue.ts`의 `IssueBadge`와 같아 그 함수에 그대로 넘긴다.
 */
export interface ItemPathItemInput {
  id: string
  item_book_id: string | null
  deleted_at: string | null
  drop_excluded: boolean
  valid_from: string | null
  valid_until: string | null
  /** 등급 — 동기화·캡슐은 등급을 먼저 뽑고 그 등급의 후보에서 고르므로 등급이 없으면 나올 수 없다 */
  rarity: BadgeRarity | null
  /** 「잠김으로 만듦」 — 어느 길로 얻어도 잠긴 채 받는다(`drop-engine/lockAssignment.ts`) */
  always_locked: boolean
  /** 「여는 데 필요한 양」 — 정하지 않았으면 null이고, 그때는 등급 기본값을 쓴다 */
  unlock_required: number | null
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
  // 드랍 길 (동기화·캡슐과 등급 올리기도 같은 컬렉션·아이템 사유를 쓴다)
  collectionInactive: 'collection_inactive',
  collectionNotLaunched: 'collection_not_launched',
  collectionEnded: 'collection_ended',
  collectionDropExcluded: 'collection_drop_excluded',
  itemDropExcluded: 'item_drop_excluded',
  itemOutOfPeriod: 'item_out_of_period',
  // 동기화·캡슐 길 (그 밖의 사유는 위 드랍 길 사유를 그대로 쓴다)
  collectionNoTribe: 'collection_no_tribe',
  itemNoRarity: 'item_no_rarity',
  // 등급 올리기 길
  tierUpRarityPairMissing: 'tier_up_rarity_pair_missing',
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

/** 아이템 상태 — 열림(한 길이라도 열림) / 막힘(다섯 길 모두 닫힘) / 드랍 제외(제외 설정이고 다른 길이 없음) */
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

/** 동기화·캡슐 길 — 소속 트라이브 유저의 동기화 발급과 캡슐 열기가 같은 풀(`listIssueCandidates`)에서 고른다 */
export interface SyncCapsulePath {
  open: boolean
  /** 닫혔을 때만 채운다(열렸으면 빈 배열) */
  reasons: ItemPathReason[]
}

/** 등급 올리기 길 — 재료 등급 또는 그 바로 윗등급으로 이 아이템의 등급이 나오고, 컬렉션이 그 재료 등급으로 받을 수 있어야 열린다 */
export interface TierUpPath {
  open: boolean
  /** 닫혔을 때만 채운다(열렸으면 빈 배열). 아이템 자체가 발급 풀에 못 들면 동기화·캡슐 길과 같은 사유다 */
  reasons: ItemPathReason[]
}

/**
 * 받는 모습 — 길이 아니라 어느 길로 얻든 따라오는 성질이라 열림 판정에 쓰지 않는다.
 * 잠김으로 만든 아이템 배지는 잠긴 채 받고, 열 때 잼이 든다(`drop-engine/lockAssignment.ts`의 `badge_locked`).
 */
export interface ItemLockInfo {
  /** `badges.always_locked` */
  receivedLocked: boolean
  /** 배지에 정한 「여는 데 필요한 양」. 잠긴 채 받는데 정하지 않았으면 null이고 등급 기본값을 쓴다. 잠기지 않으면 늘 null */
  unlockRequired: number | null
}

export interface ItemPathResult {
  itemId: string
  collectionId: string
  /** 아이템 배지의 등급. 같은 이름이 등급마다 하나씩 있어서 화면이 줄을 구분하는 데 쓴다(없으면 null) */
  rarity: BadgeRarity | null
  status: ItemPathStatus
  drop: DropPath
  mix: MixPath
  mission: MissionPath
  syncCapsule: SyncCapsulePath
  tierUp: TierUpPath
  lock: ItemLockInfo
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
