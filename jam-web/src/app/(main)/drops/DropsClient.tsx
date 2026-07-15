'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
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
  badge_image_url: string
}

interface DropItem {
  id: string
  badge_name: string
  badge_rarity: string
  badge_image_url: string
  dropper_name: string
  dropped_at: string
}

type Mode = 'drop' | 'pickup'
type Step = 'map' | 'select_item' | 'confirm'

const RARITY_COLOR: Record<string, string> = {
  rare: 'text-jam-teal',
  legendary: 'text-jam-purple',
  mythic: 'text-jam-yellow',
}

const RARITY_LABEL: Record<string, string> = {
  rare: 'RARE',
  legendary: 'LEGENDARY',
  mythic: 'MYTHIC',
}

// ===== 컴포넌트 =====

export default function DropsClient() {
  const { toast } = useToast()

  const [mode, setMode] = useState<Mode>('drop')
  const [step, setStep] = useState<Step>('map')

  const [locError, setLocError] = useState<string | null>(null)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)

  const [pois, setPois] = useState<NearbyPoi[]>([])
  const [poisLoading, setPoisLoading] = useState(false)
  const [selectedPoi, setSelectedPoi] = useState<NearbyPoi | null>(null)

  // 드랍 모드: 인벤토리 아이템
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [dropping, setDropping] = useState(false)

  // 픽업 모드: POI 드랍 목록
  const [dropItems, setDropItems] = useState<DropItem[]>([])
  const [dropItemsLoading, setDropItemsLoading] = useState(false)
  const [selectedDrop, setSelectedDrop] = useState<DropItem | null>(null)
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

  // POI 선택 시 아이템 목록 로드
  const handlePoiSelect = useCallback(async (poiId: string) => {
    const poi = pois.find((p) => p.id === poiId)
    if (!poi) return
    if (!poi.in_drop_range) {
      toast(`${poi.name}까지 ${poi.distance_meters}m — 50m 이내로 이동하면 드랍/픽업할 수 있어요`, 'error')
      return
    }
    setSelectedPoi(poi)
    setSelectedItem(null)
    setSelectedDrop(null)

    if (mode === 'drop') {
      setInventoryLoading(true)
      setStep('select_item')
      try {
        const res = await fetch('/api/inventory/items')
        const json = await res.json()
        setInventoryItems(json.items ?? [])
      } catch {
        toast('인벤토리 로드 실패', 'error')
      } finally {
        setInventoryLoading(false)
      }
    } else {
      setDropItemsLoading(true)
      setStep('select_item')
      try {
        const res = await fetch(`/api/drops/poi/${poiId}`)
        const json = await res.json()
        if (!res.ok) {
          toast(json.error ?? '드랍 목록 로드 실패', 'error')
          return
        }
        setDropItems(json.drops ?? [])
      } catch {
        toast('드랍 목록 로드 실패', 'error')
      } finally {
        setDropItemsLoading(false)
      }
    }
  }, [pois, mode, toast])

  // 드랍 실행
  async function executeDrop() {
    if (!selectedPoi || !selectedItem || userLat === null || userLng === null) return
    setDropping(true)
    try {
      const res = await fetch('/api/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poi_id: selectedPoi.id,
          inventory_item_id: selectedItem.id,
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
      setStep('map')
      setSelectedPoi(null)
      setSelectedItem(null)
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
      setStep('map')
      setSelectedPoi(null)
      setSelectedDrop(null)
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

  return (
    <div className="flex flex-col h-full bg-jam-orange">
      {/* 헤더 */}
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-1">
        <h1 className="text-3xl font-black text-jam-ink">드랍 · 픽업</h1>
      </div>

      {/* 모드 탭 */}
      <div className="flex gap-2 px-4 pt-4 pb-3">
        {(['drop', 'pickup'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m)
              setStep('map')
              setSelectedPoi(null)
              setSelectedItem(null)
              setSelectedDrop(null)
            }}
            className={[
              'flex-1 py-2.5 rounded-2xl text-sm font-black transition-all border-[3px] border-jam-ink',
              mode === m
                ? 'bg-jam-ink text-white shadow-[3px_3px_0_0_rgba(0,0,0,0.3)]'
                : 'bg-white text-jam-ink/50',
            ].join(' ')}
          >
            {m === 'drop' ? '드랍' : '픽업'}
          </button>
        ))}
      </div>

      {/* 지도 */}
      <div className="flex-1 px-4 pb-2 relative">
        {poisLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/60 rounded-[1.75rem] mx-4 backdrop-blur-sm">
            <div className="w-5 h-5 border-2 border-jam-ink border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div className="w-full h-full rounded-[1.75rem] overflow-hidden border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616]">
          <MapView
            userLat={userLat}
            userLng={userLng}
            pois={poiMarkers}
            onPoiSelect={handlePoiSelect}
            selectedPoiId={selectedPoi?.id}
          />
        </div>

        {!poisLoading && pois.length === 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-jam-cream rounded-2xl px-4 py-3 text-jam-ink/70 text-sm font-bold text-center whitespace-nowrap border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616]">
            주변 500m에 드랍 가능한 장소가 없어요
          </div>
        )}
        {!poisLoading && pois.length > 0 && !pois.some((p) => p.in_drop_range) && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-jam-cream rounded-2xl px-4 py-3 text-jam-ink/70 text-sm font-bold text-center whitespace-nowrap border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616]">
            장소로 50m 이내에 가면 드랍/픽업할 수 있어요
          </div>
        )}
      </div>

      {/* 바텀시트: 아이템 선택 */}
      {step === 'select_item' && selectedPoi && (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-[1.75rem] border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616] overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b-[3px] border-jam-ink">
              <div>
                <p className="text-xs text-jam-ink/50 mb-0.5 font-semibold">{selectedPoi.name}</p>
                <p className="text-sm font-black text-jam-ink">
                  {mode === 'drop' ? '드랍할 아이템 선택' : '픽업할 아이템 선택'}
                </p>
              </div>
              <button
                onClick={() => { setStep('map'); setSelectedPoi(null) }}
                className="text-jam-ink/50 p-1"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 아이템 목록 */}
            <div className="max-h-52 overflow-y-auto">
              {(mode === 'drop' ? inventoryLoading : dropItemsLoading) ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-jam-ink border-t-transparent rounded-full animate-spin" />
                </div>
              ) : mode === 'drop' ? (
                inventoryItems.length === 0 ? (
                  <p className="text-center text-jam-ink/50 text-sm py-8 font-semibold">드랍할 아이템이 없어요</p>
                ) : (
                  inventoryItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={[
                        'w-full flex items-center gap-3 px-4 py-3 transition-colors text-left',
                        selectedItem?.id === item.id
                          ? 'bg-jam-lime/40 border-l-4 border-jam-ink'
                          : 'hover:bg-jam-ink/5',
                      ].join(' ')}
                    >
                      <div className="w-10 h-10 rounded-xl bg-jam-cream flex-shrink-0 overflow-hidden border-2 border-jam-ink/20">
                        {item.badge_image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.badge_image_url} alt={item.badge_name} className="w-full h-full object-contain p-0.5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-jam-ink truncate">{item.badge_name}</p>
                        {item.badge_rarity !== 'common' && (
                          <p className={`text-xs font-black ${RARITY_COLOR[item.badge_rarity] ?? 'text-jam-ink/40'}`}>
                            {RARITY_LABEL[item.badge_rarity] ?? item.badge_rarity}
                          </p>
                        )}
                      </div>
                      {selectedItem?.id === item.id && (
                        <div className="ml-auto text-jam-ink">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M20.293 5.293a1 1 0 010 1.414l-11 11a1 1 0 01-1.414 0l-5-5a1 1 0 111.414-1.414L8.5 15.586l10.293-10.293a1 1 0 011.5 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))
                )
              ) : (
                dropItems.length === 0 ? (
                  <p className="text-center text-jam-ink/50 text-sm py-8 font-semibold">픽업 가능한 아이템이 없어요</p>
                ) : (
                  dropItems.map((drop) => (
                    <button
                      key={drop.id}
                      onClick={() => setSelectedDrop(drop)}
                      className={[
                        'w-full flex items-center gap-3 px-4 py-3 transition-colors text-left',
                        selectedDrop?.id === drop.id
                          ? 'bg-jam-lime/40 border-l-4 border-jam-ink'
                          : 'hover:bg-jam-ink/5',
                      ].join(' ')}
                    >
                      <div className="w-10 h-10 rounded-xl bg-jam-cream flex-shrink-0 overflow-hidden border-2 border-jam-ink/20">
                        {drop.badge_image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={drop.badge_image_url} alt={drop.badge_name} className="w-full h-full object-contain p-0.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-jam-ink truncate">{drop.badge_name}</p>
                        {drop.badge_rarity !== 'common' && (
                          <p className={`text-xs font-black ${RARITY_COLOR[drop.badge_rarity] ?? 'text-jam-ink/40'}`}>
                            {RARITY_LABEL[drop.badge_rarity] ?? drop.badge_rarity}
                          </p>
                        )}
                        <p className="text-xs text-jam-ink/40 mt-0.5 font-semibold">{drop.dropper_name}이(가) 드랍</p>
                      </div>
                      {selectedDrop?.id === drop.id && (
                        <div className="ml-auto text-jam-ink">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M20.293 5.293a1 1 0 010 1.414l-11 11a1 1 0 01-1.414 0l-5-5a1 1 0 111.414-1.414L8.5 15.586l10.293-10.293a1 1 0 011.5 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))
                )
              )}
            </div>

            {/* 실행 버튼 */}
            {(mode === 'drop' ? selectedItem : selectedDrop) && (
              <div className="px-4 py-3 border-t-[3px] border-jam-ink">
                <Button
                  fullWidth
                  loading={mode === 'drop' ? dropping : pickingUp}
                  onClick={mode === 'drop' ? executeDrop : executePickup}
                >
                  {mode === 'drop'
                    ? `"${selectedItem?.badge_name}" 드랍하기`
                    : `"${selectedDrop?.badge_name}" 픽업하기`}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
