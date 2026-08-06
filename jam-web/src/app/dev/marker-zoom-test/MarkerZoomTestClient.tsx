'use client'

import dynamic from 'next/dynamic'
import type { PoiMarker, PoiBadgeMarker } from '@/components/map/MapView'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

// 테스트 기준 좌표 — 서울시청
const CENTER_LAT = 37.5665
const CENTER_LNG = 126.978

// 기준 좌표 주변에 흩뿌린 더미 드랍/픽업 POI (일부는 드랍 있음/범위 밖 포함)
const MOCK_POIS: PoiMarker[] = [
  { id: 'p1', name: '드랍 있음', latitude: CENTER_LAT + 0.0009, longitude: CENTER_LNG + 0.0006, availableDrops: 2, inDropRange: true },
  { id: 'p2', name: '드랍 없음', latitude: CENTER_LAT - 0.0007, longitude: CENTER_LNG + 0.0012, availableDrops: 0, inDropRange: true },
  { id: 'p3', name: '범위 밖', latitude: CENTER_LAT + 0.0014, longitude: CENTER_LNG - 0.0009, availableDrops: 0, inDropRange: false },
]

// 더미 방문 배지 마커 — 실제 배지 이미지(있음)와 이미지 없음(물음표 폴백) 둘 다 포함
const MOCK_BADGES: PoiBadgeMarker[] = [
  {
    poi_id: 'p1',
    badge_id: 'b1',
    name: '획득 배지',
    latitude: CENTER_LAT + 0.0009,
    longitude: CENTER_LNG + 0.0006,
    image_url: '/badges/poi/transit/d4c2a637-7ae1-47cb-a8ff-a981e3d8fd5f.png',
    earned: true,
  },
  {
    poi_id: 'p2',
    badge_id: 'b2',
    name: '미획득 배지',
    latitude: CENTER_LAT - 0.0007,
    longitude: CENTER_LNG + 0.0012,
    image_url: '/badges/poi/transit/1f2f76c0-a856-46ed-bbb4-a8094158e6d9.png',
    earned: false,
  },
]

export default function MarkerZoomTestClient() {
  return (
    <div className="w-full h-dvh relative">
      <div className="absolute top-0 left-0 right-0 z-10 bg-black/75 text-white text-xs leading-relaxed p-3">
        <p className="font-semibold mb-1">마커 줌 크기 테스트 페이지 (임시)</p>
        <p>지도를 실제로 핀치/휠 줌해서 서클 크기 변화를 확인하세요.</p>
        <p>줌 ≤15 → 100% · 16~18(초기 진입 17) → 130% · 줌 ≥19 → 160%</p>
      </div>
      <MapView
        userLat={CENTER_LAT}
        userLng={CENTER_LNG}
        pois={MOCK_POIS}
        onPoiSelect={() => {}}
        badgeMarkers={MOCK_BADGES}
        badgeClusters={[]}
      />
    </div>
  )
}
