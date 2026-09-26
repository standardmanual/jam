import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { imageSourceReset, imageUrlTypeError } from '@/lib/admin/imageSourceReset'

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1602). 현상 → 원인 → 해결책 순서.
const READ_ERROR_MESSAGE = '카드 정보를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const SAVE_ERROR_MESSAGE = '카드를 저장하지 못했어요. 서버에서 저장 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const DELETE_ERROR_MESSAGE = '카드를 삭제하지 못했어요. 서버에서 삭제 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
// 본문이 JSON `null`이면 아래 `body.` 접근이 던져 500이 된다(티켓 20260926_1601). 다른 어드민 라우트의 본문 오류 문구와 같다.
const INVALID_BODY_MESSAGE = '요청 형식이 올바르지 않습니다.'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const body = await req.json()
  if (body === null) return NextResponse.json({ error: INVALID_BODY_MESSAGE }, { status: 400 })

  // 이 라우트의 이미지 컬럼은 `cover_image_url`이다(티켓 20260926_1455).
  const imageUrlError = imageUrlTypeError(body.cover_image_url)
  if (imageUrlError) return NextResponse.json({ error: imageUrlError }, { status: 400 })

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
    if (existingError) {
      console.error('[today PATCH 기존 카드 조회 오류]', existingError)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
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

  if (error) {
    console.error('[today PATCH 저장 오류]', error)
    return NextResponse.json({ error: SAVE_ERROR_MESSAGE }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase.from('today_cards').delete().eq('id', id)
  if (error) {
    console.error('[today DELETE 삭제 오류]', error)
    return NextResponse.json({ error: DELETE_ERROR_MESSAGE }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
