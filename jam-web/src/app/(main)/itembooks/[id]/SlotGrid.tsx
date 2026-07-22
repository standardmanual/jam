'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RarityBadge from '@/components/ui/Badge'
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
        setError('로그인이 필요해요.')
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
        setError(data.error ?? '슬롯에 실패했어요.')
        return
      }
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했어요.')
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
        setError('로그인이 필요해요.')
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
        setError(data.error ?? '슬롯 해제에 실패했어요.')
        return
      }
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했어요.')
    } finally {
      setPendingBadgeId(null)
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-xl border-2 border-red-500 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {badgeSlots.map(({ badge, inventoryItem, slot }) => {
          const isSlotted = slot != null
          const isSlottable = !isSlotted && inventoryItem != null
          const isUndiscovered = !isSlotted && inventoryItem == null
          const pending = pendingBadgeId === badge.id

          const serialLabel = inventoryItem
            ? `보유 ${inventoryItem.serial_prefix ?? '#'}${inventoryItem.serial_number}`
            : ''

          return (
            <div
              key={badge.id}
              className={[
                'flex flex-col items-center gap-2 p-3 rounded-2xl border-[3px] transition-all',
                isSlotted
                  ? 'bg-white border-jam-ink shadow-[3px_3px_0_0_#161616]'
                  : isSlottable
                    ? 'bg-white/60 border-jam-ink/40'
                    : 'bg-white/20 border-jam-ink/15',
              ].join(' ')}
            >
              {/* 배지 이미지 */}
              <div className="w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden bg-jam-cream">
                {badge.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={badge.image_url}
                    alt={isUndiscovered ? '???' : badge.name}
                    className={[
                      'w-full h-full object-contain p-1',
                      isSlotted ? 'opacity-100' : '',
                      isSlottable ? 'opacity-70' : '',
                      isUndiscovered ? 'grayscale brightness-[0.6] opacity-30' : '',
                    ].join(' ')}
                  />
                ) : (
                  <span
                    className={[
                      'text-3xl',
                      isSlottable ? 'opacity-70' : '',
                      isUndiscovered ? 'grayscale opacity-20' : '',
                    ].join(' ')}
                  >
                    🏅
                  </span>
                )}
              </div>

              {/* 이름 */}
              <p
                className={[
                  'text-[11px] font-bold leading-tight text-center line-clamp-2 w-full',
                  isUndiscovered ? 'text-jam-ink/30' : 'text-jam-ink',
                ].join(' ')}
              >
                {isUndiscovered ? '???' : badge.name}
              </p>

              {/* 희귀도 (미발견 제외) */}
              {!isUndiscovered && (
                <RarityBadge rarity={badge.rarity as BadgeRarity} />
              )}

              {/* 상태별 하단 (다른 유저 조회 시 조작 버튼 숨김) */}
              {isSlotted && !readOnly && (
                <button
                  type="button"
                  onClick={() => handleUnslot(badge.id, slot!.id)}
                  disabled={pending}
                  className="text-[11px] font-black text-jam-ink/50 underline underline-offset-2 active:text-jam-ink disabled:opacity-50"
                >
                  {pending ? '처리 중...' : '슬롯 해제'}
                </button>
              )}

              {isSlottable && !readOnly && (
                <div className="flex flex-col items-center gap-1 w-full">
                  <p className="text-[10px] text-jam-ink/50 font-bold tabular-nums">
                    {serialLabel}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSlot(badge.id, inventoryItem!.id)}
                    disabled={pending}
                    className="w-full bg-jam-lime text-jam-ink text-xs font-black py-1.5 rounded-lg border-[2px] border-jam-ink shadow-[2px_2px_0_0_#161616] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all disabled:opacity-60 disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[2px_2px_0_0_#161616]"
                  >
                    {pending ? '처리 중...' : '슬롯'}
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
