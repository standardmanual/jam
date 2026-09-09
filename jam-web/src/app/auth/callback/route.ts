import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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

  // 기존 프로필 조회 (avatar_url, username, onboarding_completed_at)
  const { data: existing } = await serviceClient
    .from('users')
    .select('avatar_url, username, onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle()

  const existingProfile = existing as {
    avatar_url: string | null
    username: string | null
    onboarding_completed_at: string | null
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

  // 온보딩 2단계(트라이브 포함) 완료 여부로 온보딩 필요 여부를 판단한다(티켓 20260909_2119).
  // username만으로 판단하면 1단계만 마친 유저가 재로그인 시 홈으로 잘못 보내진다 —
  // onboarding_completed_at은 2단계까지 전부 채워졌을 때만 기록되므로, 이 값이 null이면
  // 1단계만 했든 아예 안 했든 온보딩 화면(내부에서 단계를 자동으로 분기)으로 보낸다.
  const needsOnboarding = !existingProfile?.onboarding_completed_at

  // GA4 sign_up_complete — "구글 로그인 최초 완료" 판정은 upsert 이전에 이미 읽어둔
  // `existing`(기존 users row 존재 여부)이 기준이다. `needsOnboarding`은 username 미설정
  // 상태를 재방문 때도 계속 true로 보므로 "최초"를 구분하지 못한다.
  // 서버 라우트(리다이렉트)에서는 gtag를 직접 호출할 수 없어 온보딩 도착 화면에 플래그만
  // 넘기고, 실제 전송은 클라이언트(onboarding/page.tsx)가 담당한다.
  const isNewSignup = existing === null

  return NextResponse.redirect(
    needsOnboarding
      ? `${origin}/onboarding${isNewSignup ? '?new_signup=1' : ''}`
      : `${origin}/`
  )
}
