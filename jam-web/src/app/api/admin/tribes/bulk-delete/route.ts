import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { collectTribeReferences, TRIBE_REFERENCE_SOURCES, summarizeReference } from '@/lib/admin/reference-guards'

/**
 * 트라이브(tribes) 다중선택 일괄 하드 삭제 (티켓 20260907_1134) — 참조가 있는 항목만
 * 건너뛰고 나머지는 **한 번의 DELETE 쿼리**로 삭제한다. 단건 DELETE(`tribes/[id]/route.ts`)와
 * 같은 가드 함수(`reference-guards.ts`)를 쓴다.
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((id): id is string => typeof id === 'string') : []
  if (ids.length === 0) {
    return NextResponse.json({ error: '삭제할 트라이브를 선택해주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { counts, error: refError } = await collectTribeReferences(supabase, ids)
  if (refError) {
    console.error('[tribes bulk-delete] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', refError)
    return NextResponse.json(
      { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }

  const blocked: { id: string; reason: string }[] = []
  const deletable: string[] = []
  for (const id of ids) {
    const summary = summarizeReference(TRIBE_REFERENCE_SOURCES, counts.get(id)!)
    if (summary.blockingTotal > 0) {
      blocked.push({ id, reason: `연결된 참조 ${summary.blockingTotal}건(${summary.hitLabels})` })
    } else {
      deletable.push(id)
    }
  }

  let deleted: string[] = []
  if (deletable.length > 0) {
    const { data, error } = await supabase.from('factions').delete().in('id', deletable).select('id')
    if (error) {
      console.error('[tribes bulk-delete] 삭제 실패:', error.message)
      return NextResponse.json(
        { error: `삭제 중 오류가 발생했습니다: ${error.message}`, deleted: [], blocked },
        { status: 500 }
      )
    }
    deleted = (data ?? []).map((row) => row.id)
  }

  return NextResponse.json({ deleted, blocked })
}
