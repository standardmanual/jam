'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import { d } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

export interface BadgeSlot {
  badge: {
    id: string
    name: string
    image_url: string | null
    rarity: string
  }
  inventoryItem: {
    id: string
    serial_number: number
    serial_prefix: string | null
  } | null
  slot: {
    id: string
    slotted_at: string
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

  return (
    <div ref={gridRef}>
      {error && (
        <div className="mb-3 rounded-[var(--radius-cards)] bg-surface-elevated px-3 py-2 text-xs text-text/70">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
        {badgeSlots.map(({ badge, inventoryItem, slot }) => {
          const isSlotted = slot != null
          const isSlottable = !isSlotted && inventoryItem != null
          const isUndiscovered = !isSlotted && inventoryItem == null
          const pending = pendingBadgeId === badge.id

          return (
            <BadgeGridCard
              key={badge.id}
              name={badge.name}
              imageUrl={badge.image_url}
              rarity={badge.rarity as BadgeRarity}
              href={!isUndiscovered ? `/badges/${badge.id}${badgeLinkQuery}` : undefined}
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
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSlot(badge.id, inventoryItem!.id) }}
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
    </div>
  )
}
