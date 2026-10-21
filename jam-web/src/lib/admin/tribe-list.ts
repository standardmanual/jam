/**
 * 트라이브 목록 화면의 건수 집계와 삭제 불가 사유(티켓 20260924_0945, 상위 티켓 §4.1 트라이브 행).
 *
 * 배지·컬렉션·유저 수는 `countRowsByKey`로 센다 — 자식 행을 통째로 불러 세는 기존 방식은
 * PostgREST 1,000행 상한에 걸려 배지가 많은 트라이브의 수가 조용히 잘렸다. 삭제를 막는 참조
 * (`TRIBE_REFERENCE_SOURCES`의 `blocks: true`)의 건수도 여기서 함께 계산해, 목록이 "왜 지울 수
 * 없는지"를 건수로 보여 준다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { countRowsByKey, type CountRowsClient } from './list-counts'
import { TRIBE_REFERENCE_SOURCES, summarizeReference } from './reference-guards'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface TribeListCounts {
  /** 트라이브 id → 삭제되지 않은 배지 수 */
  badgeCounts: Record<string, number>
  /** 트라이브 id → 컬렉션 수 */
  bookCounts: Record<string, number>
  /** 트라이브 id → 참조원(`TRIBE_REFERENCE_SOURCES`의 key)별 건수 — 삭제를 막는 참조만 담는다 */
  blockingCounts: Record<string, Record<string, number>>
}

async function headCount(
  supabase: ServiceClient,
  table: 'user_drop_state',
  column: 'last_drop_tribe_id',
  value: string
): Promise<number> {
  const { count, error } = await supabase.from(table).select('user_id', { count: 'exact', head: true }).eq(column, value)
  if (error) throw new Error(`[tribe-list] ${table}.${column} 조회 실패: ${error.message}`)
  return count ?? 0
}

/** 이 트라이브를 참가 대상으로 둔 미션 수. `mission_allowed_tribes`는 `id` 컬럼이 없어(PK는 mission_id + tribe_id) 건수만 센다 */
async function allowedTribeCount(supabase: ServiceClient, tribeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('mission_allowed_tribes')
    .select('mission_id', { count: 'exact', head: true })
    .eq('tribe_id', tribeId)
  if (error) throw new Error(`[tribe-list] mission_allowed_tribes.tribe_id 조회 실패: ${error.message}`)
  return count ?? 0
}

export async function fetchTribeListCounts(supabase: ServiceClient, tribeIds: string[]): Promise<TribeListCounts> {
  const client = supabase as unknown as CountRowsClient

  const [badgeCounts, bookCounts, userCounts, adjacencyResult, dropStateCounts, allowedTribeCounts] = await Promise.all([
    countRowsByKey(client, 'badges', 'tribe_id', tribeIds, (q) => q.is('deleted_at', null)),
    countRowsByKey(client, 'item_books', 'tribe_id', tribeIds),
    countRowsByKey(client, 'users', 'tribe_id', tribeIds),
    // 인접 관계는 트라이브 수(10건대)의 제곱 이하라 전량 조회해도 1,000행에 닿지 않는다.
    supabase.from('tribe_adjacency').select('tribe_id, adjacent_tribe_id'),
    // `user_drop_state`는 `id` 컬럼이 없어 `countRowsByKey`를 쓸 수 없다 — 트라이브마다 건수만 센다.
    Promise.all(tribeIds.map(async (id) => [id, await headCount(supabase, 'user_drop_state', 'last_drop_tribe_id', id)] as const)),
    // 참가 대상으로 둔 미션(`mission_allowed_tribes`, FK RESTRICT)
    Promise.all(tribeIds.map(async (id) => [id, await allowedTribeCount(supabase, id)] as const)),
  ])
  if (adjacencyResult.error) {
    throw new Error(`[tribe-list] tribe_adjacency 조회 실패: ${adjacencyResult.error.message}`)
  }

  const adjacencyCounts: Record<string, number> = {}
  for (const row of adjacencyResult.data ?? []) {
    // 두 컬럼 어느 쪽이든 대상 트라이브를 가리키면 그 트라이브의 참조다(`collectTribeReferences`와 같다).
    adjacencyCounts[row.tribe_id] = (adjacencyCounts[row.tribe_id] ?? 0) + 1
    adjacencyCounts[row.adjacent_tribe_id] = (adjacencyCounts[row.adjacent_tribe_id] ?? 0) + 1
  }
  const dropStateById = Object.fromEntries(dropStateCounts)
  const allowedTribeById = Object.fromEntries(allowedTribeCounts)

  const blockingCounts: Record<string, Record<string, number>> = {}
  for (const id of tribeIds) {
    blockingCounts[id] = {
      tribe_adjacency: adjacencyCounts[id] ?? 0,
      user_drop_state: dropStateById[id] ?? 0,
      users: userCounts[id] ?? 0,
      mission_allowed_tribes: allowedTribeById[id] ?? 0,
    }
  }

  return { badgeCounts, bookCounts, blockingCounts }
}

/**
 * 삭제가 막히는 이유를 사람이 읽을 문구로 만든다. 막는 참조가 없으면 null(삭제 가능).
 * 예: `이 트라이브를 고른 유저 3명, 유저 드랍 상태(최근 드랍 계열) 12건`
 */
export function tribeDeleteBlockReason(counts: Record<string, number>): string | null {
  const { blockingLabels } = summarizeReference(TRIBE_REFERENCE_SOURCES, counts)
  return blockingLabels || null
}
