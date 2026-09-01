import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

/**
 * 이 세계관에 이미 저장된 background_color / background_animation 2필드를, 3단 전체로 1회성
 * 복사한다 (20260819_015 도입 → 20260901_1929로 background_color 1필드로 축소 →
 * 20260901_1944에서 카드 안 애니메이션 파라미터 추가):
 *   (a) 이 세계관에 직속된 배지(badges.faction_id 일치, 소프트 삭제되지 않음)
 *   (b) 이 세계관 소속 모든 컬렉션(item_books.faction_id 일치)
 *   (c) (b)에서 찾은 컬렉션들에 속한 모든 아이템배지(badges.item_book_id IN (...), 소프트 삭제
 *       되지 않음)
 * 자동 fallback이 아니라 버튼을 누른 순간의 값만 반영 — 이후 세계관 값이 바뀌어도 다시 이 API를
 * 호출하기 전까지는 하위 값이 그대로 유지된다. 항상 덮어쓴다(사용자 확정 방침, 예외 없음).
 *
 * 3단 UPDATE는 단일 plpgsql 함수(apply_faction_background_cascade, 마이그레이션 092 →
 * background_color 1필드로 축소한 121 → background_animation을 더한 122)로 묶여 하나의 함수
 * 호출(=암묵적 트랜잭션)로 all-or-nothing이 보장된다 (20260819_016). 복사 대상 필드가 늘어나도
 * 이 라우트는 바뀌지 않는다 — 필드 목록은 RPC 안에 있다.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('apply_faction_background_cascade', { p_faction_id: id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const row = (Array.isArray(data) ? data[0] : data) as {
    direct_badges: number
    item_books: number
    item_book_badges: number
  } | undefined
  if (!row) return NextResponse.json({ error: '세계관을 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({
    directBadges: row.direct_badges,
    itemBooks: row.item_books,
    itemBookBadges: row.item_book_badges,
    appliedCount: row.direct_badges + row.item_books + row.item_book_badges,
  })
}

/**
 * 일괄 적용 확인 다이얼로그용 건수 미리보기 (20260819_016). UPDATE 없이 apply와 동일한 3단
 * 조건으로 COUNT만 계산하는 count_faction_background_cascade(마이그레이션 092)를 호출한다 —
 * 전체 배지/컬렉션 목록을 클라이언트로 내려보내지 않는다. 실제 적용 시점과 시간차가 있을 수
 * 있어(동시 편집 등) 최종 진실값은 항상 POST 응답의 결과 배너다.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('count_faction_background_cascade', { p_faction_id: id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const row = (Array.isArray(data) ? data[0] : data) as {
    direct_badges: number
    item_books: number
    item_book_badges: number
  } | undefined
  if (!row) return NextResponse.json({ error: '세계관을 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({
    directBadges: row.direct_badges,
    itemBooks: row.item_books,
    itemBookBadges: row.item_book_badges,
  })
}
