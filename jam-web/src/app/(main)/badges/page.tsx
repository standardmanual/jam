import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BadgeRow, UserActivityBadgeRow, ItemBookRow, BadgeRarity } from '@/types/database'
import BadgesClient, { ItemBookProgress, PoiBadgeItem } from './BadgesClient'

export default async function BadgesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [
    { data: earnedBadges },
    { data: allActivityBadges },
    { data: inventoryData },
    { data: allPoiBadges },
    { data: poiEarns },
    { data: poiCategories },
  ] = await Promise.all([
    supabase
      .from('user_activity_badges')
      .select('*, badge:badges(*)')
      .eq('user_id', user.id)
      .order('earned_at', { ascending: false }),
    // 액티비티 배지는 획득 여부와 무관하게 전체 노출 — 단, 원더링(로밍) 신화 배지는
    // 잡기 전까지 존재 자체가 스포일러이므로 목록 조회 대상에서 제외한다.
    supabase
      .from('badges')
      .select('*')
      .eq('type', 'activity')
      .eq('is_wandering', false)
      .is('deleted_at', null),
    supabase
      .from('inventory')
      .select('id, inventory_items(id, badge_id, serial_number, expires_at, dropped_at, badge:badges(id, name, image_url, rarity, deleted_at))')
      .eq('user_id', user.id)
      .maybeSingle(),
    // 장소(POI) 배지 — 산/지하철 등 방문해서 획득하는 배지. 획득 여부와 무관하게 전체 노출.
    supabase.from('badges').select('*').eq('type', 'poi').is('deleted_at', null),
    // poi 배지는 반복 획득이 가능해 이력이 여러 행일 수 있음 — 배지별 개수/최근 획득일로 집계
    supabase.from('user_poi_badge_earns').select('badge_id, earned_at').eq('user_id', user.id),
    // poi_categories는 RLS가 service role 전용이라 일반 유저 클라이언트로는 못 읽는다
    createServiceClient().from('poi_categories').select('slug, label'),
  ])

  // 소프트 삭제된 배지(badges.deleted_at)는 서비스 화면에서 숨긴다 — 발급 이력 자체는 DB에 남지만
  // 마이페이지·인벤토리에는 노출하지 않는다.
  const earnedMap = new Map<string, UserActivityBadgeRow>(
    ((earnedBadges ?? []) as Array<{ badge: BadgeRow } & UserActivityBadgeRow>)
      .filter((r) => r.badge && !r.badge.deleted_at)
      .map((r) => [r.badge_id, r])
  )

  // 원더링 배지는 목록 조회에서 제외했지만, 이미 잡아서 획득한 건은 정상적으로 보여줘야 하므로
  // earned 이력에만 있고 allActivityBadges에는 없는 배지를 추가로 합친다.
  const wanderingEarnedOnly = ((earnedBadges ?? []) as Array<{ badge: BadgeRow } & UserActivityBadgeRow>)
    .filter((r) => r.badge && !r.badge.deleted_at && r.badge.is_wandering)
    .map((r) => r.badge)

  const allBadgeRows = [...((allActivityBadges ?? []) as BadgeRow[]), ...wanderingEarnedOnly]

  const badges: Array<{ badge: BadgeRow; earned: UserActivityBadgeRow | null }> = allBadgeRows.map((badge) => ({
    badge,
    earned: earnedMap.get(badge.id) ?? null,
  }))

  type RawInventoryItem = {
    id: string
    badge_id: string
    serial_number: number
    expires_at: string | null
    dropped_at: string | null
    badge: { id: string; name: string; image_url: string | null; rarity: BadgeRarity; deleted_at: string | null }
  }
  type RawInventory = { id: string; inventory_items: RawInventoryItem[] }

  const inventory = inventoryData as RawInventory | null
  // 아이템배지 탭: 드랍(양도)한 건 제외하고, 아이템북 슬롯에 넣었든 안 넣었든 소유 중인 건 전부 표시
  // (단, 소프트 삭제된 배지는 제외)
  const rawItems: RawInventoryItem[] = (inventory?.inventory_items ?? []).filter(
    (item) => item.dropped_at === null && item.badge && !item.badge.deleted_at
  )

  // 보유한 아이템 배지에 연결된 아이템북만 표시
  const ownedBadgeIds = [...new Set(rawItems.map((i) => i.badge_id))]

  let books: ItemBookRow[] = []
  let itemBookProgress: ItemBookProgress[] = []

  if (ownedBadgeIds.length > 0) {
    const { data: ownedBadgesWithBook } = await supabase
      .from('badges')
      .select('id, item_book_id')
      .in('id', ownedBadgeIds)
      .eq('type', 'item')
      .not('item_book_id', 'is', null)

    const bookIds = [...new Set(((ownedBadgesWithBook ?? []) as { id: string; item_book_id: string }[]).map((b) => b.item_book_id))]

    if (bookIds.length > 0) {
      const [{ data: booksRaw }, { data: bookBadgesRaw }, { data: slotsRaw }, { data: completionsRaw }] =
        await Promise.all([
          supabase.from('item_books').select('*').in('id', bookIds),
          supabase.from('badges').select('id, item_book_id').in('item_book_id', bookIds).eq('type', 'item'),
          supabase.from('user_item_book_slots').select('item_book_id').eq('user_id', user.id).in('item_book_id', bookIds),
          supabase.from('user_item_book_completions').select('item_book_id').eq('user_id', user.id).in('item_book_id', bookIds),
        ])

      books = (booksRaw ?? []) as ItemBookRow[]

      const totalByBook = new Map<string, number>()
      for (const b of (bookBadgesRaw ?? []) as { id: string; item_book_id: string }[]) {
        if (!b.item_book_id) continue
        totalByBook.set(b.item_book_id, (totalByBook.get(b.item_book_id) ?? 0) + 1)
      }
      const slottedByBook = new Map<string, number>()
      for (const s of (slotsRaw ?? []) as { item_book_id: string }[]) {
        slottedByBook.set(s.item_book_id, (slottedByBook.get(s.item_book_id) ?? 0) + 1)
      }
      const completedSet = new Set(((completionsRaw ?? []) as { item_book_id: string }[]).map((c) => c.item_book_id))

      itemBookProgress = books.map((book) => {
        const total = totalByBook.get(book.id) ?? 0
        const owned = slottedByBook.get(book.id) ?? 0
        const completed = completedSet.has(book.id) || (total > 0 && owned >= total)
        return { bookId: book.id, owned, total, completed }
      })
    }
  }

  // ─── 장소(POI) 배지 — 카테고리(산/대중교통 등)별로 그룹핑하기 위해 연결된
  // POI의 category를 조회. 배지 1개에 POI 여러 개가 연결될 수 있어 첫 번째
  // 값만 대표로 사용한다(같은 배지에 연결된 POI들은 보통 같은 카테고리).
  const poiBadgeRows = (allPoiBadges ?? []) as BadgeRow[]
  const poiBadgeIds = poiBadgeRows.map((b) => b.id)

  const categoryByBadge = new Map<string, string>()
  if (poiBadgeIds.length > 0) {
    const { data: linkedPois } = await supabase
      .from('poi')
      .select('linked_badge_id, category')
      .in('linked_badge_id', poiBadgeIds)
    for (const row of (linkedPois ?? []) as { linked_badge_id: string; category: string }[]) {
      if (!categoryByBadge.has(row.linked_badge_id)) {
        categoryByBadge.set(row.linked_badge_id, row.category)
      }
    }
  }

  const categoryLabelBySlug = new Map(
    ((poiCategories ?? []) as { slug: string; label: string }[]).map((c) => [c.slug, c.label])
  )

  // 배지별 획득 이력 집계 — 반복 획득 지원(개수 + 가장 최근 획득일)
  const poiEarnAgg = new Map<string, { count: number; latestEarnedAt: string }>()
  for (const row of (poiEarns ?? []) as { badge_id: string; earned_at: string }[]) {
    const prev = poiEarnAgg.get(row.badge_id)
    if (!prev) {
      poiEarnAgg.set(row.badge_id, { count: 1, latestEarnedAt: row.earned_at })
    } else {
      prev.count += 1
      if (row.earned_at > prev.latestEarnedAt) prev.latestEarnedAt = row.earned_at
    }
  }

  const poiBadges: PoiBadgeItem[] = poiBadgeRows.map((badge) => {
    const category = categoryByBadge.get(badge.id) ?? 'other'
    const earn = poiEarnAgg.get(badge.id) ?? null
    return {
      badge,
      category,
      categoryLabel: categoryLabelBySlug.get(category) ?? category,
      earnCount: earn?.count ?? 0,
      latestEarnedAt: earn?.latestEarnedAt ?? null,
    }
  })

  return (
    <BadgesClient
      badges={badges}
      itemBooks={books}
      itemBookProgress={itemBookProgress}
      poiBadges={poiBadges}
    />
  )
}
