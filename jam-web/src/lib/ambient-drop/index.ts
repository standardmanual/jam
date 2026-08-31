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
 * 로직 문서: Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md §3.12
 */
import { createServiceClient } from '@/lib/supabase/server'
import { logEngineDecision } from '@/lib/engine-log'
import { fetchAllRows } from '@/lib/notifications/batch/shared'
import type { AmbientDropConfig } from './config'
import { getAmbientDropConfig } from './config'
import {
  fallbackPickBadge,
  pickRandom,
  randomRarityDistribution,
  weightedPickRarity,
  type RarityDistribution,
} from './rarity'
import type { BadgeRarity } from '@/types/database'

export type AmbientDropTrigger = 'cron' | 'manual'

export type AmbientDropSkipReason =
  | 'auto_disabled'
  | 'no_eligible_poi'
  | 'no_candidate_badges'
  | 'insert_failed'

export interface AmbientDropBatchResult {
  trigger: AmbientDropTrigger
  ranAt: string
  /** null = 전체 카테고리 대상 */
  effectiveCategorySlug: string | null
  /** 빈 배열 = 전체 컬렉션 대상 */
  effectiveCollectionIds: string[]
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
  let effectiveCollectionIds: string[]
  if (useRandomCollection) {
    const { data: books, error: booksError } = await fetchAllRows<{ id: string }>(
      'item_books',
      'id',
      () => supabase.from('item_books').select('id').eq('is_active', true)
    )
      .then((data) => ({ data, error: null as { message: string } | null }))
      .catch((err: unknown) => ({
        data: [] as { id: string }[],
        error: { message: err instanceof Error ? err.message : String(err) },
      }))
    if (booksError) console.error('[ambient-drop] item_books 조회 오류:', booksError)
    const picked = pickRandom(books.map((b) => b.id))
    effectiveCollectionIds = picked ? [picked] : []
  } else {
    effectiveCollectionIds = config.collection_ids
  }

  const baseResult = {
    trigger,
    ranAt,
    effectiveCategorySlug,
    effectiveCollectionIds,
    effectiveRarityDistribution,
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
    await logResult(result)
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
    await logResult(result)
    return result
  }

  // ── 후보 배지 로드 (item 타입 + 컬렉션 소속 + 활성 + 유효기간, rarity별로 분류) ──
  type CandidateBadgeRow = { id: string; rarity: BadgeRarity; valid_from: string | null; valid_until: string | null }
  const { data: badgeRows, error: badgeRowsError } = await fetchAllRows<CandidateBadgeRow>(
    'badges(item)',
    'id',
    () => {
      let q = supabase
        .from('badges')
        .select('id, rarity, valid_from, valid_until')
        .eq('type', 'item')
        .is('deleted_at', null)
        .not('item_book_id', 'is', null)
      if (effectiveCollectionIds.length > 0) q = q.in('item_book_id', effectiveCollectionIds)
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
    await logResult(result)
    return result
  }

  // ── 배치 생성 — 활성 드랍 0개인 POI를 우선 분산 배치 (발견 경험 분산, 구 엔진과 동일 원칙) ──
  const inserts: { poi_id: string; badge_id: string }[] = []
  const localActiveByPoi = new Map(activeByPoi)

  for (let i = 0; i < config.batch_size; i++) {
    const zeroPois = candidatePoiIds.filter((id) => (localActiveByPoi.get(id) ?? 0) === 0)
    const pool =
      zeroPois.length > 0
        ? zeroPois
        : candidatePoiIds.filter((id) => (localActiveByPoi.get(id) ?? 0) < config.max_active_per_poi)
    const poiId = pickRandom(pool)
    if (!poiId) break // 배치 가능한 POI 슬롯 소진

    const rarity = weightedPickRarity(effectiveRarityDistribution)
    const badge = fallbackPickBadge(badgesByRarity, rarity)
    if (!badge) break // 후보 배지 자체가 없음(이론상 totalCandidates>0 체크로 도달하지 않음)

    inserts.push({ poi_id: poiId, badge_id: badge.id })
    localActiveByPoi.set(poiId, (localActiveByPoi.get(poiId) ?? 0) + 1)
  }

  if (inserts.length === 0) {
    const result: AmbientDropBatchResult = {
      ...baseResult,
      eligiblePoiCount: candidatePoiIds.length,
      spawned: 0,
      reason: 'no_candidate_badges',
    }
    await logResult(result)
    return result
  }

  // 20260829_2101: 개체 정체성 모델 — 일련번호가 확정되는 시점은 정확히 ①드랍엔진 직접지급
  // ②시스템(앰비언트) 드랍이 POI에 "배치되는 순간" 둘뿐이다. 이후 픽업은 소유권 이전일 뿐
  // 재발급이 아니므로, poi_drops row를 만들기 "전"에 InventoryItem을 먼저 선발급(pre-mint)
  // 한다 — 기존에는 pickup_drop() RPC가 픽업 시점에 새 row를 INSERT해 새 일련번호를
  // 부여했었다(의도와 반대 동작). obtained_by='ambient_drop'은 assign_random_serial()
  // 트리거가 일련번호 범위(50,001~999,999)를 판별하는 값이기도 하다(migrations/108).
  //
  // 게이트 리뷰 지적(2026-08-29): 선발급(개별 INSERT)과 poi_drops 배치 INSERT를 애플리케이션
  // 레벨에서 분리 실행하면, 배치 INSERT가 통째로 실패할 때 이미 발급된 inventory_items가
  // 어디에도 연결되지 못한 채 영구 고아로 남는다(일련번호 점유, custody_events 없음).
  // mint_and_place_ambient_drop() RPC로 개체 1건 단위(선발급+poi_drops 연결+Minted 기록)를
  // 원자적 트랜잭션으로 묶어 이 문제를 해소한다(migrations/108).
  const spawnedDrops: { id: string; inventory_item_id: string; poi_id: string }[] = []

  for (const row of inserts) {
    // @ts-expect-error 'mint_and_place_ambient_drop' RPC 함수가 src/types/database.ts의
    // Functions에 미등록(기존 create_user_drop/pickup_drop과 동일한 상황)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('mint_and_place_ambient_drop', {
      p_poi_id: row.poi_id,
      p_badge_id: row.badge_id,
    })

    if (rpcError) {
      console.error('[ambient-drop] mint_and_place_ambient_drop RPC 오류:', rpcError.message, row)
      continue
    }

    const result = rpcResult as { ok: boolean; drop_id?: string; inventory_item_id?: string }
    if (!result.ok || !result.drop_id || !result.inventory_item_id) {
      console.error('[ambient-drop] 개체 선발급+배치 실패:', result, row)
      continue
    }

    spawnedDrops.push({ id: result.drop_id, inventory_item_id: result.inventory_item_id, poi_id: row.poi_id })
  }

  if (spawnedDrops.length === 0) {
    const result: AmbientDropBatchResult = {
      ...baseResult,
      eligiblePoiCount: candidatePoiIds.length,
      spawned: 0,
      reason: 'insert_failed',
    }
    await logResult(result, '개체 선발급+배치 전부 실패')
    return result
  }

  const result: AmbientDropBatchResult = {
    ...baseResult,
    eligiblePoiCount: candidatePoiIds.length,
    spawned: spawnedDrops.length,
  }
  await logResult(result)
  return result
}

async function logResult(result: AmbientDropBatchResult, error?: string): Promise<void> {
  await logEngineDecision('drop', 'ambient_batch_result', null, { ...result, error })
}

export type { AmbientDropConfig }
