/**
 * 티켓 색인 읽기 (티켓 20261026_2028 2회차, 어드민 상황판 PRD §8). 순수 함수만 둔다.
 *
 * 색인 `docs/tickets/_index.json`은 `scripts/gen-ticket-index.mjs`가 만든 JSON 배열이다(티켓 한 줄).
 * 같은 `id`를 가진 옛 티켓이 있어서(예: `20260715_001`이 둘) id만으로 항목을 하나로 정하지 않는다.
 */
import type { TicketIndexEntry } from './types'

export interface ParsedTicketIndex {
  entries: TicketIndexEntry[]
  /** `id`·`status`·`title`이 문자열이 아니라서 건너뛴 항목 수 */
  invalid: number
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 색인 본문을 읽는다. 배열이 아니거나 JSON이 깨졌으면 null. 항목 단위로 깨진 것은 건너뛰고 개수를 센다. */
export function parseTicketIndex(raw: string): ParsedTicketIndex | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  const entries: TicketIndexEntry[] = []
  let invalid = 0
  for (const item of data) {
    if (
      item === null ||
      typeof item !== 'object' ||
      typeof (item as Record<string, unknown>).id !== 'string' ||
      typeof (item as Record<string, unknown>).status !== 'string' ||
      typeof (item as Record<string, unknown>).title !== 'string'
    ) {
      invalid += 1
      continue
    }
    const row = item as Record<string, unknown>
    entries.push({
      id: row.id as string,
      title: row.title as string,
      status: row.status as string,
      category: text(row.category),
      priority: text(row.priority),
      parent: text(row.parent),
      origin: text(row.origin),
      created: text(row.created),
      closed: text(row.closed),
      path: text(row.path),
    })
  }
  return { entries, invalid }
}

/**
 * `rootId`의 자손 전체(자식, 손자, …). 루트 자신은 넣지 않는다.
 * 순환(`parent`가 서로를 가리킴)이나 자기 참조가 있어도 끝난다. 같은 id의 항목이 여럿이면 모두 담는다.
 */
export function descendantsOf(entries: readonly TicketIndexEntry[], rootId: string): TicketIndexEntry[] {
  const childrenByParent = new Map<string, TicketIndexEntry[]>()
  for (const entry of entries) {
    if (entry.parent === '') continue
    const list = childrenByParent.get(entry.parent)
    if (list) list.push(entry)
    else childrenByParent.set(entry.parent, [entry])
  }
  const result: TicketIndexEntry[] = []
  const seenEntries = new Set<TicketIndexEntry>()
  const visitedIds = new Set<string>([rootId])
  const queue: string[] = [rootId]
  while (queue.length > 0) {
    const id = queue.shift() as string
    for (const child of childrenByParent.get(id) ?? []) {
      if (child.id === rootId || seenEntries.has(child)) continue
      seenEntries.add(child)
      result.push(child)
      if (!visitedIds.has(child.id)) {
        visitedIds.add(child.id)
        queue.push(child.id)
      }
    }
  }
  return result
}

/** 제목 앞의 `[카테고리] ` 표시를 뗀다. 카테고리는 카드에 따로 보이기 때문이다. */
export function stripCategoryPrefix(title: string): string {
  return title.replace(/^\[[^\]]+\]\s+/, '')
}
