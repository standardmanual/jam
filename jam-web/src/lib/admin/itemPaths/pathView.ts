/**
 * 컬렉션별 획득 경로 화면의 보기 모델 — 순수 함수 (티켓 20261022_1136 2회, 운영 로직 19.2절, 어드민 PRD 5-10절)
 *
 * 얻을 길 계산(`computeItemPaths`)의 결과를 화면이 그리기 좋은 모양으로 바꾼다. DB를 읽지 않고 서버 전용 모듈도 가져오지 않는다(타입만 가져온다).
 * 이름은 `loadPathNames.ts`가 읽어 온 것을 받는다. 판정은 계산 쪽이 이미 끝냈으므로 여기서 길의 열림·닫힘을 다시 따지지 않는다.
 *
 * - 컬렉션은 막힘(`blocked`) 아이템이 많은 순서이고, 같으면 컬렉션 ID 순서다. 한 쪽은 10개다.
 * - 한 컬렉션 안의 아이템은 막힘 → 드랍 제외 → 열림 순서이고, 같은 상태끼리는 이름 순서다(막힌 것을 먼저 찾으려는 화면이다).
 * - 길 다섯 개(`PATH_KEYS`)를 아이템마다 «열린 길»과 «닫힌 길(사유)»로 나눈다. 잠긴 채 받는 모습(`lock`)은 길이 아니라 그대로 싣는다.
 */
import type {
  CollectionPathSummary,
  ComputeItemPathsResult,
  ItemLockInfo,
  ItemPathReason,
  ItemPathResult,
  ItemPathStatus,
} from './types'
import { rarityTier } from '@/lib/rarity'
import type { BadgeRarity } from '@/types/database'

/** 화면에 보이는 길 다섯 개 — 이 순서로 보인다 */
export const PATH_KEYS = ['drop', 'mix', 'mission', 'syncCapsule', 'tierUp'] as const
export type PathKey = (typeof PATH_KEYS)[number]

/** 한 쪽에 싣는 컬렉션 수 */
export const COLLECTION_PATHS_PAGE_SIZE = 10

/** 밸런스 지표 화면의 탭 — 기본은 지표 */
export const DASHBOARD_TABS = ['metrics', 'paths'] as const
export type DashboardTab = (typeof DASHBOARD_TABS)[number]

/** `?tab=` 값을 읽는다. `paths`만 획득 경로이고 없거나 모르는 값은 지표다 */
export function parseDashboardTab(raw: string | undefined): DashboardTab {
  return raw === 'paths' ? 'paths' : 'metrics'
}

/** `?page=` 값을 읽는다. 1 이상의 정수 문자열이 아니면 1쪽이다 */
export function parsePageParam(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return 1
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 1 ? value : 1
}

/** 이름을 읽어 온 결과 — 못 찾은 이름은 맵에 없다 */
export interface PathNames {
  collections: ReadonlyMap<string, string>
  items: ReadonlyMap<string, string>
}

export interface ClosedPath {
  path: PathKey
  /** 닫힌 까닭 — 계산이 정한 사유 상수 그대로(문구는 화면의 `PathReasonLabels`가 만든다) */
  reasons: ItemPathReason[]
}

export interface ItemPathRow {
  itemId: string
  /** 이름을 못 읽었으면 null */
  name: string | null
  /** 같은 이름이 등급마다 하나씩 있어서 줄을 구분하려고 싣는다(등급이 없으면 null) */
  rarity: BadgeRarity | null
  status: ItemPathStatus
  /** 열려 있는 길 — `PATH_KEYS` 순서 */
  openPaths: PathKey[]
  /** 닫힌 길과 사유 — `PATH_KEYS` 순서 */
  closedPaths: ClosedPath[]
  /** 잠긴 채 받는 모습 */
  lock: ItemLockInfo
}

export interface CollectionPathView {
  collectionId: string
  /** 이름을 못 읽었으면 null */
  name: string | null
  total: number
  open: number
  blocked: number
  dropExcluded: number
  items: ItemPathRow[]
}

export interface CollectionPageInfo {
  /** 실제로 보이는 쪽(범위를 벗어난 요청은 마지막 쪽으로 맞춘다) */
  page: number
  totalPages: number
  /** 전체 컬렉션 수 */
  total: number
  /** 이 쪽에 보일 컬렉션 ID — 막힘 많은 순 */
  collectionIds: string[]
}

/** 막힘 아이템이 많은 컬렉션부터, 같으면 컬렉션 ID 순서 */
export function sortCollectionsByBlocked(summaries: readonly CollectionPathSummary[]): CollectionPathSummary[] {
  return [...summaries].sort((a, b) => b.blocked - a.blocked || (a.collectionId < b.collectionId ? -1 : a.collectionId > b.collectionId ? 1 : 0))
}

/** 요청한 쪽의 컬렉션 ID를 고른다. 컬렉션이 없어도 1쪽이 있다(빈 쪽) */
export function pickCollectionPage(
  summaries: readonly CollectionPathSummary[],
  requestedPage: number,
  pageSize: number = COLLECTION_PATHS_PAGE_SIZE,
): CollectionPageInfo {
  const sorted = sortCollectionsByBlocked(summaries)
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  const start = (page - 1) * pageSize
  return {
    page,
    totalPages,
    total: sorted.length,
    collectionIds: sorted.slice(start, start + pageSize).map((summary) => summary.collectionId),
  }
}

const PATH_RESULT: Record<PathKey, (result: ItemPathResult) => { open: boolean; reasons: readonly ItemPathReason[] }> = {
  drop: (result) => result.drop,
  mix: (result) => result.mix,
  mission: (result) => result.mission,
  syncCapsule: (result) => result.syncCapsule,
  tierUp: (result) => result.tierUp,
}

/** 아이템 한 줄 — 길 다섯 개를 열린 길과 닫힌 길로 나눈다 */
export function itemPathRowOf(result: ItemPathResult, name: string | null): ItemPathRow {
  const openPaths: PathKey[] = []
  const closedPaths: ClosedPath[] = []
  for (const path of PATH_KEYS) {
    const state = PATH_RESULT[path](result)
    if (state.open) openPaths.push(path)
    else closedPaths.push({ path, reasons: [...state.reasons] })
  }
  return { itemId: result.itemId, name, rarity: result.rarity, status: result.status, openPaths, closedPaths, lock: result.lock }
}

const STATUS_ORDER: Record<ItemPathStatus, number> = { blocked: 0, drop_excluded: 1, open: 2 }

/** 막힘 → 드랍 제외 → 열림, 같은 상태끼리는 이름(모르면 뒤) → 같은 이름이면 낮은 등급부터 → 아이템 ID 순서 */
function compareRows(a: ItemPathRow, b: ItemPathRow): number {
  const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  if (byStatus !== 0) return byStatus
  if (a.name !== b.name) {
    if (a.name === null) return 1
    if (b.name === null) return -1
    const byName = a.name.localeCompare(b.name, 'ko')
    if (byName !== 0) return byName
  }
  const byRarity = rarityTier(a.rarity) - rarityTier(b.rarity)
  if (byRarity !== 0) return byRarity
  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0
}

/** 고른 컬렉션의 보기 모델 — `collectionIds` 순서를 지킨다. 계산 결과에 없는 컬렉션은 건너뛴다 */
export function buildCollectionPathViews(
  computed: ComputeItemPathsResult,
  collectionIds: readonly string[],
  names: PathNames,
): CollectionPathView[] {
  const summaryById = new Map(computed.collections.map((summary) => [summary.collectionId, summary]))
  const itemsByCollection = new Map<string, ItemPathResult[]>()
  for (const result of computed.items) {
    const list = itemsByCollection.get(result.collectionId)
    if (list) list.push(result)
    else itemsByCollection.set(result.collectionId, [result])
  }

  const views: CollectionPathView[] = []
  for (const collectionId of collectionIds) {
    const summary = summaryById.get(collectionId)
    if (!summary) continue
    const items = (itemsByCollection.get(collectionId) ?? [])
      .map((result) => itemPathRowOf(result, names.items.get(result.itemId) ?? null))
      .sort(compareRows)
    views.push({
      collectionId,
      name: names.collections.get(collectionId) ?? null,
      total: summary.total,
      open: summary.open,
      blocked: summary.blocked,
      dropExcluded: summary.dropExcluded,
      items,
    })
  }
  return views
}

/** 이 쪽에 보일 컬렉션과 그 아이템의 ID — 이름을 필요한 만큼만 읽으려고 쓴다 */
export function idsOnPage(
  computed: ComputeItemPathsResult,
  collectionIds: readonly string[],
): { collectionIds: string[]; itemIds: string[] } {
  const onPage = new Set(collectionIds)
  return {
    collectionIds: [...collectionIds],
    itemIds: computed.items.filter((result) => onPage.has(result.collectionId)).map((result) => result.itemId),
  }
}
