import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

/**
 * 이 세계관에 이미 저장된 background_color/background_shader_id/background_image_url/
 * background_video_url 4필드를, 3단 전체로 1회성 복사한다 (20260819_015):
 *   (a) 이 세계관에 직속된 배지(badges.faction_id 일치, 소프트 삭제되지 않음)
 *   (b) 이 세계관 소속 모든 컬렉션(item_books.faction_id 일치)
 *   (c) (b)에서 찾은 컬렉션들에 속한 모든 아이템배지(badges.item_book_id IN (...), 소프트 삭제
 *       되지 않음)
 * 자동 fallback이 아니라 버튼을 누른 순간의 값만 반영 — 이후 세계관 값이 바뀌어도 다시 이 API를
 * 호출하기 전까지는 하위 값이 그대로 유지된다. 항상 덮어쓴다(사용자 확정 방침, 예외 없음).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: faction, error: factionError } = await supabase
    .from('factions')
    .select('background_color, background_shader_id, background_image_url, background_video_url')
    .eq('id', id)
    .single()
  if (factionError || !faction) {
    return NextResponse.json({ error: '세계관을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { background_color, background_shader_id, background_image_url, background_video_url } = faction as {
    background_color: string | null
    background_shader_id: string | null
    background_image_url: string | null
    background_video_url: string | null
  }
  const backgroundFields = { background_color, background_shader_id, background_image_url, background_video_url }

  // (a) 세계관 직속 배지
  const directBadgesQuery = supabase.from('badges')
  // @ts-expect-error Supabase update 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 BadgesRow와 일치
  const directBadgesUpdate = directBadgesQuery.update(backgroundFields)
  const { data: directBadgesData, error: directBadgesError } = await directBadgesUpdate
    .eq('faction_id', id)
    .is('deleted_at', null)
    .select('id')
  if (directBadgesError) return NextResponse.json({ error: directBadgesError.message }, { status: 500 })

  // (b) 세계관 소속 컬렉션
  const itemBooksQuery = supabase.from('item_books')
  // @ts-expect-error Supabase update 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 ItemBooksRow와 일치
  const itemBooksUpdate = itemBooksQuery.update(backgroundFields)
  const { data: itemBooksData, error: itemBooksError } = await itemBooksUpdate
    .eq('faction_id', id)
    .select('id')
  if (itemBooksError) return NextResponse.json({ error: itemBooksError.message }, { status: 500 })

  const itemBookIds = ((itemBooksData ?? []) as { id: string }[]).map((row) => row.id)

  // (c) 그 컬렉션들에 속한 아이템배지
  let itemBookBadgesCount = 0
  if (itemBookIds.length > 0) {
    const itemBookBadgesQuery = supabase.from('badges')
    // @ts-expect-error Supabase update 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 BadgesRow와 일치
    const itemBookBadgesUpdate = itemBookBadgesQuery.update(backgroundFields)
    const { data: itemBookBadgesData, error: itemBookBadgesError } = await itemBookBadgesUpdate
      .in('item_book_id', itemBookIds)
      .is('deleted_at', null)
      .select('id')
    if (itemBookBadgesError) return NextResponse.json({ error: itemBookBadgesError.message }, { status: 500 })
    itemBookBadgesCount = (itemBookBadgesData ?? []).length
  }

  const directBadges = (directBadgesData ?? []).length
  const itemBooks = itemBookIds.length

  return NextResponse.json({
    directBadges,
    itemBooks,
    itemBookBadges: itemBookBadgesCount,
    appliedCount: directBadges + itemBooks + itemBookBadgesCount,
  })
}
