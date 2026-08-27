import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

function isWhitelistedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  return adminEmails.includes(email)
}

/**
 * 어드민 권한 판정 (20260827_015): `ADMIN_EMAILS` 환경변수 화이트리스트 OR `users.is_admin`
 * 컬럼. 화이트리스트에 있으면 DB 조회 없이 즉시 허용한다 — 기존 화이트리스트 계정은
 * 이 변경으로 영향받지 않는다. `proxy.ts`(미들웨어)·`admin/layout.tsx`(서버 컴포넌트
 * defense-in-depth)·`getAdminUser()`(API 라우트) 3곳이 모두 이 판정을 공유한다.
 */
export async function hasAdminAccess(
  userId: string,
  email: string | null | undefined
): Promise<boolean> {
  if (isWhitelistedAdminEmail(email)) return true

  const service = createServiceClient()
  const { data } = await service.from('users').select('is_admin').eq('id', userId).maybeSingle()
  return Boolean((data as { is_admin?: boolean } | null)?.is_admin)
}

export async function getAdminUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return null
  if (!(await hasAdminAccess(user.id, user.email))) return null

  return { id: user.id, email: user.email }
}

export async function requireAdmin(): Promise<NextResponse | null> {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })
  return null
}
