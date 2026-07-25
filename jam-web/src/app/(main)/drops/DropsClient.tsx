'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import InventoryGrid, { InventoryGridItem } from '@/components/inventory/InventoryGrid'
import BadgeDetailSheet, { PickupDrop } from './BadgeDetailSheet'
import type { PoiMarker } from '@/components/map/MapView'

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

  // 위치 획득
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError('이 브라우저는 위치 기능을 지원하지 않아요.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
      },
      () => setLocError('위치 권한을 허용해 주세요.')
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
      toast('POI 로드 실패', 'error')
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
    if (!res.ok) throw new Error(json.error ?? '드랍 목록 로드 실패')
    return (json.drops ?? []) as PickupDrop[]
  }, [])

  // POI 선택 → GET /api/drops/poi/[poiId]로 상태 판별
  const handlePoiSelect = useCallback(async (poiId: string) => {
    const poi = pois.find((p) => p.id === poiId)
    if (!poi) return
    if (!poi.in_drop_range) {
      toast(`${poi.name}까지 ${poi.distance_meters}m — 50m 이내로 이동하면 드랍/픽업할 수 있어요`, 'error')
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
      toast(e instanceof Error ? e.message : '드랍 목록 로드 실패', 'error')
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
      toast('인벤토리 로드 실패', 'error')
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
        toast(err.error ?? '드랍 실패', 'error')
        return
      }
      toast('드랍 완료!', 'success')
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
      toast('드랍 실패', 'error')
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
          already_picked_up: '이미 픽업된 아이템이에요',
          inventory_full: '인벤토리가 꽉 찼어요',
        }
        toast(msg[err.error] ?? err.error ?? '픽업 실패', 'error')
        return
      }
      toast('픽업 완료! 인벤토리를 확인해보세요.', 'success')
      // 상세 오버레이 닫고 목록에서 제거
      const pickedId = selectedDrop.id
      setSelectedDrop(null)
      setPoiDrops((prev) => (prev ? prev.filter((d) => d.id !== pickedId) : prev))
      loadNearbyPois()
    } catch {
      toast('픽업 실패', 'error')
    } finally {
      setPickingUp(false)
    }
  }

  // ===== 렌더 =====

  if (locError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center bg-jam-orange">
        <div className="text-4xl">📍</div>
        <p className="text-jam-ink/70 text-sm font-bold">{locError}</p>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </div>
    )
  }

  if (userLat === null || userLng === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 bg-jam-orange">
        <div className="w-6 h-6 border-2 border-jam-ink border-t-transparent rounded-full animate-spin" />
        <p className="text-jam-ink/60 text-sm font-bold">위치 확인 중...</p>
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

  const isPickupState = (poiDrops?.length ?? 0) > 0

  return (
    <div className="relative h-full bg-jam-orange overflow-hidden">
      {/* 지도 — 풀스크린 */}
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
        <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] left-1/2 -translate-x-1/2 z-10 bg-white/80 rounded-full px-3 py-1.5 backdrop-blur-sm border-2 border-jam-ink flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-jam-ink border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-jam-ink">주변 탐색 중</span>
        </div>
      )}

      {!poisLoading && pois.length === 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-jam-cream rounded-2xl px-4 py-3 text-jam-ink/70 text-sm font-bold text-center whitespace-nowrap border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616]">
          주변 500m에 드랍/픽업 가능한 장소가 없어요
        </div>
      )}
      {!poisLoading && pois.length > 0 && !pois.some((p) => p.in_drop_range) && !selectedPoi && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-jam-cream rounded-2xl px-4 py-3 text-jam-ink/70 text-sm font-bold text-center whitespace-nowrap border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616]">
          장소로 50m 이내에 가면 드랍/픽업할 수 있어요
        </div>
      )}

      {/* POI 바텀시트 — 상태 분기 */}
      {selectedPoi && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4">
          <div className="bg-white rounded-[1.75rem] border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616] overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b-[3px] border-jam-ink">
              <div className="min-w-0">
                <p className="text-xs text-jam-ink/50 mb-0.5 font-semibold truncate">{selectedPoi.name}</p>
                <p className="text-sm font-black text-jam-ink">
                  {poiLoading ? '확인 중...' : isPickupState ? '픽업할 아이템' : '이 장소'}
                </p>
              </div>
              <button onClick={closeSheet} className="text-jam-ink/50 p-1 shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-4">
              {poiLoading || poiDrops === null ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-jam-ink border-t-transparent rounded-full animate-spin" />
                </div>
              ) : isPickupState ? (
                /* ===== 픽업 상태 ===== */
                <div className="flex flex-col gap-2">
                  {poiDrops.map((drop) => (
                    <button
                      key={drop.id}
                      onClick={() => setSelectedDrop(drop)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border-[3px] border-jam-ink bg-jam-cream active:shadow-none active:translate-x-[2px] active:translate-y-[2px] shadow-[3px_3px_0_0_#161616] transition-all text-left"
                    >
                      <div className="w-11 h-11 rounded-xl bg-white flex-shrink-0 overflow-hidden border-2 border-jam-ink/20">
                        {drop.badge_image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={drop.badge_image_url} alt={drop.badge_name} className="w-full h-full object-contain p-0.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-jam-ink truncate">{drop.badge_name}</p>
                        <p className="text-xs text-jam-ink/40 mt-0.5 font-semibold">
                          {drop.is_ambient ? '이 근처에서 발견됨' : `${drop.dropper_name ?? '익명'}이(가) 드랍`}
                        </p>
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5 text-jam-ink/40 shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              ) : showInventory ? (
                /* ===== 드랍: 인벤토리 그리드 ===== */
                pendingDropItem ? (
                  /* 인앱 확인 UI (네이티브 confirm 대체) */
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="w-20 h-20 rounded-2xl bg-jam-cream border-[3px] border-jam-ink overflow-hidden flex items-center justify-center">
                      {pendingDropItem.badgeImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pendingDropItem.badgeImageUrl} alt={pendingDropItem.badgeName} className="w-full h-full object-contain p-1" />
                      ) : (
                        <span className="text-3xl">🏷️</span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-jam-ink text-center">
                      &lsquo;{pendingDropItem.badgeName}&rsquo;을(를)<br />여기에 드랍하시겠습니까?
                    </p>
                    <div className="flex gap-2 w-full">
                      <Button fullWidth variant="secondary" onClick={() => setPendingDropItem(null)} disabled={dropping}>
                        취소
                      </Button>
                      <Button fullWidth loading={dropping} onClick={executeDrop}>
                        드랍하기
                      </Button>
                    </div>
                  </div>
                ) : inventoryLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-5 h-5 border-2 border-jam-ink border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : dropGridItems.length === 0 ? (
                  <p className="text-center text-jam-ink/50 text-sm py-8 font-semibold">드랍할 아이템이 없어요</p>
                ) : (
                  <InventoryGrid
                    items={dropGridItems}
                    mode="select"
                    onSelect={(item) => setPendingDropItem(item)}
                  />
                )
              ) : (
                /* ===== 드랍: 안내 + [드랍] 버튼 ===== */
                <div className="flex flex-col items-center gap-3 py-4">
                  <span className="text-4xl">📦</span>
                  <p className="text-sm font-bold text-jam-ink/60 text-center">아직 아이템이 없어요</p>
                  <Button fullWidth size="lg" onClick={openInventory}>
                    여기에 드랍하기
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
