'use client'

import LocalDate from '@/components/LocalDate'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import { ItemSerialCode } from '@ds/components/patterns/ItemSerialCode'
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
   * 개체 일련번호(`(serial_prefix ?? '????') + zero-pad 6자리`). 값이 있을 때만 카드 하단에
   * `ItemSerialCode`를 그린다 — 같은 배지 여러 개 중 하나를 골라야 하는 화면(컬렉션 장착
   * 개체 선택 시트, 20260907_2059)에서만 쓰고, 일반 인벤토리 목록·드랍 시트는 넘기지 않는다.
   */
  serial?: string
}

/**
 * 카드 안의 `ItemSerialCode` 높이(px). **1열(`columns=1`) 전용 값이다** — serial을 넘기는
 * 호출부(컬렉션 장착 개체 선택 시트)가 1열이기 때문이다.
 *
 * 값의 근거(추정 아님, Chromium 실렌더 `offsetWidth` 측정, 20260907_2059):
 *   - `ItemSerialCode` 총 폭 = height × 5.31 (4자리 알파벳 타일 + 6자리 숫자 타일 + 간격)
 *   - 3열 · 360px 뷰포트 카드의 클리핑 경계(padding box)는 **100px**이라, height 20이면
 *     106px가 되어 6px 잘린다. 3열에서는 height 20 이상을 쓸 수 없다
 *   - 1열 · 360px 뷰포트는 카드 콘텐츠 폭 300px / 클리핑 경계 324px → height 40이면 212px로
 *     여유 있게 들어간다
 *   - 40을 고른 이유: `ItemSerialCode`의 자간 보간 하한이 fontSize 20(=height 40)이라
 *     그 아래로는 작은 글씨용 자간 보정이 클램프돼 캘리브레이션 범위를 벗어난다.
 *     서비스 실사용 최소값(드랍 시트)도 40이다
 */
const SELECT_SERIAL_HEIGHT_PX = 40

interface InventoryGridProps {
  items: InventoryGridItem[]
  /** navigate: /inventory/[id]로 이동(기존 인벤토리 동작) · select: onSelect(item) 콜백(드랍 바텀시트) */
  mode: 'navigate' | 'select'
  onSelect?: (item: InventoryGridItem) => void
  /** 빈 슬롯 placeholder 개수(인벤토리 페이지에서만 사용) */
  emptySlots?: number
  /** 현재 선택된 아이템 id(select 모드 하이라이트용) */
  selectedItemId?: string | null
  /**
   * 열 수. 기본 3(인벤토리 목록·드랍 시트). 일련번호를 **읽고 비교해서** 골라야 하는
   * 화면(컬렉션 장착 개체 선택 시트)만 1을 넘긴다 — 3열 카드 폭에는 판독 가능한 크기의
   * `ItemSerialCode`가 들어가지 않는다(위 상수 주석의 실측 참조).
   */
  columns?: 1 | 3
  /** 카드 탭을 일시적으로 막는다(장착 요청 진행 중 중복 탭 방지). */
  disabled?: boolean
}

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
  selectedItemId = null,
  columns = 3,
  disabled = false,
}: InventoryGridProps) {
  return (
    <div className={`grid ${columns === 1 ? 'grid-cols-1' : 'grid-cols-3'} gap-[var(--spacing-8)]`}>
      {items.map((item) => {
        const expiring = isExpiringSoon(item.expiresAt)
        const expiryNode = expiring && item.expiresAt ? (
          <p className="text-[length:var(--text-caption)] font-bold leading-none px-1.5 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border)] text-text/70 text-center">
            <LocalDate iso={item.expiresAt} options={{ month: 'numeric', day: 'numeric' }} suffix={d.inventory.expiringSuffix} />
          </p>
        ) : null

        // 일련번호는 serial이 넘어온 카드에서만 그린다. serial이 없으면 자식 노드를 종전과
        // **완전히 동일하게**(expiryNode 그대로) 유지한다 — 기존 호출부 2곳
        // (`/inventory`, 드랍 바텀시트)의 레이아웃을 건드리지 않기 위함이다.
        // 릴(슬롯머신) 연출은 끈다 — 이 카드가 뜨는 유일한 화면이 "이미 가진 번호들을 읽고
        // 비교해서 고르는" 자리라, "번호가 지금 확정되는 순간"을 연출하는 릴과 목적이 반대다.
        // 시트를 열 때마다 약 1.9초간 숫자가 회전하면 정작 읽어야 할 값을 읽을 수 없다.
        const cardChildren = item.serial ? (
          <div className="flex flex-col items-center gap-[var(--spacing-4)]">
            <ItemSerialCode code={item.serial} height={SELECT_SERIAL_HEIGHT_PX} animate={false} />
            {expiryNode}
          </div>
        ) : (
          expiryNode
        )

        if (mode === 'navigate') {
          return (
            <BadgeGridCard
              key={item.id}
              href={`/inventory/${item.id}`}
              name={item.badgeName}
              imageUrl={item.badgeImageUrl}
              rarity={item.badgeRarity as import('@/types/database').BadgeRarity | null}
            >
              {cardChildren}
            </BadgeGridCard>
          )
        }

        const isSelected = selectedItemId === item.id
        return (
          <BadgeGridCard
            key={item.id}
            onClick={() => { if (!disabled) onSelect?.(item) }}
            name={item.badgeName}
            imageUrl={item.badgeImageUrl}
            rarity={item.badgeRarity as import('@/types/database').BadgeRarity | null}
            selected={isSelected}
          >
            {cardChildren}
          </BadgeGridCard>
        )
      })}
      {/* 빈 슬롯 placeholder — BadgeGridCard와 동일한 구조로 맞춰 행 높이를 일치시킨다 */}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="flex flex-col items-center bg-surface rounded-[var(--radius-card)] p-[var(--spacing-12)] overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border)] opacity-30"
        >
          <div className="w-[90px] h-[90px] rounded-[var(--radius-card)] flex items-center justify-center bg-white/10">
            <span className="text-text text-xl">+</span>
          </div>
          <div className="flex flex-col items-center gap-[var(--spacing-4)] pt-[var(--spacing-8)] w-full">
            <p className="text-[11px] font-bold text-text text-center truncate w-full leading-tight">&nbsp;</p>
            <div className="h-6" />
          </div>
        </div>
      ))}
    </div>
  )
}
