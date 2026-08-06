// 네이버 지도(NCP Maps.js) 최소 타입 선언 — MapView.tsx에서 실제로 쓰는 API만 커버
// 참조: https://navermaps.github.io/maps.js.ncp/docs/
declare namespace naver.maps {
  class LatLng {
    constructor(lat: number, lng: number)
    lat(): number
    lng(): number
  }

  /** 지도 뷰포트의 남서/북동 좌표 (map.getBounds() 반환값) */
  class LatLngBounds {
    getSW(): LatLng
    getNE(): LatLng
  }

  class Point {
    constructor(x: number, y: number)
  }

  interface MapOptions {
    center: LatLng
    zoom?: number
    scaleControl?: boolean
    logoControl?: boolean
    mapDataControl?: boolean
    zoomControl?: boolean
    customStyleId?: string
  }

  class Map {
    constructor(el: HTMLElement, options: MapOptions)
    getBounds(): LatLngBounds
    getZoom(): number
    /** 지정 좌표를 중심으로 애니메이션과 함께 이동 + 줌 변경 */
    morph(center: LatLng, zoom?: number): void
  }

  interface MarkerIcon {
    content: string
    anchor?: Point
  }

  interface MarkerOptions {
    position: LatLng
    map?: Map
    icon?: MarkerIcon
    title?: string
    zIndex?: number
  }

  class Marker {
    constructor(options: MarkerOptions)
    setMap(map: Map | null): void
    setPosition(position: LatLng): void
  }

  interface CircleOptions {
    map?: Map
    center: LatLng
    radius: number
    fillColor?: string
    fillOpacity?: number
    strokeColor?: string
    strokeOpacity?: number
    strokeWeight?: number
  }

  class Circle {
    constructor(options: CircleOptions)
    setCenter(center: LatLng): void
  }

  /** addListener가 반환하는 리스너 핸들 (removeListener에 그대로 넘긴다) */
  interface MapEventListener {
    readonly __naverEventListener?: never
  }

  namespace Event {
    function addListener(target: unknown, eventName: string, handler: () => void): MapEventListener
    function removeListener(listener: MapEventListener): void
  }
}

interface Window {
  naver?: { maps: typeof naver.maps }
}
