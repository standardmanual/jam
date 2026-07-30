'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RarityBadge from '@/components/ui/Badge'
import { MedalIcon } from '@/components/ui/icons'
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
  /** 다른 유저의 아이템북을 보는 중이면 true — 슬롯/해제 버튼을 숨기고 조회만 가능하게 함 */
  readOnly?: boolean
}

export default function SlotGrid({ itemBookId, badgeSlots, readOnly = false }: SlotGridProps) {
  const router = useRouter()
  // 현재 처리 중인 배지 id (버튼 disabled 용)
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
            <div
              key={badge.id}
              className={[
                'flex flex-col items-center gap-2 p-[var(--spacing-8)] rounded-[var(--radius-cards)] transition-all',
                isSlotted
                  ? 'shadow-[inset_0_0_0_1px_var(--color-border)]'
                  : isSlottable
                    ? 'shadow-[inset_0_0_0_1px_var(--color-border)] opacity-70'
                    : 'shadow-[inset_0_0_0_1px_var(--color-border)] opacity-30',
              ].join(' ')}
            >
              {/* 배지 이미지 */}
              <div className="w-16 h-16 rounded-[var(--radius-cards)] flex items-center justify-center overflow-hidden">
                {badge.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={badge.image_url}
                    alt={isUndiscovered ? d.itembooks.unknownBadge : badge.name}
                    className={[
                      'w-full h-full object-contain p-1',
                      isUndiscovered ? 'grayscale' : '',
                    ].join(' ')}
                  />
                ) : (
                  <MedalIcon className="w-6 h-6 text-text/30" />
                )}
              </div>

              {/* 이름 */}
              <p className="text-[length:var(--text-body-sm)] leading-tight text-center line-clamp-2 w-full text-text">
                {isUndiscovered ? d.itembooks.unknownBadge : badge.name}
              </p>

              {/* 희귀도 (미발견 제외) */}
              <div className="h-6 flex items-center justify-center">
                {!isUndiscovered && (
                  <RarityBadge rarity={badge.rarity as BadgeRarity} />
                )}
              </div>

              {/* 상태별 하단 (다른 유저 조회 시 조작 버튼 숨김) */}
              {isSlotted && !readOnly && (
                <button
                  type="button"
                  onClick={() => handleUnslot(badge.id, slot!.id)}
                  disabled={pending}
                  className="text-[11px] text-text/50 underline underline-offset-2 active:text-text disabled:opacity-50"
                >
                  {pending ? d.itembooks.processing : d.itembooks.unslotButton}
                </button>
              )}

              {isSlottable && !readOnly && (
                <div className="flex flex-col items-center gap-1 w-full">
                  <p className="text-[10px] text-text/50 tabular-nums">
                    {serialLabel}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSlot(badge.id, inventoryItem!.id)}
                    disabled={pending}
                    className="w-full text-text text-xs py-1.5 rounded-[var(--radius-pill-buttons)] shadow-[inset_0_0_0_1px_var(--color-border)] transition-all disabled:opacity-60"
                  >
                    {pending ? d.itembooks.processing : d.itembooks.slotButton}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
