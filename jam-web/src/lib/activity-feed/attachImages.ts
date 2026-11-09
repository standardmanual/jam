/**
 * 피드 행에 미션·컬렉션의 대표 이미지를 붙인다 (서버 전용, 2026-11-09 사용자 지시)
 *
 * 피드 행의 이미지 칸(`ListRow`의 lead)은 배지 이벤트에서만 `metadata.badge_image_url`이 있고, 미션·컬렉션 이벤트는 값이 없어
 * 늘 폴백 아이콘이었다. 미션 참가·완료·취소 행은 그 미션의 대표 이미지(`missions.image_url`)를, 컬렉션 등급 완성 행은 그 컬렉션의
 * 대표 이미지(`item_books.image_url`)를 쓴다. 값은 기록 시점 스냅샷에 굳히지 않고 렌더 직전에 읽는다(`hydrate.ts`와 같은 이유).
 *
 * 붙이는 키: `mission_image_url`, `collection_image_url`. 이미지가 없는 미션·컬렉션, 조회 실패는 키를 붙이지 않고 행을 그대로 둔다
 * (화면은 폴백 아이콘을 그린다). 배지 이벤트는 건드리지 않는다 — 배지 이미지는 `hydrate.ts`가 맡고, 잠긴 개체의 이름·그림 가림
 * (운영 로직 7.3절)을 이 함수가 우회하지 않게 한다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { ActivityFeedRow, ActivityFeedEventType } from '@/types/database'

const MISSION_EVENTS = new Set<ActivityFeedEventType>(['mission_joined', 'mission_completed', 'mission_cancelled'])
const COLLECTION_EVENTS = new Set<ActivityFeedEventType>(['collection_tier_completed'])

function stringValue(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

async function readImages(table: 'missions' | 'item_books', ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const supabase = createServiceClient()
  const { data, error } = await supabase.from(table).select('id, image_url').in('id', ids)
  if (error) {
    console.error(`[activity-feed/attachImages] ${table} 이미지 조회 실패`, error)
    return map
  }
  for (const row of (data ?? []) as { id: string; image_url: string | null }[]) {
    if (typeof row.image_url === 'string' && row.image_url.length > 0) map.set(row.id, row.image_url)
  }
  return map
}

export async function attachFeedImages(items: ActivityFeedRow[]): Promise<ActivityFeedRow[]> {
  const missionIds = new Set<string>()
  const collectionIds = new Set<string>()
  for (const item of items) {
    const meta = item.metadata as Record<string, unknown>
    if (MISSION_EVENTS.has(item.event_type)) {
      const id = stringValue(meta, 'mission_id')
      if (id) missionIds.add(id)
    } else if (COLLECTION_EVENTS.has(item.event_type)) {
      const id = stringValue(meta, 'collection_id')
      if (id) collectionIds.add(id)
    }
  }
  if (missionIds.size === 0 && collectionIds.size === 0) return items

  const [missionImages, collectionImages] = await Promise.all([
    readImages('missions', [...missionIds]),
    readImages('item_books', [...collectionIds]),
  ])
  if (missionImages.size === 0 && collectionImages.size === 0) return items

  return items.map((item) => {
    const meta = item.metadata as Record<string, unknown>
    if (MISSION_EVENTS.has(item.event_type)) {
      const image = missionImages.get(stringValue(meta, 'mission_id') ?? '')
      return image ? { ...item, metadata: { ...meta, mission_image_url: image } as ActivityFeedRow['metadata'] } : item
    }
    if (COLLECTION_EVENTS.has(item.event_type)) {
      const image = collectionImages.get(stringValue(meta, 'collection_id') ?? '')
      return image ? { ...item, metadata: { ...meta, collection_image_url: image } as ActivityFeedRow['metadata'] } : item
    }
    return item
  })
}
