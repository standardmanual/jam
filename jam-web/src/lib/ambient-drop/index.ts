/**
 * 앰비언트 POI 드랍 엔진 — 3축(카테고리/등급비율/대상컬렉션) 배치 실행
 *
 * 활동 트리거 없이, 어드민이 설정한 축에 따라 시스템이 POI에 아이템배지를 직접 놓아둔다.
 * 유저 간 드랍(poi_drops.source='user')과 같은 테이블을 쓰되 source='system'으로 구분한다.
 * - 만료 없음 (poi_drops.expires_at = NULL, poi_drops_source_consistency CHECK로 강제)
 * - 일련번호: 픽업 시 assign_random_serial() 트리거가 50,001~999,999로 제한(마이그레이션 044)
 * - 커버리지 계산 없음 — 실행마다 batch_size개를 그때그때 배치하는 배치 실행형 모델
 *   (구 ambient_drop_policy의 "전역 상시 커버리지 목표치" 모델과 다름 — 티켓 20260826_009)
 *
 * 로직 문서: docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md §3.12
 */
import { createServiceClient } from '@/lib/supabase/server'
import { logEngineDecision } from '@/lib/engine-log'
import { fetchAllRows } from '@/lib/notifications/batch/shared'
import { applyDroppableItemBookFilter } from '@/lib/itembook/visibility'
import type { AmbientDropConfig } from './config'
import { getAmbientDropConfig } from './config'
import { resolveAmbientTargetCollections } from './collectionTarget'
import { distributePoiSlots, placeAmbientDrops } from './placement'
import {
  fallbackPickBadge,
  pickRandom,
  randomRarityDistribution,
  weightedPickRarity,
  type RarityDistribution,
} from './rarity'
import type { BadgeRarity } from '@/types/database'

export type AmbientDropTrigger = 'cron' | 'manual' | 'scheduled'

export type AmbientDropSkipReason =
  | 'auto_disabled'
  | 'no_eligible_collection'
  | 'no_eligible_poi'
  | 'no_candidate_badges'
  | 'insert_failed'

export interface AmbientDropBatchResult {
  trigger: AmbientDropTrigger
  ranAt: string
  /** null = 전체 카테고리 대상 */
  effectiveCategorySlug: string | null
  /**
   * 빈 배열 = 전체 컬렉션 대상. 이때도 후보 배지는 노출 중 컬렉션으로 좁혀진다.
   * 단 `reason`이 `no_eligible_collection`이면 대상이 없어 드랍하지 않은 실행이다
   */
  effectiveCollectionIds: string[]
  /** 설정에는 있었지만 노출 중이 아니거나 드랍 제외라 뺀 컬렉션 id(없으면 필드 없음) */
  excludedCollectionIds?: string[]
  effectiveRarityDistribution: RarityDistribution
  eligiblePoiCount: number
  spawned: number
  reason?: AmbientDropSkipReason
}

/** 배치 1회 실행 — 카테고리/등급비율/대상컬렉션을 config·all_random에 따라 확정한 뒤 배치한다 */
export async function runAmbientDropBatch(trigger: AmbientDropTrigger): Promise<AmbientDropBatchResult> {
  const supabase = createServiceClient()
  const config = await getAmbientDropConfig()
  const ranAt = new Date().toISOString()

  const useRandomCategory = config.all_random || config.category_mode === 'random'
  const useRandomRarity = config.all_random || config.rarity_mode === 'random'
  const useRandomCollection = config.all_random || config.collection_mode === 'random'

  // ── 축 1: 카테고리 ──────────────────────────────────────────
  let effectiveCategorySlug: string | null
  if (useRandomCategory) {
    // 공용 fetchAllRows는 에러 시 예외를 던지므로 .then/.catch로 흡수해 기존 그레이스풀
    // 폴백(에러 시 console.error 후 빈 배열로 계속 진행)을 유지한다 — drop-engine/index.ts와 동일 패턴.
    const { data: categories, error: categoriesError } = await fetchAllRows<{ slug: string }>(
      'poi_categories',
      'slug',
      () => supabase.from('poi_categories').select('slug')
    )
      .then((data) => ({ data, error: null as { message: string } | null }))
      .catch((err: unknown) => ({
        data: [] as { slug: string }[],
        error: { message: err instanceof Error ? err.message : String(err) },
      }))
    if (categoriesError) console.error('[ambient-drop] poi_categories 조회 오류:', categoriesError)
    effectiveCategorySlug = pickRandom(categories.map((c) => c.slug))
  } else {
    effectiveCategorySlug = config.category_slug
  }

  // ── 축 2: 등급 비율 ─────────────────────────────────────────
  const effectiveRarityDistribution: RarityDistribution = useRandomRarity
    ? randomRarityDistribution()
    : {
        common: config.rarity_common,
        rare: config.rarity_rare,
        epic: config.rarity_epic,
        mystic: config.rarity_mystic,
      }

  // ── 축 3: 대상 컬렉션 ───────────────────────────────────────
  // 드랍 대상은 노출 중 컬렉션(is_active + 노출 기간 안)뿐이다 — 공개 전·기간이 끝난 컬렉션에는 드랍하지
  // 않는다(티켓 20260930_1516, 판정은 lib/itembook/visibility.ts). 드랍 제외(`drop_excluded`) 컬렉션도 활동 드랍
  // (`fetchDropStructure`)처럼 뺀다(티켓 20261005_1957) — 이 조건은 완성 판정이 함께 쓰는 노출 판정이 아니라
  // 드랍 후보에만 거는 것이라 공용 필터(`applyDroppableItemBookFilter`)에 넣지 않고 여기서 더한다.
  // 조회가 실패하면 대상이 없는 것으로 보고 건너뛴다 — 빈 배열이 「전체 컬렉션」으로 읽혀 넓어지는 것을 막는다.
  const { data: droppableBooks, error: booksError } = await fetchAllRows<{ id: string }>(
    'item_books',
    'id',
    () => applyDroppableItemBookFilter(supabase.from('item_books').select('id'), ranAt).eq('drop_excluded', false)
  )
    .then((data) => ({ data, error: null as { message: string } | null }))
    .catch((err: unknown) => ({
      data: [] as { id: string }[],
      error: { message: err instanceof Error ? err.message : String(err) },
    }))
  if (booksError) console.error('[ambient-drop] item_books 조회 오류:', booksError)

  const target = resolveAmbientTargetCollections({
    useRandom: useRandomCollection,
    configIds: config.collection_ids,
    droppableIds: droppableBooks.map((b) => b.id),
    pick: pickRandom,
  })
  const { effectiveCollectionIds, restrictToCollectionIds } = target

  const baseResult = {
    trigger,
    ranAt,
    effectiveCategorySlug,
    effectiveCollectionIds,
    ...(target.excludedCollectionIds.length > 0 ? { excludedCollectionIds: target.excludedCollectionIds } : {}),
    effectiveRarityDistribution,
  }

  if (target.reason) {
    const result: AmbientDropBatchResult = { ...baseResult, eligiblePoiCount: 0, spawned: 0, reason: target.reason }
    await logAmbientBatchResult(result, booksError ? '노출 중 컬렉션 조회 실패' : undefined)
    return result
  }

  // ── 대상 POI 조회 (카테고리 필터, "전체"면 무필터) ─────────────
  // 20260830_1620: is_active=false(운영 종료 지점)는 시스템이 새로 배치할 대상에서 제외한다.
  // 이미 배치돼 있던 시스템 드랍(source='system')은 건드리지 않는다 — 소급 회수하지 않음.
  const { data: poiRows, error: poiRowsError } = await fetchAllRows<{ id: string }>('poi', 'id', () => {
    let q = supabase.from('poi').select('id').eq('is_active', true)
    if (effectiveCategorySlug) q = q.eq('category', effectiveCategorySlug)
    return q
  })
    .then((data) => ({ data, error: null as { message: string } | null }))
    .catch((err: unknown) => ({
      data: [] as { id: string }[],
      error: { message: err instanceof Error ? err.message : String(err) },
    }))
  if (poiRowsError) console.error('[ambient-drop] poi 조회 오류:', poiRowsError)
  const allPoiIds = poiRows.map((p) => p.id)

  if (allPoiIds.length === 0) {
    const result: AmbientDropBatchResult = { ...baseResult, eligiblePoiCount: 0, spawned: 0, reason: 'no_eligible_poi' }
    await logAmbientBatchResult(result)
    return result
  }

  // ── 현재 활성 시스템 드랍 카운트 (POI별 — max_active_per_poi 초과분 배제) ──
  // poi_id는 이 집계 자체가 POI별 카운트라 중복이 정상 — 유니크 tie-break가 아니다.
  // poi_drops의 실제 PK는 id(migrations/004_phase7_user_drops.sql:5)이므로 select에 포함시켜
  // orderBy: 'id'로 안정 정렬한다(select에 없는 컬럼으로 정렬하면 안정 정렬이 보장되지 않는다).
  const { data: activeRows, error: activeRowsError } = await fetchAllRows<{ poi_id: string; id: string }>(
    'poi_drops(active system)',
    'id',
    () => supabase.from('poi_drops').select('poi_id, id').eq('source', 'system').eq('is_available', true)
  )
    .then((data) => ({ data, error: null as { message: string } | null }))
    .catch((err: unknown) => ({
      data: [] as { poi_id: string; id: string }[],
      error: { message: err instanceof Error ? err.message : String(err) },
    }))
  if (activeRowsError) console.error('[ambient-drop] poi_drops(active system) 조회 오류:', activeRowsError)
  const activeByPoi = new Map<string, number>()
  for (const row of activeRows) {
    activeByPoi.set(row.poi_id, (activeByPoi.get(row.poi_id) ?? 0) + 1)
  }

  const candidatePoiIds = allPoiIds.filter((id) => (activeByPoi.get(id) ?? 0) < config.max_active_per_poi)

  if (candidatePoiIds.length === 0) {
    const result: AmbientDropBatchResult = {
      ...baseResult,
      eligiblePoiCount: 0,
      spawned: 0,
      reason: 'no_eligible_poi',
    }
    await logAmbientBatchResult(result)
    return result
  }

  // ── 후보 배지 로드 (item 타입 + 컬렉션 소속 + 활성 + 드랍 제외 아님 + 유효기간, rarity별로 분류) ──
  // rarity는 nullable이다(무한레벨형, 마이그레이션 130). 아이템 배지에는 무한레벨형이 없지만
  // 타입은 열려 있으므로 아래 루프에서 명시적으로 걸러낸다 — 조용히 common으로 떨어뜨리지 않는다.
  type CandidateBadgeRow = { id: string; rarity: BadgeRarity | null; valid_from: string | null; valid_until: string | null }
  const { data: badgeRows, error: badgeRowsError } = await fetchAllRows<CandidateBadgeRow>(
    'badges(item)',
    'id',
    () => {
      let q = supabase
        .from('badges')
        .select('id, rarity, valid_from, valid_until')
        .eq('type', 'item')
        .is('deleted_at', null)
        .eq('drop_excluded', false)
        .not('item_book_id', 'is', null)
      if (effectiveCollectionIds.length > 0) q = q.in('item_book_id', effectiveCollectionIds)
      // 「전체」 설정은 effectiveCollectionIds가 비어 있어도 노출 중 컬렉션의 배지로만 좁힌다
      if (restrictToCollectionIds) q = q.in('item_book_id', restrictToCollectionIds)
      return q
    }
  )
    .then((data) => ({ data, error: null as { message: string } | null }))
    .catch((err: unknown) => ({
      data: [] as CandidateBadgeRow[],
      error: { message: err instanceof Error ? err.message : String(err) },
    }))
  if (badgeRowsError) console.error('[ambient-drop] badges(item) 조회 오류:', badgeRowsError)

  const now = ranAt
  const badgesByRarity: Record<BadgeRarity, { id: string }[]> = { common: [], rare: [], epic: [], mystic: [] }
  for (const b of badgeRows) {
    if (b.valid_from && b.valid_from > now) continue
    if (b.valid_until && b.valid_until < now) continue
    if (!b.rarity) continue  // 등급 없는 배지(무한레벨형)는 등급별 드랍 테이블에 자리가 없다
    badgesByRarity[b.rarity].push({ id: b.id })
  }
  const totalCandidates = Object.values(badgesByRarity).reduce((sum, arr) => sum + arr.length, 0)

  if (totalCandidates === 0) {
    const result: AmbientDropBatchResult = {
      ...baseResult,
      eligiblePoiCount: candidatePoiIds.length,
      spawned: 0,
      reason: 'no_candidate_badges',
    }
    await logAmbientBatchResult(result)
    return result
  }

  // ── 배치 생성 — 활성 드랍 0개인 POI를 우선 분산 배치 (발견 경험 분산, 구 엔진과 동일 원칙) ──
  // 자리 분산은 날짜 예약(scheduleRun)과 같은 함수를 쓴다(placement.ts, 티켓 20261001_2051).
  const poiSlots = distributePoiSlots({
    candidatePoiIds,
    activeByPoi,
    maxActivePerPoi: config.max_active_per_poi,
    count: config.batch_size,
    pick: pickRandom,
  })
  const inserts: { poi_id: string; badge_id: string }[] = []
  for (const poiId of poiSlots) {
    const rarity = weightedPickRarity(effectiveRarityDistribution)
    const badge = fallbackPickBadge(badgesByRarity, rarity)
    if (!badge) break // 후보 배지 자체가 없음(이론상 totalCandidates>0 체크로 도달하지 않음)

    inserts.push({ poi_id: poiId, badge_id: badge.id })
  }

  if (inserts.length === 0) {
    const result: AmbientDropBatchResult = {
      ...baseResult,
      eligiblePoiCount: candidatePoiIds.length,
      spawned: 0,
      reason: 'no_candidate_badges',
    }
    await logAmbientBatchResult(result)
    return result
  }

  // 20260829_2101: 개체 정체성 모델 — 선발급+poi_drops 연결+Minted 기록을 RPC 1건으로 원자 처리한다.
  // 근거와 실패 처리는 placement.ts `placeAmbientDrops`에 있다(날짜 예약과 공용, 티켓 20261001_2051).
  const { spawned: spawnedDrops } = await placeAmbientDrops(supabase, inserts)

  if (spawnedDrops.length === 0) {
    const result: AmbientDropBatchResult = {
      ...baseResult,
      eligiblePoiCount: candidatePoiIds.length,
      spawned: 0,
      reason: 'insert_failed',
    }
    await logAmbientBatchResult(result, '개체 선발급+배치 전부 실패')
    return result
  }

  const result: AmbientDropBatchResult = {
    ...baseResult,
    eligiblePoiCount: candidatePoiIds.length,
    spawned: spawnedDrops.length,
  }
  await logAmbientBatchResult(result)
  return result
}

/** 배치 결과를 `engine_decision_log`에 남긴다. 정기 배포와 날짜 예약(scheduleRun)이 같은 이벤트를 쓴다 */
export async function logAmbientBatchResult(result: object, error?: string): Promise<void> {
  await logEngineDecision('drop', 'ambient_batch_result', null, { ...(result as Record<string, unknown>), error })
}

export type { AmbientDropConfig }
