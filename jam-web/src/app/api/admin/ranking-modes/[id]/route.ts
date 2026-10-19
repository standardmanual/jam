import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import type { RankingModeSavePayload } from '@/lib/admin/ranking-modes'
import { PERIOD_EARNED_CHECK_FAILED_ERROR, rankingModeMissionRejection } from '@/lib/admin/ranking-mode-mission-guard'
import {
  fetchLiveCardsByMode,
  formatRankingModeBlockedMessage,
  type RankingModeCardRef,
  type RankingModeReferenceClient,
} from '@/lib/admin/ranking-mode-references'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('ranking_modes').select('*').eq('id', id).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '랭킹 규칙을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const body = (await req.json()) as RankingModeSavePayload
  const supabase = createServiceClient()

  // 기간 동안 모은 잼 미션은 연결하지 못한다(티켓 20261019_1445 3-B). 본문에 미션이 없는 수정은 수정 뒤에도 남는 기존 연결을 본다(4회).
  // 조건을 읽지 못하면 저장하지 않는다(fail-closed).
  try {
    const rejection = await rankingModeMissionRejection(supabase, body, id)
    if (rejection) return NextResponse.json({ error: rejection }, { status: 400 })
  } catch (err) {
    console.error('[ranking-modes PATCH] 연결할 미션 조건 조회 실패 — 저장을 차단합니다:', err)
    return NextResponse.json({ error: PERIOD_EARNED_CHECK_FAILED_ERROR }, { status: 500 })
  }

  const { data, error } = await supabase.from('ranking_modes').update(body).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const supabase = createServiceClient()

  const { data: existing, error: lookupError } = await supabase
    .from('ranking_modes')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: '랭킹 규칙을 찾을 수 없습니다.' }, { status: 404 })

  // today_cards.ranking_mode_id는 ON DELETE SET NULL이라 DB가 삭제를 막아 주지 않는다 — 그대로
  // 지우면 이 규칙을 쓰던 랭킹보드 카드가 빈 채로 홈 피드에 남는다. 아직 보일 수 있는(활성이고
  // 종료 전인) 카드가 있으면 막고 카드 제목을 알려 준다(티켓 20260924_0947). 조회에 실패하면
  // "참조 없음"으로 보지 않고 삭제를 멈춘다(fail-closed).
  let liveCards: RankingModeCardRef[]
  try {
    const byMode = await fetchLiveCardsByMode(supabase as unknown as RankingModeReferenceClient, [id])
    liveCards = byMode.get(id) ?? []
  } catch (error) {
    console.error('[ranking-modes DELETE] 참조 카드 조회 실패 — 삭제를 차단합니다:', error)
    return NextResponse.json(
      { error: '삭제할 수 없어요. 연결된 카드를 확인하지 못했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }
  if (liveCards.length > 0) {
    return NextResponse.json({ error: formatRankingModeBlockedMessage(liveCards), cards: liveCards }, { status: 409 })
  }

  const { error } = await supabase.from('ranking_modes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
