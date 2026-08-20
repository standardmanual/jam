// GET /api/users/[username]/itembooks
// 해당 유저가 발견한 아이템북 목록 + 진행도

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRarity } from '@/types/database'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const service = createServiceClient()

  const { data: targetRaw } = await service
    .from('users')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  if (!targetRaw) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const userId = (targetRaw as { id: string }).id

  const { data: inventoryRaw } = await service
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .single()
  const inventory = inventoryRaw as { id: string } | null

  if (!inventory) return NextResponse.json({ books: [] })

  const { data: invItemsRaw } = await service
    .from('inventory_items')
    .select('badge_id, badge:badges(item_book_id, type)')
    .eq('inventory_id', inventory.id)
    .is('dropped_at', null)

  type InvItemJoin = { badge_id: string; badge: { item_book_id: string | null; type: string } | null }
  const invItems = (invItemsRaw ?? []) as unknown as InvItemJoin[]

  const discoveredByBook = new Map<string, Set<string>>()
  for (const it of invItems) {
    const bookId = it.badge?.item_book_id
    if (!bookId || it.badge?.type !== 'item') continue
    if (!discoveredByBook.has(bookId)) discoveredByBook.set(bookId, new Set())
    discoveredByBook.get(bookId)!.add(it.badge_id)
  }

  const bookIds = [...discoveredByBook.keys()]
  if (bookIds.length === 0) return NextResponse.json({ books: [] })

  const [
    { data: booksRaw },
    { data: bookBadgesRaw },
    { data: slotsRaw },
    { data: completionsRaw },
  ] = await Promise.all([
      service
      .from('item_books')
      .select('id, name, image_url, faction:factions(name)')
      .in('id', bookIds)
      .eq('is_active', true),
      service.from('badges').select('id, item_book_id, rarity, created_at').in('item_book_id', bookIds).eq('type', 'item').order('created_at', { ascending: true }),
      service.from('user_item_book_slots').select('item_book_id').eq('user_id', userId).in('item_book_id', bookIds),
      service.from('user_item_book_completions').select('item_book_id').eq('user_id', userId).in('item_book_id', bookIds),
  ])

  const totalByBook = new Map<string, number>()
  const rarityByBook = new Map<string, BadgeRarity>()
  for (const b of (bookBadgesRaw ?? []) as { id: string; item_book_id: string; rarity: BadgeRarity; created_at: string }[]) {
    totalByBook.set(b.item_book_id, (totalByBook.get(b.item_book_id) ?? 0) + 1)
    // created_at ASC 정렬이므로 처음 만나는 항목이 최초 등록 배지
    if (!rarityByBook.has(b.item_book_id)) rarityByBook.set(b.item_book_id, b.rarity)
  }
  const slottedByBook = new Map<string, number>()
  for (const s of (slotsRaw ?? []) as { item_book_id: string }[]) {
    slottedByBook.set(s.item_book_id, (slottedByBook.get(s.item_book_id) ?? 0) + 1)
  }
  const completedSet = new Set(((completionsRaw ?? []) as { item_book_id: string }[]).map(c => c.item_book_id))

  type BookRaw = { id: string; name: string; image_url: string | null; faction: { name: string } | null }
  const books = ((booksRaw ?? []) as unknown as BookRaw[])
    .map(book => ({
      id: book.id,
      name: book.name,
      image_url: book.image_url,
      faction: book.faction,
      totalBadgeCount: totalByBook.get(book.id) ?? 0,
      slottedCount: slottedByBook.get(book.id) ?? 0,
      isCompleted: completedSet.has(book.id),
      rarity: rarityByBook.get(book.id) ?? 'common',
    }))
    .sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? -1 : 1
      return b.slottedCount - a.slottedCount
    })

  return NextResponse.json({ books })
}
