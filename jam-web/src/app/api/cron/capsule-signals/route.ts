/**
 * GET /api/cron/capsule-signals — 캡슐·소멸 운영 신호 일일 요약 (티켓 20261031_1525, 상위 20261028_1743)
 *
 * Vercel Cron: 매일 UTC 00:10 = KST 09:10(`10 0 * * *`, 일정은 `vercel.json`). 어제(KST) 하루의 소멸·열린 캡슐과 지금의 보류 유저 비율을 `#jam-alert`에 한 건 올린다.
 * 읽기 전용이다(DB를 쓰지 않는다). 값 읽기와 글 만들기는 `lib/capsule/dailySignals.ts`.
 *
 * - `CRON_SECRET`이 비었거나 헤더가 `Bearer <값>`과 다르면 401이다(`ops-stop-signals`와 같다).
 * - 세 항목을 모두 읽지 못하면 글을 올리지 않고 500과 로그만 남긴다. 일부만 못 읽었으면 «읽지 못했어요»로 적고 올린다.
 * - 슬랙 값이 없으면(`not_configured`) 올리지 못한 채 200과 `post: 'none'`이다(로컬 개발). 슬랙 게시가 실패하면 500이다. 던지지 않는다.
 * - 응답 본문은 개수와 상태만 싣는다(글 내용·개인 값은 싣지 않는다).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { postOpsSlack } from '@/lib/admin/opsInbox/slack'
import { formatCapsuleDailySignals, isAllUnread, readCapsuleDailySignals } from '@/lib/capsule/dailySignals'

const LOG = '[cron/capsule-signals]'

// 어제 하루의 소멸·열린 캡슐 행과 보류 표 전체를 페이지로 읽는다. 기본 제한보다 늘려 중간에 잘리지 않게 한다.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const signals = await readCapsuleDailySignals(createServiceClient())
  const counts = {
    forfeitUsers: signals.forfeit?.users ?? null,
    openedCapsules: signals.opens?.total ?? null,
    pendingUsers: signals.pending?.pendingUsers ?? null,
  }

  if (isAllUnread(signals)) {
    console.error(`${LOG} 세 항목을 모두 읽지 못해 글을 올리지 않았어요`)
    return NextResponse.json({ ok: false, ...counts, post: 'none', error: 'load_failed' }, { status: 500 })
  }

  const result = await postOpsSlack('alert', formatCapsuleDailySignals(signals))
  const headline = `${LOG} 소멸 유저 ${counts.forfeitUsers ?? '읽지 못함'}, 열린 캡슐 ${counts.openedCapsules ?? '읽지 못함'}, 보류 유저 ${counts.pendingUsers ?? '읽지 못함'}`

  if (result.ok) {
    console.info(`${headline}, 슬랙 sent`)
    return NextResponse.json({ ok: true, ...counts, post: 'sent' })
  }
  if (result.error === 'not_configured') {
    console.info(`${headline}, 슬랙 값이 없어 올리지 못했어요`)
    return NextResponse.json({ ok: true, ...counts, post: 'none' })
  }
  console.error(`${headline}, 슬랙 게시 실패 ${result.error ?? 'unknown'}`)
  return NextResponse.json({ ok: false, ...counts, post: 'failed', error: 'slack_failed' }, { status: 500 })
}
