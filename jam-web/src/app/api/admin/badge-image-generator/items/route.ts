import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { listBookItems, searchBooks } from '@/lib/admin/badgeImageGenerator/items'

/** 컬렉션 검색(?q=)·아이템 목록(?bookId=) (티켓 20261113_1131 2번) */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const params = req.nextUrl.searchParams

  try {
    const bookId = params.get('bookId')
    if (bookId) {
      return NextResponse.json(await listBookItems(supabase, bookId))
    }
    return NextResponse.json({ books: await searchBooks(supabase, params.get('q') ?? '') })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '조회에 실패했습니다.' }, { status: 500 })
  }
}
