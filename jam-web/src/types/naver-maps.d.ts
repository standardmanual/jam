// 네이버 지도(NCP Maps.js) 최소 타입 선언 — MapView.tsx에서 실제로 쓰는 API만 커버
// 참조: https://navermaps.github.io/maps.js.ncp/docs/
declare namespace naver.maps {
  class LatLng {
    constructor(lat: number, lng: number)
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
  }

  namespace Event {
    function addListener(target: unknown, eventName: string, handler: () => void): void
  }
}

interface Window {
  naver?: { maps: typeof naver.maps }
}
