import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { clusterPoiBadges, shouldCluster, CLUSTER_ZOOM_THRESHOLD } from '@/lib/poi/badge-clustering'

// GET /api/checkin-badges?swLat=&swLng=&neLat=&neLng=&zoom=
//
// Phase 17 — 지도 뷰포트(bounding box) 안의 "체크인 배지"만 반환한다.
// (20260826_004에서 `/api/poi-badges` → `/api/checkin-badges`로 이동. 지점 테이블 `poi`
//  자체는 그대로 쓴다 — 배지 도메인만 checkin으로 통일한다.)
// 드랍/픽업용 `/api/drops`(사용자 위치 반경 기반)와는 완전히 별개인 API로,
// 여기서는 사용자 위치 거리 제한 없이 뷰포트에 걸리는 체크인 배지를 전부 노출한다.
//
// - zoom > 13 : 개별 목록 반환 (`pois`)
// - zoom <= 13: 그리드 셀 집계 클러스터만 반환 (`clusters`) — 개별 좌표 미노출

/** 한 번의 뷰포트 조회로 다룰 최대 POI 수 (비정상적으로 넓은 bbox 방어) */
const MAX_POIS = 2000

interface PoiBadgeItem {
  poi_id: string
  badge_id: string
  name: string
  latitude: number
  longitude: number
  image_url: string | null
  earned: boolean
}

type PoiPick = {
  id: string
  name: string
  latitude: number
  longitude: number
  linked_badge_id: string | null
}

type BadgePick = {
  id: string
  type: string
  image_url: string | null
  deleted_at: string | null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const swLat = parseFloat(searchParams.get('swLat') ?? '')
  const swLng = parseFloat(searchParams.get('swLng') ?? '')
  const neLat = parseFloat(searchParams.get('neLat') ?? '')
  const neLng = parseFloat(searchParams.get('neLng') ?? '')
  const zoom = parseFloat(searchParams.get('zoom') ?? '')

  if ([swLat, swLng, neLat, neLng].some((v) => !Number.isFinite(v))) {
    return NextResponse.json({ error: 'swLat, swLng, neLat, neLng 파라미터 필요' }, { status: 400 })
  }
  if (!Number.isFinite(zoom)) {
    return NextResponse.json({ error: 'zoom 파라미터 필요' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()

  // 남서/북동이 뒤집혀 들어와도 동작하도록 정규화
  const minLat = Math.min(swLat, neLat)
  const maxLat = Math.max(swLat, neLat)

  // linked_badge_id가 있는 POI 중 bounding box 안에 있는 것만 조회
  let query = service
    .from('poi')
    .select('id, name, latitude, longitude, linked_badge_id')
    .not('linked_badge_id', 'is', null)
    .gte('latitude', minLat)
    .lte('latitude', maxLat)

  // 날짜변경선을 걸친 뷰포트(swLng > neLng)는 두 구간의 OR로 처리
  if (swLng > neLng) {
    query = query.or(`longitude.gte.${swLng},longitude.lte.${neLng}`)
  } else {
    query = query.gte('longitude', swLng).lte('longitude', neLng)
  }

  const { data: poisRaw, error: poiError } = await query.limit(MAX_POIS)
  if (poiError) {
    return NextResponse.json({ error: 'POI 조회 실패' }, { status: 500 })
  }

  const candidatePois = (poisRaw ?? []) as PoiPick[]
  if (candidatePois.length === 0) {
    return emptyResponse(zoom)
  }

  // 연결된 배지 중 type='checkin' 이고 삭제되지 않은 것만 대상
  const badgeIds = Array.from(
    new Set(candidatePois.map((p) => p.linked_badge_id).filter((id): id is string => !!id))
  )

  const { data: badgesRaw, error: badgeError } = await service
    .from('badges')
    .select('id, type, image_url, deleted_at')
    .in('id', badgeIds)
    .eq('type', 'checkin')
    .is('deleted_at', null)

  if (badgeError) {
    return NextResponse.json({ error: '배지 조회 실패' }, { status: 500 })
  }

  const badgeById = new Map<string, BadgePick>(
    ((badgesRaw ?? []) as BadgePick[]).map((b) => [b.id, b])
  )

  const targetPois = candidatePois.filter(
    (p) => p.linked_badge_id !== null && badgeById.has(p.linked_badge_id)
  )

  if (targetPois.length === 0) {
    return emptyResponse(zoom)
  }

  // 줌 13 이하 — 개별 좌표 대신 그리드 집계만 반환 (payload 최소화)
  if (shouldCluster(zoom)) {
    return NextResponse.json({
      mode: 'cluster' as const,
      zoom,
      cluster_zoom_threshold: CLUSTER_ZOOM_THRESHOLD,
      clusters: clusterPoiBadges(targetPois, zoom),
      pois: [],
    })
  }

  // 줌 13 초과 — 개별 목록 + earned 판정
  const targetBadgeIds = Array.from(
    new Set(targetPois.map((p) => p.linked_badge_id).filter((id): id is string => !!id))
  )

  const { data: earnsRaw } = await service
    .from('user_checkin_badge_earns')
    .select('badge_id')
    .eq('user_id', user.id)
    .in('badge_id', targetBadgeIds)

  const earnedBadgeIds = new Set(
    ((earnsRaw ?? []) as Array<{ badge_id: string }>).map((e) => e.badge_id)
  )

  const pois: PoiBadgeItem[] = targetPois.map((p) => {
    const badgeId = p.linked_badge_id as string
    return {
      poi_id: p.id,
      badge_id: badgeId,
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      image_url: badgeById.get(badgeId)?.image_url ?? null,
      earned: earnedBadgeIds.has(badgeId),
    }
  })

  return NextResponse.json({
    mode: 'individual' as const,
    zoom,
    cluster_zoom_threshold: CLUSTER_ZOOM_THRESHOLD,
    clusters: [],
    pois,
  })
}

function emptyResponse(zoom: number) {
  return NextResponse.json({
    mode: shouldCluster(zoom) ? ('cluster' as const) : ('individual' as const),
    zoom,
    cluster_zoom_threshold: CLUSTER_ZOOM_THRESHOLD,
    clusters: [],
    pois: [],
  })
}
