import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InventoryRow, InventoryItemRow, BadgeRow } from '@/types/database'
import InventoryGrid, { InventoryGridItem } from '@/components/inventory/InventoryGrid'
import Button from '@/components/ui/Button'
import ProgressCountBar from '@/components/ui/ProgressCountBar'
import { EmptyState } from '@/components/ui/EmptyState'
import TopNav from '@/components/ui/TopNav'
import { MixingBowlIcon, ArrowDownIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

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

  const { data: inventoryData, error: inventoryError } = await supabase
    .from('inventory')
    .select('*, inventory_items(*, badge:badges(*))')
    .eq('user_id', user.id)
    .single()
  // 20260901_1848: 조회 실패가 "빈 인벤토리"로 위장되던 지점(.single()이라 무인벤토리도
  // error로 잡히므로 실제 오류와 완전히 구분되진 않지만, 최소 가시성 확보는 된다)
  if (inventoryError) console.error('[inventory/page] inventory 조회 실패', inventoryError)

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
  // 내려가는 props와 RSC 페이로드에 이 값들이 실리면 화면에서 가려도 소용이 없다. 등급만 싣는다.
  const gridItems: InventoryGridItem[] = items.map((item) =>
    item.locked === true
      ? {
          id: item.id,
          badgeName: '',
          badgeImageUrl: null,
          badgeRarity: item.badge.rarity,
          expiresAt: item.expires_at,
          locked: true,
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
      <TopNav logo logoText={d.inventory.title} />

      <div className="px-4 pt-4 pb-6">
      {/* 헤더 */}
      <div className="mb-5">
        {/* 20261031_1821: 보이는 타이틀은 없애고, 스크린리더용 페이지 제목만 남긴다 */}
        <h1 className="sr-only">{d.inventory.title}</h1>
        {/* 슬롯 사용량 — 컬렉션 상세의 진행도 바와 같은 모양(바 오른쪽에 «사용/전체» 수치, 바 아래 문장 없음, 2026-11-09 사용자 지시) */}
        {/* 2026-11-27 사용자 지시(티켓 20261127_0829): 바 채움색을 컬렉션 상세의 진행도 바와 같은 --capsule-fill로 맞춘다 */}
        <ProgressCountBar percent={Math.min(100, (usedSlots / maxSlots) * 100)} current={usedSlots} total={maxSlots} color="var(--capsule-fill)" />

        {/* 20261110: 믹스하기 버튼을 진행도 바 아래로 옮겼다(사용자 지시, 버튼 색은 그대로).
            같은 날 가로 중앙으로 옮기고 레시피 상세의 믹스하기 버튼과 같은 가차머신 아이콘을 글자 앞에 붙였다(사용자 지시, 티켓 20261110_1757).
            20261114: 버튼이 페이지 폭을 가득 채우도록 늘렸다(사용자 지시, 티켓 20261114_1544) */}
        <div className="mt-3">
          <Button href="/combine" variant="secondary" fullWidth className="bg-surface!">
            <MixingBowlIcon className="w-5 h-5 shrink-0" />
            {d.inventory.combineButton}
          </Button>
        </div>

        {/* 20260912_1940: 슬롯 포화 상시 안내 — 가득 찼을 때만 노출, 카드형 인셋(edge-to-edge 금지).
            20261105_1953: 홈 막힘 카드와 같은 어두운 반전 면(--background-inverse + --snow).
            20261106: 한 줄 문구만 남기고 «드랍하기» 버튼을 걷었다(사용자 결정) */}
        {remainingSlots === 0 && (
          <div
            className="mt-3 rounded-2xl px-4 py-3 bg-background-inverse border border-background-inverse"
          >
            <p className="text-base text-snow break-keep wrap-break-word">{d.inventory.fullNoticeBody}</p>
          </div>
        )}
      </div>

      {/* 아이템 그리드 — 2026-11-27 사용자 지시(티켓 20261127_0829): 빈 슬롯은 남은 슬롯 수만큼 모두 그린다(옛 규칙은 총 6칸까지만) */}
      {items.length === 0 ? (
        <EmptyState
          icon={<ArrowDownIcon className="w-8 h-8" />}
          title={d.inventory.emptyTitle}
          description={d.inventory.emptyBody}
        />
      ) : (
        <InventoryGrid
          items={gridItems}
          mode="navigate"
          emptySlots={remainingSlots}
        />
      )}
      </div>
    </div>
  )
}
