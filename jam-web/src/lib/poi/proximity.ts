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
