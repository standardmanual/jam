import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { DescriptionError, ensureDescription } from '@/lib/admin/badgeImageGenerator/describe'

/** 묘사 문장 작성·수정 (티켓 20261113_1131 3번) */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as {
    bookId?: string
    itemName?: string
    manualText?: string
    feedback?: string
    force?: boolean
  } | null
  if (!body?.bookId || !body.itemName) {
    return NextResponse.json({ error: 'bookId와 itemName이 필요합니다.' }, { status: 400 })
  }
  try {
    const result = await ensureDescription(createServiceClient(), {
      bookId: body.bookId,
      itemName: body.itemName,
      manualText: body.manualText,
      feedback: body.feedback,
      force: body.force === true,
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof DescriptionError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : '묘사 작성에 실패했습니다.' }, { status: 500 })
  }
}
