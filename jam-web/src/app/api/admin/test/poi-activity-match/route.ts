/**
 * 임시 테스트 엔드포인트 — POI 매칭 시뮬레이션 (배지 발급 없음)
 * 사용 후 삭제 예정
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { decrypt, encrypt } from '@/lib/utils'
import { getActivityStreams, refreshStravaToken } from '@/lib/strava/api'
import { matchPoisForActivity } from '@/lib/poi/matcher'

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, stravaActivityId } = await req.json()
  if (!userId || !stravaActivityId) {
    return NextResponse.json({ error: 'userId, stravaActivityId 필수' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 1. Strava 연결 정보 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conn } = await (supabase as any)
    .from('strava_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .single() as { data: { access_token: string; refresh_token: string; token_expires_at: string } | null }

  if (!conn) return NextResponse.json({ error: 'Strava 연결 없음' }, { status: 404 })

  // 2. 토큰 복호화
  let accessToken = await decrypt(conn.access_token)
  const refreshToken = await decrypt(conn.refresh_token)

  // 3. 만료 시 refresh
  const expiresAt = new Date(conn.token_expires_at).getTime() / 1000
  if (Date.now() / 1000 >= expiresAt - 60) {
    const refreshed = await refreshStravaToken(refreshToken)
    accessToken = refreshed.access_token
    // DB 갱신
    const [encAccess, encRefresh] = await Promise.all([
      encrypt(refreshed.access_token),
      encrypt(refreshed.refresh_token),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('strava_connections')
      .update({
        access_token: encAccess,
        refresh_token: encRefresh,
        token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
      })
      .eq('user_id', userId)
  }

  // 4. GPS 스트림 조회
  const route = await getActivityStreams(Number(stravaActivityId), accessToken)
  if (!route || route.length === 0) {
    return NextResponse.json({ error: 'GPS 경로 데이터 없음 (실내 활동 또는 권한 없음)' }, { status: 422 })
  }

  // 5. POI 매칭 (현재 DB radius_meters 기준)
  const matchedPois = await matchPoisForActivity(route, supabase)

  // 6. 매칭된 POI와 연결 배지 조회
  const poiBadgeIds = matchedPois.map((p) => p.linked_badge_id).filter(Boolean) as string[]
  const { data: poiBadgesRaw } = poiBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name, rarity').in('id', poiBadgeIds)
    : { data: [] as { id: string; name: string; rarity: string }[] }
  const poiBadgesById = new Map((poiBadgesRaw ?? []).map((b) => [b.id, b]))

  const result = matchedPois.map((poi) => ({
    poiId: poi.id,
    poiName: poi.name,
    category: poi.category,
    radiusMeters: poi.radius_meters,
    linkedBadge: poi.linked_badge_id ? poiBadgesById.get(poi.linked_badge_id) ?? null : null,
  }))

  return NextResponse.json({
    stravaActivityId,
    trackpointCount: route.length,
    matchedPois: result,
    totalMatched: result.length,
  })
}
