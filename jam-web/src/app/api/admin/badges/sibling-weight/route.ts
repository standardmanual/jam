import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import type { BadgeRarity } from '@/types/database'

/**
 * 아이템 배지 저작 화면(BadgeForm.tsx)의 "같은 컬렉션·희귀도 내 다른 배지 대비 이 배지가
 * 뽑힐 상대 확률" 미리보기 전용 조회. 예전에는 `GET /api/admin/badges`로 배지 테이블
 * 전체(수천 건)를 1,000건씩 페이지네이션해 끝까지 가져온 뒤 클라이언트에서 필터링했다
 * (티켓 20260906_1422). 이 라우트는 `item_book_id`+`rarity` 조건에 맞는 `drop_weight`
 * 합계만 서버에서 계산해 반환한다 — 패턴은 `/api/admin/badges/search`와 동일(이름 검색
 * 대신 컬렉션+희귀도 필터).
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const itemBookId = req.nextUrl.searchParams.get('item_book_id')
  const rarity = req.nextUrl.searchParams.get('rarity') as BadgeRarity | null
  // 수정 중인 배지 자신은 합계에서 제외한다 — 안 넘기면(신규 등록) 전부 포함.
  const excludeId = req.nextUrl.searchParams.get('excludeId')

  if (!itemBookId || !rarity) {
    return NextResponse.json({ error: 'item_book_id, rarity가 필요합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  let q = supabase
    .from('badges')
    .select('id, drop_weight')
    .eq('type', 'item')
    .eq('item_book_id', itemBookId)
    .eq('rarity', rarity)
    .is('deleted_at', null)

  if (excludeId) q = q.neq('id', excludeId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sum = (data ?? []).reduce((s, b) => s + (b.drop_weight ?? 1.0), 0)
  return NextResponse.json({ sum })
}
