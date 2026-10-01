/**
 * DELETE /api/admin/ops-rules/signals/[signalKey]/[thresholdKey] — 신호 기준값 한 칸을 기본값으로 되돌리기 (티켓 20260930_1459 조각 C, 운영툴 PRD §11.5)
 *
 * 그 칸의 `ops_rules` 행만 지운다(변경 기록도 함께 사라진다). 쿼리 `expectedUpdatedAt`(화면이 본 그 칸 행의 수정 시각, 필수)과 현재 행이 같을 때만 지우고,
 * 행이 없거나 그사이 바뀌었으면 409다. 처리는 `opsSignals/saveThresholds.ts`의 `revertSignalThreshold`가 한다. 응답은 200 `{ threshold }`(기본값 그대로가 된 칸),
 * 400(읽기 전용 칸·수정 시각 없음), 404(없는 신호·칸), 409, 500이다.
 *
 * 관리자 로그인 세션(`getAdminUser()`)만 통과한다. 읽기 토큰으로는 쓸 수 없다.
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { revertSignalThreshold } from '@/lib/admin/opsSignals/saveThresholds'

export async function DELETE(req: Request, { params }: { params: Promise<{ signalKey: string; thresholdKey: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const { signalKey, thresholdKey } = await params
  const expectedUpdatedAt = new URL(req.url).searchParams.get('expectedUpdatedAt')

  const outcome = await revertSignalThreshold(createServiceClient(), { signalKey, thresholdKey, expectedUpdatedAt })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json({ threshold: outcome.threshold })
}
