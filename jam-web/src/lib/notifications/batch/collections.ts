/**
 * ② 컬렉션 배치 — #9 장착 가능 / #10 완성 임박 (티켓 20260825_002)
 * 스펙: PRD §3 ②, DATA_MODEL §4-2
 *
 * 판정은 `itembook/completable.ts`(#11)와 같은 채움 규칙을 쓴다.
 *   - `item` 배지: `user_item_book_slots`에 들어가야 채워진다
 *   - `poi`  배지: 1회 이상 획득 이력이 있으면 채워진다 (슬롯팅 개념 없음)
 *
 * ## 재발송 정책
 *
 * 배치가 매일 도는데 `merge`로 두면 상태가 유지되는 동안 **매일 `updated_at`이 갱신돼
 * dot이 다시 켜진다** — PRD §2-4가 금지한 반복 발송과 같아진다. 그래서 둘 다 `once`다.
 *   - #10: `collection_near_complete:{book_id}` — 컬렉션당 평생 1회(PRD §3 ② 명시)
 *   - #9 : `collection_slottable:{book_id}:{가장 최근 미장착 아이템의 획득 KST일자}`
 *          같은 상태에서는 다시 알리지 않되, **새 아이템이 들어오면 키가 바뀌어 다시 알린다.**
 *          `{book_id}`만으로 once를 걸면 평생 1회가 되어 이후 아이템이 쌓여도 침묵한다.
 */
import { scopedGroupKey } from '@/lib/notifications/groupKey'
import { kstDateString } from '@/lib/notifications/kst'
import {
  fetchAllRows,
  type BatchContext,
  type NotificationDraft,
} from './shared'

export interface CollectionBook {
  id: string
  name: string
}

/** 유저 1명의 컬렉션 보유 현황 (DB 접근 없이 판정할 수 있는 형태) */
export interface UserCollectionState {
  /** 이미 채워진 칸 = 슬롯에 넣은 배지 ∪ 획득 이력이 있는 POI 배지 */
  filledBadgeIds: Set<string>
  /** 미장착 보유 아이템 배지 → 가장 최근 획득 시각(ISO). 드랍해서 넘긴 것은 제외 */
  unslottedBadgeObtainedAt: Map<string, string>
}

export interface CollectionScanInput {
  books: CollectionBook[]
  /** book_id → 소속 배지 id (item + poi) */
  badgeIdsByBook: Map<string, string[]>
  /** user_id → 보유 현황 */
  stateByUser: Map<string, UserCollectionState>
}

/**
 * #9·#10 판정 (순수 함수 — 테스트 대상).
 *
 * **0이면 만들지 않는다**(§3-3). #9의 `count`가 0이면 렌더러의 `num()`이 0을 돌려
 * "…아이템 배지가 0개 있어요"가 그대로 나간다.
 */
export function selectCollectionDrafts(input: CollectionScanInput): NotificationDraft[] {
  const drafts: NotificationDraft[] = []

  for (const [userId, state] of input.stateByUser) {
    for (const book of input.books) {
      const badgeIds = input.badgeIdsByBook.get(book.id) ?? []
      if (badgeIds.length === 0) continue // 배지 없는 북은 완성 개념이 없다

      const remaining = badgeIds.filter((id) => !state.filledBadgeIds.has(id))
      if (remaining.length === 0) continue // 이미 완성

      // ── #9 장착 가능 — 잔여 칸에 지금 넣을 수 있는 미장착 보유 배지 수
      const slottable = remaining.filter((id) => state.unslottedBadgeObtainedAt.has(id))
      if (slottable.length > 0) {
        // 키에 쓸 "가장 최근 획득 시각" — 새 아이템이 들어와야 키가 바뀐다
        let latest = ''
        for (const id of slottable) {
          const at = state.unslottedBadgeObtainedAt.get(id) ?? ''
          if (at > latest) latest = at
        }
        drafts.push({
          userId,
          type: 'collection_slottable',
          payload: { item_book_id: book.id, book_name: book.name, count: slottable.length },
          groupKey: scopedGroupKey(
            'collection_slottable',
            book.id,
            latest ? kstDateString(latest) : 'unknown'
          ),
          mode: 'once',
        })
      }

      // ── #10 완성 임박 — 잔여 1칸 "도달", 컬렉션당 평생 1회
      // 채운 칸이 0이면 도달한 게 아니다. 이 조건이 없으면 배지가 1개뿐인 컬렉션이
      // 아무것도 안 한 유저 전원에게 "한 칸만 남았어요"를 보낸다.
      if (remaining.length === 1 && badgeIds.length - remaining.length >= 1) {
        drafts.push({
          userId,
          type: 'collection_near_complete',
          payload: { item_book_id: book.id, book_name: book.name },
          groupKey: scopedGroupKey('collection_near_complete', book.id),
          mode: 'once',
        })
      }
    }
  }

  return drafts
}

interface BookBadgeRow {
  id: string
  item_book_id: string | null
  type: string
}

/** #9·#10 — 전체 유저 스캔 */
export async function buildCollectionDrafts(ctx: BatchContext): Promise<NotificationDraft[]> {
  const { supabase } = ctx

  const books = await fetchAllRows<CollectionBook>('item_books', (from, to) =>
    supabase.from('item_books').select('id, name').eq('is_active', true).range(from, to)
  )
  if (books.length === 0) return []

  const bookIds = books.map((b) => b.id)
  const bookBadges = await fetchAllRows<BookBadgeRow>('badges(item_book)', (from, to) =>
    supabase
      .from('badges')
      .select('id, item_book_id, type')
      .in('item_book_id', bookIds)
      .in('type', ['item', 'poi'])
      .is('deleted_at', null)
      .range(from, to)
  )
  if (bookBadges.length === 0) return []

  const badgeIdsByBook = new Map<string, string[]>()
  const poiBadgeIds: string[] = []
  const allBookBadgeIds: string[] = []
  for (const b of bookBadges) {
    if (!b.item_book_id) continue
    const list = badgeIdsByBook.get(b.item_book_id) ?? []
    list.push(b.id)
    badgeIdsByBook.set(b.item_book_id, list)
    allBookBadgeIds.push(b.id)
    if (b.type === 'poi') poiBadgeIds.push(b.id)
  }

  const [slots, poiEarns, inventories] = await Promise.all([
    fetchAllRows<{ user_id: string; badge_id: string }>('user_item_book_slots', (from, to) =>
      supabase
        .from('user_item_book_slots')
        .select('user_id, badge_id')
        .in('item_book_id', bookIds)
        .range(from, to)
    ),
    poiBadgeIds.length > 0
      ? fetchAllRows<{ user_id: string; badge_id: string }>('user_poi_badge_earns', (from, to) =>
          supabase
            .from('user_poi_badge_earns')
            .select('user_id, badge_id')
            .in('badge_id', poiBadgeIds)
            .range(from, to)
        )
      : Promise.resolve([]),
    fetchAllRows<{ id: string; user_id: string }>('inventory', (from, to) =>
      supabase.from('inventory').select('id, user_id').range(from, to)
    ),
  ])

  const userByInventory = new Map(inventories.map((inv) => [inv.id, inv.user_id]))

  // 미장착 보유 아이템 — 드랍해서 넘긴 것(dropped_at)은 더 이상 내 소유가 아니다
  const invItems = await fetchAllRows<{ inventory_id: string; badge_id: string; obtained_at: string }>(
    'inventory_items',
    (from, to) =>
      supabase
        .from('inventory_items')
        .select('inventory_id, badge_id, obtained_at')
        .in('badge_id', allBookBadgeIds)
        .is('dropped_at', null)
        .is('slotted_in', null)
        .range(from, to)
  )

  const stateByUser = new Map<string, UserCollectionState>()
  const stateOf = (userId: string): UserCollectionState => {
    let s = stateByUser.get(userId)
    if (!s) {
      s = { filledBadgeIds: new Set(), unslottedBadgeObtainedAt: new Map() }
      stateByUser.set(userId, s)
    }
    return s
  }

  for (const s of slots) stateOf(s.user_id).filledBadgeIds.add(s.badge_id)
  for (const e of poiEarns) stateOf(e.user_id).filledBadgeIds.add(e.badge_id)
  for (const it of invItems) {
    const userId = userByInventory.get(it.inventory_id)
    if (!userId) continue
    const map = stateOf(userId).unslottedBadgeObtainedAt
    const prev = map.get(it.badge_id)
    if (!prev || it.obtained_at > prev) map.set(it.badge_id, it.obtained_at)
  }

  return selectCollectionDrafts({ books, badgeIdsByBook, stateByUser })
}
