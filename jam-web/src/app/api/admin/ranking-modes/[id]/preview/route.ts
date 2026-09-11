import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { computeRankingModeResult } from '@/lib/ranking/rankingDataSource'
import type { RankingModeRow } from '@/types/database'

/**
 * GET /api/admin/ranking-modes/[id]/preview — 랭킹모드가 실제로 계산하는 순위 목록.
 *
 * User Story 6("발행 전에 랭킹보드가 실제로 어떻게 보일지 미리보기로 확인")의 데이터 소스 —
 * 투데이 카드 생성·수정 화면(`TodayCardForm.tsx`)의 레일 실시간 미리보기가, 랭킹모드를
 * 이미 저장한 뒤(User Story 4 — "만들어둔 랭킹모드를 연결")에만 연결하므로 항상 id로 조회할
 * 수 있다 — 아직 저장 전인 초안(draft) 미리보기는 다루지 않는다.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('ranking_modes').select('*').eq('id', id).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '랭킹 규칙을 찾을 수 없어요.' }, { status: 404 })

  const result = await computeRankingModeResult(data as RankingModeRow, supabase)
  return NextResponse.json(result)
}
