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
  readOnly?: boolean
  badgeLinkQuery?: string
}

const CARD_BG = '#1A1A1A'
const THUMB_BG = '#333333'

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
        <div
          className="mb-3 rounded-2xl px-3 py-2 text-xs"
          style={{ border: '1px solid #333333', color: '#B2B2B2' }}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {badgeSlots.map(({ badge, inventoryItem, slot }) => {
          const isSlotted = slot != null
          const isSlottable = !isSlotted && inventoryItem != null
          const isUndiscovered = !isSlotted && inventoryItem == null
          const pending = pendingBadgeId === badge.id
          const isNavigable = !isUndiscovered

          const serialLabel = inventoryItem
            ? `${d.itembooks.ownedPrefix}${inventoryItem.serial_prefix ?? '#'}${inventoryItem.serial_number}`
            : ''

          return (
            <div
              key={badge.id}
              role={isNavigable ? 'button' : undefined}
              tabIndex={isNavigable ? 0 : undefined}
              onClick={
                isNavigable
                  ? () => router.push(`/badges/${badge.id}${badgeLinkQuery}`)
                  : undefined
              }
              onKeyDown={
                isNavigable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ')
                        router.push(`/badges/${badge.id}${badgeLinkQuery}`)
                    }
                  : undefined
              }
              className={[
                'flex flex-col items-center p-3 rounded-2xl transition-all',
                isNavigable ? 'cursor-pointer active:scale-95' : '',
                isUndiscovered ? 'opacity-30' : isSlottable ? 'opacity-70' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ background: CARD_BG }}
            >
              {/* 썸네일 90×90 */}
              <div
                className="w-[90px] h-[90px] rounded-2xl overflow-hidden flex items-center justify-center shrink-0"
                style={{ background: THUMB_BG }}
              >
                {badge.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={badge.image_url}
                    alt={isUndiscovered ? d.itembooks.unknownBadge : badge.name}
                    className={[
                      'w-full h-full object-contain',
                      isUndiscovered ? 'grayscale' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                ) : (
                  <MedalIcon className="w-8 h-8" style={{ color: '#555555' }} />
                )}
              </div>

              {/* 텍스트 + 희귀도 배지 */}
              <div className="flex flex-col items-center gap-1 w-full pt-2">
                <p
                  className="text-center line-clamp-2 w-full"
                  style={{
                    color: '#FFFFFF',
                    fontSize: '12px',
                    lineHeight: '1.3',
                    fontWeight: '500',
                  }}
                >
                  {isUndiscovered ? d.itembooks.unknownBadge : badge.name}
                </p>

                {!isUndiscovered && (
                  <RarityBadge rarity={badge.rarity as BadgeRarity} />
                )}
              </div>

              {/* 슬롯 해제 버튼 */}
              {isSlotted && !readOnly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleUnslot(badge.id, slot!.id)
                  }}
                  disabled={pending}
                  className="mt-2 text-[11px] underline underline-offset-2 disabled:opacity-50"
                  style={{ color: '#666666' }}
                >
                  {pending ? d.itembooks.processing : d.itembooks.unslotButton}
                </button>
              )}

              {/* 슬롯 장착 버튼 */}
              {isSlottable && !readOnly && (
                <div className="flex flex-col items-center gap-1 w-full mt-2">
                  <p
                    className="text-[10px] tabular-nums"
                    style={{ color: '#666666' }}
                  >
                    {serialLabel}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSlot(badge.id, inventoryItem!.id)
                    }}
                    disabled={pending}
                    className="w-full text-xs py-1.5 rounded-full transition-all disabled:opacity-60"
                    style={{
                      background: 'transparent',
                      border: '1px solid #444444',
                      color: '#FFFFFF',
                    }}
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
