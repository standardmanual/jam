// GET /api/users/[username]/itembooks
// 해당 유저가 발견한 아이템북 목록 + 진행도

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { BadgeRarity } from '@/types/database'
import { COMPLETION_BADGE_TYPES, computeBookCompletion, isBookCompleted, summarizeTiers } from '@/lib/itembook/completion-basis'
import { buildFilledByBook } from '@/lib/itembook/filled-by-book'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const service = createServiceClient()

  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  const { data: targetRaw, error: targetError } = await service
    .from('users')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle()
  // 20260901_1848: 조회 실패도 !targetRaw로 걸려 404로 위장된다 — 로그로 구분
  if (targetError) console.error('[api/users/[username]/itembooks] 대상 유저(users) 조회 실패', targetError)

  if (!targetRaw) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const userId = (targetRaw as { id: string }).id

  // .single()이라 무인벤토리도 error로 잡힘 — 실제 오류와 구분은 못 하지만 최소 가시성 확보
  const { data: inventoryRaw, error: inventoryError } = await service
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .single()
  if (inventoryError) console.error('[api/users/[username]/itembooks] inventory 조회 실패(무인벤토리 포함)', inventoryError)
  const inventory = inventoryRaw as { id: string } | null

  if (!inventory) return NextResponse.json({ books: [] })

  const { data: invItemsRaw, error: invItemsError } = await service
    .from('inventory_items')
    .select('badge_id, badge:badges(item_book_id, type, deleted_at)')
    .eq('inventory_id', inventory.id)
    .is('dropped_at', null)
    // 잠긴 개체는 어떤 아이템 배지인지(→ 어느 컬렉션인지) 드러나므로 컬렉션 발견 판정에서 뺀다(운영 로직 7.3절, 티켓 20261018_0054 2회). 열면 센다.
    .eq('locked', false)
  if (invItemsError) console.error('[api/users/[username]/itembooks] inventory_items 조회 실패', invItemsError)

  type InvItemJoin = { badge_id: string; badge: { item_book_id: string | null; type: string; deleted_at: string | null } | null }
  const invItems = (invItemsRaw ?? []) as unknown as InvItemJoin[]

  // 20260903_2021: 소프트 삭제된 배지는 목록에서도 제외한다 — 통계 카운트
  // ([username]/page.tsx의 itemBookCount)는 이미 badges.deleted_at IS NULL을 적용 중이라
  // 이 필터가 없으면 "목록에는 뜨는데 통계 숫자에는 안 잡히는" 비대칭이 생긴다.
  const discoveredByBook = new Map<string, Set<string>>()
  for (const it of invItems) {
    const bookId = it.badge?.item_book_id
    if (!bookId || it.badge?.type !== 'item' || it.badge?.deleted_at) continue
    if (!discoveredByBook.has(bookId)) discoveredByBook.set(bookId, new Set())
    discoveredByBook.get(bookId)!.add(it.badge_id)
  }

  const bookIds = [...discoveredByBook.keys()]
  if (bookIds.length === 0) return NextResponse.json({ books: [] })

  // 컬렉션 노출 판정 = is_active && 노출 기간 내(마이그레이션 171, 티켓 20260914_1729).
  // 소속 아이템배지의 활성 여부와는 독립적 — 컬렉션이 비활성/기간 밖이면 컬렉션만 숨긴다.
  const now = new Date().toISOString()
  const [
    { data: booksRaw, error: booksError },
    { data: bookBadgesRaw, error: bookBadgesError },
    { data: slotsRaw, error: slotsError },
    { data: completionsRaw, error: completionsError },
    { data: tierCompletionsRaw, error: tierCompletionsError },
  ] = await Promise.all([
      service
      .from('item_books')
      .select('id, name, image_url, tier_mode, tribe:tribes(name)')
      .in('id', bookIds)
      .eq('is_active', true)
      .or(`valid_from.is.null,valid_from.lte.${now}`)
      .or(`valid_until.is.null,valid_until.gte.${now}`),
      service.from('badges').select('id, item_book_id, type, drop_excluded, name, rarity, deleted_at, created_at').in('item_book_id', bookIds).in('type', [...COMPLETION_BADGE_TYPES]).is('deleted_at', null).order('created_at', { ascending: true }),
      service.from('user_item_book_slots').select('item_book_id, badge_id').eq('user_id', userId).in('item_book_id', bookIds),
      service.from('user_item_book_completions').select('item_book_id').eq('user_id', userId).in('item_book_id', bookIds),
      // 등급별 완성 기록 — tier_mode 컬렉션만 행이 있다(티켓 20261016_2340 3회-나)
      service.from('user_item_book_tier_completions').select('item_book_id, tier').eq('user_id', userId).in('item_book_id', bookIds),
  ])
  if (booksError) console.error('[api/users/[username]/itembooks] item_books 조회 실패', booksError)
  if (bookBadgesError) console.error('[api/users/[username]/itembooks] 아이템북 소속 배지 조회 실패', bookBadgesError)
  if (slotsError) console.error('[api/users/[username]/itembooks] user_item_book_slots 조회 실패', slotsError)
  if (completionsError) console.error('[api/users/[username]/itembooks] user_item_book_completions 조회 실패', completionsError)
  if (tierCompletionsError) console.error('[api/users/[username]/itembooks] user_item_book_tier_completions 조회 실패', tierCompletionsError)

  const rarityByBook = new Map<string, BadgeRarity>()
  const bookBadges = (bookBadgesRaw ?? []) as { id: string; item_book_id: string; type: string; drop_excluded: boolean | null; name: string; rarity: BadgeRarity; deleted_at: string | null; created_at: string }[]
  for (const b of bookBadges) {
    if (b.type !== 'item') continue
    // created_at ASC 정렬이므로 처음 만나는 항목이 최초 등록 배지
    if (!rarityByBook.has(b.item_book_id)) rarityByBook.set(b.item_book_id, b.rarity)
  }
  // 분모·분자 — 완성 판정 단일 모듈(티켓 20261016_2340 2회-나). 분자는 컬렉션별 집합으로 센다.
  const checkinBadgesByBook = new Map<string, string[]>()
  for (const b of bookBadges) {
    if (b.type !== 'checkin') continue
    const list = checkinBadgesByBook.get(b.item_book_id)
    if (list) list.push(b.id)
    else checkinBadgesByBook.set(b.item_book_id, [b.id])
  }
  const checkinBadgeIds = bookBadges.filter((b) => b.type === 'checkin').map((b) => b.id)
  let earnedCheckinRows: { badge_id: string }[] = []
  if (checkinBadgeIds.length > 0) {
    const { data: earnsRaw, error: earnsError } = await service
      .from('user_checkin_badge_earns')
      .select('badge_id')
      .eq('user_id', userId)
      .in('badge_id', checkinBadgeIds)
    if (earnsError) console.error('[api/users/[username]/itembooks] user_checkin_badge_earns 조회 실패', earnsError)
    earnedCheckinRows = (earnsRaw ?? []) as { badge_id: string }[]
  }
  const filledByBook = buildFilledByBook({
    slots: (slotsRaw ?? []) as { item_book_id: string; badge_id: string }[],
    checkinBadgesByBook,
    earnedCheckinBadgeIds: new Set(earnedCheckinRows.map((e) => e.badge_id)),
  })
  type BookRaw = { id: string; name: string; image_url: string | null; tier_mode?: boolean | null; tribe: { name: string } | null }
  const bookRows = (booksRaw ?? []) as unknown as BookRaw[]
  const tierModeBookIds = new Set(bookRows.filter((b) => b.tier_mode).map((b) => b.id))
  const completionByBook = computeBookCompletion(bookBadges, new Set<string>(), {
    filledByBook,
    tierModeBookIds,
  })
  // 등급별 완성 기록: 컬렉션 → 기록된 등급 Set
  const recordedTiersByBook = new Map<string, Set<string>>()
  for (const r of (tierCompletionsRaw ?? []) as { item_book_id: string; tier: string }[]) {
    const set = recordedTiersByBook.get(r.item_book_id)
    if (set) set.add(r.tier)
    else recordedTiersByBook.set(r.item_book_id, new Set([r.tier]))
  }
  // 옛 완성 기록 + 등급별 완성 기록이 하나라도 있는 tier_mode 컬렉션
  const completedSet = new Set(((completionsRaw ?? []) as { item_book_id: string }[]).map(c => c.item_book_id))
  for (const id of recordedTiersByBook.keys()) {
    if (tierModeBookIds.has(id)) completedSet.add(id)
  }

  const isOwnList = currentUser?.id === userId

  const books = bookRows
    .map(book => ({
      id: book.id,
      name: book.name,
      image_url: book.image_url,
      tribe: book.tribe,
      totalBadgeCount: completionByBook.get(book.id)?.total ?? 0,
      slottedCount: completionByBook.get(book.id)?.filled ?? 0,
      isCompleted: isBookCompleted(completedSet, book.id, completionByBook.get(book.id)),
      rarity: rarityByBook.get(book.id) ?? 'common',
      // 새 필드(3회-나) — 옛 컬렉션은 tierMode false, tier null, tiers {}
      tierMode: tierModeBookIds.has(book.id),
      tier: completionByBook.get(book.id)?.tier ?? null,
      tiers: summarizeTiers(completionByBook.get(book.id), recordedTiersByBook.get(book.id)),
    }))
    // 타인이 볼 때는 아이템배지 슬롯이 0개인 컬렉션을 숨긴다(20260824_016).
    // 본인 열람(isOwnList)은 예외 없이 항상 노출.
    .filter(book => isOwnList || book.slottedCount > 0)
    .sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? -1 : 1
      return b.slottedCount - a.slottedCount
    })

  return NextResponse.json({ books })
}
