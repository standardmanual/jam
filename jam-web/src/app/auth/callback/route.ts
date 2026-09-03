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

  // 기존 프로필 조회 (avatar_url, username)
  const { data: existing } = await serviceClient
    .from('users')
    .select('avatar_url, username')
    .eq('id', user.id)
    .maybeSingle()

  const existingProfile = existing as { avatar_url: string | null; username: string | null } | null

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

  // username 존재 여부 확인 → 온보딩 필요 여부 판단
  const needsOnboarding = !existingProfile?.username

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
