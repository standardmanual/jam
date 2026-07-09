/**
 * Strava API 래퍼
 * 참조: https://developers.strava.com/docs/reference/
 */
import type { StravaSummaryActivity, StravaAthlete, StravaRefreshResponse } from '@/types/strava'

const STRAVA_API_BASE = 'https://www.strava.com/api/v3'
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

// =========================================
// Rate Limit 헬퍼
// =========================================
function checkRateLimit(headers: Headers): void {
  const limit = headers.get('X-RateLimit-Limit')
  const usage = headers.get('X-RateLimit-Usage')
  if (limit && usage) {
    const [shortUsage, dailyUsage] = usage.split(',').map(Number)
    const [shortLimit, dailyLimit] = limit.split(',').map(Number)
    if (shortUsage >= shortLimit * 0.9 || dailyUsage >= dailyLimit * 0.9) {
      console.warn(`[JAM! Strava] Rate limit 경고 — 15분: ${shortUsage}/${shortLimit}, 일간: ${dailyUsage}/${dailyLimit}`)
    }
  }
}

async function stravaFetch<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  checkRateLimit(res.headers)

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Strava API 오류 ${res.status}: ${body}`)
  }

  return res.json() as Promise<T>
}

// =========================================
// 활동 목록 조회
// =========================================
/**
 * 유저의 Strava 활동 목록 조회
 * @param accessToken Strava access_token (복호화된 평문)
 * @param after Unix timestamp — 이 시각 이후 활동만 조회
 */
export async function getActivities(
  accessToken: string,
  after?: number
): Promise<StravaSummaryActivity[]> {
  const params = new URLSearchParams({
    per_page: '200',
  })
  if (after !== undefined) {
    params.set('after', String(after))
  }

  return stravaFetch<StravaSummaryActivity[]>(
    `${STRAVA_API_BASE}/athlete/activities?${params.toString()}`,
    accessToken
  )
}

// =========================================
// 토큰 갱신
// =========================================
/**
 * Strava refresh_token으로 새 access_token 획득
 */
export async function refreshStravaToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_at: number }> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Strava 토큰 갱신 실패 ${res.status}: ${body}`)
  }

  const data = (await res.json()) as StravaRefreshResponse
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  }
}

// =========================================
// 운동선수 프로필 조회
// =========================================
/**
 * 현재 인증된 Strava 운동선수 프로필
 */
export async function getAthleteProfile(accessToken: string): Promise<StravaAthlete> {
  return stravaFetch<StravaAthlete>(`${STRAVA_API_BASE}/athlete`, accessToken)
}
