import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseTodayCardEventInput, recordTodayCardEvent } from '@/lib/today/events'
import { d } from '@/lib/i18n'

// 본문 크기 상한(문자 수). 정상 페이로드({"cardId":"...","event":"impression"})는 수십 바이트,
// followupAction(최대 80자)을 더해도 200바이트를 넘지 않는다 — 여유를 두되 남용은 막는다.
const MAX_BODY_LENGTH = 2000

/**
 * POST /api/today/events — 투데이 카드 노출·열람·후속 행동 기록 (티켓 20260924_0004)
 *
 * 로그인 세션이 있어야 받되, 유저 ID는 이 라우트 밖으로(로그·저장) 절대 넘기지 않는다
 * (PRD content-automation/PRD.md §9 "개인 식별자는 저장하지 않는다"). `TodayCardTracker`가
 * `navigator.sendBeacon` 우선/`fetch keepalive` 폴백으로 호출한다 — 응답 본문이 클라이언트에서
 * 쓰이지 않으므로 성공 시 204를 돌려준다.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: '요청 본문이 너무 큽니다.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = rawBody ? JSON.parse(rawBody) : null
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
  }

  const parsed = parseTodayCardEventInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const result = await recordTodayCardEvent(parsed.value)
  if (!result.ok) {
    console.error('[/api/today/events] 기록 오류:', result.error)
    return NextResponse.json({ error: '기록 중 오류가 발생했습니다.' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
