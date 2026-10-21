/**
 * 계정을 지우는 규칙 하나(티켓 20261021_1249 1·3회, 운영 로직 17장). 어드민 삭제(`hardDeleteUser`)와 유저 탈퇴(`POST /api/account/delete`)가
 * 쓰고, «그래도 연결하기»의 기존 계정 지우기(4회)도 같은 함수를 부른다.
 *
 * 순서
 *   1. 어드민 계정은 거절한다(`admin_account`). 호출부의 거절이 빠져도 어드민이 지워지지 않게 하는 이중 안전장치다.
 *   2. Strava 토큰을 메모리로 읽어 둔다 — 연결 행은 계정을 지울 때 함께 사라지므로 그 전에 읽어야 해제할 수 있다. 읽지 못해도 멈추지 않는다.
 *   3. 아바타 파일 삭제 — 실패해도 계정 삭제는 멈추지 않고 서버 로그에만 남긴다(파일이 남는 것보다 탈퇴가 막히는 것이 더 나쁘다).
 *      준비 RPC보다 앞에 둔다: 아이템이 «없어짐»으로 바뀐 뒤 계정 삭제까지의 틈에 느린 파일 삭제가 끼지 않게 하려는 순서다(티켓 20261021_1841).
 *   4. 준비 RPC `prepare_account_deletion`(마이그레이션 263) — 법정 보관 기록 복사, 이력 이름 칸 비우기, 소유 아이템 «없어짐» 처리를
 *      한 트랜잭션으로 한다. 실패하면 여기서 멈추고 계정은 지우지 않는다. 다시 불러도 안전하다.
 *   5. `auth.admin.deleteUser` — `public.users`가 `auth.users`를 `ON DELETE CASCADE`로 참조해 나머지 행은 외래키가 연쇄로 지운다.
 *   6. 계정 삭제가 성공했을 때만 Strava 쪽 앱 승인을 해제한다(실패는 로그만). 해제 때문에 계정 삭제가 막히거나 새 실패 구간이 생기지 않는다.
 *
 * 옵션 `skipStravaDeauthorize`(티켓 20261021_1249 4회): «그래도 연결하기»가 기존 계정을 지울 때만 켠다. 지우는 계정과 새로 연결하는 계정이 같은
 * Strava 계정(athlete)이라, 앱 승인 해제가 방금 받은 새 토큰까지 무효로 만들 수 있다(추정). 켜면 2번(토큰 읽기)과 6번(해제)을 모두 건너뛴다.
 *
 * 호출자에게는 DB·Auth 오류 원문 대신 고정 코드만 돌려준다. 원문은 서버 로그에만 남는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { isAdminAccount } from '@/lib/admin/auth'
import { deauthorizeStoredConnection, type StoredStravaTokens } from '@/lib/strava/deauthorize-connection'
import { removeAvatarFiles } from './avatar-cleanup'
import { RETAINED_KINDS, type RetainedKind } from './retention'

type ServiceClient = ReturnType<typeof createServiceClient>

export type DeleteAccountFailureCode = 'admin_account' | 'not_found' | 'prepare_failed' | 'delete_failed'

/** 준비 RPC가 돌려주는 건수 요약. 두 번째 호출부터는 모두 0이다 */
export interface AccountDeletionSummary {
  /** 보관 표로 복사한 건수(종류별) */
  retained: Record<RetainedKind, number>
  /** 이름 칸을 비운 이력 행 수 */
  custodyRowsCleared: number
  /** 없어짐 처리한 아이템 수 */
  vanishedItems: number
}

export type DeleteAccountResult =
  | { ok: true; summary: AccountDeletionSummary }
  | { ok: false; code: DeleteAccountFailureCode }

function toCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

export type ParsedPrepareResult = { found: false } | { found: true; summary: AccountDeletionSummary }

/**
 * 준비 RPC 응답을 읽는다. 모양이 계약({found:false} 또는 {found:true, retained, custody_rows_cleared, vanished_items})과
 * 다르면 null — 호출부가 성공으로 보지 않고 계정을 지우지 않는다.
 */
export function parsePrepareResult(data: unknown): ParsedPrepareResult | null {
  if (typeof data !== 'object' || data === null) return null
  const body = data as Record<string, unknown>
  if (body.found === false) return { found: false }
  if (body.found !== true) return null

  const retainedRaw = body.retained
  if (typeof retainedRaw !== 'object' || retainedRaw === null) return null
  const retained = {} as Record<RetainedKind, number>
  for (const kind of RETAINED_KINDS) {
    const count = toCount((retainedRaw as Record<string, unknown>)[kind])
    if (count === null) return null
    retained[kind] = count
  }

  const custodyRowsCleared = toCount(body.custody_rows_cleared)
  const vanishedItems = toCount(body.vanished_items)
  if (custodyRowsCleared === null || vanishedItems === null) return null

  return { found: true, summary: { retained, custodyRowsCleared, vanishedItems } }
}

/**
 * 지우기 전에 Strava 토큰을 읽어 둔다. 연결이 없거나 이미 끊겼으면(토큰이 비었다) null — 해제할 승인이 없다.
 * 읽기가 실패해도 던지지 않고 null이다: 해제는 덤이라 이것 때문에 탈퇴가 막히면 안 된다.
 */
async function readStravaTokens(supabase: ServiceClient, userId: string): Promise<StoredStravaTokens | null> {
  try {
    const { data, error } = await supabase
      .from('strava_connections')
      .select('access_token, refresh_token, token_expires_at, disconnected_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.error('[account/delete] Strava 연결 조회 실패(앱 해제는 건너뜀):', error.message)
      return null
    }
    if (!data || data.disconnected_at || !data.access_token || !data.refresh_token) return null
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: data.token_expires_at,
    }
  } catch (error) {
    console.error('[account/delete] Strava 연결 조회 중 예외(앱 해제는 건너뜀):', error)
    return null
  }
}

export interface DeleteAccountOptions {
  /** Strava 앱 승인 해제를 건너뛴다. «그래도 연결하기»의 기존 계정 지우기에서만 켠다(위 설명) */
  skipStravaDeauthorize?: boolean
}

export async function deleteAccount(
  supabase: ServiceClient,
  userId: string,
  options: DeleteAccountOptions = {}
): Promise<DeleteAccountResult> {
  // 1. 어드민 계정 거절 — 조회가 실패하면 어드민인지 알 수 없으므로 아무것도 바꾸지 않고 멈춘다
  try {
    const { data: user, error } = await supabase.from('users').select('id, email, is_admin').eq('id', userId).maybeSingle()
    if (error) {
      console.error('[account/delete] 유저 조회 실패:', error.message)
      return { ok: false, code: 'prepare_failed' }
    }
    if (!user) return { ok: false, code: 'not_found' }
    if (isAdminAccount(user)) return { ok: false, code: 'admin_account' }
  } catch (error) {
    console.error('[account/delete] 유저 조회 중 예외:', error)
    return { ok: false, code: 'prepare_failed' }
  }

  // 2. Strava 토큰을 메모리로 — 계정을 지우면 연결 행도 사라진다. 해제를 건너뛰는 호출은 읽지 않는다
  const stravaTokens = options.skipStravaDeauthorize ? null : await readStravaTokens(supabase, userId)

  // 3. 아바타 파일 — 실패해도 계속한다
  try {
    await removeAvatarFiles(supabase, userId)
  } catch (error) {
    console.error('[account/delete] 아바타 파일 삭제 실패(계정 삭제는 계속):', error)
  }

  // 4. 준비 RPC — 실패하면 계정을 지우지 않는다
  let prepared: ParsedPrepareResult | null
  try {
    const { data, error } = await supabase.rpc('prepare_account_deletion', {
      p_user_id: userId,
    })
    if (error) {
      console.error('[account/delete] 준비 RPC 실패:', error.message)
      return { ok: false, code: 'prepare_failed' }
    }
    prepared = parsePrepareResult(data)
  } catch (error) {
    console.error('[account/delete] 준비 RPC 중 예외:', error)
    return { ok: false, code: 'prepare_failed' }
  }
  if (!prepared) {
    console.error('[account/delete] 준비 RPC가 계약 밖 응답을 돌려줬습니다.')
    return { ok: false, code: 'prepare_failed' }
  }
  if (!prepared.found) return { ok: false, code: 'not_found' }

  // 5. 계정 삭제
  try {
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) {
      console.error('[account/delete] 계정 삭제 실패:', error.message)
      return { ok: false, code: 'delete_failed' }
    }
  } catch (error) {
    console.error('[account/delete] 계정 삭제 중 예외:', error)
    return { ok: false, code: 'delete_failed' }
  }

  // 6. Strava 앱 승인 해제 — 계정은 이미 지워졌으므로 결과가 어떻든 성공이다(공용 함수는 던지지 않고 로그만 남기지만,
  //    여기서 예외가 새면 지워진 계정에 실패를 돌려주게 되므로 한 번 더 막는다)
  if (stravaTokens) {
    try {
      await deauthorizeStoredConnection(stravaTokens, { userId })
    } catch (error) {
      console.error('[account/delete] Strava 앱 해제 중 예외(계정은 이미 지워짐):', error)
    }
  }

  return { ok: true, summary: prepared.summary }
}
