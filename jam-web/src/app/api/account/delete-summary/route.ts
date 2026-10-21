/**
 * 탈퇴 화면의 본인 데이터 요약 API
 * GET /api/account/delete-summary
 *
 * 로그인한 유저 **본인**의 «지워지는 것» 수치를 돌려준다(티켓 20261021_1249 3회, 운영 로직 17.1절).
 * 대상 id는 요청이 아니라 세션에서만 얻는다. 읽기만 하며 아무것도 바꾸지 않는다.
 * 조회가 실패하면 500이고, 화면은 수치 없이 일반 문장을 보이고 탈퇴는 막지 않는다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getAccountSummary } from '@/lib/account/summary'
import { d } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sessionClient = await createClient()
  const {
    data: { user },
    error,
  } = await sessionClient.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  try {
    const summary = await getAccountSummary(createServiceClient(), user.id)
    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[/api/account/delete-summary] 요약 조회 오류:', err)
    return NextResponse.json({ error: d.auth.errorGeneric }, { status: 500 })
  }
}
