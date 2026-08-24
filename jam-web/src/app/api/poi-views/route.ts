// POST /api/poi-views — POI 열람 기록 (소식 #18 "내 드랍 지점 활성" 계측)
//
// #18의 "다녀갔다"는 **누군가 그 POI를 열어서 확인한 것**이다(2026-08-24 확정, 픽업 여부와 무관).
// `PoiCarouselModal`이 열리는 지점에서 호출한다.
//
// ⚠️ `at`을 **클라이언트가 보낸 타임스탬프로 채우지 않는다.** 기기 시계는 틀어질 수 있고
// 조작도 가능하다 — `recordPoiView()`의 서버 `new Date()` 기본값을 그대로 쓴다.
// (`viewed_on`이 KST 날짜 UNIQUE라 시각이 틀어지면 하루 중복 억제와 주간 집계가 어긋난다)
// 티켓 20260824_021

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordPoiView } from '@/lib/notifications'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  let poiId = ''
  try {
    const body = (await req.json()) as { poi_id?: unknown }
    if (typeof body.poi_id === 'string') poiId = body.poi_id
  } catch {
    // 본문 파싱 실패는 아래 검증에서 400으로 떨어진다
  }
  if (!poiId) return NextResponse.json({ error: 'poi_id 필요' }, { status: 400 })

  // 계측 실패가 화면을 막으면 안 되므로 recordPoiView는 예외를 던지지 않는다
  const ok = await recordPoiView(poiId, user.id)
  return NextResponse.json({ ok })
}
