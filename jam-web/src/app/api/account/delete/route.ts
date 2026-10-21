/**
 * 유저 탈퇴 API
 * POST /api/account/delete   본문 { confirmPhrase }
 *
 * 로그인한 유저 **본인**의 계정을 지운다(티켓 20261021_1249 3회, 운영 로직 17장). 지울 대상은 세션에서만 얻고 요청에서 받지 않는다.
 * 1. 로그인 확인 — 없으면 401.
 * 2. 확인 문구를 서버에서 다시 검사한다(앞뒤 공백 무시, NFC 정규화) — 어긋나면 400. 화면의 검사는 편의일 뿐이다.
 * 3. 지우는 규칙 한 함수 `deleteAccount`(어드민 거절 → 아바타 → 준비 RPC → 계정 삭제 → Strava 해제)를 부른다.
 *
 * 이용 정지 중인 유저도 탈퇴할 수 있다(`assertNotSuspended`를 부르지 않는다). 운영 로직 16.4: 정지가 막는 것은 새 보상·기록이 생기는
 * 동작이고, 탈퇴를 막으면 오히려 문의가 늘어난다. 어드민 계정은 403으로 거절한다.
 * 실패 응답에는 DB·Auth 오류 원문을 싣지 않고 `d.account.*`의 고정 문장만 낸다(원문은 `deleteAccount`가 서버 로그에 남긴다).
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { deleteAccount } from '@/lib/account/delete-account'
import { WITHDRAW_CONFIRM_PHRASE, isWithdrawConfirmed } from '@/lib/account/withdraw-contract'
import { d, t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const sessionClient = await createClient()
  const {
    data: { user },
    error,
  } = await sessionClient.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    // 본문이 없거나 JSON이 아니면 확인 문구가 없는 것과 같다 — 아래에서 400
  }
  const confirmPhrase = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).confirmPhrase : undefined
  if (!isWithdrawConfirmed(confirmPhrase)) {
    return NextResponse.json(
      { error: t(d.account.deleteConfirmMismatch, { phrase: WITHDRAW_CONFIRM_PHRASE }) },
      { status: 400 }
    )
  }

  try {
    const result = await deleteAccount(createServiceClient(), user.id)
    if (result.ok) return NextResponse.json({ success: true })

    if (result.code === 'admin_account') {
      return NextResponse.json({ error: d.account.deleteAdminForbidden }, { status: 403 })
    }
    // 유저 행이 없는 경우(not_found)도 화면에는 같은 고정 문장이다. 원인 구분은 서버 로그에 있다
    console.error(`[/api/account/delete] 탈퇴 실패 (code: ${result.code})`)
    return NextResponse.json({ error: d.account.deleteFailed }, { status: result.code === 'not_found' ? 404 : 500 })
  } catch (err) {
    console.error('[/api/account/delete] 탈퇴 중 예외:', err)
    return NextResponse.json({ error: d.account.deleteFailed }, { status: 500 })
  }
}
