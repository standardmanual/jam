// GET /api/badge-images/warmup — 곧 열 화면(인벤토리·배지함)의 배지 그림 원본 주소 목록 (티켓 20261115_1344)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { collectFirstScreenBadgeImageUrls } from '@/lib/badges/firstScreenBadgeImages'
import { d } from '@/lib/i18n'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  const urls = await collectFirstScreenBadgeImageUrls(supabase, user.id)
  return NextResponse.json({ urls })
}
