// POST /api/notifications/seen — 알림함 전체 읽음 처리
//
// 개별 read 플래그를 두지 않으므로 유저당 **항상 1행 UPDATE**다 (DATA_MODEL §3).
//
// ## 왜 서버 컴포넌트 렌더가 아니라 이 라우트인가
//
// 읽음 처리는 부수효과다. 페이지 렌더 중에 수행하면 Next.js의 프리페치/재렌더만으로도
// "열지 않았는데 읽음"이 될 수 있다. 화면이 마운트된 뒤 클라이언트가 한 번 호출하는 편이
// "진입 = 확인"이라는 의미와 정확히 일치한다. 구분선용 seen_at 스냅샷은 이 호출 **이전에**
// 서버 컴포넌트가 이미 읽어 응답에 실어 보냈다.
// 티켓 20260824_021

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { markNotificationsSeen } from '@/lib/notifications/feed'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const ok = await markNotificationsSeen(user.id)
  if (!ok) return NextResponse.json({ error: '읽음 처리 실패' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
