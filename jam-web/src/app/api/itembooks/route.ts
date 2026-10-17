import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { COMPLETION_BADGE_TYPES, computeBookCompletion, isBookCompleted, summarizeTiers } from '@/lib/itembook/completion-basis'
import { buildFilledByBook } from '@/lib/itembook/filled-by-book'
import { applyLaunchedItemBookFilter } from '@/lib/itembook/visibility'
import type {
  InventoryRow,
  InventoryItemRow,
  BadgeRow,
  ItemBookRow,
  TribeRow,
  UserItemBookSlotRow,
  UserItemBookCompletionRow,
} from '@/types/database'

// GET /api/itembooks — 유저가 디스커버리한(인벤토리에 아이템 배지를 보유한) 아이템북 목록
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  // 1) 유저 인벤토리
  const { data: invRaw } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!invRaw) return NextResponse.json({ itemBooks: [] })
  const inventoryId = (invRaw as Pick<InventoryRow, 'id'>).id

  // 2) 인벤토리 아이템 → 고유 badge_id 목록 (슬롯 여부 관계없이 전부)
  const { data: invItemsRaw } = await supabase
    .from('inventory_items')
    .select('badge_id')
    .eq('inventory_id', inventoryId)
  const ownedBadgeIds = Array.from(
    new Set(((invItemsRaw ?? []) as Pick<InventoryItemRow, 'badge_id'>[]).map((i) => i.badge_id))
  )
  if (ownedBadgeIds.length === 0) return NextResponse.json({ itemBooks: [] })

  // 3) 보유 배지 중 아이템북 소속 아이템 배지만 추림 → book별 발견 배지 Set
  const { data: ownedBadgesRaw } = await supabase
    .from('badges')
    .select('id, item_book_id')
    .in('id', ownedBadgeIds)
    .eq('type', 'item')
    .not('item_book_id', 'is', null)
    .is('deleted_at', null)
  const ownedBadges = (ownedBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'item_book_id'>[]

  const discoveredMap = new Map<string, Set<string>>()
  for (const b of ownedBadges) {
    if (!b.item_book_id) continue
    if (!discoveredMap.has(b.item_book_id)) discoveredMap.set(b.item_book_id, new Set())
    discoveredMap.get(b.item_book_id)!.add(b.id)
  }
  const discoveredBookIds = Array.from(discoveredMap.keys())
  if (discoveredBookIds.length === 0) return NextResponse.json({ itemBooks: [] })

  // 4) 공개된 아이템북만 — 공개 전(비활성·시작 전) 컬렉션은 목록에서 뺀다. 기간이 끝난 컬렉션은
  //    보유자에게 계속 보인다(판정은 visibility.ts, 티켓 20260930_1516 결정 E1·E2).
  const { data: booksRaw } = await applyLaunchedItemBookFilter(
    supabase.from('item_books').select('*').in('id', discoveredBookIds),
    new Date().toISOString()
  )
  const books = (booksRaw ?? []) as ItemBookRow[]
  const bookIds = books.map((b) => b.id)
  if (bookIds.length === 0) return NextResponse.json({ itemBooks: [] })

  // 5) 전체 아이템 배지 수 + 슬롯 카운트 + 완성 여부 병렬 조회 — 걸러진 컬렉션 id로만 조회한다
  const [{ data: allBadgesRaw }, { data: slotsRaw }, { data: compRaw }, { data: tierCompRaw }] =
    await Promise.all([
      supabase.from('badges').select('id, item_book_id, type, drop_excluded, name, rarity, deleted_at').in('item_book_id', bookIds).in('type', [...COMPLETION_BADGE_TYPES]).is('deleted_at', null),
      supabase
        .from('user_item_book_slots')
        .select('item_book_id, badge_id')
        .eq('user_id', user.id)
        .in('item_book_id', bookIds),
      supabase
        .from('user_item_book_completions')
        .select('item_book_id')
        .eq('user_id', user.id)
        .in('item_book_id', bookIds),
      // 등급별 완성 기록 — tier_mode 컬렉션만 행이 있다(티켓 20261016_2340 3회-나)
      supabase
        .from('user_item_book_tier_completions')
        .select('item_book_id, tier')
        .eq('user_id', user.id)
        .in('item_book_id', bookIds),
    ])

  // 북별 분모·분자 — 완성 판정 단일 모듈(티켓 20261016_2340 2회-나). 분자는 컬렉션별 집합으로 센다.
  const allBadges = (allBadgesRaw ?? []) as {
    id: string
    item_book_id: string | null
    type: string
    drop_excluded: boolean | null
    name: string
    rarity: string | null
    deleted_at: string | null
  }[]
  const checkinBadgesByBook = new Map<string, string[]>()
  for (const b of allBadges) {
    if (b.type !== 'checkin' || !b.item_book_id) continue
    const list = checkinBadgesByBook.get(b.item_book_id)
    if (list) list.push(b.id)
    else checkinBadgesByBook.set(b.item_book_id, [b.id])
  }
  const checkinBadgeIds = allBadges.filter((b) => b.type === 'checkin').map((b) => b.id)
  let earnedCheckinRows: { badge_id: string }[] = []
  if (checkinBadgeIds.length > 0) {
    const { data: earnsRaw } = await supabase
      .from('user_checkin_badge_earns')
      .select('badge_id')
      .eq('user_id', user.id)
      .in('badge_id', checkinBadgeIds)
    earnedCheckinRows = (earnsRaw ?? []) as { badge_id: string }[]
  }
  const filledByBook = buildFilledByBook({
    slots: (slotsRaw ?? []) as Pick<UserItemBookSlotRow, 'item_book_id' | 'badge_id'>[],
    checkinBadgesByBook,
    earnedCheckinBadgeIds: new Set(earnedCheckinRows.map((e) => e.badge_id)),
  })
  const tierModeBookIds = new Set(books.filter((b) => (b as { tier_mode?: boolean | null }).tier_mode).map((b) => b.id))
  const completionMap = computeBookCompletion(allBadges, new Set<string>(), {
    filledByBook,
    tierModeBookIds,
  })

  // 등급별 완성 기록: 컬렉션 → 기록된 등급 Set
  const recordedTiersByBook = new Map<string, Set<string>>()
  for (const r of (tierCompRaw ?? []) as { item_book_id: string; tier: string }[]) {
    const set = recordedTiersByBook.get(r.item_book_id)
    if (set) set.add(r.tier)
    else recordedTiersByBook.set(r.item_book_id, new Set([r.tier]))
  }

  // 완성된 북 Set — 옛 완성 기록 + 등급별 완성 기록이 하나라도 있는 tier_mode 컬렉션
  const completedSet = new Set(
    ((compRaw ?? []) as Pick<UserItemBookCompletionRow, 'item_book_id'>[]).map((c) => c.item_book_id)
  )
  for (const id of recordedTiersByBook.keys()) {
    if (tierModeBookIds.has(id)) completedSet.add(id)
  }

  // 6) 트라이브 조회
  const tribeIds = Array.from(
    new Set(books.map((b) => b.tribe_id).filter((f): f is string => !!f))
  )
  const tribeMap = new Map<string, Pick<TribeRow, 'id' | 'name' | 'image_url'>>()
  if (tribeIds.length > 0) {
    const { data: tribesRaw } = await supabase
      .from('tribes')
      .select('id, name, image_url')
      .in('id', tribeIds)
    for (const f of (tribesRaw ?? []) as Pick<TribeRow, 'id' | 'name' | 'image_url'>[]) {
      tribeMap.set(f.id, f)
    }
  }

  const itemBooks = books.map((book) => {
    const tribe = book.tribe_id ? tribeMap.get(book.tribe_id) : undefined
    return {
      id: book.id,
      name: book.name,
      description: book.description,
      image_url: book.image_url,
      tribe: tribe
        ? { id: tribe.id, name: tribe.name, image_url: tribe.image_url }
        : null,
      totalBadgeCount: completionMap.get(book.id)?.total ?? 0,
      discoveredBadgeCount: discoveredMap.get(book.id)?.size ?? 0,
      slottedCount: completionMap.get(book.id)?.filled ?? 0,
      isCompleted: isBookCompleted(completedSet, book.id, completionMap.get(book.id)),
      // 새 필드(3회-나) — 옛 컬렉션은 tierMode false, tier null, tiers {}
      tierMode: tierModeBookIds.has(book.id),
      tier: completionMap.get(book.id)?.tier ?? null,
      tiers: summarizeTiers(completionMap.get(book.id), recordedTiersByBook.get(book.id)),
    }
  })

  return NextResponse.json({ itemBooks })
}
