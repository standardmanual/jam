/**
 * 앰비언트 드랍 놓기 — 정기 배포와 날짜 예약이 함께 쓴다
 *
 * 정해진 (지점, 배지) 쌍을 RPC로 놓는다. 잠김으로 만든 배지는 잠긴 채 놓는다(티켓 20261018_1813, 운영 로직 9.4절).
 * 자리 분산·계획 같은 순수 코드는 `placement.ts`에 있고, 이 파일은 DB·정책을 읽으므로 서버 전용이다.
 */
import { fetchAllRowsIn } from '@/lib/notifications/batch/shared'
import { assignLock } from '@/lib/drop-engine/lockAssignment'
import { getJamPolicy } from '@/lib/jam/policy'
import type { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRarity } from '@/types/database'
import type { AmbientPlacementRow, SpawnedAmbientDrop } from './placement'

type ServiceClient = ReturnType<typeof createServiceClient>

interface BadgeLockRow {
  id: string
  always_locked: boolean
  unlock_required: number | null
  rarity: BadgeRarity | null
}

type PlacementKind = { kind: 'open' } | { kind: 'locked'; unlockRequired: number } | { kind: 'skip'; why: string }

/**
 * 놓기 직전에 배지의 «잠김으로 만듦»을 읽어 열린 채 놓을지 잠긴 채 놓을지 정한다.
 * 규칙은 동기화·캡슐의 잠김 배정과 같다(`assignLock`의 `designated` 경로 — 잠김으로 만든 배지만 잠그고 난수를 쓰지 않는다):
 * 여는 데 필요한 양은 배지 값, 값이 없으면 등급 최소값이고 놓을 때 고정한다.
 * 조회가 실패하면 던진다 — 잠겨야 할 배지가 열린 채 놓이는 것을 막으려 호출부가 전부 실패로 센다.
 */
async function resolvePlacementKinds(
  supabase: ServiceClient,
  rows: readonly AmbientPlacementRow[]
): Promise<Map<string, PlacementKind>> {
  const badgeIds = [...new Set(rows.map((r) => r.badge_id))]
  const badgeRows = await fetchAllRowsIn<BadgeLockRow, string>('badges(놓기 직전 잠김)', 'id', badgeIds, (chunk) =>
    supabase.from('badges').select('id, always_locked, unlock_required, rarity').in('id', chunk)
  )
  const lockedRows = badgeRows.filter((b) => b.always_locked)
  const policy = lockedRows.length > 0 ? await getJamPolicy(supabase) : null

  const kinds = new Map<string, PlacementKind>()
  for (const badgeId of badgeIds) kinds.set(badgeId, { kind: 'open' })
  for (const b of lockedRows) {
    const valueOk = b.unlock_required !== null && Number.isInteger(b.unlock_required) && b.unlock_required >= 1
    if (!valueOk && !b.rarity) {
      // 값도 등급도 없어 필요한 양을 정할 수 없다 — 열린 채 놓지 않고 건너뛴다
      kinds.set(b.id, { kind: 'skip', why: '필요한 양을 정할 수 없음(값·등급 없음)' })
      continue
    }
    const lock = assignLock(
      { alwaysLocked: true, unlockRequired: b.unlock_required, rarity: b.rarity ?? 'common', route: 'designated' },
      policy!,
      () => 0
    )
    kinds.set(b.id, lock.locked ? { kind: 'locked', unlockRequired: lock.unlockRequired } : { kind: 'open' })
  }
  return kinds
}

/**
 * 정해진 (지점, 배지) 쌍마다 RPC로 놓는다. 잠김으로 만든 배지(`badges.always_locked`)는
 * `mint_and_place_ambient_drop_locked`(까닭 `badge_locked`, 필요한 양 고정, 마이그레이션 240)로, 아니면 옛
 * `mint_and_place_ambient_drop`으로 놓는다.
 *
 * 20260829_2101: 개체 정체성 모델 — 일련번호가 확정되는 시점은 정확히 ①드랍엔진 직접지급 ②시스템(앰비언트)
 * 드랍이 POI에 「배치되는 순간」 둘뿐이다. 선발급(개별 INSERT)과 poi_drops INSERT를 애플리케이션 레벨에서
 * 분리하면 도중 실패 때 발급된 개체가 어디에도 연결되지 못한 채 영구 고아로 남는다(2026-08-29 게이트 리뷰
 * 지적). RPC가 개체 1건 단위(선발급+poi_drops 연결+Minted 기록)를 원자적 트랜잭션으로 묶는다
 * (migrations/108·240). 한 건이 실패해도 나머지는 계속 놓는다.
 */
export async function placeAmbientDrops(
  supabase: ServiceClient,
  rows: readonly AmbientPlacementRow[]
): Promise<{ spawned: SpawnedAmbientDrop[]; failedCount: number }> {
  const spawned: SpawnedAmbientDrop[] = []
  if (rows.length === 0) return { spawned, failedCount: 0 }

  let kinds: Map<string, PlacementKind>
  try {
    kinds = await resolvePlacementKinds(supabase, rows)
  } catch (err) {
    console.error('[ambient-drop] 배지 잠김 조회 실패 — 놓지 않아요:', err instanceof Error ? err.message : err)
    return { spawned, failedCount: rows.length }
  }

  for (const row of rows) {
    const kind = kinds.get(row.badge_id) ?? { kind: 'open' as const }
    if (kind.kind === 'skip') {
      console.error('[ambient-drop] 잠긴 배지를 놓지 못함:', kind.why, row)
      continue
    }

    const rpcName = kind.kind === 'locked' ? 'mint_and_place_ambient_drop_locked' : 'mint_and_place_ambient_drop'
    const { data: rpcResult, error: rpcError } =
      kind.kind === 'locked'
        ? await supabase.rpc('mint_and_place_ambient_drop_locked', {
            p_poi_id: row.poi_id,
            p_badge_id: row.badge_id,
            p_lock_reason: 'badge_locked',
            p_unlock_required: kind.unlockRequired,
          })
        : await supabase.rpc('mint_and_place_ambient_drop', { p_poi_id: row.poi_id, p_badge_id: row.badge_id })

    if (rpcError) {
      console.error(`[ambient-drop] ${rpcName} RPC 오류:`, rpcError.message, row)
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
