/**
 * POST /api/admin/ops-inbox/[bundleId]/open — 기획 상세를 처음 열 때 「도착 → 검토중」 전환 (티켓 20260930_1817)
 *
 * 화면(`OpsBundleWorkspace`)이 기획 상세를 열 때 **따로 한 번** 부른다. 상세 화면을 그리는 읽기 요청(`getOpsBundleDetail`)은
 * 상태를 바꾸지 않는다(상위 티켓 20260930_1455 가정 3). 그 묶음에서 `status = 'arrived'`인 항목만 `reviewing`으로 바꾸므로
 * 여러 번 불러도, 여러 탭에서 동시에 불러도 결과가 같고 이미 결정된 항목은 건드리지 않는다.
 *
 * - 관리자 로그인 세션만 통과한다. 읽기 토큰으로는 이 경로에 닿기 전에 proxy가 로그인으로 돌려보낸다
 *   (토큰 쓰기 예외는 제출 경로 하나뿐이다 — `opsInbox/constants.ts`).
 * - 결정 기록은 남기지 않는다(기록 대상은 제출·승인·반려·수정이다, 상위 티켓 가정 6).
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { isUuid } from '@/lib/admin/uuid'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(_req: Request, { params }: { params: Promise<{ bundleId: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const { bundleId } = await params
  if (!isUuid(bundleId)) {
    return NextResponse.json({ error: '기획 ID 형식이 올바르지 않아요.' }, { status: 400 })
  }

  const service = createServiceClient()

  const found = await service.from('ops_bundles').select('id').eq('id', bundleId).maybeSingle()
  if (found.error) {
    console.error('[ops-inbox/open] 묶음 조회 실패:', found.error.message)
    return NextResponse.json({ error: '검토중으로 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, { status: 500 })
  }
  if (!found.data) return NextResponse.json({ error: '찾을 수 없는 기획이에요.' }, { status: 404 })

  // 도착 항목만 바꾼다. 그 사이 다른 곳에서 결정한 항목은 조건에 걸려 그대로 남는다.
  const updated = await service
    .from('ops_bundle_items')
    .update({ status: 'reviewing', updated_at: new Date().toISOString() })
    .eq('bundle_id', bundleId)
    .eq('status', 'arrived')
    .select('id')
  if (updated.error) {
    console.error('[ops-inbox/open] 항목 상태 변경 실패:', updated.error.message)
    return NextResponse.json({ error: '검토중으로 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, changed: updated.data?.length ?? 0 })
}
