/**
 * 저장된 Strava 연결의 앱 승인을 Strava 쪽에서 해제한다 (티켓 20261021_1249 3회, 운영 로직 3.2·17장).
 *
 * 두 곳이 같이 쓴다: 프로필의 «동기화 끊기»(`api/strava/disconnect`)와 계정을 지울 때(`lib/account/delete-account.ts`).
 * 해제가 실패해도 호출한 쪽의 일은 멈추지 않는다 — 이미 철회됐거나 토큰이 무효인 연결이 흔하다. 그래서 이 함수는 던지지 않고
 * 성공 여부만 돌려준다. 만료 직전이면 먼저 갱신해 해제가 통하게 하고, 갱신 실패도 같은 방식으로 흘려보낸다.
 * 토큰 값과 응답 본문은 로그에 남기지 않고 오류 종류(HTTP 상태)만 남긴다.
 */
import { decrypt } from '@/lib/utils'
import { deauthorizeStrava, refreshStravaToken } from '@/lib/strava/api'

/** `strava_connections` 행에서 해제에 필요한 세 칸. 토큰은 암호화된 채 저장돼 있다 */
export interface StoredStravaTokens {
  access_token: string
  refresh_token: string
  token_expires_at: string
}

/** 만료까지 이 시간 안으로 남았으면 먼저 갱신한다 */
const REFRESH_MARGIN_MS = 60_000

/** 해제에 성공했으면 true, 어떤 이유로든 하지 못했으면 false. 던지지 않는다 */
export async function deauthorizeStoredConnection(tokens: StoredStravaTokens, context: { userId: string }): Promise<boolean> {
  try {
    let accessToken = await decrypt(tokens.access_token)
    if (Date.now() >= new Date(tokens.token_expires_at).getTime() - REFRESH_MARGIN_MS) {
      const refreshed = await refreshStravaToken(await decrypt(tokens.refresh_token))
      accessToken = refreshed.access_token
    }
    await deauthorizeStrava(accessToken)
    return true
  } catch (err) {
    const status = (err as { status?: unknown } | null)?.status
    console.warn(
      `[strava/deauthorize] Strava 앱 해제 실패, 호출한 쪽은 계속 진행 (userId: ${context.userId}, status: ${typeof status === 'number' ? status : 'n/a'})`
    )
    return false
  }
}
