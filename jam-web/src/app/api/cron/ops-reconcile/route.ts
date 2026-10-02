/**
 * GET /api/cron/ops-reconcile — 운영툴 상태 맞추기 (티켓 20261002_1814, 상위 20260930_1500 ⑦-b)
 *
 * Vercel Cron: 10분마다(일정은 `vercel.json`). `reconcileOpsItems`(`opsInbox/execute/reconcile.ts`)를 한 번 부른다 — 예약된 항목의 공개·종료 시각이 지났는지,
 * 자원이 밖에서 바뀌거나 지워졌는지 보고 항목 상태와 결정 기록을 자원에 맞춘다. 판정과 쓰기는 모두 그 함수가 한다. 이 라우트는 인증·응답 모양·응답 뒤 슬랙 글만 맡는다.
 *
 * - `CRON_SECRET`이 비었거나 헤더가 `Bearer <값>`과 다르면 401이다. 비어 있을 때 「Bearer undefined」가 통과하지 않도록 값을 먼저 막는다(P3 20260929_1636).
 * - 읽기 재료를 읽지 못한 `RunFailure`는 그 상태 코드와 `{ ok: false, error }`다.
 * - 성공 본문에는 개수만 싣는다(항목 ID·사유는 싣지 않는다). 건너뛴 항목이 있으면(`errors > 0`) 500이다 — Vercel의 cron 실패 감지는 상태 코드 기준이라 200이면 대시보드에서
 *   성공으로 보인다(`cron/notifications` 선례). 다음 회차가 건너뛴 항목을 다시 맡으므로 재시도가 와도 중복은 생기지 않는다.
 * - 슬랙 글은 오류가 있어도 성공(`ReconcileSuccess`)이면 응답이 나간 뒤(`after`) 올린다. `notifyReconcile`은 던지지 않는다.
 */
import { NextRequest, NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyReconcile, reconcileOpsItems } from '@/lib/admin/opsInbox/execute/reconcile'

// 대상 항목마다 자원을 읽고 상태·결정 기록을 쓴다. 기본 제한보다 늘려 한 회차가 중간에 잘리지 않게 한다.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const result = await reconcileOpsItems(service)

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
  }

  after(() => notifyReconcile(service, result))

  const counts = {
    published: result.published.length,
    ended: result.ended.length,
    cancelled: result.cancelled.length,
    failed: result.failed.length,
    externalChanged: result.externalChanged.length,
    errors: result.errors,
  }
  const headline =
    `[cron/ops-reconcile] 공개 ${counts.published}, 종료 ${counts.ended}, 취소 ${counts.cancelled}, 실패 ${counts.failed}, ` +
    `밖에서 바뀜 ${counts.externalChanged}, 건너뜀 ${counts.errors}`

  if (counts.errors > 0) {
    console.error(headline)
    return NextResponse.json({ ok: false, ...counts }, { status: 500 })
  }

  console.info(headline)
  return NextResponse.json({ ok: true, ...counts })
}
