import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  // @ts-expect-error Supabase rpc() 인자 타입 매칭 제한(단일 필수 인자 RPC에서 발생하는 라이브러리 특이 케이스) 우회 — 실제 인자는 activate_theme_preset(p_preset_id uuid)와 일치
  const { error } = await supabase.rpc('activate_theme_preset', { p_preset_id: id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
