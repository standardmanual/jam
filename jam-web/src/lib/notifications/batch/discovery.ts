/**
 * ⑦ #34 주변 신규 드랍 (티켓 20260825_002)
 * 스펙: PRD §3 ⑦ — "앰비언트 드랍 배치", 일 1회 상한
 *
 * ## 지역 판정
 *
 * PRD §9는 "활동 지역 = `users.region` 문자열 일치"로 확정했다. 그런데 앰비언트 드랍은
 * `dropper_user_id`가 NULL이라 비교할 상대 region이 없고, `poi` 테이블에도 region 컬럼이
 * 없다. 그래서 POI 좌표를 **역지오코딩**해 "구 동" 문자열을 얻어 비교한다.
 *
 * 비용을 이렇게 억제한다.
 *   1. region이 비어 있지 않은 유저가 **한 명도 없으면 지오코딩을 아예 하지 않는다.**
 *      (`users.region`은 기본값이 `''`이고 현재 어떤 코드도 이 값을 쓰지 않는다)
 *   2. 한 배치에서 지오코딩할 POI 수를 `NEARBY_DROP_GEOCODE_LIMIT`으로 제한한다.
 *   3. `reverseGeocodeToRegionName()`은 좌표 격자 캐시를 이미 갖고 있다.
 */
import { scopedGroupKey } from '@/lib/notifications/groupKey'
import { reverseGeocodeToRegionName } from '@/lib/poi/reverse-geocode'
import {
  DAY_MS,
  fetchAllRows,
  type BatchContext,
  type NotificationDraft,
} from './shared'

/** 집계 창 — 지난 24시간의 신규 앰비언트 드랍 */
export const NEARBY_DROP_WINDOW_MS = DAY_MS

/** 한 배치에서 역지오코딩할 POI 상한 (외부 API 호출 폭주 방지) */
export const NEARBY_DROP_GEOCODE_LIMIT = 50

export interface NearbyDropInput {
  /** region → 지난 24시간 신규 앰비언트 드랍 수 */
  countByRegion: Map<string, number>
  /** region → 그 지역 유저 id */
  usersByRegion: Map<string, string[]>
  today: string
}

/**
 * #34 판정 (순수 함수 — 테스트 대상).
 *
 * **count가 0이면 만들지 않는다**(§3-3). 렌더러가 `num()`으로 0을 읽어
 * "…아이템 배지 0개가 새로 떨어졌어요"를 그대로 낸다.
 */
export function selectNearbyDropDrafts(input: NearbyDropInput): NotificationDraft[] {
  const drafts: NotificationDraft[] = []
  for (const [region, count] of input.countByRegion) {
    if (count <= 0) continue
    if (region.trim() === '') continue
    for (const userId of input.usersByRegion.get(region) ?? []) {
      drafts.push({
        userId,
        type: 'nearby_drops',
        payload: { count, region },
        // "일 1회 상한"(PRD §3 ⑦) + cron 재시도 멱등성
        groupKey: scopedGroupKey('nearby_drops', input.today),
        mode: 'once',
      })
    }
  }
  return drafts
}

export async function buildNearbyDropDrafts(ctx: BatchContext): Promise<NotificationDraft[]> {
  const { supabase, startedAt, today } = ctx

  const users = await fetchAllRows<{ id: string; region: string | null }>('users(region)', (from, to) =>
    supabase.from('users').select('id, region').range(from, to)
  )
  const usersByRegion = new Map<string, string[]>()
  for (const u of users) {
    const region = (u.region ?? '').trim()
    if (region === '') continue
    const list = usersByRegion.get(region) ?? []
    list.push(u.id)
    usersByRegion.set(region, list)
  }
  // 지역을 설정한 유저가 없으면 역지오코딩을 할 이유가 없다
  if (usersByRegion.size === 0) return []

  const since = new Date(startedAt.getTime() - NEARBY_DROP_WINDOW_MS).toISOString()
  const drops = await fetchAllRows<{ poi_id: string }>('poi_drops(ambient 24h)', (from, to) =>
    supabase
      .from('poi_drops')
      .select('poi_id')
      .eq('source', 'system')
      .eq('is_available', true)
      .gte('dropped_at', since)
      .range(from, to)
  )
  if (drops.length === 0) return []

  const countByPoi = new Map<string, number>()
  for (const d of drops) countByPoi.set(d.poi_id, (countByPoi.get(d.poi_id) ?? 0) + 1)

  const poiIds = [...countByPoi.keys()].slice(0, NEARBY_DROP_GEOCODE_LIMIT)
  const pois = await fetchAllRows<{ id: string; latitude: number; longitude: number }>(
    'poi(ambient)',
    (from, to) =>
      supabase.from('poi').select('id, latitude, longitude').in('id', poiIds).range(from, to)
  )

  const countByRegion = new Map<string, number>()
  for (const poi of pois) {
    let region: string | null = null
    try {
      region = await reverseGeocodeToRegionName(poi.latitude, poi.longitude)
    } catch (err) {
      // 외부 API 실패가 나머지 소식을 막지 않는다
      console.error(`[notifications-batch] 역지오코딩 실패 — poi: ${poi.id}:`, err)
    }
    if (!region) continue
    if (!usersByRegion.has(region)) continue
    countByRegion.set(region, (countByRegion.get(region) ?? 0) + (countByPoi.get(poi.id) ?? 0))
  }

  return selectNearbyDropDrafts({ countByRegion, usersByRegion, today })
}
