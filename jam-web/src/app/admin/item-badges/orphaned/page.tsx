import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, InventoryItemRow } from '@/types/database'
import { OrphanedItemsTable, type OrphanedItemRow } from './OrphanedItemsTable'
import Pagination from '../../poi/Pagination'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'

const PAGE_SIZE = 50
/** PostgREST 기본 응답 상한 — range 순회 페이지 크기 */
const FETCH_PAGE_SIZE = 1000
/** `.in()` 한 번에 실을 값의 최대 개수(URL 길이 상한 방어) */
const IN_CHUNK_SIZE = 200

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면(`?page=1&page=2`)
 * Next가 배열을 넘긴다. `pickSingleQueryParams`가 배열을 「값 없음」으로 흡수해 이 아래
 * 모든 읽기가 단일 문자열만 보게 한다 (티켓 20260906_1312).
 */
interface Props {
  searchParams: SearchParamsPromise
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
 * "소유자 없음" 아이템배지 전체 목록(티켓 20260830_0104) — 배지(도안)를 먼저 선택하지
 * 않고, 전체 배지에 걸쳐 소유자를 잃은 개체만 모아 조회한다. 관리 액션(영구 폐기·재배정)
 * 자체는 20260829_2150에서 이미 구현된 `DestroyOrphanedAction`/`ReassignOrphanedAction`을
 * 그대로 재사용한다 — 이 화면은 접근 경로(목록)만 새로 만든다.
 *
 * ## `inventory_items`를 직접 스캔한다 (티켓 20260908_0842 — 후보 좁히기 폐기)
 *
 * 이전에는 "Orphaned 상태로 들어가는 경로는 계정 탈퇴(`BEFORE DELETE ON public.users`
 * 트리거 `log_orphan_custody_events`) 하나뿐이고, 그 경로는 항상 `custody_events`에
 * `Orphan` 이벤트를 남긴다"는 전제로 먼저 `Orphan` 이벤트 후보만 추린 뒤 재확인하는
 * 2단계 조회(DEV_PROCESS_GUARDRAILS.md 패턴 3 "쿼리 방향 역전")를 썼다.
 *
 * 그 전제가 v5 전환 유저 초기화(`inventory`/`inventory_items`를 직접 조작, `users` 행
 * `DELETE` 트리거를 거치지 않음)로 깨졌다 — `Orphan` 이벤트가 0건인데도 실제로는 325건이
 * 소유자를 잃은 상태였다(전체 325건 중 156건은 다른 custody_events는 있지만 Orphan만
 * 없었고, 169건은 custody_events 자체가 없었다). "이 경로 하나뿐"이라는 전제가 유저 초기화
 * 같은 일회성 대량 작업으로 우회될 수 있는 이상, 이 후보 좁히기는 신뢰할 수 없다.
 *
 * `inventory_items` 전체 규모(2026-09-08 기준 515건, `inventory_id IS NULL AND
 * destroyed_at IS NULL`인 행은 488건)가 작아 `custody_events` 경유 없이 직접 스캔해도
 * 성능 부담이 없으므로, 후보 좁히기 없이 `inventory_id IS NULL AND destroyed_at IS NULL`을
 * 바로 건다. "소유자 없음" 최종 판정(참조하는 활성 `poi_drops` 제외)은 그대로 3단계에서
 * 재확인한다 — `admin_destroy_orphaned_item()`/`admin_reassign_orphaned_item()`
 * (110_admin_orphaned_item_actions.sql), `deriveItemBadgeStatus()`의 Orphaned 분기와
 * 반드시 같은 결과를 내야 한다.
 */
export default async function OrphanedItemsPage({ searchParams }: Props) {
  const sp = pickSingleQueryParams(await searchParams)
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  const supabase = createServiceClient()

  const header = (
    <div className="mb-6">
      <h1 className="text-2xl md:text-3xl font-bold">미소유 아이템배지 현황</h1>
      <p className="text-muted-foreground text-sm mt-1">
        계정 탈퇴 등으로 소유자를 잃은 아이템배지 개체를 배지 구분 없이 한 번에 조회합니다.
      </p>
    </div>
  )

  // 1. 소유자 없는(inventory_id IS NULL) + 파괴되지 않은 개체를 직접 스캔 — range 순회로
  //    전량 확보. 최종 "소유자 없음" 판정은 3단계(활성 poi_drops 제외)에서 마무리한다.
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

  if (stillUnowned.length === 0) {
    return (
      <div className="p-4 md:p-8">
        {header}
        <div className="text-center py-12 text-muted-foreground text-sm">소유자 없는 개체가 없습니다.</div>
      </div>
    )
  }

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

  if (orphaned.length === 0) {
    return (
      <div className="p-4 md:p-8">
        {header}
        <div className="text-center py-12 text-muted-foreground text-sm">소유자 없는 개체가 없습니다.</div>
      </div>
    )
  }

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

  const allRows: OrphanedItemRow[] = orphaned.map((item) => {
    const badge = badgeById.get(item.badge_id)
    return {
      id: item.id,
      serialLabel: `${item.serial_prefix ?? ''}${item.serial_number}`,
      badgeId: item.badge_id,
      badgeName: badge?.name ?? '(삭제된 배지 도안)',
      badgeImageUrl: badge?.image_url ?? null,
      badgeRarity: badge?.rarity ?? '',
      mintedAt: mintedAtByItem.get(item.id) ?? item.obtained_at,
    }
  })

  allRows.sort((a, b) => (a.mintedAt < b.mintedAt ? 1 : -1))

  const total = allRows.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages)
  const from = (clampedPage - 1) * PAGE_SIZE
  const pageRows = allRows.slice(from, from + PAGE_SIZE)

  return (
    <div className="p-4 md:p-8">
      {header}

      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">총 {total}개</div>

        <OrphanedItemsTable rows={pageRows} />

        <Pagination page={clampedPage} totalPages={totalPages} searchParams={sp} basePath="/admin/item-badges/orphaned" />
      </div>
    </div>
  )
}
