import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { normalizeDateParam } from '@/lib/admin/today-calendar'
import { getAdminTodayPreviewCards } from '@/lib/admin/todayPreview'

/** 어드민 투데이 캘린더뷰(20260902_1028) [미리보기] 버튼용 — ?date=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const date = normalizeDateParam(searchParams.get('date') ?? undefined)
  const cards = await getAdminTodayPreviewCards(date)
  return NextResponse.json({ date, cards })
}
