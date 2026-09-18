import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { computeKpiWeeklyMetrics, resolveKpiWeeklyRange } from '@/lib/admin/kpiWeekly'

/**
 * GET /api/admin/kpi/weekly — 주간 운영 이상 4개 집계 (티켓 20260918_1150)
 *
 * GA4가 놓치는 지표(미션 달성자 수·배지 발급량·Strava 동기화 실패·앰비언트 드랍 만료)를
 * 어드민 세션 쿠키 없이 자동화 토큰(`x-admin-read-token`, 티켓 20260918_1149)으로도 조회할
 * 수 있게 한다 — 읽기 전용 GET이라 `requireAdminRead`를 쓴다.
 *
 * `?days=N`으로 기간을 바꿀 수 있다(기본 7일). 응답에는 집계 숫자만 담고 개인 식별
 * 정보(닉네임·이메일·유저 ID)는 절대 넣지 않는다 — 각 지표 정의는 `lib/admin/kpiWeekly.ts`
 * 참고.
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdminRead(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const range = resolveKpiWeeklyRange(searchParams.get('days'))

  try {
    const metrics = await computeKpiWeeklyMetrics(range)
    return NextResponse.json(metrics)
  } catch (err) {
    console.error('[/api/admin/kpi/weekly] 집계 오류:', err)
    return NextResponse.json({ error: '집계 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
