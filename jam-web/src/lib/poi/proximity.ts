export { haversineDistance } from './matcher'
import { haversineDistance } from './matcher'
import type { PoiRow } from '@/types/database'

export const DROP_RADIUS_METERS = 500

export function isUserNearPoi(
  userLat: number,
  userLng: number,
  poi: Pick<PoiRow, 'latitude' | 'longitude'>
): boolean {
  return haversineDistance(userLat, userLng, poi.latitude, poi.longitude) <= DROP_RADIUS_METERS
}

export function getNearbyPois(
  userLat: number,
  userLng: number,
  pois: PoiRow[]
): Array<PoiRow & { distance_meters: number }> {
  return pois
    .map((poi) => ({
      ...poi,
      distance_meters: Math.round(haversineDistance(userLat, userLng, poi.latitude, poi.longitude)),
    }))
    .filter((poi) => poi.distance_meters <= DROP_RADIUS_METERS)
    .sort((a, b) => a.distance_meters - b.distance_meters)
}
