import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, CustodyEventRow, InventoryItemRow, InventoryRow, PoiDropSource } from '@/types/database'
import {
  deriveItemBadgeStatus,
  formatDateTime,
  ITEM_BADGE_STATUS_LABEL,
  ITEM_BADGE_STATUS_COLOR,
  RARITY_LABEL,
  RARITY_BADGE_COLOR,
} from '@/lib/admin/item-badge-status'
import { CustodyTimeline } from './CustodyTimeline'
import { DestroyOrphanedAction } from '../../_orphaned-actions/DestroyOrphanedAction'
import { ReassignOrphanedAction } from '../../_orphaned-actions/ReassignOrphanedAction'

interface Props {
  params: Promise<{ badgeId: string; itemId: string }>
}

const DESTROY_REASON_LABEL: Record<'Consume' | 'Expire', string> = {
  Consume: '조합 소모',
  Expire: '미픽업 만료',
}

/**
 * 아이템배지 이력 상세(티켓 20260829_2139) — 발급부터 현재까지의 CustodyEvent 타임라인을
 * 보여준다. 파괴(Destroyed/Consumed)된 개체도 소프트 삭제 모델이라 그대로 조회 가능해야
 * 한다는 전제를 검증하는 화면이다(엣지 케이스 명시) — destroyed_at으로 걸러내지 않는다.
 */
export default async function ItemBadgeDetailPage({ params }: Props) {
  const { itemId } = await params
  const supabase = createServiceClient()

  const { data: itemRaw } = await supabase.from('inventory_items').select('*').eq('id', itemId).maybeSingle()
  if (!itemRaw) notFound()
  const item = itemRaw as InventoryItemRow

  const { data: badgeRaw } = await supabase
    .from('badges')
    .select('id, name, image_url, rarity')
    .eq('id', item.badge_id)
    .maybeSingle()
  const badge = badgeRaw as Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'> | null

  const [{ data: activeDropRaw }, { data: eventsRaw }, { data: siblingsRaw }] = await Promise.all([
    supabase
      .from('poi_drops')
      .select('poi_id, source')
      .eq('inventory_item_id', item.id)
      .eq('is_available', true)
      .maybeSingle(),
    supabase.from('custody_events').select('*').eq('inventory_item_id', item.id).order('created_at', { ascending: true }),
    supabase
      .from('inventory_items')
      .select('id, badge_id, destroyed_at')
      .eq('serial_number', item.serial_number)
      .neq('id', item.id),
  ])

  const activeDrop = activeDropRaw as { poi_id: string; source: PoiDropSource } | null
  const events = (eventsRaw ?? []) as CustodyEventRow[]
  const siblings = (siblingsRaw ?? []) as Pick<InventoryItemRow, 'id' | 'badge_id' | 'destroyed_at'>[]

  const lastDestroyEvent = [...events].reverse().find((e) => e.event_type === 'Consume' || e.event_type === 'Expire')
  const destroyReason = lastDestroyEvent?.event_type === 'Consume' || lastDestroyEvent?.event_type === 'Expire'
    ? lastDestroyEvent.event_type
    : null

  const status = deriveItemBadgeStatus({
    destroyedAt: item.destroyed_at,
    inventoryId: item.inventory_id,
    slottedIn: item.slotted_in,
    hasActivePoiDrop: !!activeDrop,
    activePoiDropSource: activeDrop?.source ?? null,
    destroyReasonEvent: destroyReason,
  })

  let owner: { id: string; username: string | null } | null = null
  if (item.inventory_id) {
    const { data: invRaw } = await supabase.from('inventory').select('user_id').eq('id', item.inventory_id).maybeSingle()
    const userId = (invRaw as Pick<InventoryRow, 'user_id'> | null)?.user_id
    if (userId) {
      const { data: userRaw } = await supabase.from('users').select('id, username').eq('id', userId).maybeSingle()
      owner = userRaw as { id: string; username: string | null } | null
    }
  }

  let poi: { id: string; name: string } | null = null
  if (activeDrop?.poi_id) {
    const { data: poiRaw } = await supabase.from('poi').select('id, name').eq('id', activeDrop.poi_id).maybeSingle()
    poi = poiRaw as { id: string; name: string } | null
  }

  // 타임라인에 등장하는 POI 이름을 일괄 조회 (지점별 개별 쿼리 방지)
  const eventPoiIds = [...new Set(events.map((e) => e.poi_id).filter((v): v is string => !!v))]
  const poiNameById = new Map<string, string>()
  if (eventPoiIds.length > 0) {
    const { data: eventPoisRaw } = await supabase.from('poi').select('id, name').in('id', eventPoiIds)
    for (const p of (eventPoisRaw ?? []) as { id: string; name: string }[]) poiNameById.set(p.id, p.name)
  }
  if (poi) poiNameById.set(poi.id, poi.name)

  const destroyedSibling = siblings.find((s) => s.destroyed_at)
  const isReissued = siblings.length > 0
  // "동시 존재 이상" = 같은 번호를 가진 개체가 파괴 안 된 채로 2개 이상 살아있을 때(이 개체
  // 자신의 생존 여부도 포함) — 이 개체가 이미 파괴된 채 형제 하나만 살아있는 건 정상적인
  // 재발급 이력이다(list page.tsx와 동일 판정 기준, 20260829_2101 §"재발급된 일련번호").
  const aliveCount = (item.destroyed_at ? 0 : 1) + siblings.filter((s) => !s.destroyed_at).length
  const isAnomaly = aliveCount >= 2

  const serialLabel = `${item.serial_prefix ?? ''}${item.serial_number}`

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <div>
        <Link
          href={`/admin/item-badges/${item.badge_id}`}
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          ← 배지별 발급 일련번호 목록
        </Link>
      </div>

      {/* 헤더: 배지 도안 + 일련번호 + 현재 상태 */}
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 flex-shrink-0 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
          {badge?.image_url ? (
            <Image src={badge.image_url} alt={badge.name} width={64} height={64} className="w-full h-full object-contain" />
          ) : (
            <span className="text-gray-400 text-xs">—</span>
          )}
        </div>
        <div className="space-y-1">
          {badge ? (
            <Link href={`/admin/badges/${badge.id}`} className="text-xl font-bold hover:underline">
              {badge.name}
            </Link>
          ) : (
            <h1 className="text-xl font-bold text-muted-foreground">(삭제된 배지 도안)</h1>
          )}
          {badge && (
            <span
              className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                RARITY_BADGE_COLOR[badge.rarity] ?? 'bg-gray-100 text-gray-700'
              }`}
            >
              {RARITY_LABEL[badge.rarity] ?? badge.rarity}
            </span>
          )}
          <p className="font-mono text-lg">#{serialLabel}</p>
          {/* shadcn Badge 대신 순수 span — SerialListTable.tsx 상단 주석 참고
              (variant 기본 색상과 커스텀 색상 className이 섞이는 충돌 방지) */}
          <span
            className={`inline-block px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${ITEM_BADGE_STATUS_COLOR[status]}`}
          >
            {ITEM_BADGE_STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      {/* 재발급/이상 배너 */}
      {isReissued && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            isAnomaly ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-800'
          }`}
        >
          {isAnomaly ? (
            <p>
              <strong>동일 번호 동시 존재 이상</strong> — 같은 일련번호(#{serialLabel})를 가진 개체가 파괴되지 않은
              채로 {siblings.length}개 더 있습니다. 복제 버그 가능성이 있어 확인이 필요합니다.
            </p>
          ) : (
            <p>
              <strong>재발급된 일련번호</strong> — 이전에 같은 번호(#{serialLabel})를 가졌던 개체가 파괴되어 이
              번호가 재사용됐습니다.
              {destroyedSibling && (
                <>
                  {' '}
                  <Link href={`/admin/item-badges/${destroyedSibling.badge_id}/${destroyedSibling.id}`} className="underline font-medium">
                    이전 개체 상세로 이동
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* 현재 위치/소유자 */}
      <div className="rounded-lg border p-4 space-y-1">
        <h2 className="text-sm font-semibold text-muted-foreground">현재 위치/소유자</h2>
        {owner ? (
          <Link href={`/admin/users/${owner.id}`} className="hover:underline">
            {owner.username ?? '(닉네임 없음)'}
          </Link>
        ) : poi ? (
          <Link href={`/admin/poi/${poi.id}`} className="hover:underline">
            {poi.name}
          </Link>
        ) : status === 'Orphaned' ? (
          <span>고아(어드민 보관 중)</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}

        {/* 고아 관리 액션(티켓 20260829_2150) — 단건. 목록 화면의 일괄 액션과 동일 컴포넌트 재사용 */}
        {status === 'Orphaned' && (
          <div className="flex gap-2 pt-3">
            <DestroyOrphanedAction items={[{ id: item.id, serialLabel }]} label="영구 폐기" />
            <ReassignOrphanedAction items={[{ id: item.id, serialLabel }]} label="재배정" />
          </div>
        )}

        {item.destroyed_at && (
          <p className="text-sm text-muted-foreground pt-2">
            파괴 사유: {destroyReason ? DESTROY_REASON_LABEL[destroyReason] : '알 수 없음(레거시 데이터)'} · 파괴 시각:{' '}
            {formatDateTime(item.destroyed_at)}
          </p>
        )}
      </div>

      {/* 이력 타임라인 */}
      <div>
        <h2 className="text-lg font-bold mb-2">이력</h2>
        <CustodyTimeline events={events} poiNameById={poiNameById} />
      </div>
    </div>
  )
}
