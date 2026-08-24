// GET /api/notifications — 알림함 다음 페이지 (커서 기반)
//
// 첫 페이지는 `/notifications` 서버 컴포넌트가 직접 그리고, "더 불러오기"만 이 라우트를 탄다.
// 조인·경고 재평가 로직은 `listNotificationViews()` 하나를 공유해 두 경로가 갈리지 않게 한다.
// 티켓 20260824_021

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listNotificationViews } from '@/lib/notifications/feed'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const cursor = req.nextUrl.searchParams.get('cursor')
  const page = await listNotificationViews(user.id, cursor)

  return NextResponse.json(page)
}
