/**
 * 캡슐 열기 API (티켓 20261018_0052 2회, 운영 로직 5.2절)
 *
 * POST /api/capsule/open — 가득 찬 캡슐을 연다. 개수·트라이브·등급·후보·잠김을 추첨해 지급하고 다음 캡슐을 만든다.
 *
 * 세션으로 유저를 확인하고(401) 서비스 클라이언트로 부른다. 대상은 세션 유저뿐이라 본문은 읽지 않는다.
 * 이용 정지 중이면 403(`code: 'user_suspended'`)이고 추첨하지 않는다.
 * 거절: `not_full`·`insufficient_slots`·`no_tribe`·`capsule_changed` 409(`insufficient_slots`는 응답에 지금 빈칸 수 `freeSlots`와 필요한 빈칸 수 `neededSlots`).
 * 그 밖의 오류는 500이고 내부 오류 원문은 싣지 않는다. 채운 잼은 거절·오류에서 그대로 남는다.
 *
 * 열기는 `counted: true`로 부른다(티켓 20261028_1735 3회): RPC `capsule_open_counted`를 쓰고 옛 챕터 점수 «캡슐 열기»를 쌓지 않는다.
 * 챕터 횟수 세기와 오름 처리는 열기가 아니라 `capsule_auto_fill`이 캡슐이 100%에 닿는 시점에 이미 했으므로 여기서는 하지 않는다.
 * counted 응답에 더해지는 챕터 횟수 칸(`chapterNo`·`reachedChapters`·`chapterCount`)은 라우트 응답 계약(`CapsuleOpenPayload`)에 없어 내려보내지 않는다 — 응답 모양은 그대로다.
 */
import { after, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { CapsuleError } from '@/lib/capsule/capsule'
import type { CapsuleErrorResponse, CapsuleOpenPayload } from '@/lib/capsule/capsule-contract'
import { openCapsule } from '@/lib/capsule/open'
import { runJamActionEvaluation } from '@/lib/badge-engine/jamActionRoute'
import { jamTriggersForCapsuleOpen } from '@/lib/badge-engine/jamActionProgressTriggers'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE, type UserSuspendedResponse } from '@/lib/suspension/suspension-contract'

export const dynamic = 'force-dynamic'

const OPEN_ERRORS = {
  not_full: d.capsule.openNotFull,
  insufficient_slots: d.capsule.openInsufficientSlots,
  no_tribe: d.capsule.openNoTribe,
  capsule_changed: d.capsule.changed,
} as const

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  try {
    const { openId, items, next } = await openCapsule(createServiceClient(), user.id, { counted: true })
    const payload: CapsuleOpenPayload = { openId, items, next }
    // JAM! 행동 지표(캡슐 연 횟수·다른 트라이브 아이템 종류 수) — 열기가 확정된 뒤 응답을 보내고 판정한다(티켓 20261018_1815).
    // `runJamActionEvaluation`은 예외를 던지지 않아 열기 응답은 그대로다.
    after(() => runJamActionEvaluation(user.id, jamTriggersForCapsuleOpen()))
    return NextResponse.json(payload)
  } catch (err) {
    const suspended = err instanceof UserSuspendedError || (err instanceof CapsuleError && err.code === 'user_suspended')
    if (suspended) {
      const body: UserSuspendedResponse = { error: d.suspension.capsuleOpenBlocked, code: USER_SUSPENDED_CODE }
      return NextResponse.json(body, { status: 403 })
    }
    if (err instanceof CapsuleError && (err.code === 'not_full' || err.code === 'insufficient_slots' || err.code === 'no_tribe' || err.code === 'capsule_changed')) {
      const body: CapsuleErrorResponse = {
        error: OPEN_ERRORS[err.code],
        code: err.code,
        ...(err.code === 'insufficient_slots' ? { freeSlots: err.freeSlots ?? 0, neededSlots: err.neededSlots ?? 0 } : {}),
      }
      return NextResponse.json(body, { status: 409 })
    }
    console.error('[/api/capsule/open] 열기 오류:', err)
    return NextResponse.json({ error: d.capsule.openFailed }, { status: 500 })
  }
}
