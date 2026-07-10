'use client'

import { useEffect, useRef } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

export interface PoiMarker {
  id: string
  name: string
  latitude: number
  longitude: number
  availableDrops: number
}

interface MapViewProps {
  userLat: number
  userLng: number
  pois: PoiMarker[]
  onPoiSelect: (poiId: string) => void
  selectedPoiId?: string | null
}

export default function MapView({ userLat, userLng, pois, onPoiSelect, selectedPoiId }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])

  // 지도 초기화
  useEffect(() => {
    if (!mapRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY! } as any)

    let cancelled = false

    importLibrary('maps').then((mapsLib) => {
      if (cancelled || !mapRef.current) return
      const { Map, Circle, Marker, SymbolPath } = mapsLib as google.maps.MapsLibrary & {
        Circle: typeof google.maps.Circle
        Marker: typeof google.maps.Marker
        SymbolPath: typeof google.maps.SymbolPath
      }

      const map = new Map(mapRef.current!, {
        center: { lat: userLat, lng: userLng },
        zoom: 17,
        disableDefaultUI: true,
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#888888' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
          { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212121' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d0d0d' }] },
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        ],
      })

      mapInstanceRef.current = map

      // 현재 위치 마커
      new Marker({
        position: { lat: userLat, lng: userLng },
        map,
        icon: {
          path: SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        zIndex: 10,
        title: '현재 위치',
      })

      // 50m 반경 Circle
      new Circle({
        map,
        center: { lat: userLat, lng: userLng },
        radius: 50,
        fillColor: '#4285F4',
        fillOpacity: 0.08,
        strokeColor: '#4285F4',
        strokeOpacity: 0.4,
        strokeWeight: 1,
      })
    })

    return () => {
      cancelled = true
      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []
    }
    // 지도는 최초 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // POI 마커 업데이트
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    importLibrary('maps').then((mapsLib) => {
      const { Marker, SymbolPath } = mapsLib as google.maps.MapsLibrary & {
        Marker: typeof google.maps.Marker
        SymbolPath: typeof google.maps.SymbolPath
      }

      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []

      pois.forEach((poi) => {
        const hasDrops = poi.availableDrops > 0
        const isSelected = poi.id === selectedPoiId

        const marker = new Marker({
          position: { lat: poi.latitude, lng: poi.longitude },
          map,
          title: poi.name,
          icon: {
            path: SymbolPath.CIRCLE,
            scale: isSelected ? 14 : 10,
            fillColor: hasDrops ? '#AEEA00' : '#555555',
            fillOpacity: 1,
            strokeColor: isSelected ? '#ffffff' : 'transparent',
            strokeWeight: isSelected ? 2 : 0,
          },
          zIndex: isSelected ? 5 : 3,
        })

        marker.addListener('click', () => onPoiSelect(poi.id))
        markersRef.current.push(marker)
      })
    })
  }, [pois, selectedPoiId, onPoiSelect])

  return <div ref={mapRef} className="w-full h-full rounded-2xl overflow-hidden" />
}
