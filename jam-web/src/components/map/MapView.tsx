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

interface MapViewProps {
  userLat: number
  userLng: number
  pois: PoiMarker[]
  onPoiSelect: (poiId: string) => void
  selectedPoiId?: string | null
}

// 전역 콜백 이름 (네이버 지도 script src에 callback= 으로 전달)
const CALLBACK = '__jam_maps_ready__'

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

function markerIconHtml(color: string, size: number, opacity: number): string {
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:${opacity};border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.2);"></div>`
}

export default function MapView({ userLat, userLng, pois, onPoiSelect, selectedPoiId }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<naver.maps.Map | null>(null)
  const markersRef = useRef<naver.maps.Marker[]>([])

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
          content: markerIconHtml('#4285F4', 20, 1),
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
    }).catch(console.error)

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // POI 마커 업데이트
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
      const fillColor = hasDrops ? '#22c55e' : inRange ? '#888888' : '#444444'
      const size = isSelected ? 28 : 20

      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(poi.latitude, poi.longitude),
        map,
        title: poi.name,
        icon: {
          content: markerIconHtml(fillColor, size, inRange ? 1 : 0.5),
          anchor: new naver.maps.Point(size / 2, size / 2),
        },
        zIndex: isSelected ? 5 : 3,
      })

      naver.maps.Event.addListener(marker, 'click', () => onPoiSelect(poi.id))
      markersRef.current.push(marker)
    })
  }, [pois, selectedPoiId, onPoiSelect])

  return <div ref={mapRef} className="w-full h-full rounded-2xl overflow-hidden" />
}
