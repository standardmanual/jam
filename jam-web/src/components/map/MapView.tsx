'use client'

import { useEffect, useRef, useState } from 'react'
import { CLUSTER_ZOOM_THRESHOLD } from '@/lib/poi/badge-clustering'

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
 * 드랍/픽업 POI 마커 서클 크기 배율. 기본 20px 기준 24px(1.2배)로,
 * 방문 배지 마커(BADGE_MARKER_SIZE)와 크기를 맞춘다.
 */
const DROP_MARKER_SCALE = 1.2

// 배지 아이콘(흰색) — badge-fill.svg / badge-line.svg 그대로 사용
const BADGE_FILL_PATH =
  '<path fill-rule="evenodd" clip-rule="evenodd" d="M20.0006 6.22251C20.619 6.57985 21 7.23993 21 7.95424V16.0457C21 16.76 20.619 17.4201 20.0006 17.7774L13.0006 21.8219C12.3815 22.1796 11.6185 22.1796 10.9994 21.8219L3.99944 17.7774C3.38095 17.4201 3 16.76 3 16.0457V7.95424C3 7.23993 3.38096 6.57985 3.99945 6.2225L10.9994 2.17806C11.6185 1.82037 12.3815 1.82037 13.0006 2.17806L20.0006 6.22251ZM15.5 12C15.5 13.933 13.933 15.5 12 15.5C10.067 15.5 8.5 13.933 8.5 12C8.5 10.067 10.067 8.49996 12 8.49996C13.933 8.49996 15.5 10.067 15.5 12Z"/>'
const BADGE_LINE_PATH =
  '<path fill-rule="evenodd" clip-rule="evenodd" d="M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79082 9.79086 7.99996 12 7.99996C14.2091 7.99996 16 9.79082 16 12ZM14.5 12C14.5 13.3807 13.3807 14.5 12 14.5C10.6193 14.5 9.5 13.3807 9.5 12C9.5 10.6193 10.6193 9.49996 12 9.49996C13.3807 9.49996 14.5 10.6193 14.5 12Z"/>' +
  '<path fill-rule="evenodd" clip-rule="evenodd" d="M13.0006 2.17806C12.3815 1.82037 11.6185 1.82037 10.9994 2.17806L3.99945 6.22251C3.38096 6.57986 3 7.23993 3 7.95424V16.0457C3 16.76 3.38095 17.4201 3.99944 17.7774L10.9994 21.8219C11.6185 22.1796 12.3815 22.1796 13.0006 21.8219L20.0006 17.7774C20.619 17.4201 21 16.76 21 16.0457V7.95424C21 7.23993 20.619 6.57986 20.0006 6.22251L13.0006 2.17806ZM19.2501 7.5213L12.2501 3.47686C12.0954 3.38743 11.9046 3.38743 11.7499 3.47686L4.74986 7.5213C4.59524 7.61064 4.5 7.77566 4.5 7.95424V16.0457C4.5 16.2243 4.59524 16.3893 4.74986 16.4786L11.7499 20.5231C11.9046 20.6125 12.0954 20.6125 12.2501 20.5231L19.2501 16.4786C19.4048 16.3893 19.5 16.2243 19.5 16.0457V7.95424C19.5 7.77566 19.4048 7.61064 19.2501 7.5213Z"/>'

/**
 * 드랍/픽업 POI 마커 — 서클 + 내부 흰색 배지 아이콘.
 * 픽업 가능한 드랍 있음 = 메인 포인트 컬러 배경 + badge-fill 아이콘,
 * 없음 = 그레이 배경 + badge-line 아이콘. 드랍 범위 밖은 기존과 동일하게
 * 진회색 + 반투명으로 표현한다.
 */
function dropMarkerIconHtml(opts: { hasDrops: boolean; inRange: boolean; size: number }): string {
  const { hasDrops, inRange, size } = opts
  const bg = hasDrops ? 'var(--color-main)' : inRange ? '#888888' : '#444444'
  const opacity = inRange ? 1 : 0.5
  const icon = size * 0.6
  const path = hasDrops ? BADGE_FILL_PATH : BADGE_LINE_PATH

  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};opacity:${opacity};border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;box-sizing:border-box;">` +
    `<svg viewBox="0 0 24 24" width="${icon}" height="${icon}" fill="#ffffff" aria-hidden="true">${path}</svg></div>`
}

/** 개별 방문 배지 마커의 기준 지름(px) — 드랍/픽업 POI 서클(기본 24px)과 동일하게 맞춘다 */
const BADGE_MARKER_SIZE = 24
/**
 * 방문 배지 마커를 POI 서클 위로 띄우는 기준 수직 오프셋(px).
 * 드랍/픽업 서클 반경(기본 24px 기준 12px) + 여유 간격(4px).
 */
const BADGE_MARKER_LIFT = 16
/**
 * 마커 콘텐츠 전체(서클+이름 라벨) 기준 너비(px). 서클은 이 너비 안에서 가운데 정렬되므로
 * anchor.x는 항상 이 값의 절반 — 라벨 길이가 서클보다 넓어져도 서클 중심 좌표는 그대로 유지된다.
 */
const BADGE_MARKER_CONTENT_WIDTH = 72

/**
 * 줌 레벨별 POI/배지 서클 크기 배율.
 * 최초 진입 줌(17)을 포함한 기본 구간(16~18)이 130% — 기존 크기가 배지 디자인이
 * 안 보일 정도로 작다는 피드백에 따른 확대. 줌아웃(≤15)하면 100%로 되돌리고,
 * 줌인(≥19)하면 160%까지 한 단계 더 키운다. 계단식(3단계)으로 끊는 이유는 naver 지도
 * 마커가 HTML을 매 렌더마다 다시 그리는 구조라, 줌 조작 중 프레임마다 값이 바뀌는
 * 연속(선형) 스케일을 적용하면 깜빡임/버벅임이 발생하기 때문 — zoom_changed 핸들러의
 * 디바운스와 함께 단계 전환 빈도를 최소화한다.
 */
function getZoomScaleMultiplier(zoom: number): number {
  if (zoom >= 19) return 1.6
  if (zoom >= 16) return 1.3
  return 1.0
}

/**
 * POI 배지 마커 — 원형 배지 이미지 + 아래에 POI 이름 라벨.
 * 드랍/픽업 POI 서클과 같은 좌표에 겹쳐 그려지면 서클을 완전히 가리므로,
 * anchor를 아래로 내려 서클 위쪽에 작게 얹히도록 배치한다(서클과 배지 둘 다 노출).
 * 미획득은 그레이스케일 필터로 표시한다(클릭 리스너 자체를 걸지 않아 탭 비활성).
 */
function badgeMarkerIconHtml(imageUrl: string | null, earned: boolean, name: string, size: number): string {
  const filter = earned ? 'none' : 'grayscale(1)'
  const opacity = earned ? 1 : 0.7
  const safeName = escapeHtml(name)
  const inner = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${safeName}" style="width:100%;height:100%;object-fit:contain;padding:2px;box-sizing:border-box;" />`
    : `<span style="font-size:13px;line-height:1;color:#666;">?</span>`

  const circle = `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;background:#ffffff;border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;box-sizing:border-box;filter:${filter};opacity:${opacity};">${inner}</div>`
  const label = `<div style="margin-top:2px;max-width:100%;padding:1px 6px;border-radius:8px;background:rgba(0,0,0,0.65);color:#ffffff;font-size:10px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;box-sizing:border-box;opacity:${opacity};">${safeName}</div>`

  return `<div style="width:${BADGE_MARKER_CONTENT_WIDTH}px;display:flex;flex-direction:column;align-items:center;">${circle}${label}</div>`
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

  // 줌 레벨(마커 크기 배율 계산용). 초기 줌(17)과 동일한 값으로 시작한다.
  const [zoom, setZoom] = useState(17)
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoomScale = getZoomScaleMultiplier(zoom)

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

      // 줌 변경 시 마커 크기 배율 갱신. 핀치/휠 연속 입력 중 매 프레임 리렌더를
      // 막기 위해 idle과 별개로 짧게 디바운스한다(단계 전환 자체가 3단계뿐이라
      // 값이 실제로 바뀔 때만 setZoom이 리렌더를 유발한다).
      const zoomListener = naver.maps.Event.addListener(map, 'zoom_changed', () => {
        if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current)
        zoomDebounceRef.current = setTimeout(() => setZoom(map.getZoom()), 120)
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
        naver.maps.Event.removeListener(zoomListener)
      }
    }).catch(console.error)

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current)
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
      const size = Math.round((isSelected ? 26 : 20) * DROP_MARKER_SCALE * zoomScale)

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
  }, [pois, selectedPoiId, onPoiSelect, zoomScale])

  // POI 배지 마커 / 클러스터 마커 업데이트
  useEffect(() => {
    const map = mapInstanceRef.current
    const naver = window.naver
    if (!map || !naver?.maps) return

    badgeMarkersRef.current.forEach((m) => m.setMap(null))
    badgeMarkersRef.current = []

    // 줌 13 이하 — 서버가 집계한 클러스터를 그대로 렌더링.
    // 클릭 시 해당 좌표를 중심으로 이동 + 개별 마커가 보이는 줌으로 확대한다.
    badgeClusters.forEach((cluster) => {
      const size = cluster.count >= 100 ? 44 : cluster.count >= 10 ? 38 : 32
      const clusterCenter = new naver.maps.LatLng(cluster.lat, cluster.lng)
      const marker = new naver.maps.Marker({
        position: clusterCenter,
        map,
        icon: {
          content: clusterMarkerIconHtml(cluster.count),
          anchor: new naver.maps.Point(size / 2, size / 2),
        },
        zIndex: 6,
      })

      naver.maps.Event.addListener(marker, 'click', () => {
        map.morph(clusterCenter, CLUSTER_ZOOM_THRESHOLD + 1)
      })

      badgeMarkersRef.current.push(marker)
    })

    // 줌 13 초과 — 개별 배지 마커. 드랍/픽업 POI 서클과 같은 좌표를 공유하므로
    // anchor.y를 키워 서클 위쪽에 작게 얹는다(서클을 가리지 않고 함께 노출).
    const badgeSize = Math.round(BADGE_MARKER_SIZE * zoomScale)
    const badgeLift = Math.round(BADGE_MARKER_LIFT * zoomScale)
    badgeMarkers.forEach((badge) => {
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(badge.latitude, badge.longitude),
        map,
        title: badge.name,
        icon: {
          content: badgeMarkerIconHtml(badge.image_url, badge.earned, badge.name, badgeSize),
          anchor: new naver.maps.Point(BADGE_MARKER_CONTENT_WIDTH / 2, badgeSize / 2 + badgeLift),
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
  }, [badgeMarkers, badgeClusters, zoomScale])

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
