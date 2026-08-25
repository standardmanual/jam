/**
 * GET /api/cron/notifications
 * 매일 09:00(UTC) = KST 18:00 실행: 알림(소식) T2 11종 배치 생성 — 티켓 20260825_002
 * Vercel Cron: "0 9 * * *"
 *
 * KST 18:00인 이유 — 01_PRD.md §2의 핵심 시나리오가 "운동 후 귀가해서 저녁에 확인"이다.
 * 저녁 접속 시점에 소식이 갓 만들어져 있는 게 가장 신선하다. poi-cleanup(UTC 00:00)과도
 * 겹치지 않는다.
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

  // 요약에 scanned·drafts를 반드시 싣는다 — 생성 수만 보면 "정상 0건"(#24는 최근 종료
  // 미션이 없으면 0이 맞다)과 "판정이 깨져서 0건"이 똑같아 보인다. scanned > 0인데
  // drafts가 0인 단계가 며칠 이어지면 그 단계의 판정이 죽은 것이다.
  const summary = result.steps
    .map(
      (s) =>
        `${s.step}: 생성${s.created}/시도${s.drafts}/스캔${s.scanned}/${s.durationMs}ms` +
        `${s.failed > 0 ? ` 실패${s.failed}` : ''}${s.error ? ' 오류' : ''}`
    )
    .join(' | ')
  const headline =
    `[cron/notifications] 생성 ${result.created}건, 시도 ${result.drafts}건, ` +
    `스캔 ${result.scanned}행, 실패 ${result.failed}건, ${result.durationMs}ms — ${summary}`

  // 단계가 하나라도 실패하면 non-2xx로 알린다. Vercel의 cron 실패 감지는 상태 코드
  // 기준이라 200을 주면 마이그레이션 미적용 같은 상태가 **대시보드에서 성공으로 보인다.**
  // 11종 전부 `once` + `group_key`라 재시도가 와도 중복은 생기지 않는다.
  const failedSteps = result.steps.filter((s) => s.error)
  if (failedSteps.length > 0) {
    console.error(`${headline} — 실패 단계: ${failedSteps.map((s) => s.step).join(', ')}`)
    return NextResponse.json({ ...result, ok: false }, { status: 500 })
  }

  console.info(headline)
  return NextResponse.json({ ...result, ok: true })
}
