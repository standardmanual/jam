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

const MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#888888' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d0d0d' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]

// 전역 콜백 이름 (Google Maps script src에 callback= 으로 전달)
const CALLBACK = '__jam_maps_ready__'

function loadMapsScript(): Promise<void> {
  // 이미 로드됐으면 즉시 resolve
  if (window.google?.maps) return Promise.resolve()

  // 이미 로딩 중이면 콜백 대기
  if (document.querySelector('script[data-jam-maps]')) {
    return new Promise((resolve) => {
      const prev = (window as any)[CALLBACK]
      ;(window as any)[CALLBACK] = () => { prev?.(); resolve() }
    })
  }

  return new Promise((resolve, reject) => {
    ;(window as any)[CALLBACK] = resolve
    const script = document.createElement('script')
    script.setAttribute('data-jam-maps', '1')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&callback=${CALLBACK}&loading=async`
    script.async = true
    script.defer = true
    script.onerror = () => reject(new Error('Google Maps 로드 실패'))
    document.head.appendChild(script)
  })
}

export default function MapView({ userLat, userLng, pois, onPoiSelect, selectedPoiId }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])

  // 지도 초기화
  useEffect(() => {
    if (!mapRef.current) return
    let cancelled = false

    loadMapsScript().then(() => {
      if (cancelled || !mapRef.current) return

      const map = new google.maps.Map(mapRef.current, {
        center: { lat: userLat, lng: userLng },
        zoom: 17,
        disableDefaultUI: true,
        styles: MAP_STYLES,
      })
      mapInstanceRef.current = map

      new google.maps.Marker({
        position: { lat: userLat, lng: userLng },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        zIndex: 10,
        title: '현재 위치',
      })

      new google.maps.Circle({
        map,
        center: { lat: userLat, lng: userLng },
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
    if (!map || !window.google?.maps) return

    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

    pois.forEach((poi) => {
      const hasDrops = poi.availableDrops > 0
      const isSelected = poi.id === selectedPoiId

      // inDropRange=undefined(구버전 호환)이면 true로 간주
      const inRange = poi.inDropRange !== false
      const fillColor = hasDrops ? '#22c55e' : inRange ? '#888888' : '#444444'

      const marker = new google.maps.Marker({
        position: { lat: poi.latitude, lng: poi.longitude },
        map,
        title: poi.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 14 : 10,
          fillColor,
          fillOpacity: inRange ? 1 : 0.5,
          strokeColor: isSelected ? '#ffffff' : 'transparent',
          strokeWeight: isSelected ? 2 : 0,
        },
        zIndex: isSelected ? 5 : 3,
      })

      marker.addListener('click', () => onPoiSelect(poi.id))
      markersRef.current.push(marker)
    })
  }, [pois, selectedPoiId, onPoiSelect])

  return <div ref={mapRef} className="w-full h-full rounded-2xl overflow-hidden" />
}
