/**
 * 배지 공유 이미지용 스트라바 데이터 조회 API (20260821_004)
 * GET /api/badges/[id]/share-data?u={username}
 *
 * activity/poi 타입 배지의 공유 이미지를 만들 때 필요한 거리·페이스·시간을 반환한다.
 * 거리(triggered_by_distance_km)는 이미 DB에 저장돼 있고, 페이스·시간은 DB에 없어
 * triggered_by_strava_id로 스트라바 활동을 재조회해 moving_time/elapsed_time에서 계산한다.
 * 클라이언트가 스트라바 access token을 직접 다루지 않도록 이 서버 라우트에서만 처리한다.
 *
 * item 타입 배지는 스트라바 데이터가 필요 없어 이 API를 호출하지 않는다(클라이언트에서 바로 생성).
 *
 * 응답:
 *   200 { distanceKm: number, paceSecPerKm: number | null, elapsedTimeSec: number | null }
 *   401 { error: 'unauthorized' }               — 로그인 필요
 *   403 { error: 'forbidden' }                    — 본인 배지가 아닌 데이터를 조회하려 함
 *   404 { error: 'badge_not_found' }             — 배지 없음
 *   400 { error: 'not_activity_or_poi' }         — item 배지에 잘못 호출한 경우
 *   404 { error: 'not_earned' }                  — 조회 대상 유저가 아직 획득하지 않음
 *   404 { error: 'no_strava_trigger' }           — 획득은 했으나 연결된 스트라바 활동이 없음(레거시/어드민 발급)
 *   404 { error: 'strava_disconnected' }         — 스트라바 연동 해제 또는 토큰 갱신 실패(재인증 필요)
 *   502 { error: 'strava_fetch_failed' }         — 스트라바 API 조회 실패(레이트리밋·5xx 등)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/utils'
import { getActivityById, refreshStravaToken } from '@/lib/strava/api'
import type { BadgeRow, StravaConnectionRow, UserActivityBadgeRow, UserPoiBadgeEarnRow } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ShareStats {
  distanceKm: number
  paceSecPerKm: number | null
  elapsedTimeSec: number | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const usernameParam = request.nextUrl.searchParams.get('u')

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  // ?u=username — page.tsx와 동일하게, 다른 유저의 배지 상세에서 진입한 경우 그 유저 기준으로 조회.
  // 단, 배지 공유는 본인 배지에서만 가능하다(20260821_004 재작업) — u가 로그인 유저 본인이
  // 아닌 다른 유저를 가리키면 즉시 거부한다. 클라이언트는 타인 배지에서 공유 버튼 자체를
  // 숨기지만, 이 API를 직접 호출하면 그 숨김을 우회해 타인의 스트라바 페이스/시간 데이터를
  // 조회할 수 있으므로(이전 게이트 리뷰에서 지적된 사이드 파인딩) 서버에서도 반드시 검증한다.
  let subjectId = user.id
  if (usernameParam) {
    const { data: subjectRaw } = await service
      .from('users')
      .select('id')
      .eq('username', usernameParam.toLowerCase())
      .maybeSingle()
    if (subjectRaw) {
      subjectId = (subjectRaw as { id: string }).id
    }
  }
  if (subjectId !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // 소프트 삭제된 배지(badges.deleted_at)는 존재하지 않는 배지와 동일하게 취급한다(20260824_007).
  const { data: badgeRaw } = await supabase.from('badges').select('*').eq('id', id).is('deleted_at', null).single()
  if (!badgeRaw) {
    return NextResponse.json({ error: 'badge_not_found' }, { status: 404 })
  }
  const badge = badgeRaw as BadgeRow

  if (badge.type === 'item') {
    return NextResponse.json({ error: 'not_activity_or_poi' }, { status: 400 })
  }

  let stravaId: number | null = null
  let distanceKm: number | null = null

  if (badge.type === 'poi') {
    // 반복 획득 구조 — 최신 획득 기준으로 트리거 활동 선택
    const { data: earnRaw } = await service
      .from('user_poi_badge_earns')
      .select('*')
      .eq('user_id', subjectId)
      .eq('badge_id', id)
      .order('earned_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const earn = earnRaw as UserPoiBadgeEarnRow | null
    if (!earn) {
      return NextResponse.json({ error: 'not_earned' }, { status: 404 })
    }
    stravaId = earn.triggered_by_strava_id
    distanceKm = earn.triggered_by_distance_km
  } else {
    const { data: earnRaw } = await service
      .from('user_activity_badges')
      .select('*')
      .eq('user_id', subjectId)
      .eq('badge_id', id)
      .maybeSingle()
    const earn = earnRaw as UserActivityBadgeRow | null
    if (!earn) {
      return NextResponse.json({ error: 'not_earned' }, { status: 404 })
    }
    stravaId = earn.triggered_by_strava_id
    distanceKm = earn.triggered_by_distance_km
  }

  if (distanceKm === null || stravaId === null) {
    // 거리·트리거 활동 스냅샷이 없는 레거시/어드민 발급 케이스 — 공유 이미지의
    // 필수 요소(DISTANCE)를 채울 수 없어 페이스·시간 재조회 없이 바로 실패 처리한다.
    return NextResponse.json({ error: 'no_strava_trigger' }, { status: 404 })
  }

  const { data: connectionRaw } = await service
    .from('strava_connections')
    .select('*')
    .eq('user_id', subjectId)
    .maybeSingle()
  const connection = connectionRaw as StravaConnectionRow | null
  if (!connection) {
    return NextResponse.json({ error: 'strava_disconnected' }, { status: 404 })
  }

  let accessToken: string
  try {
    accessToken = await decrypt(connection.access_token)
    const refreshToken = await decrypt(connection.refresh_token)
    const expiresAt = new Date(connection.token_expires_at).getTime()

    // 토큰 갱신 패턴은 lib/strava/sync.ts의 syncStravaActivities와 동일(1분 여유)
    if (Date.now() >= expiresAt - 60_000) {
      const refreshed = await refreshStravaToken(refreshToken)
      accessToken = refreshed.access_token

      const [encAccess, encRefresh] = await Promise.all([
        encrypt(refreshed.access_token),
        encrypt(refreshed.refresh_token),
      ])

      const { error: updateError } = await service
        .from('strava_connections')
        // @ts-expect-error Supabase 타입 추론 제한 우회 — sync.ts와 동일 패턴
        .update({
          access_token: encAccess,
          refresh_token: encRefresh,
          token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
        })
        .eq('user_id', subjectId)

      if (updateError) {
        console.error('[/api/badges/[id]/share-data] 갱신된 토큰 저장 실패:', updateError)
      }
    }
  } catch (err) {
    // refresh_token이 만료됐거나(유저가 Strava 쪽에서 앱 연동을 해제) 복호화 실패 —
    // 이 유저는 재동기화 전까지 스트라바 데이터를 다시 가져올 수 없다
    console.error('[/api/badges/[id]/share-data] 토큰 갱신 실패 — 연동 해제로 간주:', err)
    return NextResponse.json({ error: 'strava_disconnected' }, { status: 404 })
  }

  const activityResult = await getActivityById(stravaId, accessToken)
  if ('error' in activityResult) {
    if (activityResult.status === 401) {
      return NextResponse.json({ error: 'strava_disconnected' }, { status: 404 })
    }
    console.error(
      `[/api/badges/[id]/share-data] 스트라바 활동 조회 실패 (status: ${activityResult.status}):`,
      activityResult.error
    )
    return NextResponse.json({ error: 'strava_fetch_failed' }, { status: 502 })
  }

  const paceSecPerKm = distanceKm > 0 ? activityResult.moving_time / distanceKm : null
  const stats: ShareStats = {
    distanceKm,
    paceSecPerKm,
    elapsedTimeSec: activityResult.elapsed_time,
  }
  return NextResponse.json(stats)
}
