/**
 * 앰비언트 드랍 배치 — 지점 자리 분산과 실제 놓기 (정기 배포와 날짜 예약이 함께 쓴다)
 *
 * `index.ts`의 정기 배포가 쓰던 두 덩어리를 동작 변경 없이 옮긴 것이다(티켓 20261001_2051).
 *  - `distributePoiSlots`: 활성 드랍이 0인 지점을 우선하고, 한도 미만인 지점으로 흩어 자리를 정한다
 *  - `placeAmbientDrops`: 정해진 (지점, 배지) 쌍마다 `mint_and_place_ambient_drop` RPC로 놓는다
 */
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface DistributePoiSlotsInput {
  /** 놓을 수 있는 지점 후보(이미 한도 미만인 지점만 담아 온다) */
  candidatePoiIds: readonly string[]
  /** 지점별 활성 시스템 드랍 수 */
  activeByPoi: ReadonlyMap<string, number>
  /** 지점 1곳이 동시에 가질 수 있는 활성 시스템 드랍의 최대 수 */
  maxActivePerPoi: number
  /** 놓을 자리 수 */
  count: number
  /** 배열에서 하나를 고른다(비었으면 null). 운영은 `pickRandom`, 테스트는 결정값을 넘긴다 */
  pick: (ids: readonly string[]) => string | null
}

/**
 * 놓을 자리마다 지점을 하나씩 정한다 — 발견 경험을 흩는 원칙(구 엔진과 동일): 활성 드랍이 0인 지점을 먼저
 * 채우고, 모두 채워지면 한도 미만인 지점에 더한다. 자리가 소진되면(모든 지점이 한도) 있는 만큼만 돌려준다.
 */
export function distributePoiSlots(input: DistributePoiSlotsInput): string[] {
  const { candidatePoiIds, activeByPoi, maxActivePerPoi, count, pick } = input
  const localActiveByPoi = new Map(activeByPoi)
  const slots: string[] = []

  for (let i = 0; i < count; i++) {
    const zeroPois = candidatePoiIds.filter((id) => (localActiveByPoi.get(id) ?? 0) === 0)
    const pool =
      zeroPois.length > 0
        ? zeroPois
        : candidatePoiIds.filter((id) => (localActiveByPoi.get(id) ?? 0) < maxActivePerPoi)
    const poiId = pick(pool)
    if (!poiId) break // 배치 가능한 POI 슬롯 소진

    slots.push(poiId)
    localActiveByPoi.set(poiId, (localActiveByPoi.get(poiId) ?? 0) + 1)
  }
  return slots
}

export interface AmbientPlacementRow {
  poi_id: string
  badge_id: string
}

export interface SpawnedAmbientDrop {
  id: string
  inventory_item_id: string
  poi_id: string
}

/**
 * 정해진 (지점, 배지) 쌍마다 `mint_and_place_ambient_drop` RPC로 놓는다.
 *
 * 20260829_2101: 개체 정체성 모델 — 일련번호가 확정되는 시점은 정확히 ①드랍엔진 직접지급 ②시스템(앰비언트)
 * 드랍이 POI에 「배치되는 순간」 둘뿐이다. 선발급(개별 INSERT)과 poi_drops INSERT를 애플리케이션 레벨에서
 * 분리하면 도중 실패 때 발급된 개체가 어디에도 연결되지 못한 채 영구 고아로 남는다(2026-08-29 게이트 리뷰
 * 지적). RPC가 개체 1건 단위(선발급+poi_drops 연결+Minted 기록)를 원자적 트랜잭션으로 묶는다
 * (migrations/108). 한 건이 실패해도 나머지는 계속 놓는다.
 */
export async function placeAmbientDrops(
  supabase: ServiceClient,
  rows: readonly AmbientPlacementRow[]
): Promise<{ spawned: SpawnedAmbientDrop[]; failedCount: number }> {
  const spawned: SpawnedAmbientDrop[] = []

  for (const row of rows) {
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

    spawned.push({ id: result.drop_id, inventory_item_id: result.inventory_item_id, poi_id: row.poi_id })
  }

  return { spawned, failedCount: rows.length - spawned.length }
}
