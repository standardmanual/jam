/**
 * 앰비언트 POI 드랍 엔진 — 상시 아이템배지 자동 배치 + 수량 모니터링/보충
 *
 * 활동 트리거 없이, 시스템이 주기적으로(크론) POI에 아이템배지를 직접 놓아둔다.
 * 유저-간 드랍(poi_drops.source='user')과 같은 테이블을 쓰되 source='system'으로 구분.
 * - 레어리티: common 위주, mythic 없음 (신화 등급은 액티비티 성취·떠돌이 아이템 전용 유지)
 * - 만료 없음 (poi_drops.expires_at = NULL, DB CHECK로 강제)
 * - 일련번호: 픽업 시 assign_random_serial() 트리거가 50,001~999,999로 제한 (마이그레이션 044)
 *
 * 로직 문서: PRD/badge/BADGE_ENGINE_UNIFIED.md §3.12
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { AmbientDropPolicy } from './policy'
import type { BadgeRarity } from '@/types/database'

type EligibleBadge = { id: string; rarity: 'common' | 'rare' | 'legendary' }

function pickRarity(policy: AmbientDropPolicy): 'common' | 'rare' | 'legendary' {
  const roll = Math.random()
  if (roll < policy.rarity_common) return 'common'
  if (roll < policy.rarity_common + policy.rarity_rare) return 'rare'
  return 'legendary'
}

function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

export interface ReplenishResult {
  eligiblePoiCount: number
  targetTotal: number
  currentActive: number
  spawned: number
  reason?: string
}

export async function replenishAmbientDrops(policy: AmbientDropPolicy): Promise<ReplenishResult> {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // 1. 대상 POI 전체 조회
  const { data: poiRows } = await supabase.from('poi').select('id')
  const allPoiIds = ((poiRows ?? []) as { id: string }[]).map((p) => p.id)
  const eligiblePoiCount = allPoiIds.length

  if (eligiblePoiCount === 0) {
    return { eligiblePoiCount: 0, targetTotal: 0, currentActive: 0, spawned: 0, reason: 'no_poi' }
  }

  // 2. 목표 수량 산정: 활성 POI 수 × 커버리지 비율, min~max로 클램프
  const targetTotal = Math.min(
    policy.max_target_total,
    Math.max(policy.min_target_total, Math.round(eligiblePoiCount * policy.target_coverage_ratio))
  )

  // 3. 현재 활성 앰비언트 드랍 수 + POI별 보유 개수
  const { data: activeRows } = await supabase
    .from('poi_drops')
    .select('poi_id')
    .eq('source', 'system')
    .eq('is_available', true)

  const activeByPoi = new Map<string, number>()
  for (const row of (activeRows ?? []) as { poi_id: string }[]) {
    activeByPoi.set(row.poi_id, (activeByPoi.get(row.poi_id) ?? 0) + 1)
  }
  const currentActive = (activeRows ?? []).length

  const deficit = targetTotal - currentActive
  if (deficit <= 0) {
    return { eligiblePoiCount, targetTotal, currentActive, spawned: 0, reason: 'target_met' }
  }
  const spawnCount = Math.min(deficit, policy.replenish_batch_size)

  // 4. 레어리티별 후보 배지 로드 (활성 item 배지, 유효기간 필터)
  const { data: badgeRows } = await supabase
    .from('badges')
    .select('id, rarity, valid_from, valid_until')
    .eq('type', 'item')
    .in('rarity', ['common', 'rare', 'legendary'])

  const badgesByRarity: Record<'common' | 'rare' | 'legendary', EligibleBadge[]> = {
    common: [],
    rare: [],
    legendary: [],
  }
  for (const b of (badgeRows ?? []) as {
    id: string
    rarity: BadgeRarity
    valid_from: string | null
    valid_until: string | null
  }[]) {
    if (b.valid_from && b.valid_from > now) continue
    if (b.valid_until && b.valid_until < now) continue
    if (b.rarity === 'common' || b.rarity === 'rare' || b.rarity === 'legendary') {
      badgesByRarity[b.rarity].push({ id: b.id, rarity: b.rarity })
    }
  }

  // 5. POI 선정 풀: max_active_per_poi 미만인 POI만 후보 (분산 배치)
  const candidatePoiIds = allPoiIds.filter(
    (id) => (activeByPoi.get(id) ?? 0) < policy.max_active_per_poi
  )

  const inserts: { poi_id: string; badge_id: string; source: 'system' }[] = []
  const localActiveByPoi = new Map(activeByPoi)

  for (let i = 0; i < spawnCount; i++) {
    // 활성 드랍이 0개인 POI를 우선 — 넓게 퍼뜨려 "발견" 경험 유지
    const zeroPois = candidatePoiIds.filter((id) => (localActiveByPoi.get(id) ?? 0) === 0)
    const pool = zeroPois.length > 0 ? zeroPois : candidatePoiIds.filter(
      (id) => (localActiveByPoi.get(id) ?? 0) < policy.max_active_per_poi
    )
    const poiId = pickRandom(pool)
    if (!poiId) break // 배치 가능한 POI 슬롯 소진

    const rarity = pickRarity(policy)
    const badge = pickRandom(badgesByRarity[rarity]) ?? pickRandom(badgesByRarity.common)
    if (!badge) break // 후보 배지 자체가 없음

    inserts.push({ poi_id: poiId, badge_id: badge.id, source: 'system' })
    localActiveByPoi.set(poiId, (localActiveByPoi.get(poiId) ?? 0) + 1)
  }

  if (inserts.length === 0) {
    return { eligiblePoiCount, targetTotal, currentActive, spawned: 0, reason: 'no_candidates' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('poi_drops').insert(
    inserts.map((row) => ({
      poi_id: row.poi_id,
      badge_id: row.badge_id,
      source: row.source,
      dropper_user_id: null,
      expires_at: null,
    }))
  )

  if (error) {
    console.error('[ambient-drop] 보충 삽입 오류:', error)
    return { eligiblePoiCount, targetTotal, currentActive, spawned: 0, reason: 'insert_failed' }
  }

  return { eligiblePoiCount, targetTotal, currentActive, spawned: inserts.length }
}
