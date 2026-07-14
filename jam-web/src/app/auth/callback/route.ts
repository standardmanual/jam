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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertData: any = {
    id: user.id,
    email: user.email!,
  }
  if (shouldUpdateAvatar && googleAvatarUrl) {
    upsertData.avatar_url = googleAvatarUrl
  }

  await serviceClient
    .from('users')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(upsertData as any, { onConflict: 'id' })

  // username 존재 여부 확인 → 온보딩 필요 여부 판단
  const needsOnboarding = !existingProfile?.username

  return NextResponse.redirect(
    needsOnboarding ? `${origin}/onboarding` : `${origin}/`
  )
}
