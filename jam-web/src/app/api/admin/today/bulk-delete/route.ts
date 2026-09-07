import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'

/**
 * 투데이 콘텐츠(today_cards) 다중선택 일괄 하드 삭제 (티켓 20260907_1134).
 *
 * 사전 조사 결과 참조 위험이 낮다고 판단해(카드는 다른 콘텐츠가 참조하는 대상이 아니라
 * 참조하는 쪽이다 — `mission_id`/`item_book_id`/`badge_ids`는 전부 today_cards → 다른
 * 엔티티 방향) 별도 참조 가드 없이 **한 번의 DELETE 쿼리**로 처리한다(순차 단건 호출이 아님).
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((id): id is string => typeof id === 'string') : []
  if (ids.length === 0) {
    return NextResponse.json({ error: '삭제할 카드를 선택해주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('today_cards').delete().in('id', ids).select('id')
  if (error) {
    console.error('[today bulk-delete] 삭제 실패:', error.message)
    return NextResponse.json({ error: `삭제 중 오류가 발생했습니다: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ deleted: (data ?? []).map((row) => row.id), blocked: [] })
}
