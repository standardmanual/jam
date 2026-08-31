import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

/**
 * 유저 어드민 권한 부여/해제 (20260827_015)
 * DB `users.is_admin` 컬럼을 토글한다. `ADMIN_EMAILS` 화이트리스트 계정은 이 값과 무관하게
 * 항상 접근 가능하므로(OR 조건), 화이트리스트 계정에 대한 토글도 막지 않는다 — 화면에서
 * "이미 화이트리스트로 어드민" 안내만 하고 토글 자체는 단순화 우선으로 그대로 둔다.
 * 본인 스스로의 권한 해제도 별도 차단 로직 없이 허용한다(단순화 우선, 티켓 명시).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })

  const { id: userId } = await params
  const body = await req.json().catch(() => null)
  const isAdmin = (body as { isAdmin?: unknown } | null)?.isAdmin

  if (typeof isAdmin !== 'boolean') {
    return NextResponse.json({ error: 'isAdmin 값은 boolean이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 })
  if (!userRow) return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 })

  const usersQuery = supabase.from('users')
  const { error } = await usersQuery.update({ is_admin: isAdmin }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.info(`[admin/users/admin-role] userId: ${userId}, isAdmin: ${isAdmin} (by admin: ${admin.email})`)

  return NextResponse.json({ isAdmin })
}
