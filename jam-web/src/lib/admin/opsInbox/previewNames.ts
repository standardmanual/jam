/**
 * 레시피·드랍 미리보기가 쓰는 이름 맵 (티켓 20261007_1401, 상위 20261006_1805 ⑤-b).
 *
 * 레시피의 재료·보상 배지와 드랍의 지점·배지·컬렉션은 항목에 ID로만 적혀 있어 서버가 이름·이미지를 읽어 화면에 내려 준다.
 * **읽기만 한다.** 읽지 못하면 로그만 남기고 그 부분을 빈 맵으로 두므로 미리보기는 폴백 문구(「이름을 읽지 못함」)로 그려진다.
 * 서버가 읽은 값은 JSON으로 화면에 가므로 일반 객체다. 값 import에 서버 모듈이 없어 화면이 이 파일의 타입·상수를 가져와도 된다.
 */
import { fetchAllRowsIn, type PagedQuery } from '@/lib/db/fetchAllRows'
import { asRecord, type ViewableItem } from '@/lib/admin/opsInbox/itemView'
import type { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRarity } from '@/types/database'

type ServiceClient = ReturnType<typeof createServiceClient>

export const PREVIEW_NAME_UNKNOWN = '(이름을 읽지 못함)'

export interface OpsPreviewBadge {
  id: string
  name: string
  imageUrl: string | null
  rarity: BadgeRarity | null
}

export interface OpsPreviewNames {
  badges: Record<string, OpsPreviewBadge>
  pois: Record<string, string>
  collections: Record<string, string>
  /** 지점 종류 slug → 라벨 */
  categories: Record<string, string>
}

export const EMPTY_PREVIEW_NAMES: OpsPreviewNames = { badges: {}, pois: {}, collections: {}, categories: {} }

interface NameSource extends ViewableItem {
  kind?: string | null
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()) : []
}

/** 원본과 직접 수정본 양쪽의 `resource`에서 이름을 읽어야 할 ID를 모은다(수정본이 ID를 바꿔도 둘 다 읽는다). */
export function collectPreviewIds(items: readonly NameSource[]): {
  badgeIds: string[]
  poiIds: string[]
  collectionIds: string[]
  needsCategories: boolean
} {
  const badgeIds = new Set<string>()
  const poiIds = new Set<string>()
  const collectionIds = new Set<string>()
  let needsCategories = false
  for (const item of items) {
    if (item.kind !== 'recipe' && item.kind !== 'drop_schedule') continue
    for (const side of [item.original, item.edited]) {
      const resource = asRecord(asRecord(side)?.resource)
      if (!resource) continue
      if (item.kind === 'recipe') {
        for (const id of stringList(resource.reward_badge_ids)) badgeIds.add(id)
        if (Array.isArray(resource.slots)) {
          for (const slot of resource.slots) for (const id of stringList(asRecord(slot)?.allowed_badge_ids)) badgeIds.add(id)
        }
      } else {
        for (const id of stringList(resource.badge_ids)) badgeIds.add(id)
        for (const id of stringList(resource.poi_ids)) poiIds.add(id)
        for (const id of stringList(resource.collection_ids)) collectionIds.add(id)
        if (typeof resource.poi_category === 'string' && resource.poi_category.trim() !== '') needsCategories = true
      }
    }
  }
  return { badgeIds: [...badgeIds], poiIds: [...poiIds], collectionIds: [...collectionIds], needsCategories }
}

async function readRows<T>(label: string, ids: string[], query: (chunk: string[]) => PagedQuery<T>): Promise<T[]> {
  try {
    return await fetchAllRowsIn<T, string>(label, 'id', ids, query)
  } catch (err) {
    console.error('[ops-preview-names] 이름 조회 실패:', err)
    return []
  }
}

async function readCategories(supabase: ServiceClient): Promise<{ slug: string; label: string }[]> {
  try {
    const { data, error } = await supabase.from('poi_categories').select('slug, label')
    if (error) throw error
    return data ?? []
  } catch (err) {
    console.error('[ops-preview-names] 지점 종류 조회 실패:', err)
    return []
  }
}

/** 레시피·드랍 항목이 가리키는 배지·지점·컬렉션의 이름을 읽는다. 대상이 없으면 DB를 읽지 않는다. 실패하면 그 부분만 비운다. */
export async function readOpsPreviewNames(supabase: ServiceClient, items: readonly NameSource[]): Promise<OpsPreviewNames> {
  const { badgeIds, poiIds, collectionIds, needsCategories } = collectPreviewIds(items)
  if (badgeIds.length + poiIds.length + collectionIds.length === 0 && !needsCategories) return EMPTY_PREVIEW_NAMES

  const [badgeRows, poiRows, collectionRows, categoryRows] = await Promise.all([
    readRows('badges(미리보기 이름)', badgeIds, (chunk) => supabase.from('badges').select('id, name, image_url, rarity').in('id', chunk)),
    readRows('poi(미리보기 이름)', poiIds, (chunk) => supabase.from('poi').select('id, name').in('id', chunk)),
    readRows('item_books(미리보기 이름)', collectionIds, (chunk) => supabase.from('item_books').select('id, name').in('id', chunk)),
    needsCategories ? readCategories(supabase) : Promise.resolve([]),
  ])

  return {
    badges: Object.fromEntries(
      badgeRows.map((row) => [
        row.id,
        { id: row.id, name: row.name, imageUrl: row.image_url ?? null, rarity: (row.rarity ?? null) as BadgeRarity | null },
      ])
    ),
    pois: Object.fromEntries(poiRows.map((row) => [row.id, row.name])),
    collections: Object.fromEntries(collectionRows.map((row) => [row.id, row.name])),
    categories: Object.fromEntries(categoryRows.map((row) => [row.slug, row.label])),
  }
}
