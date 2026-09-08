/**
 * GPX 파싱 + 경로 다운샘플링 — `/admin/simulator`가 쓰던 순수 함수를 그대로 옮겼다
 * (티켓 20260908_1631). 배지 조건 사전 시뮬레이션의 가상 활동 입력에서도 같은 로직을
 * 재사용하기 위해 컴포넌트 밖으로 분리했다. 로직 자체는 바뀌지 않았다.
 */

export type ActivityType = 'cycling' | 'running' | 'trail_running' | 'hiking' | 'walking'

export const ACTIVITY_TYPES: ActivityType[] = [
  'cycling',
  'running',
  'trail_running',
  'hiking',
  'walking',
]

export interface GpxParsed {
  distanceKm: number
  durationMin: number
  elevationGainM: number
  averageSpeedKmh: number
  trackpointCount: number
  startDate: string
  startLat: number
  startLng: number
  route: [number, number][]
  fileName: string
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function parseGpx(text: string, fileName: string): GpxParsed {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'application/xml')
  const trkpts = Array.from(doc.querySelectorAll('trkpt'))

  if (trkpts.length === 0) throw new Error('트랙포인트가 없습니다. 유효한 GPX 파일인지 확인하세요.')

  const route: [number, number][] = trkpts.map((pt) => [
    parseFloat(pt.getAttribute('lat') ?? '0'),
    parseFloat(pt.getAttribute('lon') ?? '0'),
  ])

  // 거리 계산 (Haversine 누적)
  let distanceM = 0
  for (let i = 1; i < route.length; i++) {
    distanceM += haversine(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1])
  }
  const distanceKm = Math.round(distanceM / 10) / 100

  // 이동 시간 계산
  const firstTime = trkpts[0].querySelector('time')?.textContent
  const lastTime = trkpts[trkpts.length - 1].querySelector('time')?.textContent
  let durationMin = 0
  let startDate = new Date().toISOString()
  if (firstTime && lastTime) {
    startDate = firstTime
    durationMin = Math.round((new Date(lastTime).getTime() - new Date(firstTime).getTime()) / 60000)
  }

  // 고도 상승 계산
  let elevationGainM = 0
  const eles = trkpts.map((pt) => {
    const ele = pt.querySelector('ele')?.textContent
    return ele ? parseFloat(ele) : null
  })
  for (let i = 1; i < eles.length; i++) {
    const prev = eles[i - 1]
    const curr = eles[i]
    if (prev !== null && curr !== null && curr > prev) {
      elevationGainM += curr - prev
    }
  }
  elevationGainM = Math.round(elevationGainM)

  // 평균 속도
  const averageSpeedKmh =
    durationMin > 0 ? Math.round((distanceKm / (durationMin / 60)) * 10) / 10 : 0

  return {
    distanceKm,
    durationMin,
    elevationGainM,
    averageSpeedKmh,
    trackpointCount: trkpts.length,
    startDate,
    startLat: route[0][0],
    startLng: route[0][1],
    route,
    fileName,
  }
}

export function downsampleRoute(route: [number, number][], maxPoints: number): [number, number][] {
  if (route.length <= maxPoints) return route
  const step = Math.ceil(route.length / maxPoints)
  const sampled: [number, number][] = []
  for (let i = 0; i < route.length; i += step) sampled.push(route[i])
  if (sampled[sampled.length - 1] !== route[route.length - 1]) sampled.push(route[route.length - 1])
  return sampled
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`
}
