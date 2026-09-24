/**
 * 미소유 아이템배지 목록 쿼리(티켓 20260924_0950, 상위 티켓 §4.3) — 목록 페이지
 * (`admin/item-badges/orphaned/page.tsx`)·전체 선택용 ID 조회(`api/admin/item-badges/orphaned/ids`)·
 * 내보내기(`.../export`)가 같은 행 집합과 같은 정렬 규칙을 쓰도록 한 곳에 모은다.
 *
 * ## 왜 DB 정렬이 아니라 전량 적재 뒤 정렬인가
 * "소유자 없음"은 `inventory_items`의 두 조건(`inventory_id IS NULL AND destroyed_at IS NULL`)에
 * "참조하는 활성 `poi_drops`가 없음"이 더해진 파생 상태이고, 발급일시는 `custody_events`의
 * `Minted` 이벤트(없으면 `obtained_at`)라 한 쿼리의 `ORDER BY`로 표현할 수 없다. 전체 규모가
 * 작아(2026-09-24 기준 1,268건 안팎) 전량을 읽어 서버에서 정렬한 뒤 쪽을 자른다 — 정렬은
 * 페이지를 넘어 일관되고(예전에는 현재 쪽 안에서만 정렬됐다), 클라이언트는 정렬하지 않는다.
 *
 * "소유자 없음" 판정 근거·이력은 옛 `page.tsx` 주석(티켓 20260908_0842)과 같다:
 * `admin_destroy_orphaned_item()`/`admin_reassign_orphaned_item()`(110_admin_orphaned_item_actions.sql),
 * `deriveItemBadgeStatus()`의 Orphaned 분기와 반드시 같은 결과를 내야 한다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, InventoryItemRow } from '@/types/database'

type ServiceClient = ReturnType<typeof createServiceClient>

/** PostgREST 기본 응답 상한 — range 순회 페이지 크기 */
const FETCH_PAGE_SIZE = 1000
/** `.in()` 한 번에 실을 값의 최대 개수(URL 길이 상한 방어) */
const IN_CHUNK_SIZE = 200

export interface OrphanedItemRow {
  id: string
  serialLabel: string
  /** 일련번호 정렬용 — `serialLabel`의 접두어와 숫자 부분 */
  serialPrefix: string
  serialNumber: number
  badgeId: string
  badgeName: string
  badgeImageUrl: string | null
  badgeRarity: string
  mintedAt: string
}

const ORPHANED_SORTS = [
  'minted_desc',
  'minted_asc',
  'badge_asc',
  'badge_desc',
  'serial_asc',
  'serial_desc',
] as const
export type OrphanedSort = (typeof ORPHANED_SORTS)[number]

export const ORPHANED_DEFAULT_SORT: OrphanedSort = 'minted_desc'

function isOrphanedSort(value: string | undefined): value is OrphanedSort {
  return !!value && (ORPHANED_SORTS as readonly string[]).includes(value)
}

export interface OrphanedListParams {
  sort: OrphanedSort
}

/** URL(또는 API 쿼리) 파라미터 → 목록 조건. 알 수 없는 정렬 값은 기본(발급일 최신순)이다. */
export function parseOrphanedListParams(raw: Record<string, string | undefined>): OrphanedListParams {
  return { sort: isOrphanedSort(raw.sort) ? raw.sort : ORPHANED_DEFAULT_SORT }
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'ko')
}

/**
 * 정렬 기준별 비교. 값이 같으면 `id`로 마무리해 결과가 항상 같은 순서가 되게 한다 —
 * 쪽을 넘길 때 같은 행이 두 쪽에 걸리거나 빠지는 일이 없다.
 * - 발급일시: ISO 문자열 사전식 비교가 시간순과 일치한다.
 * - 일련번호: 접두어 → 숫자 순(문자열로 비교하면 `#10`이 `#9`보다 앞선다).
 */
function compareByKey(a: OrphanedItemRow, b: OrphanedItemRow, key: 'minted' | 'badge' | 'serial'): number {
  if (key === 'minted') return a.mintedAt < b.mintedAt ? -1 : a.mintedAt > b.mintedAt ? 1 : 0
  if (key === 'badge') return compareText(a.badgeName, b.badgeName)
  return compareText(a.serialPrefix, b.serialPrefix) || a.serialNumber - b.serialNumber
}

/** 서버 정렬 — 입력 배열을 바꾸지 않고 정렬된 새 배열을 돌려준다 */
export function sortOrphanedRows(rows: OrphanedItemRow[], sort: OrphanedSort): OrphanedItemRow[] {
  const [key, direction] = sort.split('_') as ['minted' | 'badge' | 'serial', 'asc' | 'desc']
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => compareByKey(a, b, key) * sign || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

type CandidateItem = Pick<
  InventoryItemRow,
  'id' | 'badge_id' | 'serial_number' | 'serial_prefix' | 'obtained_at' | 'destroyed_at' | 'inventory_id'
>

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

/**
 * "소유자 없음" 개체 전체를 배지 정보·발급일시와 함께 읽어 온다(정렬은 하지 않는다 —
 * {@link sortOrphanedRows}). 조회가 실패하면 던진다.
 */
export async function loadOrphanedRows(supabase: ServiceClient): Promise<OrphanedItemRow[]> {
  // 1. 소유자 없는(inventory_id IS NULL) + 파괴되지 않은 개체를 직접 스캔 — range 순회로 전량 확보.
  const stillUnowned: CandidateItem[] = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('id, badge_id, serial_number, serial_prefix, obtained_at, destroyed_at, inventory_id')
      .is('destroyed_at', null)
      .is('inventory_id', null)
      .order('id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1)
    if (error) throw new Error(`개체 상태 조회 실패: ${error.message}`)
    const rows = (data ?? []) as CandidateItem[]
    stillUnowned.push(...rows)
    if (rows.length < FETCH_PAGE_SIZE) break
  }
  if (stillUnowned.length === 0) return []

  // 2. 그중 참조하는 활성(is_available=true) poi_drops가 있으면 제외한다(Dropped/AtPoi 제외).
  const activeDropItemIds = new Set<string>()
  for (const ids of chunk(
    stillUnowned.map((i) => i.id),
    IN_CHUNK_SIZE
  )) {
    const { data, error } = await supabase
      .from('poi_drops')
      .select('inventory_item_id')
      .in('inventory_item_id', ids)
      .eq('is_available', true)
    if (error) throw new Error(`활성 드랍 조회 실패: ${error.message}`)
    for (const row of (data ?? []) as { inventory_item_id: string | null }[]) {
      if (row.inventory_item_id) activeDropItemIds.add(row.inventory_item_id)
    }
  }

  const orphaned = stillUnowned.filter((i) => !activeDropItemIds.has(i.id))
  if (orphaned.length === 0) return []

  // 3. 배지(도안) 정보 조인 — 이름/이미지/등급 표시용.
  const badgeIds = [...new Set(orphaned.map((i) => i.badge_id))]
  const badgeById = new Map<string, Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>>()
  for (const ids of chunk(badgeIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase.from('badges').select('id, name, image_url, rarity').in('id', ids)
    if (error) throw new Error(`배지 조회 실패: ${error.message}`)
    for (const b of (data ?? []) as Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>[]) badgeById.set(b.id, b)
  }

  // 4. 발급일시 — 배지별 목록 화면([badgeId]/page.tsx)과 동일하게 Minted 이벤트를 우선하고,
  //    없으면 obtained_at으로 폴백한다(레거시 데이터 등).
  const mintedAtByItem = new Map<string, string>()
  for (const ids of chunk(
    orphaned.map((i) => i.id),
    IN_CHUNK_SIZE
  )) {
    const { data, error } = await supabase
      .from('custody_events')
      .select('inventory_item_id, created_at')
      .in('inventory_item_id', ids)
      .eq('event_type', 'Minted')
    if (error) throw new Error(`발급 이력 조회 실패: ${error.message}`)
    for (const row of (data ?? []) as { inventory_item_id: string; created_at: string }[]) {
      const existing = mintedAtByItem.get(row.inventory_item_id)
      if (!existing || row.created_at < existing) mintedAtByItem.set(row.inventory_item_id, row.created_at)
    }
  }

  return orphaned.map((item) => {
    const badge = badgeById.get(item.badge_id)
    const serialPrefix = item.serial_prefix ?? ''
    return {
      id: item.id,
      serialLabel: `${serialPrefix}${item.serial_number}`,
      serialPrefix,
      serialNumber: item.serial_number,
      badgeId: item.badge_id,
      badgeName: badge?.name ?? '(삭제된 배지 도안)',
      badgeImageUrl: badge?.image_url ?? null,
      badgeRarity: badge?.rarity ?? '',
      mintedAt: mintedAtByItem.get(item.id) ?? item.obtained_at,
    }
  })
}
