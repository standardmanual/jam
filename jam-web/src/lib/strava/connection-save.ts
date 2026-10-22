/**
 * Strava 연결 저장과 «이미 연결된 Strava 계정»의 기존 계정 판정 (티켓 20261021_1249 4회, 운영 로직 3.2절)
 *
 * 콜백(`api/strava/callback`)과 «그래도 연결하기»(`api/strava/replace`)가 같이 쓴다. 콜백에서 뽑아 낸 코드이고 동작은 그대로다.
 * 토큰 값은 로그에 남기지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { isAdminAccount } from '@/lib/admin/auth'
import { encrypt } from '@/lib/utils'
import { syncStravaActivities } from '@/lib/strava/sync'
import { getActiveSuspension, UserSuspendedError } from '@/lib/suspension/suspension'
import { TribeRequiredError } from '@/lib/tribe/gate'
import { STRAVA_DISCONNECT_CLEARED } from '@/lib/strava/connection-state'

type ServiceClient = ReturnType<typeof createServiceClient>

/** Strava 토큰 교환 응답에서 연결 저장에 필요한 값(평문). 저장할 때 암호화한다 */
export interface StravaTokenSet {
  accessToken: string
  refreshToken: string
  /** access token 만료 시각(epoch 초) */
  expiresAtSec: number
}

export interface SaveStravaConnectionParams {
  userId: string
  athleteId: number
  tokens: StravaTokenSet
  /** 이 유저가 이미 같은 Strava 계정의 연결 행을 갖고 있는가(같은 계정 재연결). 아니면 새 행을 넣는다 */
  hasSameAthleteRow: boolean
}

/**
 * 연결을 저장한다. 한 JAM 계정에는 연결이 하나뿐이다(운영 로직 3.2절).
 *  - 같은 Strava 계정을 다시 연결(`hasSameAthleteRow`): 토큰을 갱신하고 끊김을 지운다. first_sync_pending·last_synced_at은 그대로 둬
 *    마지막 동기화 뒤부터 이어서 가져온다.
 *  - 다른 Strava 계정 연결: 새 행은 첫 동기화 대기(`first_sync_pending: true`)다. upsert가 아니라 insert라서 동시에 같은 계정을 연결한
 *    다른 유저와 부딪히면 유니크 위반으로 실패하고 아무것도 덮어쓰지 않는다.
 *  - 그다음 이 유저의 이전 연결(다른 Strava 계정) 행을 지운다. 지우지 못하면 방금 넣은 새 행을 되돌려 같은 user_id의 행이 둘 남지 않게 한다.
 *    활동 기록·배지·잼·포인트는 다른 테이블이라 그대로 남는다.
 *
 * DB 쓰기가 실패하면 false(원인은 서버 로그)를 돌려주고, 암호화가 실패하면 던진다 — 호출부가 각각 DB 오류·서버 오류로 닫는다.
 */
export async function saveStravaConnection(
  supabase: ServiceClient,
  { userId, athleteId, tokens, hasSameAthleteRow }: SaveStravaConnectionParams
): Promise<boolean> {
  // 토큰 암호화
  const [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
    encrypt(tokens.accessToken),
    encrypt(tokens.refreshToken),
  ])
  const tokenFields = {
    access_token: encryptedAccessToken,
    refresh_token: encryptedRefreshToken,
    token_expires_at: new Date(tokens.expiresAtSec * 1000).toISOString(),
  }

  // DB 저장 (service client — RLS 우회)
  let insertedNewRow = false
  if (hasSameAthleteRow) {
    const { error: updateError } = await supabase
      .from('strava_connections')
      .update({ ...tokenFields, ...STRAVA_DISCONNECT_CLEARED })
      .eq('user_id', userId)
      .eq('strava_athlete_id', athleteId)
    if (updateError) {
      console.error('[JAM! Strava] strava_connections 갱신 오류:', updateError)
      return false
    }
  } else {
    const { error: insertError } = await supabase.from('strava_connections').insert({
      user_id: userId,
      strava_athlete_id: athleteId,
      ...tokenFields,
      backfill_completed: true, // 소급 없음 — 연동 즉시 완료로 표시
      last_synced_at: null,
      first_sync_pending: true,
      ...STRAVA_DISCONNECT_CLEARED,
    })
    if (insertError) {
      console.error('[JAM! Strava] strava_connections insert 오류:', insertError)
      return false
    }
    insertedNewRow = true
  }

  // 이 유저의 이전 연결(다른 Strava 계정) 행을 지운다 — 같은 user_id의 행이 둘이면 조회가 오류를 낸다.
  const { error: deleteError } = await supabase
    .from('strava_connections')
    .delete()
    .eq('user_id', userId)
    .neq('strava_athlete_id', athleteId)
  if (deleteError) {
    console.error('[JAM! Strava] 이전 연결 삭제 오류:', deleteError)
    // 방금 넣은 새 행을 되돌린다(티켓 20261017_1422 서버 보정 b). 되돌림이 실패해도 원래 오류는 그대로 돌려준다 — 로그로만 남긴다.
    if (insertedNewRow) {
      const { error: rollbackError } = await supabase
        .from('strava_connections')
        .delete()
        .eq('user_id', userId)
        .eq('strava_athlete_id', athleteId)
      if (rollbackError) {
        console.error('[JAM! Strava] 새 연결 되돌림 실패:', rollbackError)
      }
    }
    return false
  }

  return true
}

/**
 * 연결 직후 즉시 동기화 — 반드시 await한다. 서버리스 함수는 응답을 반환하면 직후 인스턴스가 종료될 수 있어, await 없는 백그라운드
 * 호출은 처리 도중 끊길 위험이 있다(신규 유저 첫 배지 미발급 인시던트 원인 — 2026-08-10).
 * 동기화 자체가 실패해도 연결은 이미 완료된 상태이므로 던지지 않는다. 이용 정지·트라이브 없음은 오류가 아니라 건너뜀으로 남긴다.
 */
export async function syncAfterConnect(userId: string): Promise<void> {
  try {
    await syncStravaActivities(userId)
  } catch (err) {
    if (err instanceof UserSuspendedError) {
      // 이용 정지 중이면 동기화만 건너뛴다 — 연결 저장과 로그인 흐름은 그대로 진행한다 (티켓 20261017_1426)
      console.info('[JAM! Strava] 이용 정지 중이라 즉시 동기화를 건너뜀 (연동은 성공)')
    } else if (err instanceof TribeRequiredError) {
      // 콜백이 이미 막았으므로 보통 닿지 않는다. 연결 저장 뒤 트라이브가 사라진 경합이면 오류가 아니라 건너뜀으로 남긴다 (티켓 20261021_1247)
      console.info('[JAM! Strava] 트라이브가 없어 즉시 동기화를 건너뜀 (연동은 성공)')
    } else {
      console.error('[JAM! Strava] 즉시 동기화 실패 (연동은 성공):', err)
    }
  }
}

/**
 * 기존 계정(같은 Strava 계정을 가진 다른 유저)을 «그래도 연결하기»로 지워도 되는가.
 *  - `replaceable`: 일반·정상 계정이다.
 *  - `blocked`: 어드민(화이트리스트 이메일 또는 `is_admin`)이거나 이용 정지 중이거나 유저 행을 찾을 수 없다. 시트를 보여 주기 전에 막는다 —
 *    정지 우회와 어드민 삭제를 막으려는 것이다(운영 로직 3.2·16장, 티켓 20261021_2241과 같은 맥락). 실행 때(`replace` 라우트)도 한 번 더 판정한다.
 *  - `unknown`: 읽지 못했다(DB 오류). «지워도 된다»로 보지 않는다. 오류 원문은 서버 로그에만 남긴다.
 */
export type DuplicateOwnerStatus = 'replaceable' | 'blocked' | 'unknown'

export async function assessDuplicateOwner(supabase: ServiceClient, ownerUserId: string): Promise<DuplicateOwnerStatus> {
  try {
    const { data: owner, error } = await supabase
      .from('users')
      .select('id, email, is_admin')
      .eq('id', ownerUserId)
      .maybeSingle()
    if (error) {
      console.error('[JAM! Strava] 기존 계정 조회 오류:', error.message)
      return 'unknown'
    }
    if (!owner) return 'blocked'
    if (isAdminAccount(owner)) return 'blocked'

    const suspension = await getActiveSuspension(supabase, ownerUserId)
    return suspension ? 'blocked' : 'replaceable'
  } catch (err) {
    console.error('[JAM! Strava] 기존 계정 확인 중 예외:', err instanceof Error ? err.message : err)
    return 'unknown'
  }
}
