'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import BottomSheet from '@/components/ui/BottomSheet'
import InventoryGrid, { type InventoryGridItem } from '@/components/inventory/InventoryGrid'
import { d, t } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

/** 일련번호 표시 포맷 — 서비스 전역 공통(4자리 prefix + 6자리 zero-pad). */
function formatSerial(item: { serial_prefix: string | null; serial_number: number }): string {
  return `${item.serial_prefix ?? '????'}${String(item.serial_number).padStart(6, '0')}`
}

export interface BadgeSlot {
  badge: {
    id: string
    name: string
    image_url: string | null
    /** 무한레벨형 배지는 등급이 없다(마이그레이션 130). null이면 등급 칩을 그리지 않는다 */
    rarity: string | null
  }
  /**
   * 이 배지로 장착 가능한 **미장착 개체 후보 전체**(obtained_at ASC). 20260907_2059에서
   * 단수 `inventoryItem`을 배열로 바꿨다 — 같은 배지를 여러 개 보유했을 때 어느 개체를
   * 넣을지 사용자가 골라야 하기 때문이다. 비어 있으면 미보유(`???`) 칸이다.
   */
  candidates: {
    id: string
    serial_number: number
    serial_prefix: string | null
  }[]
  slot: {
    id: string
    slotted_at: string
    /** 이 칸에 실제로 꽂힌 개체 — 배지 상세 링크의 `?item`으로 넘긴다(20260907_2059) */
    inventory_item_id: string
  } | null
}

interface SlotGridProps {
  itemBookId: string
  badgeSlots: BadgeSlot[]
  readOnly?: boolean
  badgeLinkQuery?: string
  /**
   * 장착 모드 — `/collections/[id]?slot=1`로 진입했을 때 켜진다 (20260824_021).
   *
   * 소식 #11("다 모았어요. 컬렉션에 추가해보세요")은 **완성할 수 있는데 아직 안 넣은**
   * 시점의 소식이라, 단순 이동이 아니라 장착 액션까지 이어져야 제 값을 한다. 슬롯 그리드로
   * 스크롤하고 아직 넣지 않은 칸을 짚어준다.
   */
  slotMode?: boolean
}

export default function SlotGrid({
  itemBookId,
  badgeSlots,
  readOnly = false,
  badgeLinkQuery = '',
  slotMode = false,
}: SlotGridProps) {
  const router = useRouter()
  const [pendingBadgeId, setPendingBadgeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 개체 선택 시트를 띄운 배지 id(후보가 2개 이상일 때만 설정된다) — 20260907_2059 */
  const [selectingBadgeId, setSelectingBadgeId] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)

  // 장착 모드로 진입하면 슬롯 그리드가 화면에 들어오게 한다(스토리 텍스트가 길어 스크롤이 필요)
  useEffect(() => {
    if (!slotMode || readOnly) return
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [slotMode, readOnly])

  async function getToken(): Promise<string | null> {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  async function handleSlot(badgeId: string, inventoryItemId: string) {
    setError(null)
    setPendingBadgeId(badgeId)
    try {
      const token = await getToken()
      if (!token) {
        setError(d.itembooks.slotLoginRequired)
        return
      }
      const res = await fetch(`/api/itembooks/${itemBookId}/slot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inventory_item_id: inventoryItemId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? d.itembooks.slotFailed)
        return
      }
      router.refresh()
    } catch {
      setError(d.itembooks.networkError)
    } finally {
      setPendingBadgeId(null)
    }
  }

  async function handleUnslot(badgeId: string, slotId: string) {
    setError(null)
    setPendingBadgeId(badgeId)
    try {
      const token = await getToken()
      if (!token) {
        setError(d.itembooks.slotLoginRequired)
        return
      }
      const res = await fetch(`/api/itembooks/${itemBookId}/slot`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slot_id: slotId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? d.itembooks.unslotFailed)
        return
      }
      router.refresh()
    } catch {
      setError(d.itembooks.networkError)
    } finally {
      setPendingBadgeId(null)
    }
  }

  /** 후보가 1개면 즉시 장착, 2개 이상이면 일련번호가 보이는 선택 시트를 연다(20260907_2059). */
  function handleSlotButton(badgeSlot: BadgeSlot) {
    if (badgeSlot.candidates.length === 1) {
      handleSlot(badgeSlot.badge.id, badgeSlot.candidates[0].id)
      return
    }
    setError(null)
    setSelectingBadgeId(badgeSlot.badge.id)
  }

  const selectingSlot = selectingBadgeId
    ? badgeSlots.find((bs) => bs.badge.id === selectingBadgeId) ?? null
    : null
  const selectingItems: InventoryGridItem[] = selectingSlot
    ? selectingSlot.candidates.map((candidate) => ({
        id: candidate.id,
        badgeName: selectingSlot.badge.name,
        badgeImageUrl: selectingSlot.badge.image_url,
        badgeRarity: selectingSlot.badge.rarity,
        serial: formatSerial(candidate),
      }))
    : []

  return (
    <div ref={gridRef}>
      {error && (
        <div className="mb-3 rounded-[var(--radius-cards)] bg-surface-elevated px-3 py-2 text-xs text-text/70">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
        {badgeSlots.map((badgeSlot) => {
          const { badge, candidates, slot } = badgeSlot
          const isSlotted = slot != null
          const isSlottable = !isSlotted && candidates.length > 0
          const isUndiscovered = !isSlotted && candidates.length === 0
          const pending = pendingBadgeId === badge.id
          // 장착된 칸은 "실제로 꽂힌 개체"를 배지 상세에 넘긴다 — 그러지 않으면 상세가
          // 임의의 대표 개체(최신 획득분)를 골라 다른 일련번호를 보여준다(20260907_2059).
          // (값이 비어 있으면 붙이지 않는다 — 상세는 `?item` 없이도 기존 폴백으로 동작한다)
          const itemQuery = slot?.inventory_item_id
            ? `${badgeLinkQuery ? '&' : '?'}item=${encodeURIComponent(slot.inventory_item_id)}`
            : ''

          return (
            <BadgeGridCard
              key={badge.id}
              name={badge.name}
              imageUrl={badge.image_url}
              rarity={badge.rarity as BadgeRarity | null}
              href={!isUndiscovered ? `/badges/${badge.id}${badgeLinkQuery}${itemQuery}` : undefined}
              earned={isSlotted}
              undiscovered={isUndiscovered}
              highlighted={slotMode && !readOnly && isSlottable}
              className={isUndiscovered ? 'opacity-30' : ''}
            >
              {/* 슬롯 해제 버튼 */}
              {isSlotted && !readOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnslot(badge.id, slot!.id) }}
                  disabled={pending}
                  className="block mx-auto px-3 py-1 text-[length:var(--text-micro)] leading-[var(--leading-micro)] rounded-[var(--radius-pill-buttons)] bg-[color:var(--color-primary)] text-[color:var(--color-text-on-primary)] transition-all disabled:opacity-40"
                >
                  {pending ? '…' : d.itembooks.unslotButton}
                </button>
              )}

              {/* 슬롯 장착 버튼 */}
              {isSlottable && !readOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSlotButton(badgeSlot) }}
                  disabled={pending}
                  className="block mx-auto px-3 py-1 text-[length:var(--text-micro)] leading-[var(--leading-micro)] rounded-[var(--radius-pill-buttons)] bg-[color:var(--color-primary)] text-[color:var(--color-text-on-primary)] transition-all disabled:opacity-40"
                >
                  {pending ? '…' : d.itembooks.slotButton}
                </button>
              )}
            </BadgeGridCard>
          )
        })}
      </div>

      {/* 개체 선택 시트 — 같은 배지를 2개 이상 보유했을 때만 열린다(20260907_2059).
          레이어: BottomSheet가 document.body 포털 + z-50(시트·다이얼로그 층)이라
          DESIGN_RENEWAL_SPEC의 기존 층 서열을 그대로 따른다(새 z값 도입 없음).
          하단 고정 액션(footer)이 없으므로 pushBottomOverlay 신고 대상도 아니다. */}
      <BottomSheet
        open={selectingSlot != null}
        onClose={() => setSelectingBadgeId(null)}
        title={d.itembooks.selectItemTitle}
      >
        <div className="px-[var(--spacing-16)] pb-[var(--spacing-16)] flex flex-col gap-[var(--spacing-12)]">
          <p className="text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-[var(--color-text-secondary)]">
            {selectingSlot ? t(d.itembooks.selectItemBody, { count: String(selectingSlot.candidates.length) }) : ''}
          </p>
          <InventoryGrid
            items={selectingItems}
            mode="select"
            onSelect={(item) => {
              if (!selectingSlot) return
              setSelectingBadgeId(null)
              handleSlot(selectingSlot.badge.id, item.id)
            }}
          />
        </div>
      </BottomSheet>
    </div>
  )
}
