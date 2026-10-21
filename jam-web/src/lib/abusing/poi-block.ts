/**
 * POI 영역 블록 (GPS 조작 감지 후 72시간 드랍/픽업 차단)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.generated'
import type { AbusingPolicy } from './policy'
import { chunkIds } from './chunk-ids'
import { logAbusingEvents, type ExtendResult } from './abusing-log'

/**
 * 해당 유저가 이 POI에서 차단됐는지 확인.
 *
 * 조회 실패는 fail-open(`false` = 차단 아님)으로 둔다. 이 함수는 모든 유저의 픽업 경로마다
 * 호출되므로 fail-closed로 바꾸면 DB 일시 장애가 "전체 픽업 정지"로 번진다
 * (20260831_1259 §"DB 전체 장애" 행). 다만 이전에는 이 실패가 완전히 무음이었다 —
 * 최소한 서버 로그는 남긴다 (티켓 20260901_1843).
 */
export async function isPoiBlocked(userId: string, poiId: string): Promise<boolean> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('poi_blocks')
      .select('blocked_until')
      .eq('user_id', userId)
      .eq('poi_id', poiId)
      .maybeSingle()

    if (error) {
      console.error(`[poi-block] 조회 실패 — 차단 아님으로 간주 (userId: ${userId}, poiId: ${poiId}):`, error)
      return false
    }
    if (!data) return false
    return new Date(data.blocked_until) > new Date()
  } catch (e) {
    console.error(`[poi-block] 조회 예외 — 차단 아님으로 간주 (userId: ${userId}, poiId: ${poiId}):`, e)
    return false
  }
}

/**
 * POI 블록 적용. 실패하면 호출부가 인지하도록 예외를 던진다.
 * (이전에는 upsert 반환 error를 확인하지 않아 GPS 조작 감지 후 블록이 걸리지 않아도
 * "적용됨"으로 처리됐다 — 티켓 20260901_1843)
 */
export async function blockPoiForUser(
  userId: string,
  poiId: string,
  policy: AbusingPolicy,
  reason: string = 'gps_spoof_detected'
): Promise<void> {
  const supabase = createServiceClient()
  const blockedUntil = new Date(Date.now() + policy.poi_block_hours * 3_600_000).toISOString()

  const table = supabase.from('poi_blocks')
  const payload = { user_id: userId, poi_id: poiId, blocked_until: blockedUntil, reason }
  const { error } = await table.upsert(payload, { onConflict: 'user_id,poi_id' })
  if (error) {
    console.error(`[poi-block] 블록 적용 실패 (userId: ${userId}, poiId: ${poiId}):`, error)
    throw new Error(`poi_blocks upsert 실패 (${error.code}): ${error.message}`)
  }
}

/**
 * POI 블록 해제 (어드민). 실패하면 호출부가 인지하도록 예외를 던진다.
 * (이전에는 delete 반환 error를 확인하지 않아 해제 실패가 "해제됨"으로 응답됐다 — 티켓 20260901_1843)
 */
export async function unblockPoi(userId: string, poiId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('poi_blocks').delete().eq('user_id', userId).eq('poi_id', poiId)
  if (error) {
    console.error(`[poi-block] 블록 해제 실패 (userId: ${userId}, poiId: ${poiId}):`, error)
    throw new Error(`poi_blocks delete 실패 (${error.code}): ${error.message}`)
  }
}

export type PoiBlockRecord = Database['public']['Tables']['poi_blocks']['Row']

export interface ReleasePoiBlocksResult {
  released: PoiBlockRecord[]
  logged: boolean
  error: string | null
}

/**
 * POI 차단 일괄 해제(티켓 20260924_0952) — 200건
 * 묶음마다 삭제 한 문장 뒤 지운 행을 실행 어드민과 함께 `abusing_logs`에 남긴다.
 */
export async function releasePoiBlocks(ids: string[], releasedBy: string): Promise<ReleasePoiBlocksResult> {
  const supabase = createServiceClient()
  const released: PoiBlockRecord[] = []
  let logged = true

  for (const idsChunk of chunkIds(ids)) {
    const { data, error } = await supabase.from('poi_blocks').delete().in('id', idsChunk).select('*')
    if (error) {
      console.error('[poi-block] 일괄 해제 실패:', error)
      return { released, logged, error: `poi_blocks delete 실패 (${error.code}): ${error.message}` }
    }
    const rows = data ?? []
    released.push(...rows)
    const ok = await logAbusingEvents(
      rows.map((row) => ({
        user_id: row.user_id,
        event_type: 'poi_block_released',
        detail: {
          poi_id: row.poi_id,
          blocked_until: row.blocked_until,
          reason: row.reason,
          created_at: row.created_at,
          released_by: releasedBy,
        },
      }))
    )
    if (!ok) logged = false
  }

  return { released, logged, error: null }
}

/** POI 차단 만료 연장(티켓 20260924_0952) — 이미 더 오래 가는 차단은 `.lt` 조건으로 빠진다 */
export async function extendPoiBlocks(ids: string[], until: Date): Promise<ExtendResult> {
  const supabase = createServiceClient()
  const untilIso = until.toISOString()
  const updatedIds: string[] = []

  for (const idsChunk of chunkIds(ids)) {
    const { data, error } = await supabase
      .from('poi_blocks')
      .update({ blocked_until: untilIso })
      .in('id', idsChunk)
      .lt('blocked_until', untilIso)
      .select('id')
    if (error) {
      console.error('[poi-block] 만료 연장 실패:', error)
      return { updatedIds, error: `poi_blocks update 실패 (${error.code}): ${error.message}` }
    }
    updatedIds.push(...(data ?? []).map((row) => row.id))
  }

  return { updatedIds, error: null }
}
