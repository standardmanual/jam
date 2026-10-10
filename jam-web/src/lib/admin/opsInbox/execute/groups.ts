/**
 * 연결 그룹과 생성 순서 (티켓 20261002_1122, 상위 20260930_1500 ③-a). 규칙의 정본은 `docs/service/prd/ops-tool/PRD.md` §8.3이다.
 *
 * 순수 함수다(DB·Supabase 값 import 없음). 사전 점검(`precheck.ts`)과 뒤 조각의 실행 API가 같은 함수를 쓴다.
 * - 그룹: `links`로 이어진 항목끼리 방향 없이 모은 연결 요소다. 반려·취소·실패한 항목은 그룹에서 뺀다(가정 4).
 * - 읽을 수 없는 연결(가정 3): `item_key`가 겹치는 항목, `links`가 없는 키·자기 자신·겹친 키를 가리키는 항목을 표시한다.
 *   제출 때는 형식 오류로만 남으므로(`validate.ts`) 여기서 다시 걸러야 한다.
 * - 종류 쌍(`LINK_PAIRS`): 어느 쪽이 `links`에 적었는지와 관계없이 두 항목의 종류로 가리키는 쪽이 정해진다.
 * - 함께 취소할 항목(`cancelSetOf`, 티켓 20261002_1256 가정 3): 취소하는 항목을 직접 또는 다른 항목을 거쳐 가리키는 항목을 상태에 따라 나눈다.
 * - 지금 종료 미리 보기(`pointingLiveOf`, 티켓 20261006_0950 가정 10): 종료하는 항목을 직접 가리키는 게재 중 항목만 모은다(함께 끝내지 않는다).
 */
import { linksOf, isUndecidedStatus, asRecord, itemField } from '@/lib/admin/opsInbox/itemView'
import { isBalanceSkippedStatus } from '@/lib/admin/opsInbox/balance/rules'
import type { OpsItemKind } from '@/lib/admin/opsInbox/constants'
import type { ExecuteItem, ExecuteLinkedIds } from './handlers'

// ── 종류 쌍 표(§8.3) ────────────────────────────────────────────────────────────────────────────

export type LinkField = Extract<keyof ExecuteLinkedIds, string>

export interface LinkPair {
  /** 가리키는 항목의 종류. */
  from: OpsItemKind
  /** 가리키는 대상의 종류. */
  to: OpsItemKind
  /** 대상이 만든 ID로 채우는 칸. */
  field: LinkField
  /** `single`: 칸 하나에 대상 하나. 대상이 둘 이상이면 못 한다. `append`: `resource`의 같은 칸 뒤에 더한다. */
  mode: 'single' | 'append'
  /** `resource`에 이 칸이 이미 있으면 못 한다(변환의 `fillLinkedId`가 같은 경우를 오류로 낸다). 해당 없으면 `null`. */
  ownResourceKey: string | null
  /** `resource`의 이 칸이 비어 있지 않으면 못 한다(드랍의 아이템 직접 선택). 해당 없으면 `null`. */
  directSelectKey: string | null
}

/** §8.3 종류 쌍 표. 표에 없는 쌍은 그룹으로만 묶고 칸을 채우지 않는다. 쌍을 더할 때는 `CREATION_KIND_ORDER`도 함께 확인한다. */
export const LINK_PAIRS: readonly LinkPair[] = [
  { from: 'home_feed_card', to: 'mission', field: 'mission_id', mode: 'single', ownResourceKey: 'mission_id', directSelectKey: null },
  { from: 'home_feed_card', to: 'jam_badge', field: 'badge_ids', mode: 'append', ownResourceKey: null, directSelectKey: null },
  { from: 'home_feed_card', to: 'collection_launch', field: 'item_book_id', mode: 'single', ownResourceKey: 'item_book_id', directSelectKey: null },
  // 카드가 레시피보다 먼저 공개돼도 막지 않는다(07 §4.5 예외) — 그래서 `precheck.ts`는 이 쌍에 공개 순서 검사를 하지 않는다.
  { from: 'home_feed_card', to: 'recipe', field: 'recipe_id', mode: 'single', ownResourceKey: 'recipe_id', directSelectKey: null },
  { from: 'mission', to: 'jam_badge', field: 'reward_badge_ids', mode: 'append', ownResourceKey: null, directSelectKey: null },
  { from: 'collection_launch', to: 'jam_badge', field: 'reward_badge_id', mode: 'single', ownResourceKey: 'reward_badge_id', directSelectKey: null },
  { from: 'drop_schedule', to: 'collection_launch', field: 'collection_ids', mode: 'append', ownResourceKey: null, directSelectKey: 'badge_ids' },
  // 대상의 `recipe_id`로 덮는 칸이라 `resource`에 같은 값이 있어도 충돌이 아니다.
  { from: 'jam_badge', to: 'recipe', field: 'recipe_id', mode: 'single', ownResourceKey: null, directSelectKey: null },
]

/** 생성 순서(§8.3): 참조당하는 쪽이 먼저다. 이 순서는 `LINK_PAIRS`의 모든 쌍을 만족한다. */
export const CREATION_KIND_ORDER: readonly OpsItemKind[] = [
  'recipe',
  'jam_badge',
  'collection_launch',
  'mission',
  'drop_schedule',
  'home_feed_card',
]

/** 종류 쌍을 찾는다. 없으면 `undefined`. */
function pairOf(from: string | null, to: string | null): LinkPair | undefined {
  return LINK_PAIRS.find((pair) => pair.from === from && pair.to === to)
}

// ── 연결 그래프 ─────────────────────────────────────────────────────────────────────────────────

/** 이 항목이 멈췄는지(반려·취소·실패). 멈춘 항목은 그룹에 넣지 않는다. */
export function isStoppedItem(item: Pick<ExecuteItem, 'status'>): boolean {
  return isBalanceSkippedStatus(item.status)
}

/** 아직 만들지 않은 항목인지(결정 전이거나 승인됨). 준비중·예약됨·게재중·종료는 이미 처리된 항목이다. */
function isNotYetCreated(item: Pick<ExecuteItem, 'status'>): boolean {
  return item.status === 'approved' || isUndecidedStatus(item.status)
}

function byPosition(a: ExecuteItem, b: ExecuteItem): number {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

interface LinkGraph {
  /** 항목 ID → 이어진 항목 ID(방향 없음, 멈춘 항목 포함). */
  neighbors: Map<string, Set<string>>
  /** `links`에 적힌 대로의 연결(가리키는 쪽 → 대상). 읽을 수 있는 것만, 중복 없이. */
  written: Array<{ from: string; to: string }>
  /** 연결을 읽을 수 없는 항목 ID. */
  unreadable: Set<string>
}

/**
 * 묶음 전체의 `links`를 `item_key`로 풀어 그래프를 만든다. 겹친 키는 어느 항목인지 알 수 없어 연결로 쓰지 않고,
 * 그 키를 가진 항목과 그 키를 가리킨 항목을 모두 「읽을 수 없음」으로 표시한다. 없는 키·자기 자신을 가리킨 항목도 같다.
 */
function resolveLinkGraph(items: readonly ExecuteItem[]): LinkGraph {
  const keyCount = new Map<string, number>()
  const byKey = new Map<string, ExecuteItem>()
  for (const item of items) {
    if (typeof item.item_key !== 'string' || item.item_key === '') continue
    keyCount.set(item.item_key, (keyCount.get(item.item_key) ?? 0) + 1)
    byKey.set(item.item_key, item)
  }

  const neighbors = new Map<string, Set<string>>(items.map((item) => [item.id, new Set<string>()]))
  const written: LinkGraph['written'] = []
  const writtenSeen = new Set<string>()
  const unreadable = new Set<string>()

  for (const item of items) {
    if (item.item_key && (keyCount.get(item.item_key) ?? 0) > 1) unreadable.add(item.id)

    for (const key of linksOf(item)) {
      const target = byKey.get(key)
      if (!target || (keyCount.get(key) ?? 0) > 1 || target.id === item.id) {
        unreadable.add(item.id)
        continue
      }
      neighbors.get(item.id)?.add(target.id)
      neighbors.get(target.id)?.add(item.id)
      const edgeKey = `${item.id}>${target.id}`
      if (!writtenSeen.has(edgeKey)) {
        writtenSeen.add(edgeKey)
        written.push({ from: item.id, to: target.id })
      }
    }
  }
  return { neighbors, written, unreadable }
}

// ── 연결 그룹 ───────────────────────────────────────────────────────────────────────────────────

export interface LinkGroup {
  /** 그룹 안 항목(멈춘 항목 제외), 제출 순서. 결정 전·이미 처리된 항목도 들어 있다. */
  items: ExecuteItem[]
  /** `links`에 적힌 연결(가리키는 쪽 → 대상). 그룹 안 항목끼리만이다. */
  edges: Array<{ from: string; to: string }>
  /** 연결을 읽을 수 없는 항목 ID(겹친 키·없는 키·자기 자신). 있으면 그룹 전체를 믿을 수 없다. */
  unreadableItemIds: string[]
}

/**
 * 방향 없이 이은 연결 요소를 그룹으로 모은다. 반려·취소·실패한 항목은 뺀다. 연결이 없는 항목도 혼자서 한 그룹이다.
 * 그룹은 가장 앞선 항목의 제출 순서대로 돌려준다.
 */
export function buildLinkGroups(items: readonly ExecuteItem[]): LinkGroup[] {
  const graph = resolveLinkGraph(items)
  const active = items.filter((item) => !isStoppedItem(item)).sort(byPosition)
  const activeIds = new Set(active.map((item) => item.id))

  const seen = new Set<string>()
  const groups: LinkGroup[] = []
  for (const start of active) {
    if (seen.has(start.id)) continue
    const memberIds = new Set<string>([start.id])
    const queue = [start.id]
    seen.add(start.id)
    while (queue.length > 0) {
      const current = queue.shift() as string
      for (const next of graph.neighbors.get(current) ?? []) {
        if (!activeIds.has(next) || seen.has(next)) continue
        seen.add(next)
        memberIds.add(next)
        queue.push(next)
      }
    }
    const members = active.filter((item) => memberIds.has(item.id))
    groups.push({
      items: members,
      edges: graph.written.filter((edge) => memberIds.has(edge.from) && memberIds.has(edge.to)),
      unreadableItemIds: members.filter((item) => graph.unreadable.has(item.id)).map((item) => item.id),
    })
  }
  return groups
}

// ── 생성 순서 ───────────────────────────────────────────────────────────────────────────────────

interface Orderable {
  kind: string | null
  position: number
}

/**
 * 그룹의 생성 순서(§8.3): `CREATION_KIND_ORDER`의 종류 순서, 같은 종류끼리는 제출 순서(`position`)다.
 * 순서에 없는 종류(`pattern_proposal`·알 수 없는 종류)는 맨 끝이다. 입력을 바꾸지 않는다.
 */
export function orderForCreation<T extends Orderable>(group: { items: readonly T[] }): T[] {
  const rank = (kind: string | null): number => {
    const index = CREATION_KIND_ORDER.findIndex((candidate) => candidate === kind)
    return index === -1 ? CREATION_KIND_ORDER.length : index
  }
  return [...group.items].sort((a, b) => rank(a.kind) - rank(b.kind) || a.position - b.position)
}

/** 되돌림 순서: 생성 순서의 역순이다(§8.3). */
export function orderForUndo<T extends Orderable>(group: { items: readonly T[] }): T[] {
  return orderForCreation(group).reverse()
}

// ── 실패로 닫을 항목(가정 4) ────────────────────────────────────────────────────────────────────

export interface StoppedReference {
  /** 가리키는 쪽에서 가장 가까운, 멈춘 항목의 ID. */
  stoppedId: string
  /** 멈춘 항목을 직접 가리키면 `true`, 다른 항목을 거쳐 가리키면 `false`. */
  direct: boolean
}

/**
 * 멈춘 항목(`stoppedIds`)을 직접 또는 다른 항목을 거쳐 가리키는 항목을 찾는다. 가리키는 쪽은 종류 쌍(`LINK_PAIRS`)으로 정한다.
 * 멈춘 항목이 가리키기만 하는(참조당하는) 항목은 들어 있지 않다(반려된 카드가 여는 미션은 그대로 예약할 수 있다).
 * 거쳐 가는 항목은 아직 만들지 않은 항목(결정 전·승인됨)뿐이다. 이미 만들어진 항목은 자원이 있으므로 그 너머를 따라가지 않는다.
 * 결과는 가장 가까운 멈춘 항목 기준이다.
 */
export function referencersOf(
  items: readonly ExecuteItem[],
  stoppedIds: ReadonlySet<string> | readonly string[]
): Map<string, StoppedReference> {
  const stopped = new Set(stoppedIds)
  const byId = new Map(items.map((item) => [item.id, item]))
  const graph = resolveLinkGraph(items)

  const result = new Map<string, StoppedReference>()
  // 너비 우선: 멈춘 항목에서 시작해, 그 항목을 가리키는 항목을 차례로 넓힌다.
  const queue: Array<{ id: string; stoppedId: string }> = [...stopped].map((id) => ({ id, stoppedId: id }))
  while (queue.length > 0) {
    const { id: targetId, stoppedId } = queue.shift() as { id: string; stoppedId: string }
    const target = byId.get(targetId)
    if (!target) continue
    for (const neighborId of graph.neighbors.get(targetId) ?? []) {
      const neighbor = byId.get(neighborId)
      if (!neighbor || stopped.has(neighborId) || result.has(neighborId) || !isNotYetCreated(neighbor)) continue
      if (!pairOf(neighbor.kind, target.kind)) continue
      result.set(neighborId, { stoppedId, direct: stopped.has(targetId) })
      queue.push({ id: neighborId, stoppedId })
    }
  }
  return result
}

// ── 함께 취소할 항목(가정 3) ────────────────────────────────────────────────────────────────────

export interface CancelSet {
  /** 취소할 항목: 시작 항목과, 그것을 직접 또는 다른 「예약됨」 항목을 거쳐 가리키는 「예약됨」 항목. 제출 순서. */
  cancelIds: string[]
  /** 막는 항목: 가리키는데 이미 게재 중(`live`)이거나 예약 등록이 진행 중(`preparing`)이라 함께 취소할 수 없다. 제출 순서. */
  blockers: Array<{ id: string; status: 'live' | 'preparing' }>
}

/**
 * 공개 전 취소(§8.7)의 범위를 정한다. 시작 항목(`itemId`, 「예약됨」이어야 하는 것은 호출부가 본다)을 가리키는 항목을 종류 쌍(`LINK_PAIRS`)으로 찾아 상태로 나눈다.
 * - 예약됨: 함께 취소하고, 그 항목을 가리키는 항목도 따라간다.
 * - 게재중·준비중: 막는 항목이다. 그 너머는 따라가지 않는다(하나라도 있으면 아무것도 취소하지 않는다).
 * - 그 밖(결정 전·승인됨·종료·반려·취소·실패): 건드리지 않고 따라가지도 않는다. 승인됨 항목은 다음 사전 점검이 「실패로 닫을 항목」으로 닫는다(§8.2).
 * 시작 항목이 가리키는 대상은 그대로 둔다(카드를 취소해도 미션은 남는다). 입력을 바꾸지 않는다.
 */
export function cancelSetOf(items: readonly ExecuteItem[], itemId: string): CancelSet {
  const byId = new Map(items.map((item) => [item.id, item]))
  if (!byId.has(itemId)) return { cancelIds: [], blockers: [] }
  const graph = resolveLinkGraph(items)

  const cancel = new Set<string>([itemId])
  const blockers = new Map<string, 'live' | 'preparing'>()
  const queue = [itemId]
  while (queue.length > 0) {
    const target = byId.get(queue.shift() as string) as ExecuteItem
    for (const neighborId of graph.neighbors.get(target.id) ?? []) {
      const neighbor = byId.get(neighborId) as ExecuteItem
      if (cancel.has(neighborId) || blockers.has(neighborId) || !pairOf(neighbor.kind, target.kind)) continue
      if (neighbor.status === 'scheduled') {
        cancel.add(neighborId)
        queue.push(neighborId)
      } else if (neighbor.status === 'live' || neighbor.status === 'preparing') {
        blockers.set(neighborId, neighbor.status)
      }
    }
  }

  const inOrder = (ids: Iterable<string>) => [...ids].map((id) => byId.get(id) as ExecuteItem).sort(byPosition)
  return {
    cancelIds: inOrder(cancel).map((item) => item.id),
    blockers: inOrder(blockers.keys()).map((item) => ({ id: item.id, status: blockers.get(item.id) as 'live' | 'preparing' })),
  }
}

// ── 지금 종료가 알릴 항목(⑪-a 가정 10) ──────────────────────────────────────────────────────────

/**
 * 이 항목(`itemId`)을 연결 칸으로 **직접** 가리키는 게재 중(`live`) 항목을 제출 순서로 돌려준다(운영툴 PRD §8.7). 종류 쌍(`LINK_PAIRS`)으로 가리키는 쪽을 정하므로
 * 미션을 끝낼 때는 그 미션을 가리키는 카드가 들어 오고, 그 미션이 가리키는 배지는 들어 오지 않는다. 다른 항목을 거쳐 가리키는 항목·예약됨·종료 항목도 넣지 않는다.
 * 「지금 종료」는 그 항목만 끝내고 이 항목들은 그대로 두므로(막지도 않는다) 확인창이 알려 주는 재료다. 입력을 바꾸지 않는다.
 */
export function pointingLiveOf(items: readonly ExecuteItem[], itemId: string): ExecuteItem[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const target = byId.get(itemId)
  if (!target) return []
  const graph = resolveLinkGraph(items)
  return [...(graph.neighbors.get(itemId) ?? [])]
    .map((id) => byId.get(id) as ExecuteItem)
    .filter((neighbor) => neighbor.status === 'live' && pairOf(neighbor.kind, target.kind) !== undefined)
    .sort(byPosition)
}

// ── 연결 칸 채우기 계획 ─────────────────────────────────────────────────────────────────────────

export interface LinkFill {
  field: LinkField
  mode: LinkPair['mode']
  /** 이 칸을 채울 대상 항목의 ID(생성 순서). 실행은 대상이 만든 ID를 넣는다. */
  targetItemIds: string[]
}

export type LinkConflictCode = 'multiple_targets' | 'own_resource_field' | 'direct_selection'

/** 칸을 채울 수 없는 경우(§8.3 「못 하는 항목」). */
export interface LinkConflict {
  /** 가리키는 쪽 항목의 ID. */
  itemId: string
  code: LinkConflictCode
  pair: LinkPair
}

export interface LinkFillPlan {
  /** 가리키는 항목 ID → 채울 칸. 칸을 채울 수 있는 쌍만 들어 있다. */
  fills: Map<string, LinkFill[]>
  conflicts: LinkConflict[]
}

function hasOwnValue(resource: Record<string, unknown> | null, key: string): boolean {
  return resource !== null && resource[key] !== undefined && resource[key] !== null
}

function hasNonEmptyList(resource: Record<string, unknown> | null, key: string): boolean {
  const value = resource?.[key]
  return Array.isArray(value) && value.length > 0
}

/**
 * 그룹 안 연결을 종류 쌍으로 읽어 가리키는 항목마다 채울 칸을 정한다. 쌍은 어느 쪽 `links`에 적혔는지와 관계없이 두 항목의 종류로 정해진다.
 * 칸을 채울 수 없으면(대상이 둘 이상인 단일 칸, `resource`의 같은 칸, 드랍의 아이템 직접 선택) 충돌로 알리고 그 칸은 계획에 넣지 않는다.
 */
export function planLinkFills(group: LinkGroup): LinkFillPlan {
  const adjacent = new Map<string, Set<string>>(group.items.map((item) => [item.id, new Set<string>()]))
  for (const edge of group.edges) {
    adjacent.get(edge.from)?.add(edge.to)
    adjacent.get(edge.to)?.add(edge.from)
  }
  const ordered = orderForCreation(group)
  const rankById = new Map(ordered.map((item, index) => [item.id, index]))
  const kindById = new Map(group.items.map((item) => [item.id, item.kind]))

  const fills = new Map<string, LinkFill[]>()
  const conflicts: LinkConflict[] = []
  for (const referencer of ordered) {
    const resource = asRecord(itemField(referencer, 'resource'))
    for (const pair of LINK_PAIRS) {
      if (pair.from !== referencer.kind) continue
      const targetItemIds = [...(adjacent.get(referencer.id) ?? [])]
        .filter((id) => kindById.get(id) === pair.to)
        .sort((a, b) => (rankById.get(a) ?? 0) - (rankById.get(b) ?? 0))
      if (targetItemIds.length === 0) continue

      let conflict: LinkConflictCode | null = null
      if (pair.mode === 'single' && targetItemIds.length > 1) conflict = 'multiple_targets'
      else if (pair.ownResourceKey !== null && hasOwnValue(resource, pair.ownResourceKey)) conflict = 'own_resource_field'
      else if (pair.directSelectKey !== null && hasNonEmptyList(resource, pair.directSelectKey)) conflict = 'direct_selection'

      if (conflict) {
        conflicts.push({ itemId: referencer.id, code: conflict, pair })
        continue
      }
      fills.set(referencer.id, [...(fills.get(referencer.id) ?? []), { field: pair.field, mode: pair.mode, targetItemIds }])
    }
  }
  return { fills, conflicts }
}
