'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import LocalDate from '@/components/LocalDate'
import BadgeGridCard, { BadgeGridCardPlaceholder } from '@/components/ui/BadgeGridCard'
import { FIRST_SCREEN_GRID_COUNT } from '@/lib/imageSrc'
import { ListRowChip } from '@/components/ui/ListRow'
import { d } from '@/lib/i18n'

// 인벤토리 그리드 카드에 필요한 정규화된 아이템 형태.
// - /inventory/page.tsx: `InventoryItemRow & { badge }`를 이 형태로 매핑
// - 드랍 바텀시트: `GET /api/inventory/items`의 플랫 응답을 이 형태로 매핑
// 두 소스의 shape가 달라 공용 컴포넌트는 정규화 타입으로 받는다(API 변경 없음).
export interface InventoryGridItem {
  id: string
  badgeName: string
  badgeImageUrl: string | null
  /** 무한레벨형 배지는 등급이 없다(마이그레이션 130). null이면 등급 칩을 그리지 않는다 */
  badgeRarity: string | null
  expiresAt?: string | null
  /**
   * 그룹 내 개체 수 — 드랍 그리드가 같은 배지의 여러 개체를 카드 1장으로 묶을 때만 쓴다
   * (20260908_0040). 2 이상일 때만 `BadgeGridCard`가 모서리에 ×N을 그린다.
   */
  count?: number | null
  /**
   * `count`가 있을 때의 ×N 접근성 문구 — 호출부가 맥락에 맞는 문구를 만들어 넘긴다
   * (`InventoryGrid`는 두 화면이 공유하는 정규화 컴포넌트라 특정 화면의 i18n 그룹을
   * 이 파일이 직접 알지 않는다, 20260908_0040).
   */
  countAriaText?: string
  /**
   * 잠긴 아이템 배지(열기 전, 티켓 20261018_0054 2회, 운영 로직 7.3절). `true`이면 카드는 `BadgeGridCard locked`로 그려지고
   * `badgeName`·`badgeImageUrl`은 쓰지 않는다. **서버가 이 두 값을 비워서 내려야 한다** — 값이 클라이언트 props와 RSC 페이로드에
   * 실리면 화면에서 가려도 소용이 없다(호출부가 `''`·`null`을 넣는다). `badgeRarity`는 등급 칩으로 그린다.
   */
  locked?: boolean
}

interface InventoryGridProps {
  items: InventoryGridItem[]
  /** navigate: /inventory/[id]로 이동(기존 인벤토리 동작) · select: onSelect(item) 콜백(드랍 바텀시트) */
  mode: 'navigate' | 'select'
  onSelect?: (item: InventoryGridItem) => void
  /** 빈 슬롯 placeholder 개수(인벤토리 페이지에서만 사용). `fillScreen`이 켜져 있으면 그릴 수 있는 최대 개수다 */
  emptySlots?: number
  /**
   * 빈 슬롯을 화면 높이만큼만 그린다(2026-11-27 사용자 지시, 티켓 20261127_0829). 켜면 `emptySlots`는 상한이 되고,
   * 그리드 위쪽 여백과 한 줄 높이를 실측해 «화면 아래 끝까지 줄을 채우는 데 필요한 칸»만 남긴다(마지막 줄은 3칸을 채운다).
   * 첫 렌더(서버 포함)는 옛 규칙(총 6칸)으로 그리고 마운트 직후 페인트 전에 계산값으로 바꾼다.
   */
  fillScreen?: boolean
}

const GRID_COLUMNS = 3
const GRID_GAP_PX = 8
/** `fillScreen` 첫 렌더에 쓰는 총 칸 수 — 옛 규칙과 같다 */
const FILL_SCREEN_INITIAL_TOTAL = 6

/**
 * 희귀도 상태 팔레트 — Phase 2에서 `state_color_palette` 테이블로 이관 예정.
 * [주의] 색상값/매핑을 재조정하지 마세요(유저가 학습한 색 언어 유지).
 * 타일 배경은 항상 아이스 고정 — 코발트 배경 위 반투명 워시는 텍스트와 섞여 대비가 깨진다.
 */
function isExpiringSoon(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

export default function InventoryGrid({
  items,
  mode,
  onSelect,
  emptySlots = 0,
  fillScreen = false,
}: InventoryGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [fillCount, setFillCount] = useState<number | null>(null)

  // 화면 높이 실측: 스크롤 영역(`main`)의 위쪽에서 그리드까지의 거리와 첫 줄 높이로, 화면 아래 끝까지 덮는 줄 수를 구한다.
  // 첫 칸의 높이를 한 줄 높이로 본다(그리드가 한 줄 안 칸 높이를 같게 맞춘다). 칸 수에 기대지 않아 빈 칸을 더해도 값이 흔들리지 않는다.
  const measure = useCallback(() => {
    const grid = gridRef.current
    const firstCell = grid?.firstElementChild as HTMLElement | null
    if (!grid || !firstCell) return
    const scroller = grid.closest('main') as HTMLElement | null
    const scrollerTop = scroller ? scroller.getBoundingClientRect().top : 0
    const scrollTop = scroller ? scroller.scrollTop : window.scrollY
    const gridTop = grid.getBoundingClientRect().top - scrollerTop + scrollTop
    const visibleHeight = window.innerHeight - scrollerTop
    const rowPitch = firstCell.offsetHeight + GRID_GAP_PX
    if (rowPitch <= GRID_GAP_PX) return
    const rows = Math.max(1, Math.ceil((visibleHeight - gridTop + GRID_GAP_PX) / rowPitch))
    setFillCount(rows * GRID_COLUMNS)
  }, [])

  useLayoutEffect(() => {
    if (!fillScreen) return
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [fillScreen, measure, items.length])

  const placeholderCount = fillScreen
    ? Math.min(emptySlots, Math.max(0, (fillCount ?? FILL_SCREEN_INITIAL_TOTAL) - items.length))
    : emptySlots

  return (
    <div ref={gridRef} className="grid grid-cols-3 gap-2">
      {items.map((item, index) => {
        const eager = index < FIRST_SCREEN_GRID_COUNT
        const expiring = isExpiringSoon(item.expiresAt)
        const expiryNode = expiring && item.expiresAt ? (
          // 만료 임박 칩도 ListRowChip 규격(12px·2px 8px·20px)이다. 정본 tone «surface-muted»를 쓴다(티켓 20261126_1408)
          <ListRowChip tone="surface-muted">
            <LocalDate iso={item.expiresAt} options={{ month: 'numeric', day: 'numeric' }} suffix={d.inventory.expiringSuffix} />
          </ListRowChip>
        ) : null

        // 카드 자식은 만료 임박 칩뿐이다. 일련번호를 그리던 분기는 유일한 사용처였던 컬렉션
        // 장착 개체 선택 시트가 `ListRowCard` 목록으로 바뀌면서 제거했다(20260907_2221).
        const cardChildren = expiryNode

        // 잠긴 개체는 이름·그림을 카드에 넘기지 않는다(카드도 막지만 호출부에서 먼저 끊는다) — 운영 로직 7.3절
        const identity = item.locked
          ? { locked: true }
          : { name: item.badgeName, imageUrl: item.badgeImageUrl }

        if (mode === 'navigate') {
          return (
            <BadgeGridCard
              key={item.id}
              href={`/inventory/${item.id}`}
              eager={eager}
              {...identity}
              rarity={item.badgeRarity as import('@/types/database').BadgeRarity | null}
            >
              {cardChildren}
            </BadgeGridCard>
          )
        }

        return (
          <BadgeGridCard
            key={item.id}
            onClick={() => onSelect?.(item)}
            eager={eager}
            {...identity}
            rarity={item.badgeRarity as import('@/types/database').BadgeRarity | null}
            count={item.count}
            countAriaText={item.countAriaText}
          >
            {cardChildren}
          </BadgeGridCard>
        )
      })}
      {/* 빈 슬롯 placeholder — BadgeGridCardPlaceholder가 채운 카드와 동일한 폭·aspect-square·text-sm 기하를 유지한다 */}
      {Array.from({ length: placeholderCount }).map((_, i) => (
        <BadgeGridCardPlaceholder key={`empty-${i}`} />
      ))}
    </div>
  )
}
