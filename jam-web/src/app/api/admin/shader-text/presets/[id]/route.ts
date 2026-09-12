import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

/** 쉐이더 텍스트 생성기 — 스타일 프리셋 삭제 API (티켓 20260912_1532). 하드 삭제(구현자 재량 확정). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: '프리셋을 찾을 수 없습니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('shader_text_presets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
