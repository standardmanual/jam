import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { collectMissionReferences, MISSION_REFERENCE_SOURCES, summarizeReference } from '@/lib/admin/reference-guards'

/**
 * 미션 다중선택 일괄 하드 삭제 (티켓 20260907_1134) — 참조가 있는 항목만 건너뛰고 나머지는
 * **한 번의 DELETE 쿼리**로 삭제한다(순차 단건 DELETE 반복이 아니다). 부분 실패가 아니라
 * 「원래부터 차단된 항목」과 「삭제된 항목」을 항목별로 나눠 보고한다.
 *
 * 단건 DELETE(`missions/[id]/route.ts`)와 같은 가드 함수(`reference-guards.ts`)를 쓴다 —
 * 한쪽만 고쳐지는 일이 없도록.
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((id): id is string => typeof id === 'string') : []
  if (ids.length === 0) {
    return NextResponse.json({ error: '삭제할 미션을 선택해주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { counts, error: refError } = await collectMissionReferences(supabase, ids)
  if (refError) {
    console.error('[missions bulk-delete] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', refError)
    return NextResponse.json(
      { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }

  const blocked: { id: string; reason: string }[] = []
  const deletable: string[] = []
  for (const id of ids) {
    const summary = summarizeReference(MISSION_REFERENCE_SOURCES, counts.get(id)!)
    if (summary.blockingTotal > 0) {
      blocked.push({ id, reason: `참여·완료 이력 ${summary.blockingTotal}건(${summary.hitLabels})` })
    } else {
      deletable.push(id)
    }
  }

  let deleted: string[] = []
  if (deletable.length > 0) {
    const { data, error } = await supabase.from('missions').delete().in('id', deletable).select('id')
    if (error) {
      console.error('[missions bulk-delete] 삭제 실패:', error.message)
      return NextResponse.json(
        { error: `삭제 중 오류가 발생했습니다: ${error.message}`, deleted: [], blocked },
        { status: 500 }
      )
    }
    deleted = (data ?? []).map((row) => row.id)
  }

  return NextResponse.json({ deleted, blocked })
}
