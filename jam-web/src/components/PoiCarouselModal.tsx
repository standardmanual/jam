'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { MedalIcon, ChevronRightIcon, PackageIcon } from '@/components/ui/icons'
import { IconButton } from '@ds/components/buttons/IconButton'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { Card } from '@ds/components/cards/Card'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { Carousel } from '@ds/components/navigation/Carousel'
import InventoryGrid, { InventoryGridItem } from '@/components/inventory/InventoryGrid'
import BadgeDetailSheet, { PickupDrop } from '@/app/(main)/drops/BadgeDetailSheet'
import { useRevealOnMount } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import type { NearbyPoi } from '@/types/drops'
import type { BadgeRarity } from '@/types/database'
import { d, t } from '@/lib/i18n'
import { DROP_RADIUS_METERS } from '@/lib/poi/proximity'
import { trackEvent } from '@/lib/analytics/gtag'

// 20260820_018: 드랍(지도) POI 모달 캐러셀 개편
// 기존 하단 고정 바텀시트를 대체하는 화면 중앙 모달 — 캐러셀 아이템 자체가
// 모달 카드다(모달과 캐러셀이 분리된 두 컴포넌트가 아님). 중앙 카드 = 선택된 POI.

interface InventoryItem {
  id: string
  badge_id: string
  badge_name: string
  badge_rarity: string
  badge_image_url: string | null
}

/** 최초 공개 카드 수 + 윈도우가 확장될 때마다 추가되는 카드 수 */
const INITIAL_WINDOW_SIZE = 3
const WINDOW_STEP = 3

const KNOWN_RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

interface PoiCarouselModalProps {
  /** 반경 내 전체 POI 목록(정렬 순서는 무관 — 내부에서 거리순으로 재정렬한다) */
  pois: NearbyPoi[]
  /** 캐러셀을 열 때 중앙에 둘 POI id(지도에서 클릭한 POI) */
  initialPoiId: string
  userLat: number
  userLng: number
  onClose: () => void
  /** 캐러셀 중앙이 바뀔 때(스와이프 포함) 호출 — 지도 포커싱에 사용 */
  onCenterChange: (poi: NearbyPoi) => void
  /** 드랍/픽업 성공 시 호출 — 부모의 반경 내 POI 목록(카운트)을 재조회 */
  onDropOrPickupSuccess: () => void
}

export default function PoiCarouselModal({
  pois,
  initialPoiId,
  userLat,
  userLng,
  onClose,
  onCenterChange,
  onDropOrPickupSuccess,
}: PoiCarouselModalProps) {
  const { toast } = useToast()

  // 이 캐러셀은 반경 내(드랍/픽업 가능) POI만 다룬다 — 반경 밖 POI는 이 기능
  // 범위에 존재하지 않는다(마커 클릭 단계에서 이미 걸러지지만, 반경 내 다른
  // 마커를 눌러 목록이 갱신될 때도 안전하게 다시 걸러낸다). 거리순 정렬 후,
  // 클릭해서 연 POI가 맨 앞(=캐러셀 index 0, 중앙)에 오도록 순환 회전한다.
  const orderedPois = useMemo(() => {
    const inRange = pois.filter((p) => p.in_drop_range)
    const sorted = [...inRange].sort((a, b) => a.distance_meters - b.distance_meters)
    const startIdx = sorted.findIndex((p) => p.id === initialPoiId)
    if (startIdx <= 0) return sorted
    return [...sorted.slice(startIdx), ...sorted.slice(0, startIdx)]
  }, [pois, initialPoiId])

  const [activeIndex, setActiveIndex] = useState(0)
  const [visibleCount, setVisibleCount] = useState(() => Math.min(INITIAL_WINDOW_SIZE, orderedPois.length))

  // 다른 POI 마커를 눌러 캐러셀을 다시 연 경우에만 리셋한다. 드랍/픽업 후
  // 카운트 갱신으로 `pois` 참조가 바뀌는 것만으로는 리셋하지 않는다(내비게이션
  // 위치가 요동치는 것을 방지). react.dev가 안내하는 "prop 변경 시 렌더 중
  // state 조정" 패턴 — effect 없이 렌더 중 조건부로 setState한다
  // (react-hooks/set-state-in-effect 정리 목적의 순수 리팩터링, 동작 동일).
  const [prevInitialPoiId, setPrevInitialPoiId] = useState(initialPoiId)
  if (initialPoiId !== prevInitialPoiId) {
    setPrevInitialPoiId(initialPoiId)
    setActiveIndex(0)
    setVisibleCount(Math.min(INITIAL_WINDOW_SIZE, orderedPois.length))
  }

  // 활성 카드가 공개된 윈도우 끝에 다다르면 3개씩 더 공개한다. 전체가 공개된
  // 뒤부터는 Carousel 자체의 모듈로 인덱싱으로 전체 목록을 무한 순환한다.
  // 위와 동일한 이유로 effect 대신 렌더 중 조건부 setState로 정리.
  if (activeIndex >= visibleCount - 1 && visibleCount < orderedPois.length) {
    setVisibleCount(Math.min(visibleCount + WINDOW_STEP, orderedPois.length))
  }

  const visiblePois = useMemo(() => orderedPois.slice(0, visibleCount), [orderedPois, visibleCount])
  const activePoi = visiblePois[activeIndex] ?? null

  const backdropRef = useRevealOnMount<HTMLDivElement>(true)
  const panelRef = useRevealOnMount<HTMLDivElement>(true)

  // 지도 포커싱 — 활성 POI가 바뀔 때마다(스와이프 포함) 알림
  useEffect(() => {
    if (activePoi) onCenterChange(activePoi)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePoi?.id])

  // ── POI별 드랍(픽업 가능 배지) 목록 캐시 — 이미 열람한 POI는 재호출하지 않는다 ──
  const [dropsCache, setDropsCache] = useState<Record<string, PickupDrop[]>>({})
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({})
  const fetchingRef = useRef<Set<string>>(new Set())

  const fetchPoiDrops = useCallback(async (poiId: string) => {
    if (fetchingRef.current.has(poiId)) return
    fetchingRef.current.add(poiId)
    setLoadingIds((prev) => ({ ...prev, [poiId]: true }))
    try {
      const res = await fetch(`/api/drops/poi/${poiId}`)
      const json = await res.json()
      // 20260826_002: 서버 응답의 error는 snake_case 코드다. 목록 조회 실패는
      // 사용자가 취할 행동이 하나뿐(다시 시도)이라 코드 구분 없이 같은 문구로 안내한다.
      // 예전에는 `json.error`를 그대로 던져 서버 원문이 토스트에 노출됐다.
      if (!res.ok) throw new Error(d.drops.loadDropsFailed)
      setDropsCache((prev) => ({ ...prev, [poiId]: (json.drops ?? []) as PickupDrop[] }))
    } catch {
      toast(d.drops.loadDropsFailed, 'error')
    } finally {
      fetchingRef.current.delete(poiId)
      setLoadingIds((prev) => ({ ...prev, [poiId]: false }))
    }
  }, [toast])

  // 화면 중앙(활성) 카드가 바뀔 때만 드랍 목록을 채운다 — peek(옆) 카드는
  // POI 기본 정보만 보여주고, 배지 데이터는 그 카드가 중앙에 도착한 시점에만
  // 불러온다(20260820_025, 불필요한 동시 요청 축소). tier1/tier2 구분 없이
  // 항상 API를 호출한다 — tier2(네이버 자동수집) POI도 백그라운드에서 poi
  // 테이블에 정식 저장되고 나면 실제 UUID를 가지므로 poi_drops가 정상적으로
  // 연결될 수 있다("DB 미저장이라 연결 불가"는 잘못된 전제였다, 20260820_024).
  useEffect(() => {
    if (!activePoi) return
    if (dropsCache[activePoi.id] !== undefined || fetchingRef.current.has(activePoi.id)) return
    // fetchPoiDrops 내부가 첫 await 전에 setLoadingIds를 동기 호출해
    // react-hooks/set-state-in-effect에 걸리므로 마이크로태스크로 지연.
    // 같은 틱 내, 페인트 이전에 실행되어 체감 타이밍 차이는 없음.
    const id = activePoi.id
    Promise.resolve().then(() => fetchPoiDrops(id))
  }, [activePoi, dropsCache, fetchPoiDrops])

  // ── 드랍 플로우(활성 카드에만 적용) ──
  const [showInventory, setShowInventory] = useState(false)
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [pendingDropItem, setPendingDropItem] = useState<InventoryGridItem | null>(null)
  const [dropping, setDropping] = useState(false)

  // 카드가 바뀌면 이전 카드에서 진행 중이던 드랍 플로우를 초기화한다.
  // react.dev의 "prop 변경 시 렌더 중 state 조정" 패턴 — effect 없이 렌더 중
  // 조건부로 setState (react-hooks/set-state-in-effect 정리, 동작 동일).
  const [prevActivePoiIdForDropFlow, setPrevActivePoiIdForDropFlow] = useState(activePoi?.id)
  if (activePoi?.id !== prevActivePoiIdForDropFlow) {
    setPrevActivePoiIdForDropFlow(activePoi?.id)
    setShowInventory(false)
    setInventoryItems([])
    setPendingDropItem(null)
  }

  async function openInventory() {
    setShowInventory(true)
    setInventoryLoading(true)
    try {
      const res = await fetch('/api/inventory/items')
      const json = await res.json()
      setInventoryItems(json.items ?? [])
    } catch {
      toast(d.drops.loadInventoryFailed, 'error')
    } finally {
      setInventoryLoading(false)
    }
  }

  async function executeDrop() {
    if (!activePoi || !pendingDropItem) return
    setDropping(true)
    try {
      const res = await fetch('/api/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poi_id: activePoi.id,
          inventory_item_id: pendingDropItem.id,
          user_lat: userLat,
          user_lng: userLng,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        // 20260826_002: 픽업과 동일하게 서버 코드 → 사용자 문구 매핑만 노출한다.
        // 예전에는 `err.error ?? ...`라 서버의 개발자용 축약 문구('POI 없음' 등)가
        // 그대로 토스트에 떴다. 매핑되지 않은 코드는 일반 실패 문구로 흘린다.
        const msg: Record<string, string> = {
          out_of_range: t(d.drops.dropOutOfRange, { m: DROP_RADIUS_METERS }),
          poi_not_found: d.drops.dropPoiNotFound,
          inventory_not_found: d.drops.loadInventoryFailed,
          item_not_found: d.drops.dropItemNotFound,
          already_dropped: d.drops.dropAlreadyDropped,
          item_slotted: d.drops.dropItemSlotted,
          missing_params: d.drops.locationMissing,
          // 20260826_002 후속: 401은 재시도로 풀리지 않으므로 재로그인을 안내한다.
          unauthorized: d.drops.sessionExpired,
        }
        toast(msg[err.error] ?? d.drops.dropFailed, 'error')
        return
      }
      toast(d.drops.dropSuccess, 'success')
      // GA4 item_drop — pendingDropItem(InventoryGridItem)에는 badge_id가 없어(정규화 타입),
      // 방금 열었던 인벤토리 원본 목록에서 같은 인벤토리 아이템 id로 badge_id를 찾는다.
      const droppedBadgeId = inventoryItems.find((it) => it.id === pendingDropItem.id)?.badge_id ?? null
      trackEvent('item_drop', { poi_id: activePoi.id, inventory_item_id: pendingDropItem.id, badge_id: droppedBadgeId })
      setShowInventory(false)
      setPendingDropItem(null)
      setInventoryItems([])
      try {
        const dropsRes = await fetch(`/api/drops/poi/${activePoi.id}`)
        const dropsJson = await dropsRes.json()
        setDropsCache((prev) => ({ ...prev, [activePoi.id]: (dropsJson.drops ?? []) as PickupDrop[] }))
      } catch {
        /* 목록 갱신 실패해도 드랍 자체는 성공 */
      }
      onDropOrPickupSuccess()
    } catch {
      toast(d.drops.dropFailed, 'error')
    } finally {
      setDropping(false)
    }
  }

  // ── 픽업 플로우 ──
  const [selectedDrop, setSelectedDrop] = useState<PickupDrop | null>(null)
  const [pickingUp, setPickingUp] = useState(false)

  async function executePickup() {
    if (!selectedDrop || !activePoi) return
    setPickingUp(true)
    try {
      const res = await fetch(`/api/drops/${selectedDrop.id}/pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_lat: userLat, user_lng: userLng }),
      })
      if (!res.ok) {
        const err = await res.json()
        const msg: Record<string, string> = {
          already_picked_up: d.drops.pickupAlreadyDone,
          inventory_full: d.drops.pickupInventoryFull,
          // 20260826_002: inventory_not_found(인벤토리 레코드 자체가 없음)를
          // '인벤토리가 꽉 찼어요'로 안내하던 것을 바로잡았다 — 다른 상황이다.
          inventory_not_found: d.drops.loadInventoryFailed,
          cannot_pickup_own_drop: d.drops.pickupOwnDrop,
          out_of_range: t(d.drops.pickupOutOfRange, { m: DROP_RADIUS_METERS }),
          // 20260826_002: 서버에 한국어 원문으로 남아 있던 나머지 실패 경로도 코드화됐다.
          drop_not_found: d.drops.pickupDropNotFound,
          poi_not_found: d.drops.pickupPoiNotFound,
          poi_blocked: d.drops.pickupPoiBlocked,
          location_unverified: d.drops.pickupLocationUnverified,
          missing_params: d.drops.locationMissing,
          // 20260826_002 후속: 401은 재시도로 풀리지 않으므로 재로그인을 안내한다.
          unauthorized: d.drops.sessionExpired,
        }
        // 20260825_039: `?? err.error` 폴백을 제거했다 — 서버가 돌려주는 개발자용 축약 문구
        // ('드랍 없음', 'POI 없음' 등)가 그대로 토스트에 노출되던 경로다. 매핑되지 않은
        // 코드는 전부 일반 실패 문구로 흘린다.
        toast(msg[err.error] ?? d.drops.pickupFailed, 'error')
        return
      }
      toast(d.drops.pickupSuccess, 'success')
      trackEvent('item_pickup', { poi_id: activePoi.id, drop_id: selectedDrop.id, badge_id: selectedDrop.badge_id })
      const pickedId = selectedDrop.id
      const poiId = activePoi.id
      setSelectedDrop(null)
      setDropsCache((prev) => ({
        ...prev,
        [poiId]: (prev[poiId] ?? []).filter((dr) => dr.id !== pickedId),
      }))
      onDropOrPickupSuccess()
    } catch {
      toast(d.drops.pickupFailed, 'error')
    } finally {
      setPickingUp(false)
    }
  }

  const dropGridItems: InventoryGridItem[] = inventoryItems.map((it) => ({
    id: it.id,
    badgeName: it.badge_name,
    badgeImageUrl: it.badge_image_url,
    badgeRarity: it.badge_rarity,
  }))

  if (visiblePois.length === 0) return null

  return (
    <div className="fixed inset-0 z-30" style={{ maxWidth: 430, margin: '0 auto' }}>
      {/* 배경 오버레이 — 탭하면 닫힘 */}
      <div ref={backdropRef} className="absolute inset-0 bg-surface/70 t-panel-backdrop" data-open="false" onClick={onClose} />

      {/*
        20260820_022: 화면 세로 중앙(justify-center) → TabBar 바로 위 고정(justify-end)으로
        변경. 이 기능 개발 이전 바텀시트와 동일한 하단 위치다. paddingBottom은 TabBar
        (bottom: safe-area+16px, height 64px) 위 12px 여백을 더한 값 — BottomSheet.tsx/
        BadgeDetailSheet.tsx의 footer 패딩과 동일한 관례를 따른다. justify-end라 컨텐츠
        (드랍된 배지 수)가 많아질수록 패널이 아래는 고정된 채 위쪽으로만 늘어난다.
        좌우 padding은 제거 — 캐러셀이 화면 폭 전체를 써서 옆 카드(peek)가 화면 끝까지
        잘리지 않고 보이게 한다(빈 영역은 pointer-events:none으로 배경 탭 닫기를 살려둔다).
      */}
      <div
        className="relative h-full flex flex-col justify-end pointer-events-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px + 64px + 12px)' }}
      >
        <div
          ref={panelRef}
          className="t-panel-slide w-full pointer-events-auto"
          data-open="false"
          style={{ ['--panel-translate-y' as string]: '24px' }}
        >
          {/* 20260820_023: 닫기 버튼을 캐러셀 위 별도 행이 아니라 각 카드 안쪽
              우측 상단으로 이동(사용자 요청) — PoiCard에 onClose로 전달 */}
          <Carousel
            items={visiblePois}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            getItemKey={(poi: NearbyPoi) => poi.id}
            ariaLabel="주변 지점 목록"
            renderItem={(poi: NearbyPoi, { isActive }) => (
              <PoiCard
                poi={poi}
                isActive={isActive}
                drops={dropsCache[poi.id]}
                loading={loadingIds[poi.id] ?? false}
                showInventory={isActive && showInventory}
                inventoryLoading={inventoryLoading}
                pendingDropItem={isActive ? pendingDropItem : null}
                dropping={dropping}
                dropGridItems={dropGridItems}
                onOpenInventory={isActive ? openInventory : undefined}
                onSelectDropItem={isActive ? setPendingDropItem : undefined}
                onCancelPending={isActive ? () => setPendingDropItem(null) : undefined}
                onConfirmDrop={isActive ? executeDrop : undefined}
                onSelectDrop={isActive ? setSelectedDrop : undefined}
                onClose={onClose}
              />
            )}
          />
        </div>
      </div>

      {selectedDrop && activePoi && (
        <BadgeDetailSheet
          drop={selectedDrop}
          poiName={activePoi.name}
          pickingUp={pickingUp}
          onPickup={executePickup}
          onCancel={() => setSelectedDrop(null)}
        />
      )}
    </div>
  )
}

// ===== POI 카드 (캐러셀 아이템 자체가 모달 카드) =====

interface PoiCardProps {
  poi: NearbyPoi
  isActive: boolean
  drops: PickupDrop[] | undefined
  loading: boolean
  showInventory: boolean
  inventoryLoading: boolean
  pendingDropItem: InventoryGridItem | null
  dropping: boolean
  dropGridItems: InventoryGridItem[]
  onOpenInventory?: () => void
  onSelectDropItem?: (item: InventoryGridItem) => void
  onCancelPending?: () => void
  onConfirmDrop?: () => void
  onSelectDrop?: (drop: PickupDrop) => void
  onClose: () => void
}

function PoiCard({
  poi,
  isActive,
  drops,
  loading,
  showInventory,
  inventoryLoading,
  pendingDropItem,
  dropping,
  dropGridItems,
  onOpenInventory,
  onSelectDropItem,
  onCancelPending,
  onConfirmDrop,
  onSelectDrop,
  onClose,
}: PoiCardProps) {
  return (
    <Card
      tone="default"
      style={{
        width: '100%',
        maxWidth: 360,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-16)',
        opacity: isActive ? 1 : 0.55,
        transform: isActive ? 'scale(1)' : 'scale(0.92)',
        transition:
          'transform var(--duration-medium) var(--ease-smooth-out), opacity var(--duration-medium) var(--ease-smooth-out)',
      }}
    >
      {/* 헤더 — 닫기 버튼을 카드 안쪽 우측 상단에 배치(20260820_023, 사용자 요청).
          모든 카드가 동일한 onClose를 받아 어느 카드에서 눌러도 전체 모달이 닫힌다. */}
      <div className="flex items-start justify-between gap-[var(--spacing-8)]">
        <div className="min-w-0">
          <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] font-bold text-text truncate">{poi.name}</p>
          <p className="text-[length:var(--text-caption)] text-text/50 mt-0.5">{poi.distance_meters}m</p>
        </div>
        <IconButton icon="close" label={d.common.close} onClick={onClose} surface="dark" className="shrink-0 -mt-2 -mr-2" />
      </div>

      {/* 본문 — peek(비활성) 카드는 POI 기본 정보만 노출하고 본문 자체를
          렌더하지 않는다. 배지 데이터는 이 카드가 중앙(활성)에 도착한
          시점에만 불러온다(20260820_025). 세로 높이는 콘텐츠(드랍된 배지 수)
          만큼 자연스럽게 자란다. 카드 하단이 항상 같은 기준선(캐러셀
          컨테이너 bottom)에서 시작하므로 배지가 많을수록 카드가 위로만
          길어진다(하단 정렬). 이 캐러셀에는 반경 내(in_drop_range) POI만
          들어오므로 반경 밖 안내는 없다. */}
      {!isActive ? null : loading || drops === undefined ? (
        <div className="flex justify-center py-[var(--spacing-24)]">
          <div className="w-5 h-5 border border-current border-t-transparent rounded-full animate-spin" />
        </div>
      ) : showInventory ? (
        /* ===== 드랍: 인벤토리 그리드(활성 카드에서만 열림) ===== */
        pendingDropItem ? (
          <div className="flex flex-col items-center gap-[var(--spacing-16)] py-[var(--spacing-16)]">
            <div className="w-20 h-20 rounded-[var(--radius-cards)] bg-white/[0.04] overflow-hidden flex items-center justify-center">
              {pendingDropItem.badgeImageUrl ? (
                <Image src={pendingDropItem.badgeImageUrl} alt={pendingDropItem.badgeName} width={80} height={80} className="w-full h-full object-contain p-1" />
              ) : (
                <MedalIcon className="w-8 h-8 text-text/40" />
              )}
            </div>
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center whitespace-pre-line">
              {t(d.drops.confirmDrop, { name: pendingDropItem.badgeName })}
            </p>
            <div className="flex gap-2 w-full">
              <Button fullWidth variant="outline" surface="main" onClick={onCancelPending} disabled={dropping}>
                {d.drops.cancel}
              </Button>
              <Button fullWidth surface="main" loading={dropping} onClick={onConfirmDrop}>
                {d.drops.dropButton}
              </Button>
            </div>
          </div>
        ) : inventoryLoading ? (
          <div className="flex justify-center py-[var(--spacing-24)]">
            <div className="w-5 h-5 border border-current border-t-transparent rounded-full animate-spin" />
          </div>
        ) : dropGridItems.length === 0 ? (
          <EmptyState
            icon={<MedalIcon className="w-8 h-8" />}
            title={d.drops.dropNoItems}
            description={d.drops.dropNoItemsBody}
          />
        ) : (
          <InventoryGrid items={dropGridItems} mode="select" onSelect={(item) => onSelectDropItem?.(item)} />
        )
      ) : (
        /* ===== 드랍된 배지 목록(있으면) + [여기에 드랍] 액션(항상 함께 노출) — 20260829_2101
           "No broken objects" 위반 수정: 픽업 가능 목록 유무와 드랍 액션 노출 여부를
           독립적인 축으로 분리했다. 목록·버튼 레이블·문구는 기존 것을 그대로 재사용. */
        <div className="flex flex-col gap-[var(--spacing-16)]">
          {drops.length > 0 ? (
            <div className="flex flex-col gap-2">
              {drops.map((drop) => {
                const rarity = KNOWN_RARITIES.includes(drop.badge_rarity as BadgeRarity)
                  ? (drop.badge_rarity as BadgeRarity)
                  : 'common'
                return (
                  <button
                    key={drop.id}
                    onClick={() => onSelectDrop?.(drop)}
                    disabled={!isActive}
                    className="w-full flex items-center gap-[var(--spacing-16)] px-[var(--spacing-16)] py-[var(--spacing-8)] rounded-[var(--radius-cards)] bg-white/[0.04] active:scale-[0.98] transition-transform duration-100 text-left disabled:cursor-default"
                  >
                    <div className="w-11 h-11 rounded-[var(--radius-cards)] flex-shrink-0 overflow-hidden bg-white/[0.06] flex items-center justify-center">
                      {drop.badge_image_url ? (
                        <Image src={drop.badge_image_url} alt={drop.badge_name} width={44} height={44} className="w-full h-full object-contain p-0.5" />
                      ) : (
                        <MedalIcon className="w-5 h-5 text-text/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">{drop.badge_name}</p>
                      <RarityBadge rarity={rarity} className="mt-1" />
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text/40 shrink-0" />
                  </button>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={<PackageIcon className="w-8 h-8" />}
              title={d.drops.dropEmptyTitle}
              description={d.drops.dropEmptyBody}
              style={{ padding: 0 }}
            />
          )}
          {isActive && (
            <Button fullWidth surface="main" onClick={onOpenInventory}>
              {d.drops.dropHereButton}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
