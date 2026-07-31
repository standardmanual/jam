'use client'

import { useEffect, useRef } from 'react'

export interface PoiMarker {
  id: string
  name: string
  latitude: number
  longitude: number
  availableDrops: number
  inDropRange?: boolean
  poiTier?: number
}

/** Phase 17 — 지도에 노출되는 POI 방문 배지 마커 (`/api/poi-badges` 개별 응답) */
export interface PoiBadgeMarker {
  poi_id: string
  badge_id: string
  name: string
  latitude: number
  longitude: number
  image_url: string | null
  /** 획득 여부 — false면 그레이 + 탭 비활성 */
  earned: boolean
}

/** Phase 17 — 줌 13 이하에서 서버가 그리드로 집계해 내려주는 클러스터 */
export interface PoiBadgeClusterMarker {
  lat: number
  lng: number
  count: number
}

/** 지도 뷰포트(bounding box) + 줌 */
export interface MapViewport {
  swLat: number
  swLng: number
  neLat: number
  neLng: number
  zoom: number
}

interface MapViewProps {
  userLat: number
  userLng: number
  pois: PoiMarker[]
  onPoiSelect: (poiId: string) => void
  selectedPoiId?: string | null
  /** POI 배지 개별 마커 (줌 > 13) */
  badgeMarkers?: PoiBadgeMarker[]
  /** POI 배지 클러스터 마커 (줌 <= 13) */
  badgeClusters?: PoiBadgeClusterMarker[]
  /**
   * 뷰포트가 "이전에 조회한 범위를 벗어났을 때"만 호출된다(디바운스 적용).
   * 범위 안에서의 이동은 호출하지 않아 API 호출량을 최소화한다.
   */
  onViewportChange?: (viewport: MapViewport) => void
}

// 전역 콜백 이름 (네이버 지도 script src에 callback= 으로 전달)
const CALLBACK = '__jam_maps_ready__'

/** 지도 idle 이후 재조회까지의 디바운스 (ms) */
const VIEWPORT_DEBOUNCE_MS = 350

/**
 * 재조회 판단용 여유 마진 비율.
 * 마지막 조회 범위를 이 비율만큼 안쪽으로 좁힌 영역을 벗어나면 재조회한다
 * (경계에 딱 붙었을 때 미세 이동으로 호출이 튀는 것을 방지).
 */
const VIEWPORT_MARGIN_RATIO = 0.02

type MapsReadyCallback = () => void
const globalCallbacks = window as unknown as Record<string, MapsReadyCallback | undefined>

function loadMapsScript(): Promise<void> {
  // 이미 로드됐으면 즉시 resolve
  if (window.naver?.maps) return Promise.resolve()

  // 이미 로딩 중이면 콜백 대기
  if (document.querySelector('script[data-jam-maps]')) {
    return new Promise((resolve) => {
      const prev = globalCallbacks[CALLBACK]
      globalCallbacks[CALLBACK] = () => { prev?.(); resolve() }
    })
  }

  return new Promise((resolve, reject) => {
    globalCallbacks[CALLBACK] = resolve
    const script = document.createElement('script')
    script.setAttribute('data-jam-maps', '1')
    const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&callback=${CALLBACK}`
    script.async = true
    script.defer = true
    script.onerror = () => reject(new Error('네이버 지도 로드 실패'))
    document.head.appendChild(script)
  })
}

/** 현재 위치 등 단순 색상 원 마커 */
function dotIconHtml(color: string, size: number, opacity: number): string {
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:${opacity};border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.2);"></div>`
}

/**
 * 드랍/픽업 POI 마커 서클 크기 배율. 기존 20px/26px(선택 시) 기준 130%.
 */
const DROP_MARKER_SCALE = 1.3

/**
 * 드랍/픽업 POI 마커 — 서클 + 내부 네거티브 컬러 메달(배지) 아이콘.
 * "드랍/픽업 행위"가 아니라 "여기에 배지가 있다/없다"를 표현하도록 화살표 대신
 * 배지 상세화면 등에서 이미 쓰이는 MedalIcon과 동일한 모양을 사용한다.
 * 픽업 가능 배지 있음 = 메인 포인트 컬러, 없음 = 그레이.
 * 드랍 범위 밖은 기존과 동일하게 진회색 + 반투명으로 표현한다.
 */
function dropMarkerIconHtml(opts: { hasDrops: boolean; inRange: boolean; size: number }): string {
  const { hasDrops, inRange, size } = opts
  const bg = hasDrops ? 'var(--color-main)' : inRange ? '#888888' : '#444444'
  // 배경과 대비되는 네거티브 컬러 (코발트/그레이 모두 밝은 아이스가 대비 확보)
  const fg = hasDrops ? 'var(--color-sub)' : '#ffffff'
  const opacity = inRange ? 1 : 0.5
  const icon = size * 0.6

  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};opacity:${opacity};border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;box-sizing:border-box;">` +
    `<svg viewBox="0 0 24 24" width="${icon}" height="${icon}" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M12 3.5l2.2 4.4 4.9.7-3.55 3.45.84 4.85L12 14.6l-4.39 2.3.84-4.85L4.9 8.6l4.9-.7L12 3.5z"/>` +
    `<path d="M8.5 16.5L7 21.5l5-2.4 5 2.4-1.5-5"/>` +
    `</svg></div>`
}

/**
 * POI 배지 마커 — 지름 30px 원형 배지 이미지.
 * 미획득은 그레이스케일 필터로 표시한다(클릭 리스너 자체를 걸지 않아 탭 비활성).
 */
function badgeMarkerIconHtml(imageUrl: string | null, earned: boolean, name: string): string {
  const size = 30
  const filter = earned ? 'none' : 'grayscale(1)'
  const opacity = earned ? 1 : 0.7
  const safeName = escapeHtml(name)
  const inner = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${safeName}" style="width:100%;height:100%;object-fit:contain;padding:2px;box-sizing:border-box;" />`
    : `<span style="font-size:13px;line-height:1;color:#666;">?</span>`

  return `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;background:#ffffff;border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;box-sizing:border-box;filter:${filter};opacity:${opacity};">${inner}</div>`
}

/** 클러스터 마커 — 숫자를 표기한 원형 마커 (개수에 따라 크기 가변) */
function clusterMarkerIconHtml(count: number): string {
  const size = count >= 100 ? 44 : count >= 10 ? 38 : 32
  const label = count > 999 ? '999+' : String(count)
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--color-main);border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;box-sizing:border-box;color:var(--color-sub);font-size:12px;font-weight:600;line-height:1;">${label}</div>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default function MapView({
  userLat,
  userLng,
  pois,
  onPoiSelect,
  selectedPoiId,
  badgeMarkers = [],
  badgeClusters = [],
  onViewportChange,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<naver.maps.Map | null>(null)
  const markersRef = useRef<naver.maps.Marker[]>([])
  const badgeMarkersRef = useRef<naver.maps.Marker[]>([])

  // idle 디바운스 타이머 + 마지막으로 조회한 뷰포트(범위 밖으로 나갔을 때만 재조회)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastViewportRef = useRef<MapViewport | null>(null)
  // 최신 콜백을 리스너 재등록 없이 참조하기 위한 ref
  const onViewportChangeRef = useRef(onViewportChange)
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange
  }, [onViewportChange])
  // 언마운트 시 idle 리스너 해제용
  const cleanupRef = useRef<(() => void) | null>(null)

  // 지도 초기화
  useEffect(() => {
    if (!mapRef.current) return
    let cancelled = false

    loadMapsScript().then(() => {
      if (cancelled || !mapRef.current) return
      const naver = window.naver
      if (!naver) return

      const styleId = process.env.NEXT_PUBLIC_NAVER_MAP_STYLE_ID
      const map = new naver.maps.Map(mapRef.current, {
        center: new naver.maps.LatLng(userLat, userLng),
        zoom: 17,
        scaleControl: false,
        logoControl: false,
        mapDataControl: false,
        zoomControl: false,
        ...(styleId ? { customStyleId: styleId } : {}),
      })
      mapInstanceRef.current = map

      new naver.maps.Marker({
        position: new naver.maps.LatLng(userLat, userLng),
        map,
        icon: {
          content: dotIconHtml('#4285F4', 20, 1),
          anchor: new naver.maps.Point(10, 10),
        },
        zIndex: 10,
        title: '현재 위치',
      })

      new naver.maps.Circle({
        map,
        center: new naver.maps.LatLng(userLat, userLng),
        radius: 500,
        fillColor: '#4285F4',
        fillOpacity: 0.08,
        strokeColor: '#4285F4',
        strokeOpacity: 0.4,
        strokeWeight: 1,
      })

      // ── 뷰포트 변경 감지 (이동/줌 완료 = idle) ──
      const emitViewport = () => {
        // getBounds()는 LatLngBounds — SW/NE 좌표를 뽑아 bbox로 변환
        const bounds = map.getBounds()
        const sw = bounds.getSW()
        const ne = bounds.getNE()
        const next: MapViewport = {
          swLat: sw.lat(),
          swLng: sw.lng(),
          neLat: ne.lat(),
          neLng: ne.lng(),
          zoom: map.getZoom(),
        }

        const prev = lastViewportRef.current
        // 이전 조회 범위 안이고 줌도 그대로면 재조회하지 않는다
        if (prev && prev.zoom === next.zoom && isWithin(next, prev)) return

        lastViewportRef.current = next
        onViewportChangeRef.current?.(next)
      }

      const idleListener = naver.maps.Event.addListener(map, 'idle', () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(emitViewport, VIEWPORT_DEBOUNCE_MS)
      })

      // 초기 1회 즉시 조회. 지도 초기화 직후 bounds가 아직 없을 수 있는데,
      // 그 경우엔 lastViewport가 비어 있으므로 첫 idle에서 자연히 조회된다.
      try {
        emitViewport()
      } catch {
        /* noop */
      }

      cleanupRef.current = () => {
        naver.maps.Event.removeListener(idleListener)
      }
    }).catch(console.error)

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      cleanupRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 드랍/픽업 POI 마커 업데이트 (기존 로직 유지 — 아이콘만 리디자인)
  useEffect(() => {
    const map = mapInstanceRef.current
    const naver = window.naver
    if (!map || !naver?.maps) return

    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

    pois.forEach((poi) => {
      const hasDrops = poi.availableDrops > 0
      const isSelected = poi.id === selectedPoiId

      // inDropRange=undefined(구버전 호환)이면 true로 간주
      const inRange = poi.inDropRange !== false
      const size = Math.round((isSelected ? 26 : 20) * DROP_MARKER_SCALE)

      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(poi.latitude, poi.longitude),
        map,
        title: poi.name,
        icon: {
          content: dropMarkerIconHtml({ hasDrops, inRange, size }),
          anchor: new naver.maps.Point(size / 2, size / 2),
        },
        zIndex: isSelected ? 5 : 3,
      })

      naver.maps.Event.addListener(marker, 'click', () => onPoiSelect(poi.id))
      markersRef.current.push(marker)
    })
  }, [pois, selectedPoiId, onPoiSelect])

  // POI 배지 마커 / 클러스터 마커 업데이트
  useEffect(() => {
    const map = mapInstanceRef.current
    const naver = window.naver
    if (!map || !naver?.maps) return

    badgeMarkersRef.current.forEach((m) => m.setMap(null))
    badgeMarkersRef.current = []

    // 줌 13 이하 — 서버가 집계한 클러스터를 그대로 렌더링
    badgeClusters.forEach((cluster) => {
      const size = cluster.count >= 100 ? 44 : cluster.count >= 10 ? 38 : 32
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(cluster.lat, cluster.lng),
        map,
        icon: {
          content: clusterMarkerIconHtml(cluster.count),
          anchor: new naver.maps.Point(size / 2, size / 2),
        },
        zIndex: 6,
      })
      badgeMarkersRef.current.push(marker)
    })

    // 줌 13 초과 — 개별 배지 마커
    badgeMarkers.forEach((badge) => {
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(badge.latitude, badge.longitude),
        map,
        title: badge.name,
        icon: {
          content: badgeMarkerIconHtml(badge.image_url, badge.earned, badge.name),
          anchor: new naver.maps.Point(15, 15),
        },
        zIndex: badge.earned ? 8 : 7,
      })

      // 미획득 배지는 클릭 이벤트 자체를 걸지 않는다 (탭해도 아무 반응 없음)
      if (badge.earned) {
        naver.maps.Event.addListener(marker, 'click', () => {
          window.location.href = `/badges/${badge.badge_id}`
        })
      }

      badgeMarkersRef.current.push(marker)
    })
  }, [badgeMarkers, badgeClusters])

  return <div ref={mapRef} className="w-full h-full" />
}

/**
 * `next`가 `prev` 범위(마진만큼 바깥으로 넓힘) 안에 들어가는지 판정한다.
 * true면 이미 조회한 데이터로 사실상 커버되므로 재조회하지 않는다.
 * (마진을 바깥으로 두어 동일 뷰포트·경계 미세 이동에서 중복 호출이 나지 않게 한다)
 */
function isWithin(next: MapViewport, prev: MapViewport): boolean {
  const latMargin = (prev.neLat - prev.swLat) * VIEWPORT_MARGIN_RATIO
  const lngMargin = (prev.neLng - prev.swLng) * VIEWPORT_MARGIN_RATIO
  return (
    next.swLat >= prev.swLat - latMargin &&
    next.swLng >= prev.swLng - lngMargin &&
    next.neLat <= prev.neLat + latMargin &&
    next.neLng <= prev.neLng + lngMargin
  )
}
