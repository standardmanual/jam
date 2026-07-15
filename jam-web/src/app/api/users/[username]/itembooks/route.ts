// GET /api/users/[username]/itembooks
// 해당 유저가 발견한 아이템북 목록 + 진행도

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const service = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetRaw } = await (service as any)
    .from('users')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  if (!targetRaw) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const userId = (targetRaw as { id: string }).id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inventoryRaw } = await (service as any)
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .single()
  const inventory = inventoryRaw as { id: string } | null

  if (!inventory) return NextResponse.json({ books: [] })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invItemsRaw } = await (service as any)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('item_books')
      .select('id, name, image_url, faction:factions(name)')
      .in('id', bookIds)
      .eq('is_active', true),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('badges').select('id, item_book_id').in('item_book_id', bookIds).eq('type', 'item'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('user_item_book_slots').select('item_book_id').eq('user_id', userId).in('item_book_id', bookIds),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('user_item_book_completions').select('item_book_id').eq('user_id', userId).in('item_book_id', bookIds),
  ])

  const totalByBook = new Map<string, number>()
  for (const b of (bookBadgesRaw ?? []) as { id: string; item_book_id: string }[]) {
    totalByBook.set(b.item_book_id, (totalByBook.get(b.item_book_id) ?? 0) + 1)
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
    }))
    .sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? -1 : 1
      return b.slottedCount - a.slottedCount
    })

  return NextResponse.json({ books })
}
