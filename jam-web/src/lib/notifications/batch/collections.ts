/**
 * ② 컬렉션 배치 — #9 장착 가능 / #10 완성 임박 / #11 완성 가능
 * 티켓 20260825_002 → 20260827_014(우선순위·R11·R12)
 * 스펙: REST_CASEBOOK.md ② / PRD §3 ②, DATA_MODEL §4-2
 *
 * 판정은 `itembook/completable.ts`(#11)와 같은 채움 규칙을 쓴다.
 *   - `item` 배지: `user_item_book_slots`에 들어가야 채워진다
 *   - `poi` 배지: 1회 이상 획득 이력이 있으면 채워진다 (슬롯팅 개념 없음)
 *
 * ## 한 컬렉션에 하나만 (20260827_014 §C)
 *
 * 세 조건이 동시에 참일 수 있어(잔여 1칸 + 그 배지를 미장착 보유) 한 컬렉션이 3행을
 * 만들었다. 우선순위를 두고 **하나만** 남긴다.
 *
 * | 상태 | 보낼 소식 |
 * |---|---|
 * | 완성 가능 (남은 칸을 전부 지금 채울 수 있음) | **#11만** |
 * | 잔여 1칸 도달 (아직 그 배지 없음) | **#10만** |
 * | 그 외 넣을 게 있음 | **#9만** |
 *
 * **이 우선순위는 R12의 전제 조건이다.** 없으면 이미 보유한 배지를 "찾아"라고 말하게 된다.
 *
 * ## 재발송 정책
 *
 * 배치가 매일 도는데 `merge`로 두면 상태가 유지되는 동안 **매일 `updated_at`이 갱신돼
 * dot이 다시 켜진다** — PRD §2-4가 금지한 반복 발송과 같아진다. 그래서 전부 `once`다.
 *   - #10·#11: 컬렉션 단위 키 (컬렉션당 평생 1회)
 *   - #9 : `collection_slottable:{book_id}:{가장 최근 미장착 아이템의 획득 KST일자}`
 *          같은 상태에서는 다시 알리지 않되, **새 아이템이 들어오면 키가 바뀌어 다시 알린다.**
 *   - R11로 접힌 행은 **대상 집합의 지문**을 키로 쓴다(`groupedTargetsKey`) — 집합이
 *     그대로면 다시 알리지 않고, 대상이 바뀌면 새 상태이므로 새 키가 된다.
 */
import { groupedTargetsKey, scopedGroupKey } from '@/lib/notifications/groupKey'
import { kstDateString } from '@/lib/notifications/kst'
import {
  fetchAllRows,
  fetchAllRowsIn,
  foldTargets,
  type BatchContext,
  type NotificationDraft,
  type StepOutput,
} from './shared'

export interface CollectionBook {
  id: string
  name: string
}

/** 아이템북에 속한 배지 1개 — R12(부족한 것을 이름으로)를 위해 `name`이 필요하다 */
export interface CollectionBadge {
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
  /** book_id → 소속 배지 (item + poi) */
  badgesByBook: Map<string, CollectionBadge[]>
  /** user_id → 보유 현황 */
  stateByUser: Map<string, UserCollectionState>
}

/**
 * #11 완성 가능 초안 — **인라인(동기화)과 배치가 같은 함수를 쓴다.**
 *
 * 두 경로가 각자 키를 만들면 같은 상태가 두 행이 된다. 같은 입력에서 같은 키가 나와야
 * `once`가 한쪽을 막아준다 — 그래서 "지금 완성 가능한 컬렉션 전체"를 받아 한 번에 만든다.
 */
export function selectCompletableDrafts(
  userId: string,
  books: CollectionBook[]
): NotificationDraft[] {
  if (books.length === 0) return []
  if (books.length === 1) {
    return [
      {
        userId,
        type: 'collection_completable',
        payload: { item_book_id: books[0].id, book_name: books[0].name },
        groupKey: scopedGroupKey('collection_completable', books[0].id),
        mode: 'once',
      },
    ]
  }
  // R11 — 대상 2건 이상이면 한 행으로 접고 착지를 목록(/collections)으로 올린다
  return [
    {
      userId,
      type: 'collection_completable',
      payload: { target_count: books.length },
      groupKey: groupedTargetsKey('collection_completable', books.map((b) => b.id)),
      mode: 'once',
    },
  ]
}

/**
 * #9·#10·#11 판정 (순수 함수 — 테스트 대상).
 *
 * **0이면 만들지 않는다**(§3-3). #9의 `count`가 0이면 렌더러의 `num()`이 0을 돌려
 * "…아이템 배지가 0개 있어요"가 그대로 나간다.
 */
export function selectCollectionDrafts(input: CollectionScanInput): NotificationDraft[] {
  const drafts: NotificationDraft[] = []

  for (const [userId, state] of input.stateByUser) {
    const completable: CollectionBook[] = []

    for (const book of input.books) {
      const badges = input.badgesByBook.get(book.id) ?? []
      if (badges.length === 0) continue // 배지 없는 북은 완성 개념이 없다

      const remaining = badges.filter((b) => !state.filledBadgeIds.has(b.id))
      if (remaining.length === 0) continue // 이미 완성

      const slottable = remaining.filter((b) => state.unslottedBadgeObtainedAt.has(b.id))

      // ── #11 완성 가능 — 남은 칸을 전부 지금 채울 수 있다 (최우선)
      if (slottable.length === remaining.length) {
        completable.push(book)
        continue
      }

      // ── #10 완성 임박 — 잔여 1칸 "도달", 그 배지는 아직 없다
      // 채운 칸이 0이면 도달한 게 아니다. 이 조건이 없으면 배지가 1개뿐인 컬렉션이
      // 아무것도 안 한 유저 전원에게 "한 칸만 남았어요"를 보낸다.
      if (remaining.length === 1 && badges.length - remaining.length >= 1) {
        drafts.push({
          userId,
          type: 'collection_near_complete',
          // R12 — 부족한 것을 이름으로 부른다. 위 우선순위 덕분에 이 배지는 확실히 미보유다
          payload: { item_book_id: book.id, book_name: book.name, badge_name: remaining[0].name },
          groupKey: scopedGroupKey('collection_near_complete', book.id),
          mode: 'once',
        })
        continue
      }

      // ── #9 장착 가능 — 잔여 칸에 지금 넣을 수 있는 미장착 보유 배지 수
      if (slottable.length > 0) {
        // 키에 쓸 "가장 최근 획득 시각" — 새 아이템이 들어와야 키가 바뀐다
        let latest = ''
        for (const b of slottable) {
          const at = state.unslottedBadgeObtainedAt.get(b.id) ?? ''
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
    }

    drafts.push(...selectCompletableDrafts(userId, completable))
  }

  return foldCollectionDrafts(drafts)
}

/** R11 — #9·#10을 대상 2건 이상이면 한 행으로 접는다 (#11은 위에서 이미 접혔다) */
function foldCollectionDrafts(drafts: NotificationDraft[]): NotificationDraft[] {
  return foldTargets(drafts, (group) => {
    const first = group[0]

    if (first.type === 'collection_slottable') {
      // 묶음은 **컬렉션이 아니라 배지를 센다.** 착지도 배지가 있는 곳(인벤토리)이다
      let total = 0
      const keys: string[] = []
      for (const g of group) {
        if (g.type !== 'collection_slottable') continue
        total += g.payload.count
        keys.push(g.groupKey ?? '')
      }
      if (total <= 0) return null
      return {
        userId: first.userId,
        type: 'collection_slottable',
        payload: { count: total, target_count: group.length },
        groupKey: groupedTargetsKey('collection_slottable', keys),
        mode: 'once',
      }
    }

    if (first.type === 'collection_near_complete') {
      const bookIds = group.map((g) =>
        g.type === 'collection_near_complete' ? g.payload.item_book_id ?? '' : ''
      )
      return {
        userId: first.userId,
        type: 'collection_near_complete',
        payload: { target_count: group.length },
        groupKey: groupedTargetsKey('collection_near_complete', bookIds),
        mode: 'once',
      }
    }

    return null
  })
}

interface BookBadgeRow {
  id: string
  name: string
  item_book_id: string | null
  type: string
}

/**
 * #9·#10·#11 — 전체 유저 스캔.
 *
 * `scanned`는 **보유 현황이 잡힌 유저 수**다(판정 루프의 모집단). 이 값이 계속 0보다 큰데
 * 초안이 0이면 채움 판정이나 북↔배지 매핑이 깨진 것이다.
 */
export async function buildCollectionDrafts(ctx: BatchContext): Promise<StepOutput> {
  const { supabase } = ctx

  const books = await fetchAllRows<CollectionBook>('item_books', 'id', () =>
    supabase.from('item_books').select('id, name').eq('is_active', true)
  )
  if (books.length === 0) return { drafts: [], scanned: 0 }

  const bookIds = books.map((b) => b.id)
  // `name`은 R12(부족한 것을 이름으로 부른다)의 슬롯이다 — 없으면 #10 문구가 깨진다
  const bookBadges = await fetchAllRowsIn<BookBadgeRow, string>('badges(item_book)', 'id', bookIds, (chunk) =>
    supabase
      .from('badges')
      .select('id, name, item_book_id, type')
      .in('item_book_id', chunk)
      .in('type', ['item', 'checkin'])
      .is('deleted_at', null)
  )
  if (bookBadges.length === 0) return { drafts: [], scanned: 0 }

  const badgesByBook = new Map<string, CollectionBadge[]>()
  const poiBadgeIds: string[] = []
  const allBookBadgeIds: string[] = []
  for (const b of bookBadges) {
    if (!b.item_book_id) continue
    const list = badgesByBook.get(b.item_book_id) ?? []
    list.push({ id: b.id, name: b.name })
    badgesByBook.set(b.item_book_id, list)
    allBookBadgeIds.push(b.id)
    if (b.type === 'checkin') poiBadgeIds.push(b.id)
  }

  const [slots, poiEarns, inventories] = await Promise.all([
    fetchAllRowsIn<{ user_id: string; badge_id: string }, string>(
      'user_item_book_slots',
      'id',
      bookIds,
      (chunk) => supabase.from('user_item_book_slots').select('user_id, badge_id').in('item_book_id', chunk)
    ),
    fetchAllRowsIn<{ user_id: string; badge_id: string }, string>(
      'user_checkin_badge_earns',
      'id',
      poiBadgeIds,
      (chunk) => supabase.from('user_checkin_badge_earns').select('user_id, badge_id').in('badge_id', chunk)
    ),
    fetchAllRows<{ id: string; user_id: string }>('inventory', 'id', () =>
      supabase.from('inventory').select('id, user_id')
    ),
  ])

  const userByInventory = new Map(inventories.map((inv) => [inv.id, inv.user_id]))

  // 미장착 보유 아이템 — 드랍해서 넘긴 것(dropped_at)은 더 이상 내 소유가 아니다.
  // 아이템북 소속 배지 전체를 `.in()`에 싣는 자리라 **청크 분할이 필수**다
  // (FACTIONS.md 목표치 900종이면 URL이 33KB로 Cloudflare 16KB 한계를 넘는다).
  // inventory_id는 NULL 허용이다 — 드랍/파괴로 주인이 없어진 개체(migrations/108, "주인 없음").
  const invItems = await fetchAllRowsIn<
    { inventory_id: string | null; badge_id: string; obtained_at: string },
    string
  >('inventory_items', 'id', allBookBadgeIds, (chunk) =>
    supabase
      .from('inventory_items')
      .select('inventory_id, badge_id, obtained_at')
      .in('badge_id', chunk)
      .is('dropped_at', null)
      .is('slotted_in', null)
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
    // 주인 없는 개체는 판정 대상이 아니다(기존에도 Map 조회가 빗나가 걸러지던 경로).
    const userId = it.inventory_id ? userByInventory.get(it.inventory_id) : undefined
    if (!userId) continue
    const map = stateOf(userId).unslottedBadgeObtainedAt
    const prev = map.get(it.badge_id)
    if (!prev || it.obtained_at > prev) map.set(it.badge_id, it.obtained_at)
  }

  return {
    drafts: selectCollectionDrafts({ books, badgesByBook, stateByUser }),
    scanned: stateByUser.size,
  }
}
