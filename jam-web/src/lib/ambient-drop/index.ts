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

// PostgREST 기본 응답 상한(1000행) 대응 — poi/badges 전체 스캔이 이 상한에 걸려 조용히
// 잘리는 사고가 있었다(티켓 20260825_029, itembook 완성 판정). 같은 패턴으로 페이지네이션한다.
const PAGE_SIZE = 1000

type RangeQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function fetchAllRows<T>(label: string, query: RangeQuery<T>): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error(`[ambient-drop] ${label} 조회 오류:`, error)
      break
    }
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
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
    const categories = await fetchAllRows('poi_categories', (from, to) =>
      supabase.from('poi_categories').select('slug').order('slug').range(from, to)
    )
    effectiveCategorySlug = pickRandom((categories as { slug: string }[]).map((c) => c.slug))
  } else {
    effectiveCategorySlug = config.category_slug
  }

  // ── 축 2: 등급 비율 ─────────────────────────────────────────
  const effectiveRarityDistribution: RarityDistribution = useRandomRarity
    ? randomRarityDistribution()
    : {
        common: config.rarity_common,
        rare: config.rarity_rare,
        legend: config.rarity_legend,
        mythic: config.rarity_mythic,
      }

  // ── 축 3: 대상 컬렉션 ───────────────────────────────────────
  let effectiveCollectionIds: string[]
  if (useRandomCollection) {
    const books = await fetchAllRows('item_books', (from, to) =>
      supabase.from('item_books').select('id').eq('is_active', true).order('id').range(from, to)
    )
    const picked = pickRandom((books as { id: string }[]).map((b) => b.id))
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
  const poiRows = await fetchAllRows('poi', (from, to) => {
    let q = supabase.from('poi').select('id').order('id').range(from, to)
    if (effectiveCategorySlug) q = q.eq('category', effectiveCategorySlug)
    return q
  })
  const allPoiIds = (poiRows as { id: string }[]).map((p) => p.id)

  if (allPoiIds.length === 0) {
    const result: AmbientDropBatchResult = { ...baseResult, eligiblePoiCount: 0, spawned: 0, reason: 'no_eligible_poi' }
    await logResult(result)
    return result
  }

  // ── 현재 활성 시스템 드랍 카운트 (POI별 — max_active_per_poi 초과분 배제) ──
  const activeRows = await fetchAllRows('poi_drops(active system)', (from, to) =>
    supabase.from('poi_drops').select('poi_id').eq('source', 'system').eq('is_available', true).range(from, to)
  )
  const activeByPoi = new Map<string, number>()
  for (const row of activeRows as { poi_id: string }[]) {
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
  const badgeRows = await fetchAllRows('badges(item)', (from, to) => {
    let q = supabase
      .from('badges')
      .select('id, rarity, valid_from, valid_until')
      .eq('type', 'item')
      .is('deleted_at', null)
      .not('item_book_id', 'is', null)
      .order('id')
      .range(from, to)
    if (effectiveCollectionIds.length > 0) q = q.in('item_book_id', effectiveCollectionIds)
    return q
  })

  const now = ranAt
  const badgesByRarity: Record<BadgeRarity, { id: string }[]> = { common: [], rare: [], legend: [], mythic: [] }
  for (const b of badgeRows as { id: string; rarity: BadgeRarity; valid_from: string | null; valid_until: string | null }[]) {
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

  const payload = inserts.map((row) => ({
    poi_id: row.poi_id,
    badge_id: row.badge_id,
    source: 'system' as const,
    dropper_user_id: null,
    expires_at: null,
  }))
  const q = supabase.from('poi_drops')
  // @ts-expect-error Supabase insert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 PoiDropRow와 일치
  const { error } = await q.insert(payload)

  if (error) {
    console.error('[ambient-drop] 배치 삽입 오류:', error)
    const result: AmbientDropBatchResult = {
      ...baseResult,
      eligiblePoiCount: candidatePoiIds.length,
      spawned: 0,
      reason: 'insert_failed',
    }
    await logResult(result, error.message)
    return result
  }

  const result: AmbientDropBatchResult = {
    ...baseResult,
    eligiblePoiCount: candidatePoiIds.length,
    spawned: inserts.length,
  }
  await logResult(result)
  return result
}

async function logResult(result: AmbientDropBatchResult, error?: string): Promise<void> {
  await logEngineDecision('drop', 'ambient_batch_result', null, { ...result, error })
}

export type { AmbientDropConfig }
