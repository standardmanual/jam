/**
 * 캡슐 조회 API (티켓 20261018_0052 1회, 운영 로직 5.2절)
 *
 * GET /api/capsule — 로그인한 유저의 캡슐 상태(필요량, 채운 양, 남은 양, 잼 잔액, 열 수 있는지와 못 여는 까닭)와
 *   서버가 정한 보류·안내 값(`pendingCount`·`jamBlocked`·`alertStage`·`claim`·`notice`, 티켓 20261028_1739 1회).
 * 캡슐이 없으면 그때의 챕터로 필요량을 정해 만든다. 내 상태 보기라 이용 정지 중에도 막지 않는다.
 *
 * `capsule_get_or_create`는 service_role만 실행할 수 있다. 세션으로 유저를 확인한 뒤 서비스 클라이언트로 부르고, 대상은 세션 유저뿐이다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { getCapsuleStatus } from '@/lib/capsule/capsule'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  try {
    const status = await getCapsuleStatus(createServiceClient(), user.id)
    return NextResponse.json(status)
  } catch (err) {
    console.error('[/api/capsule] 캡슐 조회 오류:', err)
    return NextResponse.json({ error: d.capsule.loadFailed }, { status: 500 })
  }
}
