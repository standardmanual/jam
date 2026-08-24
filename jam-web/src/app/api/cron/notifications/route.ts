/**
 * GET /api/cron/notifications
 * 매일 09:00(UTC) = KST 18:00 실행: 알림(소식) T2 11종 배치 생성 — 티켓 20260825_002
 * Vercel Cron: "0 9 * * *"
 *
 * KST 18:00인 이유 — 01_PRD.md §2의 핵심 시나리오가 "운동 후 귀가해서 저녁에 확인"이다.
 * 저녁 접속 시점에 소식이 갓 만들어져 있는 게 가장 신선하다. 기존 cron 2개
 * (UTC 00:00 poi-cleanup, UTC 18:00 ambient-drop-monitor)와도 겹치지 않는다.
 *
 * **소식 종류마다 cron을 만들지 않는다.** Vercel Hobby 플랜의 cron 빈도 제한이 과거
 * 배포 실패의 원인이었다(20260723_004).
 */
import { NextRequest, NextResponse } from 'next/server'
import { runNotificationBatch } from '@/lib/notifications/batch'

/** 전체 유저 스캔이라 기본 10초로는 부족하다 (strava/sync와 같은 상한) */
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 배치 시작 시각을 여기서 한 번만 캡처한다 — 모든 group_key 빌더가 이 값을 공유해야
  // KST 자정을 걸쳐 도는 배치가 두 날짜 키로 갈리지 않는다.
  const result = await runNotificationBatch(new Date())

  const summary = result.steps
    .map((s) => `${s.step}=${s.created}${s.failed > 0 ? `/실패${s.failed}` : ''}${s.error ? '(오류)' : ''}`)
    .join(' ')
  console.info(
    `[cron/notifications] 생성 ${result.created}건, 실패 ${result.failed}건, ${result.durationMs}ms — ${summary}`
  )

  return NextResponse.json(result)
}
