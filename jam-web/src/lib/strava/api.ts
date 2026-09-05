/**
 * Strava API 래퍼
 * 참조: https://developers.strava.com/docs/reference/
 */
import type {
  StravaSummaryActivity,
  StravaDetailedActivity,
  StravaAthlete,
  StravaRefreshResponse,
} from '@/types/strava'

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
/** 목록 엔드포인트 1회 조회 상한. Strava가 허용하는 최대값이다 */
export const ACTIVITIES_PAGE_SIZE = 200

/**
 * 유저의 Strava 활동 목록 조회
 * @param accessToken Strava access_token (복호화된 평문)
 * @param after Unix timestamp — 이 시각 이후 활동만 조회
 * @param page 1부터 시작하는 페이지 번호. 생략하면 Strava 기본값(1페이지)
 *
 * ⚠️ 싱크 경로는 `page`를 쓰지 않는다(커서 기반이라 1페이지면 충분하다). 전체 이력을 훑어야
 * 하는 백필(`backfillNormalizedFields`)만 페이지를 넘긴다 — 티켓 20260905_0029.
 */
export async function getActivities(
  accessToken: string,
  after?: number,
  page?: number
): Promise<StravaSummaryActivity[]> {
  const params = new URLSearchParams({
    per_page: String(ACTIVITIES_PAGE_SIZE),
  })
  if (after !== undefined) {
    params.set('after', String(after))
  }
  if (page !== undefined) {
    params.set('page', String(page))
  }

  return stravaFetch<StravaSummaryActivity[]>(
    `${STRAVA_API_BASE}/athlete/activities?${params.toString()}`,
    accessToken
  )
}

// =========================================
// 단일 활동 조회 (소급 백필·진단용)
// =========================================
/**
 * `GET /activities/{id}` — **Detailed** 응답을 돌려준다.
 *
 * 반환 타입이 `StravaSummaryActivity`로 잘못 좁혀져 있었다(티켓 20260905_0029). 실제로는
 * 상세 엔드포인트라 `splits_metric`·`description`·`device_name` 등이 함께 오는데, 타입에
 * 없어 컴파일 단계에서 접근이 막혀 있었다.
 *
 * ⚠️ 활동 1건당 1회 호출이다. 전체 이력을 훑는 용도로 쓰지 말 것 — 백필은 목록 엔드포인트를 쓴다.
 */
export async function getActivityById(
  activityId: number | string,
  accessToken: string
): Promise<StravaDetailedActivity | { error: string; status: number }> {
  const res = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(STRAVA_FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    const body = await res.text()
    return { error: body, status: res.status }
  }
  return res.json() as Promise<StravaDetailedActivity>
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
