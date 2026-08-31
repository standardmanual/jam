import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { unblockPoi } from '@/lib/abusing/poi-block'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
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

  try {
    await unblockPoi(user_id, poi_id)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        error: `지점 블록이 해제되지 않았어요. 데이터베이스가 요청을 거부했어요. 다시 시도해도 같으면 괄호 안 오류 내용을 개발자에게 전달해 주세요. (${detail})`,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
