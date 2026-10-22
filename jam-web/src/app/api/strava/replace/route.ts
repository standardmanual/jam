/**
 * «그래도 연결하기» API
 * POST /api/strava/replace   본문 없음 — 제안 쿠키(`strava_replace_offer`)와 로그인 세션이 입력이다
 *
 * 이미 다른 JAM! 계정에 연결된 Strava 계정을 이 계정에 연결한다. 기존 계정은 지운다(티켓 20261021_1249 4회, 운영 로직 3.2·17장).
 * 1. 로그인 확인 — 없으면 401.
 * 2. 제안 쿠키를 연다(서명, 10분 만료) — 없음·변조·만료는 400. 쿠키 안의 유저 id가 로그인한 유저와 다르면 400.
 *    쿠키는 콜백이 Strava 인증을 마친 직후에만 굽는다(`lib/strava/replace-offer.ts`). 다른 사이트에서 보낸 POST에는 sameSite=lax 쿠키가 실리지 않는다.
 * 3. 이 Strava 계정을 가진 기존 계정을 **다시** 찾아 판정한다(콜백이 시트를 보여 준 뒤 달라졌을 수 있다). 어드민이거나 이용 정지 중이면 403으로 막는다.
 *    기존 계정이 이 유저 자신이면 지우지 않는다(자기 계정을 지우는 일은 없다).
 * 4. 기존 계정을 지우는 규칙 한 함수 `deleteAccount`로 지운다. Strava 앱 해제는 건너뛴다(같은 Strava 계정이라 방금 받은 새 토큰까지 죽일 수 있다).
 *    그사이 이미 지워졌으면(not_found) 그대로 이어간다.
 * 5. 새 연결을 저장한다(`first_sync_pending: true`, 콜백과 같은 공용 함수). 이어서 첫 동기화를 시작한다(실패해도 연결은 성공).
 *
 * 실패 응답은 `{ error, next }`다. `error`는 `d.stravaConnection.replaceResult.*`로 완성한 문장이고 `next`는 시트가 어떤 모양이 될지 알린다
 * (`retry`: 다시 누르면 됨, `restart`: 처음부터 다시, `blocked`: 막힘 모양으로). DB·Auth·Strava 오류 원문과 토큰·쿠키 값은 응답과 로그 어디에도 싣지 않는다.
 * 삭제는 됐는데 저장이 실패한 경우만 `afterDeleteFailed` + restart다. 그 밖의 실패는 쿠키를 지우지 않아 같은 버튼으로 다시 시도할 수 있다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { deleteAccount } from '@/lib/account/delete-account'
import { assessDuplicateOwner, saveStravaConnection, syncAfterConnect } from '@/lib/strava/connection-save'
import {
  STRAVA_REPLACE_OFFER_COOKIE,
  getStravaReplaceOfferCookieOptions,
  openStravaReplaceOffer,
} from '@/lib/strava/replace-offer'
import type { StravaReplaceNext } from '@/lib/strava/replace-client'
import { d } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

const LOG = '[/api/strava/replace]'

/** 쿠키를 지운다. 심을 때와 같은 path여야 브라우저가 같은 쿠키로 인식한다 */
function withOfferCleared(response: NextResponse): NextResponse {
  response.cookies.set(STRAVA_REPLACE_OFFER_COOKIE, '', { ...getStravaReplaceOfferCookieOptions(), maxAge: 0 })
  return response
}

function failure(status: number, error: string, next: StravaReplaceNext, clearOffer: boolean): NextResponse {
  const response = NextResponse.json({ error, next }, { status })
  return clearOffer ? withOfferCleared(response) : response
}

export async function POST(request: NextRequest) {
  const copy = d.stravaConnection.replaceResult

  const sessionClient = await createClient()
  const {
    data: { user },
    error,
  } = await sessionClient.auth.getUser()
  if (error || !user) {
    return failure(401, copy.restart, 'restart', true)
  }

  // 기존 계정을 지운 뒤인지 — 예외가 새도 «삭제 뒤 저장 실패»로 안내하려고 try 밖에 둔다
  let deleted = false
  try {
    const opened = await openStravaReplaceOffer(request.cookies.get(STRAVA_REPLACE_OFFER_COOKIE)?.value)
    if (!opened.ok) {
      console.warn(`${LOG} 제안 거부: ${opened.reason}`)
      return failure(400, copy.restart, 'restart', true)
    }
    const offer = opened.offer
    if (offer.userId !== user.id) {
      console.warn(`${LOG} 제안 거부: user_mismatch`)
      return failure(400, copy.restart, 'restart', true)
    }

    const supabase = createServiceClient()

    // 이 Strava 계정을 가진 계정을 다시 찾는다
    const { data: existing, error: lookupError } = await supabase
      .from('strava_connections')
      .select('user_id')
      .eq('strava_athlete_id', offer.athleteId)
      .maybeSingle()
    if (lookupError) {
      console.error(`${LOG} strava_connections 조회 오류:`, lookupError.message)
      return failure(500, copy.retry, 'retry', false)
    }

    if (existing && existing.user_id !== user.id) {
      const owner = await assessDuplicateOwner(supabase, existing.user_id)
      if (owner === 'unknown') {
        return failure(500, copy.retry, 'retry', false)
      }
      if (owner === 'blocked') {
        console.warn(`${LOG} 거부: owner_blocked`)
        return failure(403, copy.blocked, 'blocked', true)
      }

      const result = await deleteAccount(supabase, existing.user_id, { skipStravaDeauthorize: true })
      if (result.ok) {
        deleted = true
      } else if (result.code === 'admin_account') {
        // 판정 뒤에 어드민이 된 경합 — 지우기가 어드민을 거절했다
        console.warn(`${LOG} 거부: owner_admin`)
        return failure(403, copy.blocked, 'blocked', true)
      } else if (result.code === 'not_found') {
        // 그사이 이미 지워졌다 — 저장만 하면 된다
        console.info(`${LOG} 기존 계정이 이미 없음, 저장으로 이어감`)
      } else {
        console.error(`${LOG} 기존 계정 삭제 실패 (code: ${result.code})`)
        return failure(500, copy.retry, 'retry', false)
      }
    }

    const saved = await saveStravaConnection(supabase, {
      userId: user.id,
      athleteId: offer.athleteId,
      tokens: {
        accessToken: offer.accessToken,
        refreshToken: offer.refreshToken,
        expiresAtSec: offer.tokenExpiresAtSec,
      },
      hasSameAthleteRow: existing?.user_id === user.id,
    })
    if (!saved) {
      return deleted
        ? failure(500, copy.afterDeleteFailed, 'restart', true)
        : failure(500, copy.retry, 'retry', false)
    }

    // 첫 동기화 — 실패해도 연결은 이미 끝났다(던지지 않는다)
    await syncAfterConnect(user.id)

    return withOfferCleared(NextResponse.json({ success: true }))
  } catch (err) {
    // 오류 객체 전체는 싣지 않는다(토큰·쿠키 값이 섞일 여지를 없앤다). 종류와 메시지만 남긴다
    console.error(`${LOG} 처리 중 예외:`, err instanceof Error ? `${err.name}: ${err.message}` : 'unknown')
    return deleted
      ? failure(500, copy.afterDeleteFailed, 'restart', true)
      : failure(500, copy.retry, 'retry', false)
  }
}
