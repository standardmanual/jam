import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

/**
 * 이 컬렉션에 이미 저장된 background_color 값을, 이 컬렉션에 속한(item_book_id 일치, 소프트
 * 삭제되지 않은) 모든 배지에 1회성으로 복사한다 (20260818_004).
 * 자동 fallback이 아니라 버튼을 누른 순간의 값만 반영 — 이후 컬렉션 값이 바뀌어도 다시
 * 이 API를 호출하기 전까지는 배지 쪽 값이 그대로 유지된다. 항상 덮어쓴다(사용자 확정 방침).
 *
 * background_shader_id/background_image_url/background_video_url은 더 이상 복사하지 않는다
 * (티켓 20260901_1929 — 배경 제너레이터·쉐이더 기능 제거). 어드민 저작 화면에서 더 이상 이
 * 필드들을 채울 방법이 없으므로, 과거에 만들어진 값이 배지 쪽에 남아 있어도 그대로 둔다.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: itemBook, error: itemBookError } = await supabase
    .from('item_books')
    .select('background_color')
    .eq('id', id)
    .single()
  if (itemBookError || !itemBook) {
    return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { background_color } = itemBook as { background_color: string | null }

  const badgesQuery = supabase.from('badges')
  const updateQuery = badgesQuery.update({ background_color })
  const { data, error } = await updateQuery
    .eq('item_book_id', id)
    .is('deleted_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appliedCount: (data ?? []).length })
}
