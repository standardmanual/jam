import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { applyBan, removeBan } from '@/lib/abusing/shadow-ban'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_shadow_bans')
    .select('*, user:user_id(id, email, username)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bans: data ?? [] })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { user_id, ban_level, reason, expires_at } = await req.json()
  if (!user_id || !ban_level || !reason) {
    return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })
  }

  try {
    await applyBan(user_id, ban_level, reason, admin.email ?? 'admin', expires_at ? new Date(expires_at) : undefined)
  } catch (e) {
    // 어드민 화면이므로 운영자가 원인을 특정할 수 있게 DB 오류 메시지를 함께 노출한다
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: `섀도우밴이 적용되지 않았어요. 데이터베이스가 요청을 거부했어요. (${detail})` },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { user_id } = await req.json()
  if (!user_id) return NextResponse.json({ error: 'user_id 필요' }, { status: 400 })

  try {
    await removeBan(user_id)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: `섀도우밴이 해제되지 않았어요. 데이터베이스가 요청을 거부했어요. (${detail})` },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true })
}
