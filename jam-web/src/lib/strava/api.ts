/**
 * Strava API 래퍼
 * 참조: https://developers.strava.com/docs/reference/
 */
import type { StravaSummaryActivity, StravaAthlete, StravaRefreshResponse } from '@/types/strava'

const STRAVA_API_BASE = 'https://www.strava.com/api/v3'
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

/** Strava가 응답 없이 지연될 때 요청이 무한 대기하지 않도록 하는 타임아웃 (ms) */
const STRAVA_FETCH_TIMEOUT_MS = 8_000

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
    signal: AbortSignal.timeout(STRAVA_FETCH_TIMEOUT_MS),
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
    signal: AbortSignal.timeout(STRAVA_FETCH_TIMEOUT_MS),
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

// =========================================
// 활동 GPS 경로 스트림 조회
// =========================================

interface StravaStreamsResponse {
  latlng?: {
    data: Array<[number, number]>
    series_type: string
    original_size: number
    resolution: string
  }
}

/**
 * 활동의 GPS 경로 데이터 조회 (Strava Streams API)
 * @param activityId Strava 활동 ID
 * @param accessToken Strava access_token (복호화된 평문)
 * @returns [[lat, lng], ...] 배열, 또는 null (실내 활동 / 경로 없음)
 */
export async function getActivityStreams(
  activityId: number,
  accessToken: string
): Promise<Array<[number, number]> | null> {
  // resolution=medium: 최대 1000포인트로 제한 (high는 포인트 무제한으로 타임아웃 위험)
  const url = `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=latlng&key_by_type=true&resolution=medium`

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(STRAVA_FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    // 타임아웃(AbortError) 포함 — 개별 활동 실패는 POI 매칭을 건너뛰고 계속 진행
    console.error(`[getActivityStreams] 네트워크 오류 (activityId: ${activityId}):`, err)
    return null
  }

  checkRateLimit(res.headers)

  // 404 = 경로 데이터 없음 (실내 활동 등) — 정상 케이스
  if (res.status === 404) {
    return null
  }

  if (!res.ok) {
    const body = await res.text()
    console.warn(`[getActivityStreams] Strava Streams API 오류 ${res.status} (activityId: ${activityId}): ${body}`)
    return null
  }

  const data = (await res.json()) as StravaStreamsResponse

  if (!data.latlng?.data || data.latlng.data.length === 0) {
    return null
  }

  return data.latlng.data
}
