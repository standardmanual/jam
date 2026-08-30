import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, InventoryItemRow, InventoryRow, PoiDropSource } from '@/types/database'
import {
  deriveItemBadgeStatus,
  RARITY_LABEL,
  RARITY_BADGE_COLOR,
  type ItemBadgeStatus,
} from '@/lib/admin/item-badge-status'
import { SerialListFilterBar } from './SerialListFilterBar'
import { SerialListTable, type SerialListRow } from './SerialListTable'
import Pagination from '../../poi/Pagination'

const PAGE_SIZE = 50

type ListedItem = Pick<
  InventoryItemRow,
  'id' | 'badge_id' | 'serial_number' | 'serial_prefix' | 'obtained_at' | 'destroyed_at' | 'inventory_id' | 'slotted_in'
>

interface Props {
  params: Promise<{ badgeId: string }>
  searchParams: Promise<Record<string, string | undefined>>
}

/**
 * 배지별 발급 일련번호 목록(티켓 20260829_2139, 열린 결정 2) — 이 배지로 발급된
 * `InventoryItem` 개체를 전부 조회해 현재 상태를 파생시키고, 필터·페이지네이션은
 * 애플리케이션 레벨에서 처리한다.
 *
 * DB 레벨 페이지네이션을 쓰지 않는 이유: "현재 상태"는 여러 컬럼·연관 테이블(활성
 * poi_drops, 마지막 Consume/Expire CustodyEvent) 조합으로만 파생되는 계산값이라 SQL
 * WHERE로 직접 필터링하기 어렵다. 배지 검색으로 이미 범위가 한 배지로 좁혀진 뒤라(열린
 * 결정 2 전제) 그 배지의 전체 발급 수량은 감당 가능한 규모로 가정한다.
 */
export default async function ItemBadgeSerialListPage({ params, searchParams }: Props) {
  const { badgeId } = await params
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const statusFilter = (sp.status as ItemBadgeStatus | undefined) ?? undefined
  const reissuedOnly = sp.reissued === 'true'

  const supabase = createServiceClient()

  const { data: badgeRaw } = await supabase
    .from('badges')
    .select('id, name, image_url, rarity')
    .eq('id', badgeId)
    .maybeSingle()
  if (!badgeRaw) notFound()
  const badge = badgeRaw as Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>

  const { data: itemsRaw } = await supabase
    .from('inventory_items')
    .select('id, badge_id, serial_number, serial_prefix, obtained_at, destroyed_at, inventory_id, slotted_in')
    .eq('badge_id', badgeId)

  const items = (itemsRaw ?? []) as ListedItem[]

  const header = (
    <div className="mb-6 space-y-3">
      <Link href="/admin/item-badges" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
        ← 아이템배지 현황
      </Link>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 flex-shrink-0 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
          {badge.image_url ? (
            <Image src={badge.image_url} alt={badge.name} width={56} height={56} className="w-full h-full object-contain" />
          ) : (
            <span className="text-gray-400 text-xs">—</span>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{badge.name}</h1>
          <span
            className={`inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded ${
              RARITY_BADGE_COLOR[badge.rarity] ?? 'bg-gray-100 text-gray-700'
            }`}
          >
            {RARITY_LABEL[badge.rarity] ?? badge.rarity}
          </span>
        </div>
      </div>
    </div>
  )

  if (items.length === 0) {
    return (
      <div className="p-4 md:p-8">
        {header}
        <div className="text-center py-12 text-muted-foreground text-sm">
          이 배지로 발급된 개체가 아직 없습니다.
        </div>
      </div>
    )
  }

  const itemIds = items.map((i) => i.id)
  const destroyedIds = items.filter((i) => i.destroyed_at).map((i) => i.id)
  const heldInventoryIds = [...new Set(items.filter((i) => i.inventory_id).map((i) => i.inventory_id as string))]
  const serialNumbers = [...new Set(items.map((i) => i.serial_number))]

  const [
    { data: activeDropsRaw },
    { data: destroyEventsRaw },
    { data: mintedEventsRaw },
    { data: inventoriesRaw },
    { data: siblingsRaw },
  ] = await Promise.all([
    supabase.from('poi_drops').select('inventory_item_id, source, poi_id').in('inventory_item_id', itemIds).eq('is_available', true),
    destroyedIds.length > 0
      ? supabase
          .from('custody_events')
          .select('inventory_item_id, event_type, created_at')
          .in('inventory_item_id', destroyedIds)
          .in('event_type', ['Consume', 'Expire'])
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { inventory_item_id: string; event_type: string; created_at: string }[] }),
    supabase.from('custody_events').select('inventory_item_id, created_at').in('inventory_item_id', itemIds).eq('event_type', 'Minted'),
    heldInventoryIds.length > 0
      ? supabase.from('inventory').select('id, user_id').in('id', heldInventoryIds)
      : Promise.resolve({ data: [] as Pick<InventoryRow, 'id' | 'user_id'>[] }),
    supabase.from('inventory_items').select('id, serial_number, destroyed_at').in('serial_number', serialNumbers),
  ])

  const activeDropByItem = new Map<string, { source: PoiDropSource; poi_id: string }>()
  for (const row of (activeDropsRaw ?? []) as { inventory_item_id: string | null; source: PoiDropSource; poi_id: string }[]) {
    if (row.inventory_item_id) activeDropByItem.set(row.inventory_item_id, { source: row.source, poi_id: row.poi_id })
  }

  // 파괴된 개체당 "마지막" Consume/Expire 이벤트만 필요 — created_at 내림차순으로 정렬해왔으므로
  // Map.set은 먼저 만난(=가장 최근) 값만 유지된다(이미 있으면 덮어쓰지 않음).
  const destroyReasonByItem = new Map<string, 'Consume' | 'Expire'>()
  for (const row of (destroyEventsRaw ?? []) as { inventory_item_id: string; event_type: string; created_at: string }[]) {
    if (!destroyReasonByItem.has(row.inventory_item_id) && (row.event_type === 'Consume' || row.event_type === 'Expire')) {
      destroyReasonByItem.set(row.inventory_item_id, row.event_type)
    }
  }

  const mintedAtByItem = new Map<string, string>()
  for (const row of (mintedEventsRaw ?? []) as { inventory_item_id: string; created_at: string }[]) {
    const existing = mintedAtByItem.get(row.inventory_item_id)
    if (!existing || row.created_at < existing) mintedAtByItem.set(row.inventory_item_id, row.created_at)
  }

  const inventoryIdToUserId = new Map<string, string>()
  const userIds: string[] = []
  for (const inv of (inventoriesRaw ?? []) as Pick<InventoryRow, 'id' | 'user_id'>[]) {
    inventoryIdToUserId.set(inv.id, inv.user_id)
    userIds.push(inv.user_id)
  }

  const usernameByUserId = new Map<string, string | null>()
  if (userIds.length > 0) {
    const { data: usersRaw } = await supabase.from('users').select('id, username').in('id', [...new Set(userIds)])
    for (const u of (usersRaw ?? []) as { id: string; username: string | null }[]) usernameByUserId.set(u.id, u.username)
  }

  const poiIds = [...new Set([...activeDropByItem.values()].map((d) => d.poi_id))]
  const poiNameById = new Map<string, string>()
  if (poiIds.length > 0) {
    const { data: poisRaw } = await supabase.from('poi').select('id, name').in('id', poiIds)
    for (const p of (poisRaw ?? []) as { id: string; name: string }[]) poiNameById.set(p.id, p.name)
  }

  const siblingsBySerial = new Map<number, Pick<InventoryItemRow, 'id' | 'serial_number' | 'destroyed_at'>[]>()
  for (const row of (siblingsRaw ?? []) as Pick<InventoryItemRow, 'id' | 'serial_number' | 'destroyed_at'>[]) {
    const list = siblingsBySerial.get(row.serial_number) ?? []
    list.push(row)
    siblingsBySerial.set(row.serial_number, list)
  }

  const allRows: SerialListRow[] = items.map((item) => {
    const activeDrop = activeDropByItem.get(item.id) ?? null
    const status = deriveItemBadgeStatus({
      destroyedAt: item.destroyed_at,
      inventoryId: item.inventory_id,
      slottedIn: item.slotted_in,
      hasActivePoiDrop: !!activeDrop,
      activePoiDropSource: activeDrop?.source ?? null,
      destroyReasonEvent: destroyReasonByItem.get(item.id) ?? null,
    })

    const ownerUserId = item.inventory_id ? inventoryIdToUserId.get(item.inventory_id) ?? null : null
    const ownerUsername = ownerUserId ? usernameByUserId.get(ownerUserId) ?? null : null
    const poiId = activeDrop?.poi_id ?? null
    const poiName = poiId ? poiNameById.get(poiId) ?? null : null

    const siblings = (siblingsBySerial.get(item.serial_number) ?? []).filter((s) => s.id !== item.id)
    const isReissued = siblings.length > 0
    // "동시 존재 이상"은 같은 번호를 가진 개체가 파괴 안 된 채로 2개 이상 살아있을 때다
    // (20260829_2101 §"재발급된 일련번호" 정의) — 이 개체 자신의 생존 여부도 함께 셈해야
    // 한다. 이 개체가 이미 파괴됐고 형제 중 하나만 살아있는 건 정상적인 재발급 이력일 뿐,
    // "동시 존재"가 아니다.
    const aliveCount = (item.destroyed_at ? 0 : 1) + siblings.filter((s) => !s.destroyed_at).length
    const reissueAnomaly = aliveCount >= 2

    return {
      id: item.id,
      serialLabel: `${item.serial_prefix ?? ''}${item.serial_number}`,
      status,
      ownerUserId,
      ownerUsername,
      poiId,
      poiName,
      mintedAt: mintedAtByItem.get(item.id) ?? item.obtained_at,
      isReissued,
      reissueAnomaly,
    }
  })

  allRows.sort((a, b) => (a.mintedAt < b.mintedAt ? 1 : -1))

  let filtered = allRows
  if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter)
  if (reissuedOnly) filtered = filtered.filter((r) => r.isReissued)

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages)
  const from = (clampedPage - 1) * PAGE_SIZE
  const pageRows = filtered.slice(from, from + PAGE_SIZE)

  const hasFilter = !!statusFilter || reissuedOnly

  return (
    <div className="p-4 md:p-8">
      {header}

      <div className="space-y-4">
        <Suspense>
          <SerialListFilterBar badgeId={badgeId} />
        </Suspense>

        <div className="text-sm text-muted-foreground">
          총 {total}개{hasFilter && ' (필터 적용 중)'}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">조건에 맞는 결과가 없습니다.</div>
        ) : (
          <SerialListTable rows={pageRows} badgeId={badgeId} />
        )}

        <Pagination page={clampedPage} totalPages={totalPages} searchParams={sp} basePath={`/admin/item-badges/${badgeId}`} />
      </div>
    </div>
  )
}
