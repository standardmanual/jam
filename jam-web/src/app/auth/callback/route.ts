import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasTribe, TRIBE_SELECT_PATH } from '@/lib/tribe/gate-contract'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[JAM!] OAuth 콜백 오류:', error.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // 인증 성공 — 유저 정보 가져오기
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const serviceClient = createServiceClient()
  const googleAvatarUrl: string | null = user.user_metadata?.avatar_url ?? null

  // 기존 프로필 조회 (avatar_url, username, tribe_id)
  const { data: existing } = await serviceClient
    .from('users')
    .select('avatar_url, username, tribe_id')
    .eq('id', user.id)
    .maybeSingle()

  const existingProfile = existing as {
    avatar_url: string | null
    username: string | null
    tribe_id: string | null
  } | null

  // avatar_url 갱신 여부 판단
  // 현재 값이 없거나 구글 URL이면 구글 사진으로 업데이트
  const shouldUpdateAvatar =
    !existingProfile?.avatar_url ||
    existingProfile.avatar_url.includes('googleusercontent')

  const upsertData: { id: string; email: string; avatar_url?: string } = {
    id: user.id,
    email: user.email!,
  }
  if (shouldUpdateAvatar && googleAvatarUrl) {
    upsertData.avatar_url = googleAvatarUrl
  }

  const usersTable = serviceClient.from('users')
  await usersTable.upsert(upsertData, { onConflict: 'id' })

  // 트라이브를 골랐는지로 온보딩 필요 여부를 판단한다(티켓 20261021_1247, 운영 로직 2장). 이전에는 `onboarding_completed_at`을 봤으나
  // 공용 DB에는 완료 시각은 있는데 트라이브가 없는 계정이 있어, 앱 안(`(main)` 레이아웃 게이트)은 막는데 여기는 홈으로 보내는 어긋남이 생긴다.
  // 판정 기준을 `users.tribe_id` 하나로 맞춘다 — 1단계(아이디·이름)만 했든 아예 안 했든 트라이브가 없으면 온보딩 화면
  // (내부에서 단계를 자동으로 분기)으로 보낸다.
  const needsOnboarding = !hasTribe(existingProfile?.tribe_id)

  // GA4 sign_up_complete — "구글 로그인 최초 완료" 판정은 upsert 이전에 이미 읽어둔
  // `existing`(기존 users row 존재 여부)이 기준이다. `needsOnboarding`은 username 미설정
  // 상태를 재방문 때도 계속 true로 보므로 "최초"를 구분하지 못한다.
  // 서버 라우트(리다이렉트)에서는 gtag를 직접 호출할 수 없어 온보딩 도착 화면에 플래그만
  // 넘기고, 실제 전송은 클라이언트(onboarding/page.tsx)가 담당한다.
  const isNewSignup = existing === null

  return NextResponse.redirect(
    needsOnboarding
      ? `${origin}${TRIBE_SELECT_PATH}${isNewSignup ? '?new_signup=1' : ''}`
      : `${origin}/`
  )
}
