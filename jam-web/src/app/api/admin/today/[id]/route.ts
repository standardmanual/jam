import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { imageSourceReset } from '@/lib/admin/imageSourceReset'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const body = await req.json()
  const supabase = createServiceClient()

  // 커버 이미지가 실제로 바뀔 때만 제작 경로를 NULL(미상)로 되돌린다(티켓 20260925_1940
  // 방침 A). 폼은 매번 전체 필드를 보내므로 기존 값과 비교하고, 본문에 cover_image_url이
  // 없으면 기존 행을 조회하지 않는다.
  let imageSourcePatch: { image_source?: null } = {}
  if (body.cover_image_url !== undefined) {
    const { data: existing, error: existingError } = await supabase
      .from('today_cards')
      .select('cover_image_url')
      .eq('id', id)
      .maybeSingle<{ cover_image_url: string | null }>()
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ error: '카드를 찾을 수 없습니다.' }, { status: 404 })
    imageSourcePatch = imageSourceReset(existing.cover_image_url, body.cover_image_url)
  }

  // 제작 경로(image_source)는 본문으로 바꿀 수 없다 — 이미지 변경 시 초기화(위)와 적용 탭·등록
  // 스크립트로만 바뀐다(티켓 20260925_2003 방침 A). 배지·컬렉션·미션 저장 라우트와 같은 규칙이다.
  const safeBody = { ...body }
  delete safeBody.image_source

  const { data, error } = await supabase
    .from('today_cards')
    .update({ ...safeBody, ...imageSourcePatch } as never)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase.from('today_cards').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
