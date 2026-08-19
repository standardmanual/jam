import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

/**
 * 이 컬렉션에 이미 저장된 background_color/background_shader_id 값을, 이 컬렉션에 속한
 * (item_book_id 일치, 소프트 삭제되지 않은) 모든 배지에 1회성으로 복사한다 (20260818_004).
 * 자동 fallback이 아니라 버튼을 누른 순간의 값만 반영 — 이후 컬렉션 값이 바뀌어도 다시
 * 이 API를 호출하기 전까지는 배지 쪽 값이 그대로 유지된다.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: itemBook, error: itemBookError } = await supabase
    .from('item_books')
    .select('background_color, background_shader_id')
    .eq('id', id)
    .single()
  if (itemBookError || !itemBook) {
    return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { background_color, background_shader_id } = itemBook as {
    background_color: string | null
    background_shader_id: string | null
  }

  const badgesQuery = supabase.from('badges')
  // @ts-expect-error Supabase update 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 BadgesRow와 일치
  const updateQuery = badgesQuery.update({ background_color, background_shader_id })
  const { data, error } = await updateQuery
    .eq('item_book_id', id)
    .is('deleted_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appliedCount: (data ?? []).length })
}
