import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, InventoryItemRow } from '@/types/database'
import { OrphanedItemsTable, type OrphanedItemRow } from './OrphanedItemsTable'
import Pagination from '../../poi/Pagination'

const PAGE_SIZE = 50
/** PostgREST 기본 응답 상한 — range 순회 페이지 크기 */
const FETCH_PAGE_SIZE = 1000
/** `.in()` 한 번에 실을 값의 최대 개수(URL 길이 상한 방어) */
const IN_CHUNK_SIZE = 200

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
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
 * ## 조회 방향을 뒤집는다 (DEV_PROCESS_GUARDRAILS.md 패턴 3 "쿼리 방향 역전")
 *
 * "소유자 없음" 판정 자체는 `inventory_id IS NULL AND destroyed_at IS NULL AND 참조하는
 * 활성(is_available=true) poi_drops 없음`이다(`admin_destroy_orphaned_item()`/
 * `admin_reassign_orphaned_item()`, 110_admin_orphaned_item_actions.sql과 동일 기준,
 * `deriveItemBadgeStatus()`의 Orphaned 분기와 반드시 같은 결과를 내야 함). 하지만 이 조건을
 * `inventory_items`에 직접 걸면(`inventory_id IS NULL AND destroyed_at IS NULL`) 지금
 * 픽업을 기다리는 중인 모든 유저 드랍·시스템 드랍까지 스캔 대상에 들어간다 — 게임 전체의
 * "현재 활성 드랍" 규모로 애플리케이션 메모리에 끌어와야 할 데이터가 불어난다.
 *
 * 이 코드베이스에서 Orphaned 상태로 들어가는 경로는 계정 탈퇴 하나뿐이고(108_...sql의
 * `BEFORE DELETE ON public.users` 트리거 `log_orphan_custody_events` — 3항 스키마 변경에서
 * `inventory_id`가 nullable화되기 전에는 계정 탈퇴 시 CASCADE로 개체가 하드 삭제됐으므로
 * 이 트리거 도입 이전에는 Orphaned 상태 자체가 존재할 수 없었다), 이 트리거는 항상
 * `custody_events`에 `Orphan` 이벤트를 남긴다. 그래서 먼저 `Orphan` 이벤트를 한 번이라도
 * 겪은 개체 id만 후보로 좁히고(범위가 "계정 탈퇴 건수 × 그 계정이 보유했던 개체 수"로
 * 구조적으로 작아짐), 그 후보들만 대상으로 "지금도 실제로 소유자 없음 상태인지"(그새
 * 어드민이 재배정/폐기해서 상태가 바뀌지 않았는지)를 재확인한다.
 */
export default async function OrphanedItemsPage({ searchParams }: Props) {
  const sp = await searchParams
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

  // 1. Orphan 이벤트를 한 번이라도 겪은 개체 id 후보군 — range 순회로 전량 확보(대용량 대비).
  const candidateIds = new Set<string>()
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data: eventsRaw, error } = await supabase
      .from('custody_events')
      .select('inventory_item_id')
      .eq('event_type', 'Orphan')
      .order('id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1)
    if (error) throw new Error(`Orphan 이벤트 조회 실패: ${error.message}`)
    const events = (eventsRaw ?? []) as { inventory_item_id: string | null }[]
    for (const e of events) if (e.inventory_item_id) candidateIds.add(e.inventory_item_id)
    if (events.length < FETCH_PAGE_SIZE) break
  }

  if (candidateIds.size === 0) {
    return (
      <div className="p-4 md:p-8">
        {header}
        <div className="text-center py-12 text-muted-foreground text-sm">소유자 없는 개체가 없습니다.</div>
      </div>
    )
  }

  // 2. 후보 중 지금도 소유자가 없고 파괴되지 않은 개체만 추린다(청크로 나눠 조회).
  const candidateIdList = [...candidateIds]
  const stillUnowned: CandidateItem[] = []
  for (const ids of chunk(candidateIdList, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('id, badge_id, serial_number, serial_prefix, obtained_at, destroyed_at, inventory_id')
      .in('id', ids)
      .is('destroyed_at', null)
      .is('inventory_id', null)
    if (error) throw new Error(`개체 상태 조회 실패: ${error.message}`)
    stillUnowned.push(...((data ?? []) as CandidateItem[]))
  }

  // 3. 그중 참조하는 활성(is_available=true) poi_drops가 있으면 제외한다(Dropped/AtPoi 제외).
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

  // 4. 배지(도안) 정보 조인 — 이름/이미지/등급 표시용.
  const badgeIds = [...new Set(orphaned.map((i) => i.badge_id))]
  const badgeById = new Map<string, Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>>()
  for (const ids of chunk(badgeIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase.from('badges').select('id, name, image_url, rarity').in('id', ids)
    if (error) throw new Error(`배지 조회 실패: ${error.message}`)
    for (const b of (data ?? []) as Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>[]) badgeById.set(b.id, b)
  }

  // 5. 발급일시 — 배지별 목록 화면([badgeId]/page.tsx)과 동일하게 Minted 이벤트를 우선하고,
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
