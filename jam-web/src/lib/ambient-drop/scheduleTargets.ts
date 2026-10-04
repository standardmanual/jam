/**
 * 앰비언트 드랍 예약의 대상 읽기 — 등록(기준 = 예정 시각)과 실행(기준 = 실행 시각)이 같은 함수를 쓴다
 * (티켓 20261001_2051).
 *
 * 예약이 가리키는 지점·아이템·컬렉션 중 「그 시각에 놓을 수 있는 것」만 남기고, 걸린 것은 이유와 함께
 * `excluded`로 돌려준다. 판정은 정기 배포(`index.ts`)와 같은 조건이다.
 *
 * - 지점: 활성(`is_active`)인 지점. 활성 시스템 드랍 수를 함께 읽는다(겹침·한도 계산용)
 * - 아이템: `type='item'`, 삭제되지 않음, 컬렉션 소속, `valid_from <= 기준 <= valid_until`, 소속 컬렉션이 노출 중
 *   (`isItemBookDroppable`, 티켓 20260930_1516)
 * - 컬렉션: 노출 중인 것만(`applyDroppableItemBookFilter` + `resolveAmbientTargetCollections`)
 *
 * 등록 때는 「예정 시각」을 기준으로 미리 돌린다 — 지금은 공개 전이지만 예정 시각에 공개되는 컬렉션은
 * 통과하고, 예정 시각에 이미 기간이 끝난 컬렉션은 걸린다. 조회가 실패하면 던진다(호출부가 등록 500 또는
 * 실행 `failed`로 처리, fail-closed). 빈 결과를 「대상 없음」과 「전체」로 헷갈리지 않게 한다.
 *
 * 판정을 미룰 컬렉션(`options.deferredCollectionIds`, 티켓 20261004_2242): 운영툴이 연결로 채운 컬렉션은
 * 등록 시점에 아직 없거나 아이템이 비어 있을 수 있다(아이템은 공개 전에 채운다). 호출부가 그 ID를 넘기면
 * 그 컬렉션은 노출 중 판정과 후보 배지 읽기를 건너뛴다 — 예정 시각의 판정은 드랍 실행기가 같은 함수로
 * 다시 한다(실행기는 이 인자를 넘기지 않는다). 넘기지 않으면 동작이 이전과 같다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchAllRowsIn } from '@/lib/db/fetchAllRows'
import { applyDroppableItemBookFilter, isItemBookDroppable } from '@/lib/itembook/visibility'
import { resolveAmbientTargetCollections } from './collectionTarget'
import { pickRandom } from './rarity'
import type { AmbientDropSkipReason } from './index'
import type { AmbientDropScheduleSpec } from './scheduleSpec'
import type { BadgeRarity } from '@/types/database'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 대상에서 빠진 이유 */
export type ScheduleExcludeReason =
  | 'poi_not_found'
  | 'poi_inactive'
  | 'badge_not_found'
  | 'badge_not_item'
  | 'badge_deleted'
  | 'badge_without_collection'
  | 'badge_not_yet_valid'
  | 'badge_expired'
  | 'collection_not_exposed'

/** 결과 JSON(`ambient_drop_schedules.result`)에 그대로 실리므로 interface가 아니라 type으로 둔다 */
export type ScheduleExcluded = {
  id: string
  reason: ScheduleExcludeReason
}

export interface ScheduleTargetPoi {
  id: string
  /** 활성 시스템 드랍(`poi_drops.source='system'`, `is_available=true`) 수 */
  activeSystemCount: number
}

export interface ScheduleTargetBadge {
  id: string
  /** 등급 없는 배지(무한레벨형)는 null — 컬렉션 모드의 등급 추첨에서는 자리가 없어 빠진다 */
  rarity: BadgeRarity | null
  itemBookId: string
}

export interface ScheduleTargets {
  pois: ScheduleTargetPoi[]
  badgePool: ScheduleTargetBadge[]
  excluded: {
    pois: ScheduleExcluded[]
    badges: ScheduleExcluded[]
    collections: ScheduleExcluded[]
  }
  /** 이번 예약의 대상 컬렉션 id(컬렉션 모드는 노출 중인 선택분, 아이템 모드는 풀의 소속 컬렉션) */
  effectiveCollectionIds: string[]
  /** 있으면 놓을 수 있는 대상이 하나도 없다 */
  reason?: AmbientDropSkipReason
}

interface PoiRow {
  id: string
  is_active: boolean
}

interface ActiveDropRow {
  poi_id: string
  id: string
}

interface BadgeRow {
  id: string
  type: string
  rarity: BadgeRarity | null
  deleted_at: string | null
  item_book_id: string | null
  valid_from: string | null
  valid_until: string | null
}

interface BookRow {
  id: string
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
}

const BADGE_COLUMNS = 'id, type, rarity, deleted_at, item_book_id, valid_from, valid_until'

function validAt(b: { valid_from: string | null; valid_until: string | null }, atMs: number): 'ok' | 'not_yet' | 'expired' {
  if (b.valid_from && new Date(b.valid_from).getTime() > atMs) return 'not_yet'
  if (b.valid_until && new Date(b.valid_until).getTime() < atMs) return 'expired'
  return 'ok'
}

function countActiveByPoi(rows: ActiveDropRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.poi_id, (counts.get(row.poi_id) ?? 0) + 1)
  return counts
}

/** 지점 쪽 대상 — 지점 직접 선택이면 지정 id를, 종류+개수면 활성 지점 전체(종류 조건)를 읽는다 */
async function loadPoiTargets(
  supabase: ServiceClient,
  spec: AmbientDropScheduleSpec
): Promise<{ pois: ScheduleTargetPoi[]; excluded: ScheduleExcluded[] }> {
  if (spec.poiMode === 'list') {
    const rows = await fetchAllRowsIn<PoiRow, string>('poi(예약 지점)', 'id', spec.poiIds, (chunk) =>
      supabase.from('poi').select('id, is_active').in('id', chunk)
    )
    const byId = new Map(rows.map((r) => [r.id, r]))
    const excluded: ScheduleExcluded[] = []
    const eligibleIds: string[] = []
    for (const id of spec.poiIds) {
      const row = byId.get(id)
      if (!row) excluded.push({ id, reason: 'poi_not_found' })
      else if (!row.is_active) excluded.push({ id, reason: 'poi_inactive' })
      else eligibleIds.push(id)
    }
    if (eligibleIds.length === 0) return { pois: [], excluded }

    const active = await fetchAllRowsIn<ActiveDropRow, string>('poi_drops(active system)', 'id', eligibleIds, (chunk) =>
      supabase.from('poi_drops').select('poi_id, id').eq('source', 'system').eq('is_available', true).in('poi_id', chunk)
    )
    const counts = countActiveByPoi(active)
    return { pois: eligibleIds.map((id) => ({ id, activeSystemCount: counts.get(id) ?? 0 })), excluded }
  }

  // 종류+개수 — 정기 배포와 같은 조회(`index.ts`)
  const category = spec.poiCategory
  const poiRows = await fetchAllRows<{ id: string }>('poi', 'id', () => {
    let q = supabase.from('poi').select('id').eq('is_active', true)
    if (category) q = q.eq('category', category)
    return q
  })
  if (poiRows.length === 0) return { pois: [], excluded: [] }

  const active = await fetchAllRows<ActiveDropRow>('poi_drops(active system)', 'id', () =>
    supabase.from('poi_drops').select('poi_id, id').eq('source', 'system').eq('is_available', true)
  )
  const counts = countActiveByPoi(active)
  return { pois: poiRows.map((p) => ({ id: p.id, activeSystemCount: counts.get(p.id) ?? 0 })), excluded: [] }
}

interface ItemSide {
  badgePool: ScheduleTargetBadge[]
  excludedBadges: ScheduleExcluded[]
  excludedCollections: ScheduleExcluded[]
  effectiveCollectionIds: string[]
  reason?: AmbientDropSkipReason
}

/**
 * 아이템 쪽 대상 — 아이템 직접 선택이면 지정 배지를, 컬렉션 선택이면 노출 중 컬렉션의 배지를 읽는다.
 * `deferredIds`(소문자)에 든 컬렉션은 판정을 미룬다(컬렉션 선택일 때만 뜻이 있다).
 */
async function loadItemTargets(
  supabase: ServiceClient,
  spec: AmbientDropScheduleSpec,
  atIso: string,
  deferredIds: ReadonlySet<string>
): Promise<ItemSide> {
  const atMs = new Date(atIso).getTime()

  if (spec.itemMode === 'items') {
    const badgeRows = await fetchAllRowsIn<BadgeRow, string>('badges(예약 아이템)', 'id', spec.badgeIds, (chunk) =>
      supabase.from('badges').select(BADGE_COLUMNS).in('id', chunk)
    )
    const bookIds = [...new Set(badgeRows.map((b) => b.item_book_id).filter((id): id is string => !!id))]
    const bookRows = await fetchAllRowsIn<BookRow, string>('item_books(예약 아이템 소속)', 'id', bookIds, (chunk) =>
      supabase.from('item_books').select('id, is_active, valid_from, valid_until').in('id', chunk)
    )
    const bookById = new Map(bookRows.map((b) => [b.id, b]))
    const badgeById = new Map(badgeRows.map((b) => [b.id, b]))

    const pool: ScheduleTargetBadge[] = []
    const excluded: ScheduleExcluded[] = []
    for (const id of spec.badgeIds) {
      const b = badgeById.get(id)
      if (!b) {
        excluded.push({ id, reason: 'badge_not_found' })
        continue
      }
      if (b.type !== 'item') {
        excluded.push({ id, reason: 'badge_not_item' })
        continue
      }
      if (b.deleted_at !== null) {
        excluded.push({ id, reason: 'badge_deleted' })
        continue
      }
      if (!b.item_book_id) {
        excluded.push({ id, reason: 'badge_without_collection' })
        continue
      }
      const validity = validAt(b, atMs)
      if (validity !== 'ok') {
        excluded.push({ id, reason: validity === 'not_yet' ? 'badge_not_yet_valid' : 'badge_expired' })
        continue
      }
      const book = bookById.get(b.item_book_id)
      if (!book || !isItemBookDroppable(book, atIso)) {
        excluded.push({ id, reason: 'collection_not_exposed' })
        continue
      }
      pool.push({ id: b.id, rarity: b.rarity, itemBookId: b.item_book_id })
    }
    return {
      badgePool: pool,
      excludedBadges: excluded,
      excludedCollections: [],
      effectiveCollectionIds: [...new Set(pool.map((b) => b.itemBookId))],
      ...(pool.length === 0 ? { reason: 'no_candidate_badges' as const } : {}),
    }
  }

  // 컬렉션 선택 — 노출 중인 것만 남긴다(정기 배포의 explicit 모드와 같은 판정).
  // 판정을 미룬 컬렉션은 빼고 나머지만 판정한다. 남은 목록이 비면 조회하지 않는다 — 빈 목록은 「전체」로 읽힌다.
  const hasDeferred = spec.collectionIds.some((id) => deferredIds.has(id.toLowerCase()))
  const checkedIds = hasDeferred ? spec.collectionIds.filter((id) => !deferredIds.has(id.toLowerCase())) : spec.collectionIds
  if (hasDeferred && checkedIds.length === 0) {
    return { badgePool: [], excludedBadges: [], excludedCollections: [], effectiveCollectionIds: [] }
  }

  const droppableBooks = await fetchAllRowsIn<{ id: string }, string>('item_books(예약 컬렉션)', 'id', checkedIds, (chunk) =>
    applyDroppableItemBookFilter(supabase.from('item_books').select('id').in('id', chunk), atIso)
  )
  const target = resolveAmbientTargetCollections({
    useRandom: false,
    configIds: checkedIds,
    droppableIds: droppableBooks.map((b) => b.id),
    pick: pickRandom,
  })
  const excludedCollections = target.excludedCollectionIds.map((id) => ({
    id,
    reason: 'collection_not_exposed' as const,
  }))
  if (target.reason) {
    return {
      badgePool: [],
      excludedBadges: [],
      excludedCollections,
      effectiveCollectionIds: [],
      // 미룬 컬렉션이 있으면 노출 중 컬렉션이 예정 시각에 생길 수 있다 — 직접 적은 컬렉션이 걸린 사실은 excluded로 남는다
      ...(hasDeferred ? {} : { reason: target.reason }),
    }
  }

  const kept = target.effectiveCollectionIds
  const badgeRows = await fetchAllRowsIn<BadgeRow, string>('badges(예약 컬렉션 아이템)', 'id', kept, (chunk) =>
    supabase
      .from('badges')
      .select(BADGE_COLUMNS)
      .eq('type', 'item')
      .is('deleted_at', null)
      .not('item_book_id', 'is', null)
      .in('item_book_id', chunk)
  )
  const pool: ScheduleTargetBadge[] = []
  for (const b of badgeRows) {
    if (!b.item_book_id) continue
    if (validAt(b, atMs) !== 'ok') continue
    pool.push({ id: b.id, rarity: b.rarity, itemBookId: b.item_book_id })
  }
  return {
    badgePool: pool,
    excludedBadges: [],
    excludedCollections,
    effectiveCollectionIds: kept,
    // 후보 풀이 비어도 미룬 컬렉션이 예정 시각에 아이템을 채울 수 있어 막지 않는다
    ...(pool.length === 0 && !hasDeferred ? { reason: 'no_candidate_badges' as const } : {}),
  }
}

/** 대상 읽기의 선택 인자. 넘기지 않으면 모든 컬렉션을 `atIso` 기준으로 판정한다 */
export interface LoadScheduleTargetsOptions {
  /**
   * 판정을 예정 시각으로 미룰 컬렉션 ID(운영툴이 연결로 채운 컬렉션, 티켓 20261004_2242). 소문자·대문자 모두 받는다.
   * 이 ID는 노출 중 판정과 후보 배지 읽기를 건너뛴다. 미룬 컬렉션이 하나라도 있으면 「노출 중인 컬렉션 없음」과
   * 「후보 배지 없음」은 내지 않는다(예정 시각에 그 컬렉션에서 생길 수 있다). 직접 적은 컬렉션이 노출 중이
   * 아니면 지금처럼 `excluded.collections`에 담긴다. 지점 쪽 판정은 그대로다.
   */
  deferredCollectionIds?: readonly string[]
}

/**
 * 예약 내용(`spec`)에서 `atIso` 시각에 놓을 수 있는 대상을 읽는다.
 * 사유 우선순위는 정기 배포와 같다: 컬렉션 → 지점 → 후보 배지.
 */
export async function loadScheduleTargets(
  supabase: ServiceClient,
  spec: AmbientDropScheduleSpec,
  atIso: string,
  options: LoadScheduleTargetsOptions = {}
): Promise<ScheduleTargets> {
  const deferredIds = new Set((options.deferredCollectionIds ?? []).map((id) => id.toLowerCase()))
  const [poiSide, itemSide] = await Promise.all([
    loadPoiTargets(supabase, spec),
    loadItemTargets(supabase, spec, atIso, deferredIds),
  ])

  let reason: AmbientDropSkipReason | undefined
  if (itemSide.reason === 'no_eligible_collection') reason = 'no_eligible_collection'
  else if (poiSide.pois.length === 0) reason = 'no_eligible_poi'
  else if (itemSide.reason) reason = itemSide.reason

  return {
    pois: poiSide.pois,
    badgePool: itemSide.badgePool,
    excluded: {
      pois: poiSide.excluded,
      badges: itemSide.excludedBadges,
      collections: itemSide.excludedCollections,
    },
    effectiveCollectionIds: itemSide.effectiveCollectionIds,
    ...(reason ? { reason } : {}),
  }
}

/** 대상에서 빠진 이유의 한국어 이름(셀 수 있는 명사구) — 등록 거절 문장과 결과 화면이 함께 쓴다 */
export const SCHEDULE_EXCLUDE_REASON_LABEL: Record<ScheduleExcludeReason, string> = {
  poi_not_found: '찾을 수 없는 지점',
  poi_inactive: '운영이 끝난 지점',
  badge_not_found: '찾을 수 없는 아이템',
  badge_not_item: '아이템 배지가 아닌 배지',
  badge_deleted: '삭제된 아이템',
  badge_without_collection: '컬렉션에 속하지 않은 아이템',
  badge_not_yet_valid: '아직 유효하지 않은 아이템',
  badge_expired: '유효기간이 끝난 아이템',
  collection_not_exposed: '노출 중이 아닌 컬렉션',
}

/**
 * 등록·시각 수정 때 거절 사유를 한 문장으로 만든다. 걸린 대상이 하나라도 있거나 놓을 대상이 없으면 문장을,
 * 모두 통과하면 null을 돌려준다. 기준 시각은 호출부가 정한 「예정 시각」이다.
 */
export function describeScheduleTargetProblems(targets: ScheduleTargets): string | null {
  const counts = new Map<ScheduleExcludeReason, number>()
  for (const e of [...targets.excluded.pois, ...targets.excluded.badges, ...targets.excluded.collections]) {
    counts.set(e.reason, (counts.get(e.reason) ?? 0) + 1)
  }
  if (counts.size > 0) {
    const parts = [...counts.entries()].map(([reason, n]) => `${SCHEDULE_EXCLUDE_REASON_LABEL[reason]} ${n}건`)
    return `예정 시각에 놓을 수 없는 대상이 있어요(${parts.join(', ')}). 예약은 예정 시각의 상태로 확인해요. 해당 대상을 빼거나 시각을 바꿔서 다시 시도해 주세요.`
  }
  switch (targets.reason) {
    case 'no_eligible_collection':
      return '예정 시각에 노출 중인 컬렉션이 없어요. 공개 전이거나 기간이 끝난 컬렉션은 놓을 수 없어요. 컬렉션이나 시각을 바꿔서 다시 시도해 주세요.'
    case 'no_eligible_poi':
      return '놓을 수 있는 지점이 없어요. 선택한 종류에 운영 중인 지점이 없어요. 지점 종류를 바꿔서 다시 시도해 주세요.'
    case 'no_candidate_badges':
      return '놓을 수 있는 아이템이 없어요. 예정 시각에 유효한 아이템 배지가 없어요. 아이템이나 시각을 바꿔서 다시 시도해 주세요.'
    default:
      return null
  }
}
