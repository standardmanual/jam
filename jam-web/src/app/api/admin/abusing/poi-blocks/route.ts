import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { unblockPoi } from '@/lib/abusing/poi-block'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('poi_blocks')
    .select('*, user:user_id(id, email, username), poi:poi_id(id, name)')
    .gt('blocked_until', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ blocks: data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { user_id, poi_id } = await req.json()
  if (!user_id || !poi_id) return NextResponse.json({ error: 'user_id, poi_id 필요' }, { status: 400 })

  await unblockPoi(user_id, poi_id)
  return NextResponse.json({ ok: true })
}
