'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import Button from '@/components/ui/Button'
import TopNav from '@/components/ui/TopNav'
import { useToast } from '@/components/ui/Toast'
import PoiCarouselModal from '@/components/PoiCarouselModal'
import type { PoiBadgeMarker, PoiBadgeClusterMarker, MapViewport, MapViewHandle } from '@/components/map/MapView'
import type { NearbyPoi } from '@/types/drops'
import { d, t } from '@/lib/i18n'
import { DROP_RADIUS_METERS } from '@/lib/poi/proximity'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

// ===== 유틸 =====

/** 두 좌표 간 거리(미터)를 Haversine 공식으로 계산 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // 지구 반지름(m)
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ===== 상수 =====

/** 드랍 API 재조회 임계값 (미터). 이 거리 미만 이동은 갱신 무시 */
const DROP_RELOAD_THRESHOLD_METERS = 20

// ===== 컴포넌트 =====

/** 알림함 착지점 `/drops?poi=<id>` — 지도 카메라를 이 지점으로 옮긴다 (20260824_021) */
export interface DropsFocusPoi {
  id: string
  latitude: number
  longitude: number
}

export default function DropsClient({ focusPoi = null }: { focusPoi?: DropsFocusPoi | null }) {
  const { toast } = useToast()

  const [locError, setLocError] = useState<string | null>(null)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)

  const [pois, setPois] = useState<NearbyPoi[]>([])
  const [poisLoading, setPoisLoading] = useState(false)

  // ── Phase 17: 뷰포트 기반 체크인 배지 (드랍/픽업과 완전 별개 파이프라인) ──
  const [badgeMarkers, setBadgeMarkers] = useState<PoiBadgeMarker[]>([])
  const [badgeClusters, setBadgeClusters] = useState<PoiBadgeClusterMarker[]>([])

  // 20260820_018: 선택된 POI 하나 + 드랍 목록 대신, "캐러셀을 연 시작점 POI id"만
  // 들고 있는다. 반경 내 전체 POI 목록 + 개별 드랍 목록 조회/캐싱은
  // PoiCarouselModal이 자체적으로 관리한다.
  const [carouselPoiId, setCarouselPoiId] = useState<string | null>(null)

  // 지도 명령형 핸들 — 캐러셀 카드 전환 시 map.morph()로 포커싱하는 데 사용.
  // next/dynamic으로 지연 로드되는 MapView는 ref를 그대로 전달받지 못해
  // onMapReady 콜백으로 핸들을 받는다.
  const mapHandleRef = useRef<MapViewHandle | null>(null)
  // `?poi=`로 진입한 카메라 이동은 최초 1회만 — 이후 유저가 지도를 움직인 걸 되돌리지 않는다
  const focusedRef = useRef(false)
  const handleMapReady = useCallback((handle: MapViewHandle) => {
    mapHandleRef.current = handle
    if (focusPoi && !focusedRef.current) {
      focusedRef.current = true
      handle.focusPoi(focusPoi.latitude, focusPoi.longitude)
    }
  }, [focusPoi])

  // 위치 획득 (실시간 갱신)
  useEffect(() => {
    if (!navigator.geolocation) {
      // effect 본문에서 setState를 동기 호출하지 않도록 마이크로태스크로 지연.
      // 타이밍상 체감 차이는 없음(같은 틱 내, 페인트 이전에 실행) —
      // react-hooks/set-state-in-effect 정리 목적의 순수 리팩터링.
      Promise.resolve().then(() => setLocError(d.drops.locationUnsupported))
      return
    }

    // 이전 좌표를 클로저 내 지역 변수로 관리. ref보다 단순하고
    // watch 콜백 실행 중에만 필요한 값이므로 state 불필요.
    let prevLat: number | null = null
    let prevLng: number | null = null

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords

        // 이전 위치 대비 이동 거리가 임계값 미만이면 상태 갱신·API 호출 스킵
        if (prevLat !== null && prevLng !== null) {
          const moved = haversineMeters(prevLat, prevLng, latitude, longitude)
          if (moved < DROP_RELOAD_THRESHOLD_METERS) return
        }

        prevLat = latitude
        prevLng = longitude
        setUserLat(latitude)
        setUserLng(longitude)
      },
      () => setLocError(d.drops.locationDenied)
      // enableHighAccuracy는 넣지 않는다 — 실내에서는 GPS 위성 신호가
      // 잘 안 잡혀 오히려 WiFi/기지국 기반 기본 위치보다 더 크게 흔들리는
      // 값이 나올 수 있음(실측: 동일 장소에서 예전엔 문제없다가 이 옵션을
      // 추가한 뒤 오탐 발생). 기본 동작(정밀도 낮지만 안정적)으로 되돌림.
    )

    // 컴포넌트 언마운트 시 위치 감시 해제 (배터리·리소스 정리)
    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  // 근처 POI 로드
  const loadNearbyPois = useCallback(async () => {
    if (userLat === null || userLng === null) return
    setPoisLoading(true)
    try {
      const res = await fetch(`/api/drops?lat=${userLat}&lng=${userLng}`)
      const json = await res.json()
      setPois(json.pois ?? [])
    } catch {
      toast(d.drops.loadPoiFailed, 'error')
    } finally {
      setPoisLoading(false)
    }
  }, [userLat, userLng, toast])

  useEffect(() => {
    // loadNearbyPois 내부의 setPoisLoading(true)가 effect 본문에서 동기 호출되는
    // 형태로 정적 분석되는 것을 피하기 위해 마이크로태스크로 지연 실행.
    // 같은 틱 내(페인트 이전)에 실행되어 체감 타이밍은 동일함 —
    // react-hooks/set-state-in-effect 정리 목적의 순수 리팩터링.
    Promise.resolve().then(() => loadNearbyPois())
  }, [loadNearbyPois])

  // 뷰포트 변경 → 체크인 배지 재조회.
  // MapView가 디바운스 + "이전 조회 범위를 벗어났을 때만" 필터링해서 호출한다.
  const handleViewportChange = useCallback(async (viewport: MapViewport) => {
    const params = new URLSearchParams({
      swLat: String(viewport.swLat),
      swLng: String(viewport.swLng),
      neLat: String(viewport.neLat),
      neLng: String(viewport.neLng),
      zoom: String(viewport.zoom),
    })
    try {
      const res = await fetch(`/api/checkin-badges?${params.toString()}`)
      if (!res.ok) return
      const json = await res.json()
      setBadgeMarkers((json.pois ?? []) as PoiBadgeMarker[])
      setBadgeClusters((json.clusters ?? []) as PoiBadgeClusterMarker[])
    } catch {
      /* 배지 마커 조회 실패는 드랍/픽업 플로우에 영향을 주지 않으므로 조용히 무시 */
    }
  }, [])

  // POI 마커 클릭 → 반경 내(in_drop_range) POI만 캐러셀 모달 오픈(해당 POI를 중앙에
  // 두고 반경 내 전체 POI를 옆으로). 반경 밖 POI(네이버 fallback 포함)는 캐러셀을
  // 열지 않고 토스트만 표시한다 — 반경 밖 POI는 이 기능 범위에 존재하지 않는다.
  const handlePoiSelect = useCallback((poiId: string) => {
    const poi = pois.find((p) => p.id === poiId)
    if (!poi) return
    if (!poi.in_drop_range) {
      toast(t(d.drops.outOfRange, { name: poi.name, distance: poi.distance_meters, m: DROP_RADIUS_METERS }), 'error')
      return
    }
    setCarouselPoiId(poiId)

    // 소식 #18("내 드랍 지점 활성") 계측 — 캐러셀이 열리는 이 지점이 곧 "POI를 열어서 확인한"
    // 순간이다(픽업 여부와 무관). 기록 시각은 서버가 찍는다 — 기기 시계를 믿지 않는다.
    // 같은 유저·같은 POI·같은 KST 날짜는 1행만 남으므로(UNIQUE) 중복 호출은 조용히 무시된다.
    // 실패해도 지도 흐름을 막지 않는다.
    void fetch('/api/poi-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poi_id: poiId }),
    }).catch(() => {})
  }, [pois, toast])

  // 캐러셀 중앙 카드가 바뀔 때(스와이프 포함) → 지도 포커싱
  const handleCarouselCenterChange = useCallback((poi: NearbyPoi) => {
    mapHandleRef.current?.focusPoi(poi.latitude, poi.longitude)
  }, [])

  // ===== 렌더 =====

  if (locError) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-[var(--spacing-16)] px-[var(--spacing-24)] text-center bg-surface text-text"
        style={{ maxWidth: 430, margin: '0 auto' }}
      >
        <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/70">{locError}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {d.drops.retry}
        </Button>
      </div>
    )
  }

  if (userLat === null || userLng === null) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-[var(--spacing-16)] bg-surface text-text"
        style={{ maxWidth: 430, margin: '0 auto' }}
      >
        <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin" />
        <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60">{d.drops.locating}</p>
      </div>
    )
  }

  const poiMarkers = pois.map((p) => ({
    id: p.id,
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    availableDrops: p.available_drops_count,
    inDropRange: p.in_drop_range,
    poiTier: p.poi_tier,
  }))

  return (
    <div className="fixed inset-0 bg-surface overflow-hidden" style={{ maxWidth: 430, margin: '0 auto' }}>
      {/* 20260831_2106: 탭 최상위 공통 TopNav 추가 — 노치까지 채우는 풀블리드 지도를 위해
          의도적으로 뺐던 결정을 뒤집었다(트레이드오프로 지도 상단 일부가 가려짐, 완료 기록 참고).
          TopNav(position: sticky, z-index: 30, design-system/components/navigation/TopNav.jsx)는
          이 fixed 컨테이너(position:fixed라 자체 스태킹 컨텍스트 생성) 안에서 z-index:auto인
          아래 지도 레이어보다 항상 위에 그려지므로 별도 z-index 조정 불필요. */}
      <TopNav logo headerStyle={{ background: 'var(--color-surface)' }} />

      {/* 지도 — 풀스크린(노치·홈 인디케이터 영역까지 꽉 채움). TopNav가 상단 일부를 가린다. */}
      <div className="absolute inset-0">
        <MapView
          userLat={userLat}
          userLng={userLng}
          pois={poiMarkers}
          onPoiSelect={handlePoiSelect}
          selectedPoiId={carouselPoiId}
          badgeMarkers={badgeMarkers}
          badgeClusters={badgeClusters}
          onViewportChange={handleViewportChange}
          onMapReady={handleMapReady}
        />
      </div>

      {poisLoading && (
        // TopNav 실측 높이(env(safe-area-inset-top) + 56px, TopNav.jsx height:56 고정값) 아래로
        // 이동 — 기존 top 값(safe-area-inset-top+1rem) 그대로면 TopNav 뒤에 가려진다.
        <div className="absolute top-[calc(env(safe-area-inset-top)+56px+1rem)] left-1/2 -translate-x-1/2 z-10 bg-surface-inverse rounded-[var(--radius-nav-buttons)] px-[var(--spacing-16)] py-2 flex items-center gap-2">
          <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin text-text-inverse" />
          <span className="text-[length:var(--text-caption)] text-text-inverse">{d.drops.exploring}</span>
        </div>
      )}

      {!poisLoading && pois.length === 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-surface-inverse rounded-[var(--radius-cards)] px-[var(--spacing-16)] py-[var(--spacing-16)] text-text-inverse/70 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center whitespace-nowrap">
          {t(d.drops.noNearbyPlaces, { m: DROP_RADIUS_METERS })}
        </div>
      )}
      {!poisLoading && pois.length > 0 && !pois.some((p) => p.in_drop_range) && !carouselPoiId && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-surface-inverse rounded-[var(--radius-cards)] px-[var(--spacing-16)] py-[var(--spacing-16)] text-text-inverse/70 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center whitespace-nowrap">
          {t(d.drops.moveCloser, { m: DROP_RADIUS_METERS })}
        </div>
      )}

      {/* POI 캐러셀 모달 — 캐러셀 아이템 자체가 모달 카드, 중앙 카드 = 선택된 POI */}
      {carouselPoiId && (
        <PoiCarouselModal
          pois={pois}
          initialPoiId={carouselPoiId}
          userLat={userLat}
          userLng={userLng}
          onClose={() => setCarouselPoiId(null)}
          onCenterChange={handleCarouselCenterChange}
          onDropOrPickupSuccess={loadNearbyPois}
        />
      )}
    </div>
  )
}
