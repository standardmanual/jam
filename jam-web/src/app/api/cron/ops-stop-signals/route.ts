/**
 * GET /api/cron/ops-stop-signals — 운영툴 중단 신호 매시 점검 (티켓 20261001_1154, 상위 20260930_1502 ④)
 *
 * Vercel Cron: 매시 5분(`5 * * * *`, 일정은 `vercel.json`). 10분마다 도는 상태 맞추기(`ops-reconcile`, 0·10·20… 분)와 겹치지 않는 시각이다.
 * 순서는 늘 같다: ① 상태 맞추기(`reconcileOpsItems`, DB를 쓴다) → ② 그 결과의 슬랙 글을 응답 뒤(`after`)에 예약 → ③ 신호를 계산해 직전 한 시간 창에 새로 걸린
 * 예약 누락·루틴 실패를 `#jam-alert`에 한 건 올린다(`runStopSignalCheck`, DB를 쓰지 않는다). 맞추기를 먼저 하지 않으면 정상 공개된 항목이 「예약됨」에 남아 「예약 누락」으로 잘못 뜬다.
 *
 * - `CRON_SECRET`이 비었거나 헤더가 `Bearer <값>`과 다르면 401이다. 비어 있을 때 「Bearer undefined」가 통과하지 않도록 값을 먼저 막는다.
 * - 상태 맞추기가 실패하면(`RunFailure`이거나 던짐) 예약 누락 알림만 건너뛰고 루틴 실패는 알리며 500을 돌려준다(루틴 실패는 상태 맞추기와 관계없다).
 * - 묶음을 읽지 못했거나(`load_failed`) 슬랙에 올리지 못했으면(`slack_failed`) 500이다. 묶음을 읽지 못하면 글은 올리지 않고 로그만 남긴다. 슬랙 값이 없으면(`not_configured`) 오류가 아니라 200이다.
 * - 실행 실패는 알리지 않는다(상태 맞추기와 예약 등록이 이미 알린다). 응답 본문은 개수와 상태만 싣는다(항목 ID·문장은 싣지 않는다).
 * - Vercel의 cron 실패 감지는 상태 코드 기준이라 200이면 대시보드에서 성공으로 보인다(`cron/notifications` 선례).
 */
import { NextRequest, NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyReconcile, reconcileOpsItems, type ReconcileSuccess } from '@/lib/admin/opsInbox/execute/reconcile'
import { runStopSignalCheck } from '@/lib/admin/opsSignals/stopAlert'

const LOG = '[cron/ops-stop-signals]'

// 상태 맞추기(항목마다 자원을 읽고 상태를 쓴다)와 신호 계산(카드·미션·묶음·행동 건수 조회)을 한 회차에 한다. 기본 제한보다 늘려 중간에 잘리지 않게 한다.
export const maxDuration = 60

/** 상태 맞추기를 한 번 부른다. 성공이 아니면(실패 응답이거나 던짐) `null`이고 사유는 로그에 남긴다. */
async function reconcileOnce(service: ReturnType<typeof createServiceClient>): Promise<ReconcileSuccess | null> {
  try {
    const result = await reconcileOpsItems(service)
    if (result.ok) return result
    console.error(`${LOG} 상태 맞추기를 하지 못했어요:`, result.error)
  } catch (error) {
    console.error(`${LOG} 상태 맞추기가 중간에 멈췄어요:`, error instanceof Error ? error.message : String(error))
  }
  return null
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  // ① 상태 맞추기 → ② 그 결과의 슬랙 글(응답 뒤, 던지지 않는다)
  const reconciled = await reconcileOnce(service)
  if (reconciled) {
    after(() => notifyReconcile(service, reconciled))
    if (reconciled.errors > 0) console.warn(`${LOG} 상태 맞추기에서 건너뛴 항목이 ${reconciled.errors}건 있어요`)
  }

  // ③ 신호 계산과 알림. 맞추기가 실패했으면 정상 공개된 항목이 「예약됨」에 남았을 수 있어 예약 누락 알림만 건너뛴다.
  const check = await runStopSignalCheck({ skipMissedSchedule: reconciled === null })

  const post = check.ok ? check.post : check.error === 'slack_failed' ? 'failed' : 'none'
  const body = {
    ok: reconciled !== null && check.ok,
    reconcile: reconciled ? 'ok' : 'failed',
    missedSchedule: check.counts.missedSchedule,
    routineFailed: check.counts.routineFailed,
    post,
    ...(check.ok ? {} : { error: check.error }),
  }
  const headline =
    `${LOG} 예약 누락 ${body.missedSchedule}, 루틴 실패 ${body.routineFailed}, 슬랙 ${post}, ` +
    `상태 맞추기 ${body.reconcile}${check.ok ? '' : `, 오류 ${check.error}`}`

  if (!body.ok) {
    console.error(headline)
    return NextResponse.json(body, { status: 500 })
  }

  console.info(headline)
  return NextResponse.json(body)
}
