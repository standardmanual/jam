import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { InventoryRow, InventoryItemRow, BadgeRow } from '@/types/database'
import InventoryGrid, { InventoryGridItem } from '@/components/inventory/InventoryGrid'
import QuestBagGrid from './QuestBagGrid'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import TopNav from '@/components/ui/TopNav'
import { PackageIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import { getOnboardingQuestGate } from '@/lib/onboarding-quest/screen-gate'
import { lockedFillPercent } from '@/lib/inventory/lockedItemFill-contract'
import { isInventorySlotsLow } from '@/lib/inventory/slots'

type InventoryItemWithBadge = InventoryItemRow & {
  badge: BadgeRow
}

type InventoryWithItems = InventoryRow & {
  inventory_items: InventoryItemWithBadge[]
}

export default async function InventoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: inventoryData, error: inventoryError }, questStep] = await Promise.all([
    supabase
      .from('inventory')
      .select('*, inventory_items(*, badge:badges(*))')
      .eq('user_id', user.id)
      .single(),
    getOnboardingQuestGate(user.id, 'inventory'),
  ])
  // 20260901_1848: 조회 실패가 "빈 인벤토리"로 위장되던 지점(.single()이라 무인벤토리도
  // error로 잡히므로 실제 오류와 완전히 구분되진 않지만, 최소 가시성 확보는 된다)
  if (inventoryError) console.error('[inventory/page] inventory 조회 실패', inventoryError)
  // 결정 22: bag 차례일 때만 연출 도토리를 그리드 첫 칸에 섞는다(티켓 20260928_0137).
  const isQuestBagTurn = questStep === 'bag'

  const inventory = inventoryData as InventoryWithItems | null

  const usedSlots = inventory?.used_slots ?? 0
  const maxSlots = inventory?.max_slots ?? 50
  // 아이템북 슬롯에 장착된 아이템은 인벤토리에 동시에 표시하지 않는다 (한 아이템은 인벤토리·아이템북 중 한 곳에만 위치)
  // 소프트 삭제된 배지(badges.deleted_at)도 서비스 화면에서는 숨긴다.
  const items: InventoryItemWithBadge[] = (inventory?.inventory_items ?? []).filter(
    (item) => item.dropped_at === null && item.slotted_in === null && item.badge && !item.badge.deleted_at
  )
  const remainingSlots = Math.max(0, maxSlots - usedSlots)

  // 잠긴 개체는 이름·그림을 **여기서** 비운다(운영 로직 7.3절, 티켓 20261018_0054 2회). `item.badge`는 서버에서만 쓰이고, 클라이언트 컴포넌트로
  // 내려가는 props와 RSC 페이로드에 이 값들이 실리면 화면에서 가려도 소용이 없다. 등급과 채운 비율만 싣는다.
  const gridItems: InventoryGridItem[] = items.map((item) =>
    item.locked === true
      ? {
          id: item.id,
          badgeName: '',
          badgeImageUrl: null,
          badgeRarity: item.badge.rarity,
          expiresAt: item.expires_at,
          locked: true,
          fillPercent: lockedFillPercent(item.unlock_filled, item.unlock_required),
        }
      : {
          id: item.id,
          badgeName: item.badge.name,
          badgeImageUrl: item.badge.image_url,
          badgeRarity: item.badge.rarity,
          expiresAt: item.expires_at,
        }
  )

  return (
    <div className="min-h-full text-foreground">
      {/* 20260824_010: 탭 최상위 공통 Topnavi(좌:로고/중:동기화/우:아바타) */}
      <TopNav logo />

      <div className="px-4 pt-6 pb-6">
      {/* 헤더 */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-5xl">{d.inventory.title}</h1>
          </div>
          <Link
            href="/combine"
            className="mt-1 inline-flex items-center justify-center min-h-11 rounded-full px-4 text-base bg-surface active:scale-95 transition-transform duration-100"
          >
            {d.inventory.combineButton}
          </Link>
        </div>
        {/* 슬롯 프로그레스 */}
        <ProgressBar
          percent={Math.min(100, (usedSlots / maxSlots) * 100)}
          height={6}
          labelType="none"
        />
        {/* 20261018_0056: 남은 칸 1~3개는 줄 전체를 --foreground로 올리고 «N개만 남았어요» 구간만 굵게 한다. 새 색·카드 없음 */}
        {isInventorySlotsLow(remainingSlots) ? (
          <p className="mt-1 text-sm text-foreground break-keep wrap-break-word">
            {t(d.inventory.slotsDetailLowLead, { used: usedSlots, max: maxSlots })}
            <span className="font-bold">{t(d.inventory.slotsDetailLowEmphasis, { remaining: remainingSlots })}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-[var(--muted)] break-keep wrap-break-word">
            {t(d.inventory.slotsDetail, { used: usedSlots, max: maxSlots, remaining: remainingSlots })}
          </p>
        )}

        {/* 20260912_1940: 슬롯 포화 상시 안내 — 가득 찼을 때만 노출, 카드형 인셋(edge-to-edge 금지) */}
        {remainingSlots === 0 && (
          <div
            className="mt-3 rounded-2xl px-4 py-3 bg-surface border border-border"
          >
            <p className="text-base text-foreground break-keep wrap-break-word">
              {t(d.inventory.fullNoticeBody, { max: maxSlots })}
            </p>
            <Link
              href="/drops"
              className="mt-3 inline-flex items-center justify-center min-h-11 rounded-full px-4 text-base bg-background active:scale-95 transition-transform duration-100"
            >
              {d.inventory.fullNoticeCta}
            </Link>
          </div>
        )}
      </div>

      {/* 아이템 그리드 */}
      {isQuestBagTurn ? (
        <QuestBagGrid
          gridItems={gridItems}
          emptySlots={Math.min(remainingSlots, Math.max(0, 6 - items.length - 1))}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<PackageIcon className="w-8 h-8" />}
          title={d.inventory.emptyTitle}
          description={d.inventory.emptyBody}
        />
      ) : (
        <InventoryGrid
          items={gridItems}
          mode="navigate"
          emptySlots={Math.min(remainingSlots, Math.max(0, 6 - items.length))}
        />
      )}
      </div>
    </div>
  )
}
