'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import SafeImage from '@/components/SafeImage'
import { FIRST_SCREEN_GALLERY_COUNT } from '@/lib/imageSrc'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { MedalIcon, ArrowDownIcon } from '@/components/ui/icons'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card } from '@/components/ui/Card'
import { RarityBadge } from '@/components/ui/RarityBadge'
import { LockedTile } from '@/components/ui/LockedTile'
import { Carousel } from '@/components/ui/Carousel'
import type { InventoryGridItem } from '@/components/inventory/InventoryGrid'
import type { ItemCandidate } from '@/components/inventory/ItemCandidateRow'
import ItemCandidateSheet from '@/components/inventory/ItemCandidateSheet'
import BadgeDetailSheet, { PickupDrop } from '@/app/(main)/drops/BadgeDetailSheet'
import { useRevealOnMount } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import type { NearbyPoi } from '@/types/drops'
import type { BadgeRarity } from '@/types/database'
import { d, t } from '@/lib/i18n'
import { trackEvent } from '@/lib/analytics/gtag'
import { isLockedItemBody } from '@/lib/inventory/locked-item-block'
import { isSuspendedBody } from '@/lib/suspension/suspended-block'
import { pickupBlockKind } from '@/lib/drop/pickup-block-contract'

// 20260820_018: 드랍(지도) POI 모달 캐러셀 개편
// 기존 하단 고정 바텀시트를 대체하는 화면 중앙 모달 — 캐러셀 아이템 자체가
// 모달 카드다(모달과 캐러셀이 분리된 두 컴포넌트가 아님). 중앙 카드 = 선택된 POI.

export interface InventoryItem {
  id: string
  badge_id: string
  badge_name: string
  badge_rarity: string
  badge_image_url: string | null
  // 20260908_0040: 드랍 시트가 같은 배지의 여러 개체를 구분할 수 있게 API가 함께 내려준다.
  serial_prefix: string | null
  serial_number: number
  expires_at: string | null
  /**
   * 잠긴 개체(티켓 20261018_1817). 서버(`/api/inventory/items`)가 이름·그림·일련번호 접두사를 비우고 이 값과 등급, 여는 데 필요한 포인트만 싣는다.
   * 열린 개체에는 이 키가 없다. 화면은 잠긴 개체의 이름·그림·일련번호를 어떤 props에도 넣지 않는다.
   */
  locked?: boolean
  /** 잠긴 개체를 여는 데 필요한 포인트(배정 때 고정). 개체 선택 시트 행의 구분 값으로만 쓴다 */
  unlock_points_required?: number | null
}

/** 같은 badge_id를 가진 드랍 후보 개체 묶음 — 20260908_0040. 잠긴 개체는 서버 합성 키 `locked:{등급}`로 등급별 한 묶음이 된다. */
interface DropGroup {
  badgeId: string
  badgeName: string
  badgeRarity: string
  badgeImageUrl: string | null
  /** 잠긴 개체 묶음인가 — 행이 `LockedTile`·«잠긴 아이템 배지»·등급 칩만 그린다 */
  locked: boolean
  items: InventoryItem[]
}

/** 드랍 확인 단계가 쓰는 개체 — 잠긴 개체는 `locked`로 이름·그림 대신 잠금 타일을 그린다. */
type PendingDropItem = InventoryGridItem & { locked?: boolean }

/** 드랍 목록 행이 쓰는 묶음 항목 */
type DropGridItem = InventoryGridItem & { locked?: boolean }

/**
 * 개체 하나를 드랍 확인 단계(`pendingDropItem`)가 쓰는 정규화 형태로 변환한다.
 * 잠긴 개체는 서버가 비운 값을 읽지 않고 고정 이름만 쓴다 — 이름·그림·일련번호를 확인 단계 props에 넣지 않는다(운영 로직 7.3절).
 */
function toGridItem(item: InventoryItem): PendingDropItem {
  if (item.locked === true) {
    return { id: item.id, badgeName: d.lockedItem.card.name, badgeImageUrl: null, badgeRarity: item.badge_rarity, locked: true }
  }
  return {
    id: item.id,
    badgeName: item.badge_name,
    badgeImageUrl: item.badge_image_url,
    badgeRarity: item.badge_rarity,
  }
}

/** 개체 선택 시트 행의 입력으로 변환한다. 잠긴 개체는 일련번호·만료일을 넘기지 않고 필요한 포인트만 넘긴다. */
function toCandidate(item: { id: string; serial_number: number | null; serial_prefix: string | null; expires_at: string | null; locked?: boolean; unlock_points_required?: number | null }): ItemCandidate {
  if (item.locked === true) {
    return { id: item.id, serial_number: 0, serial_prefix: null, expires_at: null, locked: true, unlock_points_required: item.unlock_points_required ?? null }
  }
  // 마이그레이션 이전 완료된 과거 드랍 등 원본 개체 연결이 소급되지 않은 극히 드문 레거시 데이터만 serial_number가 null일 수 있다.
  // ItemCandidate 셰이프는 number를 요구하므로 0으로 안전하게 폴백한다.
  return { id: item.id, serial_number: item.serial_number ?? 0, serial_prefix: item.serial_prefix, expires_at: item.expires_at }
}

/** 같은 badge_id를 가진 픽업 후보(다른 사람이 드랍한 개체) 묶음 — 20260908_0223. */
interface PickupGroup {
  badgeId: string
  badgeName: string
  badgeRarity: string
  badgeImageUrl: string | null
  /** 잠긴 개체 묶음인가 — 행이 `LockedTile`·«잠긴 아이템 배지»·등급 칩만 그리고 만료 칩은 없다 */
  locked: boolean
  items: PickupDrop[]
}

/**
 * 픽업 목록(POI에 드랍된 개체 flat 배열)을 badge_id별로 묶는다 — 20260908_0040의 `dropGroups`
 * 빌드 루프와 같은 패턴(20260908_0223). 목록은 API가 이미 `dropped_at` 오름차순으로 내려주므로
 * 그룹 내 순서도 먼저 드랍된 순서를 유지한다.
 */
function groupPickupDrops(drops: PickupDrop[]): PickupGroup[] {
  const groups: PickupGroup[] = []
  const byBadgeId = new Map<string, PickupGroup>()
  for (const drop of drops) {
    const existing = byBadgeId.get(drop.badge_id)
    if (existing) {
      existing.items.push(drop)
      continue
    }
    const locked = drop.locked === true
    const group: PickupGroup = {
      badgeId: drop.badge_id,
      badgeName: locked ? d.lockedItem.card.name : drop.badge_name,
      badgeRarity: drop.badge_rarity,
      badgeImageUrl: locked ? null : drop.badge_image_url,
      locked,
      items: [drop],
    }
    byBadgeId.set(drop.badge_id, group)
    groups.push(group)
  }
  // 잠긴 묶음은 열린 묶음 뒤에 둔다(티켓 20261018_1817). 각 쪽의 서로 간 순서는 그대로다.
  return [...groups.filter((g) => !g.locked), ...groups.filter((g) => g.locked)]
}

/** 포커스 트랩이 순환 대상으로 삼는 요소 셀렉터 — `BottomSheet.tsx`(20260908_0040)와 동일 정의.
 *  이 모달은 BottomSheet를 쓰지 않는 별도 오버레이 구현이라 접근성 로직을 자체적으로
 *  갖는다(20260908_1754). */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 최초 공개 카드 수 + 윈도우가 확장될 때마다 추가되는 카드 수 */
const INITIAL_WINDOW_SIZE = 3
const WINDOW_STEP = 3

const KNOWN_RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/**
 * 지점 카드 크기 고정(티켓 20261114_2352). 본문 슬롯 높이(2행)는 칩이 있는 칸의 높이를 기준으로 이 값에서 계산한다. 갤러리 칸 자체는 내용 높이를 따르고, 칩이 있을 때의 높이가 이 값과 같다(티켓 20261117_1822).
 * 썸네일이 칸 폭에서 좌우 여백 4를 뺀 정사각형이라(티켓 20261115_2045) 칸 높이는 칸 폭에 따라 달라진다. 그래서 값을 px 상수가 아니라
 * 본문 슬롯 래퍼(`container-type: inline-size`)의 폭(`cqw`)으로 계산한다: 칸 폭 = (슬롯 폭 − 열 간격 2×8) ÷ 3,
 * 칸 높이 = 위 여백 4 + 썸네일(칸 폭 − 8) + 이름 위 간격 8 + 이름 2줄 30 + 간격 4 + 칩 줄 24 + 아래 여백 4 = 칸 폭 + 66(여백이 8에서 4로 줄어든 만큼 썸네일이 커져 합은 같다).
 * 375 폭 화면에서 칸 폭 약 87이면 칸 높이는 약 153이다. 실렌더 `offsetHeight` 실측으로 확인한다.
 */
const GALLERY_GAP = 8
const GALLERY_CELL_H = `calc((100cqw - ${GALLERY_GAP * 2}px) / 3 + 66px)`
const GALLERY_H = `calc(${GALLERY_CELL_H} * 2 + ${GALLERY_GAP}px)`
/** 「여기에 드랍」·[취소][드랍] 버튼 줄이 들어가는 슬롯 높이(버튼이 없는 상태에서도 비워 둔다) */
const BUTTON_SLOT_H = 48

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
  const modalRef = useRef<HTMLDivElement>(null)

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

  // 20260908_1754: 포커스 트랩·복귀·Escape 닫기 — `BottomSheet.tsx`(20260908_0040)와 같은
  // 패턴. 이 모달은 부모가 조건부 렌더로 마운트/언마운트하므로(별도 `open` prop 없음)
  // 마운트 시 1회만 적용한다. `onClose`는 호출부에서 인라인 화살표로 넘어와 매 렌더
  // 새 아이덴티티를 가지므로 ref로 최신 값만 참조하고 effect 의존성에서는 뺀다.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    const modalEl = modalRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusFirst = () => {
      const focusable = modalEl?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      const first = focusable?.[0]
      if (first) first.focus()
      else modalEl?.focus()
    }
    focusFirst()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !modalEl) return

      const focusable = Array.from(modalEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) {
        e.preventDefault()
        modalEl.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !modalEl.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last || !modalEl.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [])

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
      // ADR 0001(티켓 20260915_2241): 서버가 완성한 문구를 그대로 신뢰해 노출한다
      // (이전에는 서버 응답을 무시하고 이 컴포넌트가 고정 문구로 덮어썼다).
      if (!res.ok) {
        toast(json.error ?? d.drops.loadDropsFailed, 'error')
        return
      }
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
  const [pendingDropItem, setPendingDropItem] = useState<PendingDropItem | null>(null)
  const [dropping, setDropping] = useState(false)
  /** 그룹(같은 배지)의 개체가 2개 이상일 때 여는 개체 선택 시트의 대상 — 20260908_0040. */
  const [dropCandidateGroup, setDropCandidateGroup] = useState<DropGroup | null>(null)
  /** 픽업 목록 그룹(같은 배지를 여러 명이 드랍)의 개체 선택 시트 대상 — 20260908_0223. */
  const [pickupCandidateGroup, setPickupCandidateGroup] = useState<PickupGroup | null>(null)

  // 카드가 바뀌면 이전 카드에서 진행 중이던 드랍 플로우를 초기화한다.
  // react.dev의 "prop 변경 시 렌더 중 state 조정" 패턴 — effect 없이 렌더 중
  // 조건부로 setState (react-hooks/set-state-in-effect 정리, 동작 동일).
  const [prevActivePoiIdForDropFlow, setPrevActivePoiIdForDropFlow] = useState(activePoi?.id)
  if (activePoi?.id !== prevActivePoiIdForDropFlow) {
    setPrevActivePoiIdForDropFlow(activePoi?.id)
    setShowInventory(false)
    setInventoryItems([])
    setPendingDropItem(null)
    setDropCandidateGroup(null)
    setPickupCandidateGroup(null)
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

  /**
   * 드랍 그리드에서 배지 종류(그룹) 카드를 골랐을 때. 개체가 1개면 지금까지와 동일하게
   * 즉시 드랍 확인 단계로 진행하고, 2개 이상이면 일련번호로 구분하는 개체 선택 시트를
   * 연다(20260908_0040 — 장착 시트가 이미 쓰는 "후보 1개는 즉시, 2개 이상은 시트" 규칙과
   * 동일). 시트에서 고른 개체도 결국 이 확인 단계로 합류한다 — 새 확인 단계를 만들지 않는다.
   */
  function handleSelectDropGroup(group: DropGroup) {
    if (group.items.length === 1) {
      setPendingDropItem(toGridItem(group.items[0]))
      return
    }
    setDropCandidateGroup(group)
  }

  /** 개체 선택 시트에서 하나를 골랐을 때 — 기존 드랍 확인 단계로 넘기고 시트를 닫는다. */
  function handleSelectDropCandidate(item: InventoryItem) {
    setPendingDropItem(toGridItem(item))
    setDropCandidateGroup(null)
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
        // ADR 0001(티켓 20260915_2241): 서버(api/drops POST)가 이미 완성된 사용자 문구를
        // 돌려준다 — 여기서 코드를 문구로 재매핑하지 않고 그대로 신뢰해 노출한다.
        const err = await res.json()
        // 잠긴 개체는 «지금은 드랍할 수 없다»는 안내다 — 사용자가 잘못한 것이 아니라 error 톤으로 내지 않는다(티켓 20261018_0056).
        // 그 밖의 실패는 기존대로 error다.
        // 이용 정지도 «지금은 안 되는 까닭»이라 info 토스트만 낸다(티켓 20261018_1817).
        toast(err.error ?? d.drops.dropFailed, isLockedItemBody(res.status, err) || isSuspendedBody(res.status, err) ? 'info' : 'error')
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
  /**
   * 픽업이 막힌 까닭의 인라인 안내(티켓 20261018_1817). 가득 참은 안내만 보이고 [픽업]은 다시 누를 수 있다(칸을 비운 뒤 다시 시도).
   * 장소 차단은 안내와 함께 [픽업]을 비활성으로 둔다. 시트를 열거나 닫을 때 비운다.
   */
  const [pickupNotice, setPickupNotice] = useState<{ kind: 'inventory_full' | 'poi_blocked'; message: string } | null>(null)

  function openPickupSheet(drop: PickupDrop) {
    setPickupNotice(null)
    setSelectedDrop(drop)
  }

  function closePickupSheet() {
    setPickupNotice(null)
    setSelectedDrop(null)
  }

  /**
   * 픽업 목록에서 배지 종류(그룹) 행을 골랐을 때 — 20260908_0223. 개체가 1개면 지금까지와
   * 완전히 동일하게 즉시 픽업 상세 바텀시트(`BadgeDetailSheet`)로 진행하고, 2개 이상이면
   * 일련번호로 구분하는 개체 선택 시트를 연다(드랍 쪽 `handleSelectDropGroup`과 동일 원칙).
   * 시트에서 고른 개체도 결국 같은 `selectedDrop`으로 합류한다 — 새 확인 단계를 만들지 않는다.
   */
  function handleSelectPickupGroup(group: PickupGroup) {
    if (group.items.length === 1) {
      openPickupSheet(group.items[0])
      return
    }
    setPickupCandidateGroup(group)
  }

  /** 픽업 개체 선택 시트에서 하나를 골랐을 때 — 기존 픽업 상세 바텀시트로 넘기고 시트를 닫는다. */
  function handleSelectPickupCandidate(drop: PickupDrop) {
    openPickupSheet(drop)
    setPickupCandidateGroup(null)
  }

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
        // ADR 0001(티켓 20260915_2241): 서버(api/drops/[dropId]/pickup)가 이미 완성된
        // 사용자 문구를 돌려준다 — 여기서 코드를 문구로 재매핑하지 않고 그대로 신뢰해 노출한다.
        const err = await res.json()
        // 사용자가 잘못한 것이 아니라 «지금은 안 되는 까닭»인 막힘은 error가 아니라 안내로 낸다(티켓 20261018_1817).
        // 가득 참·장소 차단은 시트 안 인라인 안내, 이용 정지·이미 누가 픽업함은 info 토스트, 사라진 드랍(꺼진 장소 포함)은 info 토스트 뒤 카드를 닫는다.
        switch (pickupBlockKind(res.status, err)) {
          case 'inventory_full':
            setPickupNotice({ kind: 'inventory_full', message: err.error ?? d.drops.pickupInventoryFull })
            return
          case 'poi_blocked':
            setPickupNotice({ kind: 'poi_blocked', message: err.error ?? d.drops.pickupPoiBlocked })
            return
          case 'suspended':
            toast(err.error ?? d.suspension.pickupBlocked, 'info')
            return
          case 'already_picked_up':
            toast(err.error ?? d.drops.pickupAlreadyDone, 'info')
            return
          case 'drop_gone':
            toast(err.error ?? d.drops.pickupDropNotFound, 'info')
            closePickupSheet()
            onClose()
            return
          default:
            toast(err.error ?? d.drops.pickupFailed, 'error')
            return
        }
      }
      toast(d.drops.pickupSuccess, 'success')
      trackEvent('item_pickup', { poi_id: activePoi.id, drop_id: selectedDrop.id, badge_id: selectedDrop.badge_id })
      const pickedId = selectedDrop.id
      const poiId = activePoi.id
      closePickupSheet()
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

  // 드랍 그리드는 개체가 아니라 배지 종류(badge_id)별로 묶은 카드 1장이다(20260908_0040) —
  // 원래도 드랍 대상은 "개체"였지만(그리드가 개체 1:1 매핑) 같은 배지를 여러 개 가져도
  // 구분할 수단이 없었다. 묶음을 클릭하면 개체가 1개면 즉시, 2개 이상이면 개체 선택 시트로
  // 이어진다(handleSelectDropGroup).
  const dropGroups: DropGroup[] = []
  const dropGroupByBadgeId = new Map<string, DropGroup>()
  for (const it of inventoryItems) {
    const existing = dropGroupByBadgeId.get(it.badge_id)
    if (existing) {
      existing.items.push(it)
      continue
    }
    const locked = it.locked === true
    const group: DropGroup = {
      badgeId: it.badge_id,
      badgeName: locked ? d.lockedItem.card.name : it.badge_name,
      badgeRarity: it.badge_rarity,
      badgeImageUrl: locked ? null : it.badge_image_url,
      locked,
      items: [it],
    }
    dropGroupByBadgeId.set(it.badge_id, group)
    dropGroups.push(group)
  }

  // 잠긴 묶음은 열린 묶음 뒤에 둔다(티켓 20261018_1817). 각 쪽의 서로 간 순서는 그대로다.
  const orderedDropGroups = [...dropGroups.filter((g) => !g.locked), ...dropGroups.filter((g) => g.locked)]

  const dropGridItems: DropGridItem[] = orderedDropGroups.map((group) => ({
    id: group.badgeId,
    badgeName: group.badgeName,
    badgeImageUrl: group.badgeImageUrl,
    badgeRarity: group.badgeRarity,
    count: group.items.length,
    countAriaText: t(d.drops.dropOwnedCountAria, { count: String(group.items.length) }),
    locked: group.locked,
  }))

  function handleSelectDropGridItem(item: InventoryGridItem) {
    const group = dropGroupByBadgeId.get(item.id)
    if (group) handleSelectDropGroup(group)
  }

  if (visiblePois.length === 0) return null

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={d.drops.poiCarouselAriaLabel}
      tabIndex={-1}
      className="fixed inset-0 z-30"
      style={{ maxWidth: 430, margin: '0 auto' }}
    >
      {/* 배경 오버레이 — 탭하면 닫힘 */}
      <div ref={backdropRef} className="absolute inset-0 bg-backdrop t-panel-backdrop" data-open="false" onClick={onClose} />

      {/*
        20260820_022: 화면 세로 중앙(justify-center) → TabBar 바로 위 고정(justify-end)으로
        변경. paddingBottom은 TabBar(bottom: safe-area+16px, height 64px) 위 12px 여백을 더한
        값 — BottomSheet.tsx/BadgeDetailSheet.tsx의 footer 패딩과 동일한 관례를 따른다.
        카드 높이는 상태·묶음 수와 무관하게 고정이다(20261114_2352, `PoiCard` 본문 슬롯).
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
            ariaLabel={d.drops.poiCarouselListAriaLabel}
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
                onSelectDropItem={isActive ? handleSelectDropGridItem : undefined}
                onCancelPending={isActive ? () => setPendingDropItem(null) : undefined}
                onConfirmDrop={isActive ? executeDrop : undefined}
                onSelectPickupGroup={isActive ? handleSelectPickupGroup : undefined}
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
          onCancel={closePickupSheet}
          notice={pickupNotice?.message ?? null}
          pickupDisabled={pickupNotice?.kind === 'poi_blocked'}
        />
      )}

      {/* 드랍 개체 선택 시트 — 같은 배지를 2개 이상 보유했을 때만 열린다(20260908_0040).
          장착·픽업 개체 선택 시트와 공유하는 ItemCandidateSheet를 쓴다(20260908, 세 번째
          사용처 시점에 공용 컴포넌트로 추출 — 사용자 지시). 여기서 개체를 고르면 기존 드랍
          확인 단계(pendingDropItem)로 그대로 합류한다 — 이 시트 자체는 API를 호출하지
          않으므로 진행 중 상태·행 억제가 필요 없다. */}
      <ItemCandidateSheet
        open={dropCandidateGroup != null}
        onClose={() => setDropCandidateGroup(null)}
        badgeName={dropCandidateGroup?.badgeName}
        rarity={
          dropCandidateGroup && KNOWN_RARITIES.includes(dropCandidateGroup.badgeRarity as BadgeRarity)
            ? (dropCandidateGroup.badgeRarity as BadgeRarity)
            : 'common'
        }
        badgeImageUrl={dropCandidateGroup?.badgeImageUrl}
        candidates={(dropCandidateGroup?.items ?? []).map(toCandidate)}
        onSelect={(candidate) => {
          const item = dropCandidateGroup?.items.find((it) => it.id === candidate.id)
          if (item) handleSelectDropCandidate(item)
        }}
      />

      {/* 픽업 개체 선택 시트 — 같은 배지를 2명 이상이 드랍해 2개 이상 쌓였을 때만 열린다
          (20260908_0223). 위 드랍 개체 선택 시트와 같은 ItemCandidateSheet를 재사용한다.
          여기서 개체를 고르면 기존 픽업 상세 바텀시트(selectedDrop → BadgeDetailSheet)로
          그대로 합류한다 — 이 시트 자체는 API를 호출하지 않는다. */}
      <ItemCandidateSheet
        open={pickupCandidateGroup != null}
        onClose={() => setPickupCandidateGroup(null)}
        badgeName={pickupCandidateGroup?.badgeName}
        rarity={
          pickupCandidateGroup && KNOWN_RARITIES.includes(pickupCandidateGroup.badgeRarity as BadgeRarity)
            ? (pickupCandidateGroup.badgeRarity as BadgeRarity)
            : 'common'
        }
        badgeImageUrl={pickupCandidateGroup?.badgeImageUrl}
        candidates={(pickupCandidateGroup?.items ?? []).map(toCandidate)}
        onSelect={(candidate) => {
          const drop = pickupCandidateGroup?.items.find((d) => d.id === candidate.id)
          if (drop) handleSelectPickupCandidate(drop)
        }}
      />
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
  pendingDropItem: PendingDropItem | null
  dropping: boolean
  dropGridItems: DropGridItem[]
  onOpenInventory?: () => void
  onSelectDropItem?: (item: InventoryGridItem) => void
  onCancelPending?: () => void
  onConfirmDrop?: () => void
  /** 픽업 목록의 배지 종류(그룹) 행을 골랐을 때 — 20260908_0223. */
  onSelectPickupGroup?: (group: PickupGroup) => void
  onClose: () => void
}

/** 캐러셀 카드 한 장 — 잠긴 개체 드랍 확인 단계의 마크업을 서버 렌더로 고정하는 테스트가 직접 가져온다(티켓 20261018_1817). */
export function PoiCard({
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
  onSelectPickupGroup,
  onClose,
}: PoiCardProps) {
  const spinner = (
    <div className="flex justify-center">
      <div className="w-5 h-5 border border-current border-t-transparent rounded-full animate-spin" />
    </div>
  )
  let body: ReactNode = null
  let footer: ReactNode = null
  if (isActive) {
    if (loading || drops === undefined) {
      body = spinner
    } else if (showInventory) {
      /* ===== 드랍: 인벤토리 갤러리(활성 카드에서만 열림) ===== */
      if (pendingDropItem) {
        body = (
          <div className="flex flex-col items-center gap-4">
            {pendingDropItem.locked ? (
              // 잠긴 개체는 이름·그림 없이 잠금 타일과 등급 칩만 보인다(운영 로직 7.3절, 티켓 20261018_1817).
              <div className="flex flex-col items-center gap-2">
                <LockedTile size={80} />
                <RarityBadge
                  rarity={
                    KNOWN_RARITIES.includes(pendingDropItem.badgeRarity as BadgeRarity)
                      ? (pendingDropItem.badgeRarity as BadgeRarity)
                      : 'common'
                  }
                />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-background-secondary overflow-hidden flex items-center justify-center">
                <SafeImage
                  src={pendingDropItem.badgeImageUrl}
                  alt={pendingDropItem.badgeName}
                  width={80}
                  height={80}
                  eager
                  className="w-full h-full object-contain p-1"
                  fallback={<MedalIcon className="w-8 h-8 text-muted" />}
                />
              </div>
            )}
            <p className="text-base text-center whitespace-pre-line break-keep wrap-break-word">
              {t(d.drops.confirmDrop, { name: pendingDropItem.badgeName })}
            </p>
          </div>
        )
        footer = (
          <div className="flex gap-2 w-full">
            <Button fullWidth variant="secondary" surface="main" onClick={onCancelPending} disabled={dropping}>
              {d.drops.cancel}
            </Button>
            <Button fullWidth surface="main" loading={dropping} onClick={onConfirmDrop}>
              {d.drops.dropButton}
            </Button>
          </div>
        )
      } else if (inventoryLoading) {
        body = spinner
      } else if (dropGridItems.length === 0) {
        body = (
          <EmptyState
            icon={<MedalIcon className="w-8 h-8" />}
            title={d.drops.dropNoItems}
            description={d.drops.dropNoItemsBody}
          />
        )
      } else {
        // 20260908_0217: 픽업 목록과 같은 형태로 통일 — 티켓 20261114_2352에서 둘 다 3열 갤러리로 옮겼다.
        // 버튼 슬롯은 빈 채로 높이만 유지한다(갤러리를 버튼 자리까지 늘리지 않는다).
        body = (
          <PoiBadgeGallery
            cells={dropGridItems.map((item) => ({
              id: item.id,
              name: item.badgeName,
              imageUrl: item.badgeImageUrl,
              rarity: item.badgeRarity,
              count: item.count,
              countAriaText: item.countAriaText,
              locked: item.locked === true,
              onClick: () => onSelectDropItem?.(item),
            }))}
          />
        )
      }
    } else {
      /* ===== 드랍된 배지 목록(있으면) + [여기에 드랍] 액션(항상 함께 노출) — 20260829_2101
         "No broken objects" 위반 수정: 픽업 가능 목록 유무와 드랍 액션 노출 여부를
         독립적인 축으로 분리했다. 목록·버튼 레이블·문구는 기존 것을 그대로 재사용. */
      body =
        drops.length > 0 ? (
          // 20260908_0223: 픽업 목록은 badge_id별 그룹으로 묶는다(같은 배지를 여러 명이 드랍해도 칸 하나 + ×N).
          // 그룹 클릭 시 개체가 1개면 즉시, 2개 이상이면 개체 선택 시트로 이어진다(handleSelectPickupGroup).
          <PoiBadgeGallery
            cells={groupPickupDrops(drops).map((group) => ({
              id: group.badgeId,
              name: group.badgeName,
              imageUrl: group.badgeImageUrl,
              rarity: group.badgeRarity,
              count: group.items.length,
              countAriaText: t(d.drops.pickupAvailableCountAria, { count: String(group.items.length) }),
              locked: group.locked,
              onClick: () => onSelectPickupGroup?.(group),
            }))}
          />
        ) : (
          <EmptyState
            icon={<ArrowDownIcon className="w-8 h-8" />}
            title={d.drops.dropEmptyTitle}
            description={d.drops.dropEmptyBody}
            style={{ padding: 0 }}
          />
        )
      footer = (
        <Button fullWidth surface="main" onClick={onOpenInventory}>
          {d.drops.dropHereButton}
        </Button>
      )
    }
  }

  return (
    <Card
      tone="default"
      className="gap-4"
      style={{
        width: '100%',
        maxWidth: 360,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        opacity: isActive ? 1 : 0.55,
        transform: isActive ? 'scale(1)' : 'scale(0.92)',
        transition:
          'transform var(--poi-carousel-dur) var(--poi-carousel-ease), opacity var(--poi-carousel-dur) var(--poi-carousel-ease)',
      }}
    >
      {/* 헤더 — 닫기 버튼을 카드 안쪽 우측 상단에 배치(20260820_023, 사용자 요청).
          모든 카드가 동일한 onClose를 받아 어느 카드에서 눌러도 전체 모달이 닫힌다. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground truncate">{poi.name}</p>
          <p className="text-xs text-muted mt-0.5">{poi.distance_meters}m</p>
        </div>
        <IconButton icon="close" label={d.common.close} onClick={onClose} surface="light" className="shrink-0 -mt-2 -mr-2" />
      </div>

      {/* 본문 슬롯 — 높이가 상태와 무관하게 `GALLERY_H`로 고정된다(티켓 20261114_2352): 로딩·갤러리·빈 상태·드랍 확인이
          모두 이 안에서 그려지고, 옆 카드(peek)도 같은 높이의 빈 슬롯을 갖는다(`aria-hidden`). 배지 데이터는 이 카드가 중앙(활성)에
          도착한 시점에만 불러온다(20260820_025). 이 캐러셀에는 반경 내(in_drop_range) POI만 들어오므로 반경 밖 안내는 없다. */}
      <div style={{ containerType: 'inline-size' }} aria-hidden={!isActive || undefined}>
        <div style={{ height: GALLERY_H }} className="flex flex-col justify-center">
          {body}
        </div>
      </div>
      {/* 버튼 슬롯 — 버튼이 없는 상태(온보딩 pickup 연출·드랍 선택·로딩·옆 카드)에서도 높이 48을 비워 둔다 */}
      <div className="shrink-0 flex items-center" style={{ height: BUTTON_SLOT_H }} aria-hidden={!isActive || undefined}>
        {footer}
      </div>
    </Card>
  )
}


// ===== 배지 갤러리 (픽업 목록 · 드랍 선택 목록 공용, 티켓 20261114_2352) =====

/** 갤러리 한 칸의 입력 — 두 목록의 데이터를 이 모양으로 정규화해 넘긴다. 만료일은 받지 않는다(갤러리 칸에는 만료 임박을 표시하지 않는다). */
interface PoiBadgeCell {
  id: string
  name: string
  imageUrl: string | null
  /** 미지 등급 값은 'common'으로 폴백한다(기존 관례 유지) */
  rarity: string | null
  /** 2 이상일 때만 ×N 필을 그린다 */
  count?: number | null
  countAriaText?: string
  /** 잠긴 개체 묶음 — 이름·그림을 읽지 않고 `LockedTile`·«잠긴 아이템 배지»·등급 칩만 그린다(운영 로직 7.3절) */
  locked: boolean
  onClick: () => void
}

/**
 * 3열 × 2행 갤러리. 칸 높이는 내용을 따른다(칩이 없는 행은 칩 줄만큼 낮다, 티켓 20261117_1822). 본문 슬롯 높이는 칩이 있는 칸 2행 기준(`GALLERY_H`)으로 고정해 시트 크기가 바뀌지 않는다.
 * 묶음이 6개를 넘으면 이 영역 안에서만 세로 스크롤하고(`overscroll-contain`), 6개 미만이면 앞에서부터 채우며 빈 칸 자리 표시는 없다.
 * 세로 스크롤과 캐러셀 가로 스와이프는 브라우저가 제스처 방향으로 가르므로 `touch-action`을 따로 제한하지 않는다.
 */
function PoiBadgeGallery({ cells }: { cells: PoiBadgeCell[] }) {
  return (
    <div
      className="grid grid-cols-3 gap-2 content-start h-full overflow-y-auto overscroll-contain"
    >
      {cells.map((cell, index) => (
        <BadgeGridCard
          key={cell.id}
          eager={index < FIRST_SCREEN_GALLERY_COUNT}
          compact
          name={cell.name}
          imageUrl={cell.imageUrl}
          rarity={KNOWN_RARITIES.includes(cell.rarity as BadgeRarity) ? (cell.rarity as BadgeRarity) : 'common'}
          count={cell.count}
          countAriaText={cell.countAriaText}
          locked={cell.locked}
          onClick={cell.onClick}
        />
      ))}
    </div>
  )
}
