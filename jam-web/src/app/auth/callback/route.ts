import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // 인증 성공 — 온보딩 완료 여부 확인
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const { data: profile } = await supabase
    .from('users')
    .select('activity_types')
    .eq('id', user.id)
    .maybeSingle()

  const profileData = profile as { activity_types: string[] | null } | null
  const needsOnboarding =
    !profileData || !profileData.activity_types || profileData.activity_types.length === 0

  return NextResponse.redirect(
    needsOnboarding ? `${origin}/onboarding` : `${origin}/`
  )
}
