import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function getAdminUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return null

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)

  if (!adminEmails.includes(user.email)) return null
  return { id: user.id, email: user.email }
}

export async function requireAdmin(): Promise<NextResponse | null> {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })
  return null
}
