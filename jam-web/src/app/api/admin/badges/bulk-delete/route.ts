import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { invalidateUnclaimedDrops } from '@/lib/admin/poi-drops'
import { BADGE_REFERENCE_SOURCES, collectBadgeReferences } from '@/lib/admin/badge-references'

/**
 * 배지 목록 화면의 다중선택 일괄 하드 삭제 (티켓 20260907_1134).
 *
 * `/api/admin/badges/bulk`(필터 기반 대량 작업 도구, confirm-token dry-run 절차)와는 다른
 * 별개 엔드포인트다 — 이쪽은 목록 화면에서 체크박스로 고른 소수(페이지 크기 50건 이하)를
 * 대상으로 하는 단순 즉시 실행이다. 참조 가드는 단건 하드 삭제(`badges/[id]/route.ts`)와
 * **같은 함수**(`collectBadgeReferences`)를 쓴다 — 새 가드를 만들지 않는다(티켓 판단).
 *
 * 참조 카운트 조회는 배지 하나당 여러 테이블을 훑으므로, 동시 실행 폭을 제한해 커넥션
 * 풀 고갈을 피한다(`badges/bulk` maxDuration 60초 선례와 같은 이유).
 */
export const maxDuration = 60

const REFERENCE_CHECK_CONCURRENCY = 5

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const current = cursor++
      results[current] = await fn(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((id): id is string => typeof id === 'string') : []
  if (ids.length === 0) {
    return NextResponse.json({ error: '삭제할 배지를 선택해주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const perId = await mapWithConcurrency(ids, REFERENCE_CHECK_CONCURRENCY, async (id) => {
    const references = await collectBadgeReferences(supabase, [id])
    return { id, references }
  })

  // 한 배지라도 참조 조회가 실패하면 fail-closed로 전체를 중단한다 — 부분 정보로 삭제
  // 대상을 나누면 CASCADE 참조를 0건으로 오판할 위험이 있다(badges DELETE와 동일 원칙).
  const failed = perId.find((p) => p.references.error)
  if (failed) {
    console.error('[badges bulk-delete] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', failed.references.error)
    return NextResponse.json(
      { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }

  const blocked: { id: string; reason: string }[] = []
  const deletable: string[] = []
  for (const { id, references } of perId) {
    const hitLabels = BADGE_REFERENCE_SOURCES.filter((s) => references.counts[s.key] > 0)
      .map((s) => `${s.label} ${references.counts[s.key]}건`)
      .join(', ')
    const hardBlocking = references.blockingTotal + references.cascadeTotal
    if (hardBlocking > 0) {
      blocked.push({ id, reason: `발급·드랍·지점 연결 이력 ${hardBlocking}건(${hitLabels})` })
    } else if (references.total > 0) {
      blocked.push({ id, reason: `콘텐츠 참조 ${references.total}건 남음(${hitLabels}) — 참조 정리 먼저 필요` })
    } else {
      deletable.push(id)
    }
  }

  let deleted: string[] = []
  if (deletable.length > 0) {
    const { data, error } = await supabase.from('badges').delete().in('id', deletable).select('id')
    if (error) {
      console.error('[badges bulk-delete] 삭제 실패:', error.message)
      return NextResponse.json(
        { error: `삭제 중 오류가 발생했습니다: ${error.message}`, deleted: [], blocked },
        { status: 500 }
      )
    }
    deleted = (data ?? []).map((row) => row.id)
    // 이력 0건 조건에 poi_drops도 포함돼 있어 여기 도달했다면 무효화할 미픽업 드랍은 사실상
    // 없지만, 방어적으로 유지한다(단건 DELETE와 동일 관례).
    await invalidateUnclaimedDrops(supabase, deleted, 'admin badges bulk-delete')
  }

  return NextResponse.json({ deleted, blocked })
}
