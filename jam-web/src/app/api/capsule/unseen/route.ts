/**
 * 보지 않은 캡슐 결과 조회 API (티켓 20261028_1740 2회, 상위 20261028_1730 D12)
 *
 * GET /api/capsule/unseen — 동기화·서비스 활동 잼 지급이 남긴 «아직 보지 않은 캡슐 결과»를 하나로 합쳐 내려준다.
 *   응답은 `{ result: CapsuleUnseenResult | null }`이다. `result.events`(열린 순서)와 `result.chapterBadges`(이미 받은 챕터 배지)는 합친 연출의 표시 모델
 *   (`buildCapsuleResultView`)의 입력이고, `result.ids`는 연출을 끝낸 뒤 `POST /api/capsule/unseen/seen`에 돌려보낼 행 id다. 보지 않은 결과가 없으면 `result`가 null이다.
 *
 * 내 결과 보기라 이용 정지 중에도 막지 않는다. 세션으로 유저를 확인하고(401) 서비스 클라이언트로 읽는다(표가 service_role 전용). 대상은 세션 유저뿐이다.
 * 오류는 500과 일반 문구이고 내부 원문은 싣지 않는다. 읽기 전용이라 실패해도 결과는 그대로 남아 다음에 다시 읽힌다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import type { CapsuleUnseenResponse } from '@/lib/capsule/capsule-contract'
import { readUnseenCapsuleResult } from '@/lib/capsule/unseen'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  try {
    const result = await readUnseenCapsuleResult(createServiceClient(), user.id)
    const body: CapsuleUnseenResponse = { result }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[/api/capsule/unseen] 보지 않은 캡슐 결과 조회 오류:', err)
    return NextResponse.json({ error: d.capsule.unseenFailed }, { status: 500 })
  }
}
