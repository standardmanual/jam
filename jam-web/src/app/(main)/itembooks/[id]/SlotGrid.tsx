'use client'

import { useState } from 'react'
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
}

export default function SlotGrid({ itemBookId, badgeSlots, readOnly = false, badgeLinkQuery = '' }: SlotGridProps) {
  const router = useRouter()
  const [pendingBadgeId, setPendingBadgeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    <div>
      {error && (
        <div className="mb-3 rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border)] px-3 py-2 text-xs text-text/70">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
        {badgeSlots.map(({ badge, inventoryItem, slot }) => {
          const isSlotted = slot != null
          const isSlottable = !isSlotted && inventoryItem != null
          const isUndiscovered = !isSlotted && inventoryItem == null
          const pending = pendingBadgeId === badge.id

          const serialLabel = inventoryItem
            ? `${d.itembooks.ownedPrefix}${inventoryItem.serial_prefix ?? '#'}${inventoryItem.serial_number}`
            : ''

          return (
            <BadgeGridCard
              key={badge.id}
              name={badge.name}
              imageUrl={badge.image_url}
              rarity={badge.rarity as BadgeRarity}
              href={!isUndiscovered ? `/badges/${badge.id}${badgeLinkQuery}` : undefined}
              undiscovered={isUndiscovered}
              className={isSlottable ? 'opacity-70' : isUndiscovered ? 'opacity-30' : ''}
            >
              {/* 슬롯 해제 버튼 */}
              {isSlotted && !readOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnslot(badge.id, slot!.id) }}
                  disabled={pending}
                  className="w-full py-1 text-[11px] leading-none rounded-[var(--radius-pill-buttons)] shadow-[inset_0_0_0_1px_var(--color-border)] transition-all disabled:opacity-40"
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
                  className="w-full py-1 text-[11px] leading-none rounded-[var(--radius-pill-buttons)] shadow-[inset_0_0_0_1px_var(--color-border)] transition-all disabled:opacity-40"
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
