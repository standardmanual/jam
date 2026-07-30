'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { CloseIcon, MedalIcon, ChevronRightIcon } from '@/components/ui/icons'
import InventoryGrid, { InventoryGridItem } from '@/components/inventory/InventoryGrid'
import BadgeDetailSheet, { PickupDrop } from './BadgeDetailSheet'
import type { PoiMarker } from '@/components/map/MapView'
import { useTextSwap, useRevealOnMount } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

// ===== 타입 =====

interface NearbyPoi extends PoiMarker {
  distance_meters: number
  available_drops_count: number
  in_drop_range: boolean
  poi_tier: number
}

interface InventoryItem {
  id: string
  badge_id: string
  badge_name: string
  badge_rarity: string
  badge_image_url: string | null
}

// ===== 컴포넌트 =====

export default function DropsClient() {
  const { toast } = useToast()

  const [locError, setLocError] = useState<string | null>(null)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)

  const [pois, setPois] = useState<NearbyPoi[]>([])
  const [poisLoading, setPoisLoading] = useState(false)

  // 선택된 POI + 그 POI의 드랍 목록 (null = 아직 로딩)
  const [selectedPoi, setSelectedPoi] = useState<NearbyPoi | null>(null)
  const [poiDrops, setPoiDrops] = useState<PickupDrop[] | null>(null)
  const [poiLoading, setPoiLoading] = useState(false)

  // 드랍 플로우
  const [showInventory, setShowInventory] = useState(false)
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [pendingDropItem, setPendingDropItem] = useState<InventoryGridItem | null>(null)
  const [dropping, setDropping] = useState(false)

  // 픽업 플로우
  const [selectedDrop, setSelectedDrop] = useState<PickupDrop | null>(null)
  const [pickingUp, setPickingUp] = useState(false)

  // ── 트랜지션 (조기 return보다 위에서 훅을 호출해야 순서가 고정된다) ──
  const isPickupState = (poiDrops?.length ?? 0) > 0
  // POI 바텀시트 헤더 타이틀 — "확인 중..." ↔ 픽업/드랍 문구 (Text states swap, 04)
  const sheetTitle = poiLoading
    ? `${d.drops.checking}...`
    : isPickupState
      ? d.drops.pickupItemsTitle
      : d.drops.thisPlaceTitle
  const { ref: sheetTitleRef, initialText: initialSheetTitle } = useTextSwap<HTMLSpanElement>(sheetTitle)
  // POI 바텀시트 진입 — Panel reveal (07). 마운트 다음 프레임에 data-open을 뒤집는다.
  const poiSheetRef = useRevealOnMount<HTMLDivElement>(selectedPoi !== null)

  // 위치 획득
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError(d.drops.locationUnsupported)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
      },
      () => setLocError(d.drops.locationDenied)
      // enableHighAccuracy는 넣지 않는다 — 실내에서는 GPS 위성 신호가
      // 잘 안 잡혀 오히려 WiFi/기지국 기반 기본 위치보다 더 크게 흔들리는
      // 값이 나올 수 있음(실측: 동일 장소에서 예전엔 문제없다가 이 옵션을
      // 추가한 뒤 오탐 발생). 기본 동작(정밀도 낮지만 안정적)으로 되돌림.
    )
  }, [])

  // 근처 POI 로드
  const loadNearbyPois = useCallback(async () => {
    if (userLat === null || userLng === null) return
    setPoisLoading(true)
    try {
      const res = await fetch(`/api/drops?lat=${userLat}&lng=${userLng}`)
      const json = await res.json()
      setPois(json.pois ?? [])
    } catch {
      toast(d.drops.loadPoiFailed, 'error')
    } finally {
      setPoisLoading(false)
    }
  }, [userLat, userLng, toast])

  useEffect(() => {
    loadNearbyPois()
  }, [loadNearbyPois])

  // 바텀시트 닫기 + 상태 초기화
  const closeSheet = useCallback(() => {
    setSelectedPoi(null)
    setPoiDrops(null)
    setShowInventory(false)
    setInventoryItems([])
    setPendingDropItem(null)
    setSelectedDrop(null)
  }, [])

  // POI별 드랍 목록 조회 (상태 분기의 기준)
  const fetchPoiDrops = useCallback(async (poiId: string): Promise<PickupDrop[]> => {
    const res = await fetch(`/api/drops/poi/${poiId}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? d.drops.loadDropsFailed)
    return (json.drops ?? []) as PickupDrop[]
  }, [])

  // POI 선택 → GET /api/drops/poi/[poiId]로 상태 판별
  const handlePoiSelect = useCallback(async (poiId: string) => {
    const poi = pois.find((p) => p.id === poiId)
    if (!poi) return
    if (!poi.in_drop_range) {
      toast(t(d.drops.outOfRange, { name: poi.name, distance: poi.distance_meters }), 'error')
      return
    }
    setSelectedPoi(poi)
    setPoiDrops(null)
    setShowInventory(false)
    setInventoryItems([])
    setPendingDropItem(null)
    setSelectedDrop(null)
    setPoiLoading(true)
    try {
      const drops = await fetchPoiDrops(poiId)
      setPoiDrops(drops)
    } catch (e) {
      toast(e instanceof Error ? e.message : d.drops.loadDropsFailed, 'error')
      closeSheet()
    } finally {
      setPoiLoading(false)
    }
  }, [pois, toast, fetchPoiDrops, closeSheet])

  // [드랍] 버튼 → 인벤토리 아이템 지연 로드
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

  // 드랍 실행 (인앱 확인 후)
  async function executeDrop() {
    if (!selectedPoi || !pendingDropItem || userLat === null || userLng === null) return
    setDropping(true)
    try {
      const res = await fetch('/api/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poi_id: selectedPoi.id,
          inventory_item_id: pendingDropItem.id,
          user_lat: userLat,
          user_lng: userLng,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast(err.error ?? d.drops.dropFailed, 'error')
        return
      }
      toast(d.drops.dropSuccess, 'success')
      // 드랍 후: 이 POI 목록을 다시 불러와 방금 드랍한 배지를 바텀시트에 노출(픽업 상태로 전환)
      setShowInventory(false)
      setPendingDropItem(null)
      setInventoryItems([])
      try {
        const drops = await fetchPoiDrops(selectedPoi.id)
        setPoiDrops(drops)
      } catch {
        /* 목록 갱신 실패해도 드랍 자체는 성공 */
      }
      loadNearbyPois()
    } catch {
      toast(d.drops.dropFailed, 'error')
    } finally {
      setDropping(false)
    }
  }

  // 픽업 실행
  async function executePickup() {
    if (!selectedDrop || userLat === null || userLng === null) return
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
        }
        toast(msg[err.error] ?? err.error ?? d.drops.pickupFailed, 'error')
        return
      }
      toast(d.drops.pickupSuccess, 'success')
      // 상세 오버레이 닫고 목록에서 제거
      const pickedId = selectedDrop.id
      setSelectedDrop(null)
      setPoiDrops((prev) => (prev ? prev.filter((dr) => dr.id !== pickedId) : prev))
      loadNearbyPois()
    } catch {
      toast(d.drops.pickupFailed, 'error')
    } finally {
      setPickingUp(false)
    }
  }

  // ===== 렌더 =====

  if (locError) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-[var(--spacing-16)] px-[var(--spacing-24)] text-center bg-surface text-text"
        style={{ maxWidth: 430, margin: '0 auto' }}
      >
        <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/70">{locError}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {d.drops.retry}
        </Button>
      </div>
    )
  }

  if (userLat === null || userLng === null) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-[var(--spacing-16)] bg-surface text-text"
        style={{ maxWidth: 430, margin: '0 auto' }}
      >
        <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin" />
        <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60">{d.drops.locating}</p>
      </div>
    )
  }

  const poiMarkers: PoiMarker[] = pois.map((p) => ({
    id: p.id,
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    availableDrops: p.available_drops_count,
    inDropRange: p.in_drop_range,
    poiTier: p.poi_tier,
  }))

  const dropGridItems: InventoryGridItem[] = inventoryItems.map((it) => ({
    id: it.id,
    badgeName: it.badge_name,
    badgeImageUrl: it.badge_image_url,
    badgeRarity: it.badge_rarity,
  }))

  return (
    <div className="fixed inset-0 bg-surface overflow-hidden" style={{ maxWidth: 430, margin: '0 auto' }}>
      {/* 지도 — 풀스크린(노치·홈 인디케이터 영역까지 꽉 채움) */}
      <div className="absolute inset-0">
        <MapView
          userLat={userLat}
          userLng={userLng}
          pois={poiMarkers}
          onPoiSelect={handlePoiSelect}
          selectedPoiId={selectedPoi?.id}
        />
      </div>

      {poisLoading && (
        <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] left-1/2 -translate-x-1/2 z-10 bg-surface-inverse rounded-[var(--radius-nav-buttons)] px-[var(--spacing-16)] py-2 flex items-center gap-2">
          <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin text-text-inverse" />
          <span className="text-[11px] text-text-inverse">{d.drops.exploring}</span>
        </div>
      )}

      {!poisLoading && pois.length === 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-surface-inverse rounded-[var(--radius-cards)] px-[var(--spacing-16)] py-[var(--spacing-16)] text-text-inverse/70 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center whitespace-nowrap">
          {d.drops.noNearbyPlaces}
        </div>
      )}
      {!poisLoading && pois.length > 0 && !pois.some((p) => p.in_drop_range) && !selectedPoi && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-surface-inverse rounded-[var(--radius-cards)] px-[var(--spacing-16)] py-[var(--spacing-16)] text-text-inverse/70 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center whitespace-nowrap">
          {d.drops.moveCloser}
        </div>
      )}

      {/* POI 바텀시트 — 상태 분기 */}
      {selectedPoi && (
        <div
          ref={poiSheetRef}
          className="t-panel-slide absolute inset-x-0 bottom-0 z-20 px-[var(--spacing-16)] pb-[var(--spacing-16)]"
          data-open="false"
          /* 시트 자체 높이만큼만 이동해도 완전한 열림으로 읽히도록 travel을 조정 */
          style={{ ['--panel-translate-y' as string]: '48px' }}
        >
          <div className="bg-surface-inverse text-text-inverse rounded-[var(--radius-cards)] overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
              <div className="min-w-0">
                <p className="text-[11px] text-text-inverse/50 mb-0.5 truncate">{selectedPoi.name}</p>
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
                  <span ref={sheetTitleRef} className="t-text-swap">{initialSheetTitle}</span>
                </p>
              </div>
              <button onClick={closeSheet} aria-label={d.common.close} className="w-11 h-11 -mr-2 flex items-center justify-center text-text-inverse/50 active:scale-90 transition-transform duration-100 shrink-0">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-[var(--spacing-16)]">
              {poiLoading || poiDrops === null ? (
                <div className="flex justify-center py-[var(--spacing-32)]">
                  <div className="w-5 h-5 border border-current border-t-transparent rounded-full animate-spin" />
                </div>
              ) : isPickupState ? (
                /* ===== 픽업 상태 ===== */
                <div className="flex flex-col gap-2">
                  {poiDrops.map((drop) => (
                    <button
                      key={drop.id}
                      onClick={() => setSelectedDrop(drop)}
                      className="w-full flex items-center gap-[var(--spacing-16)] px-[var(--spacing-16)] py-[var(--spacing-8)] rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] active:scale-[0.98] transition-transform duration-100 text-left"
                    >
                      <div className="w-11 h-11 rounded-[var(--radius-cards)] flex-shrink-0 overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-center">
                        {drop.badge_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={drop.badge_image_url} alt={drop.badge_name} className="w-full h-full object-contain p-0.5" />
                        ) : (
                          <MedalIcon className="w-5 h-5 text-text-inverse/40" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">{drop.badge_name}</p>
                        <p className="text-[11px] text-text-inverse/40 mt-0.5">
                          {drop.is_ambient ? d.drops.foundNearby : t(d.drops.droppedBy, { name: drop.dropper_name ?? d.drops.anonymous })}
                        </p>
                      </div>
                      <ChevronRightIcon className="w-5 h-5 text-text-inverse/40 shrink-0" />
                    </button>
                  ))}
                </div>
              ) : showInventory ? (
                /* ===== 드랍: 인벤토리 그리드 ===== */
                pendingDropItem ? (
                  /* 인앱 확인 UI (네이티브 confirm 대체) */
                  <div className="flex flex-col items-center gap-[var(--spacing-16)] py-[var(--spacing-16)]">
                    <div className="w-20 h-20 rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] overflow-hidden flex items-center justify-center">
                      {pendingDropItem.badgeImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pendingDropItem.badgeImageUrl} alt={pendingDropItem.badgeName} className="w-full h-full object-contain p-1" />
                      ) : (
                        <MedalIcon className="w-8 h-8 text-text-inverse/40" />
                      )}
                    </div>
                    <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center whitespace-pre-line">
                      {t(d.drops.confirmDrop, { name: pendingDropItem.badgeName })}
                    </p>
                    <div className="flex gap-2 w-full">
                      <Button fullWidth variant="outline" surface="sub" onClick={() => setPendingDropItem(null)} disabled={dropping}>
                        {d.drops.cancel}
                      </Button>
                      <Button fullWidth surface="sub" loading={dropping} onClick={executeDrop}>
                        {d.drops.dropButton}
                      </Button>
                    </div>
                  </div>
                ) : inventoryLoading ? (
                  <div className="flex justify-center py-[var(--spacing-32)]">
                    <div className="w-5 h-5 border border-current border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : dropGridItems.length === 0 ? (
                  <p className="text-center text-text-inverse/50 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] py-[var(--spacing-32)]">{d.drops.dropNoItems}</p>
                ) : (
                  <InventoryGrid items={dropGridItems} mode="select" onSelect={(item) => setPendingDropItem(item)} />
                )
              ) : (
                /* ===== 드랍: 안내 + [드랍] 버튼 ===== */
                <div className="flex flex-col items-center gap-[var(--spacing-16)] py-[var(--spacing-16)]">
                  <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 text-center">{d.drops.dropEmptyTitle}</p>
                  <Button fullWidth surface="sub" onClick={openInventory}>
                    {d.drops.dropHereButton}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 배지 상세 오버레이 (픽업) */}
      {selectedDrop && (
        <BadgeDetailSheet
          drop={selectedDrop}
          poiName={selectedPoi?.name ?? ''}
          pickingUp={pickingUp}
          onPickup={executePickup}
          onCancel={() => setSelectedDrop(null)}
        />
      )}
    </div>
  )
}
