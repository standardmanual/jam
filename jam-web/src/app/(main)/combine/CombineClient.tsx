'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { Card } from '@ds/components/cards/Card'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import { PackageIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'
import { trackEvent } from '@/lib/analytics/gtag'
import type { BadgeRow, CombinationRecipeRow, CombineSlotBadgeType, InventoryItemRow } from '@/types/database'

interface InventoryItemWithBadge extends Pick<InventoryItemRow, 'id' | 'badge_id' | 'serial_prefix' | 'serial_number'> {
  badge: Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>
}

/** 슬롯 하나에 딸린 후보(OR) 배지 상세 — 티켓 20260917_1427 */
export interface RecipeSlotWithCandidates {
  id: string
  slot_order: number
  badge_type: CombineSlotBadgeType
  candidates: Pick<BadgeRow, 'id' | 'name' | 'image_url'>[]
}

/** 공개 레시피 + 슬롯 상세(티켓 20260917_1427, 레시피 선택형 플로우) */
export interface RecipeWithSlots extends CombinationRecipeRow {
  slots: RecipeSlotWithCandidates[]
}

interface Props {
  items: InventoryItemWithBadge[]
  publicRecipes: RecipeWithSlots[]
  /** 유저가 실제로 보유한 조건 슬롯(액티비티·체크인) 후보 배지 id — 서버가 미리 조회해 내려준다 */
  ownedConditionBadgeIds: string[]
}

const conditionSlotTypeLabel: Record<Exclude<CombineSlotBadgeType, 'item'>, string> = {
  activity: '액티비티 배지',
  checkin: '체크인 배지',
}

export default function CombineClient({ items, publicRecipes, ownedConditionBadgeIds }: Props) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  /** 아이템 슬롯 id → 채운 인벤토리 아이템 개체 id */
  const [itemFills, setItemFills] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<
    { success: boolean; names?: string[]; points?: number; reason?: string } | null
  >(null)
  const { toast } = useToast()
  const router = useRouter()

  const ownedConditionSet = useMemo(() => new Set(ownedConditionBadgeIds), [ownedConditionBadgeIds])
  const itemsByBadgeId = useMemo(() => {
    const map = new Map<string, InventoryItemWithBadge[]>()
    for (const item of items) {
      const list = map.get(item.badge_id) ?? []
      list.push(item)
      map.set(item.badge_id, list)
    }
    return map
  }, [items])

  const selectedRecipe = publicRecipes.find((r) => r.id === selectedRecipeId) ?? null
  const itemSlots = selectedRecipe?.slots.filter((s) => s.badge_type === 'item') ?? []
  const conditionSlots = selectedRecipe?.slots.filter((s) => s.badge_type !== 'item') ?? []
  const allItemSlotsFilled = itemSlots.length > 0 && itemSlots.every((s) => itemFills[s.id])
  const allConditionSlotsOwned = conditionSlots.every((s) =>
    s.candidates.some((c) => ownedConditionSet.has(c.id))
  )
  const canSubmit = allItemSlotsFilled && allConditionSlotsOwned

  // 조합 성공 배너 — Success check (10).
  // stroke-dasharray는 플레이스홀더가 아니라 실제 path의 getTotalLength()로 주입한다.
  const checkRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    if (!result?.success) return
    const wrapper = checkRef.current
    if (!wrapper) return

    const path = wrapper.querySelector('path')
    if (path) {
      const len = Math.ceil(path.getTotalLength()) // 서브픽셀 흔들림 흡수를 위해 올림
      path.style.strokeDasharray = String(len)
      path.style.strokeDashoffset = String(len)
    }

    // 이미 보이는 상태에서 다시 성공했을 때도 처음부터 재생되도록 리셋 → 리플로우 → 재생
    wrapper.setAttribute('data-state', 'out')
    void wrapper.offsetWidth // 리플로우 강제
    wrapper.setAttribute('data-state', 'in')
  }, [result])

  function selectRecipe(recipeId: string) {
    setSelectedRecipeId(recipeId)
    setItemFills({})
    setResult(null)
  }

  function backToRecipeList() {
    setSelectedRecipeId(null)
    setItemFills({})
  }

  function toggleSlotItem(slotId: string, itemId: string) {
    setItemFills((prev) => {
      const next = { ...prev }
      if (next[slotId] === itemId) {
        delete next[slotId]
        return next
      }
      // 같은 아이템 개체는 슬롯 하나에만 대응한다 — 다른 슬롯에 이미 쓰였다면 그쪽에서 뺀다.
      for (const key of Object.keys(next)) {
        if (next[key] === itemId) delete next[key]
      }
      next[slotId] = itemId
      return next
    })
  }

  async function handleCombine() {
    if (!selectedRecipe || !canSubmit) return
    setLoading(true)
    setResult(null)
    trackEvent('combine_attempt', { item_count: Object.keys(itemFills).length })

    try {
      const res = await fetch('/api/combine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: selectedRecipe.id, item_ids: Object.values(itemFills) }),
      })
      const data = await res.json()

      if (data.success && ((data.resultBadges ?? []).length > 0 || (data.pointsAwarded ?? 0) > 0)) {
        const resultBadges = (data.resultBadges ?? []) as { id: string; name: string }[]
        trackEvent('combine_success', {
          item_count: Object.keys(itemFills).length,
          result_badge_ids: resultBadges.map((b) => b.id).join(','),
        })
        const names = resultBadges.map((b) => b.name)
        // 20260910_1408: 레시피 보상은 배지·포인트를 함께 줄 수 있다(둘 중 하나만일 수도 있다).
        setResult({ success: true, names, points: data.pointsAwarded ?? 0 })
        backToRecipeList()
        router.refresh()
      } else if (data.success) {
        // 20260910_1515: 레시피는 매칭됐지만(success: true) 보상 배지가 소프트 삭제 등으로
        // 하나도 지급되지 않고 포인트도 0인 경우 — 재료는 이미 소각됐으니 유저에게는
        // 실패에 가깝다. ADR 0001에 따라 서버가 이미 판정해 붙인 message를 그대로 신뢰한다.
        trackEvent('combine_success', { item_count: Object.keys(itemFills).length, result_badge_ids: '' })
        setResult({ success: false, reason: data.message ?? d.combine.genericFail })
        backToRecipeList()
        router.refresh()
      } else {
        // ADR 0001(서버-클라이언트 단일 진실 소스, 티켓 20260915_2240): API route가
        // d.combine.*로 완성한 message를 그대로 신뢰해 노출한다. 사유 코드를 클라이언트가
        // 재조립하지 않는다.
        setResult({ success: false, reason: data.message ?? d.combine.genericFail })
        backToRecipeList()
        router.refresh()
      }
    } catch {
      toast(d.combine.genericError, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-surface text-text">
      {/* 헤더 */}
      <div className="px-[var(--spacing-16)] pt-[calc(env(safe-area-inset-top)+var(--spacing-24))] pb-[var(--spacing-24)]">
        <h1 className="text-[length:var(--text-heading)] leading-[var(--leading-heading)]">{d.combine.title}</h1>
      </div>

      {/* 결과 알림 */}
      {result && (
        <Card tone="inverse" className="mx-[var(--spacing-16)] mb-[var(--spacing-16)] text-center">
          {result.success ? (
            <div className="flex flex-col items-center gap-[var(--spacing-16)]">
              <span ref={checkRef} className="t-success-check" data-state="out" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10">
                  <path
                    d="M4 12.5 L9.5 18 L20 6.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <p>
                {(result.names ?? []).length > 0
                  ? t(d.combine.successResult, { names: (result.names ?? []).join(', ') }) +
                    ((result.points ?? 0) > 0
                      ? t(d.combine.successPointsSuffix, { points: result.points ?? 0 })
                      : '')
                  : t(d.combine.successPointsOnly, { points: result.points ?? 0 })}
              </p>
            </div>
          ) : (
            result.reason
          )}
        </Card>
      )}

      {!selectedRecipe ? (
        <>
          {/* 공개 레시피 — 탭해서 선택 */}
          <div className="px-[var(--spacing-16)] pb-[var(--spacing-24)]">
            <p className="text-[length:var(--text-caption)] text-text/50 uppercase tracking-widest mb-[var(--spacing-16)]">{d.combine.recipesTitle}</p>
            {publicRecipes.length === 0 ? (
              <EmptyState
                icon={<PackageIcon className="w-8 h-8" />}
                title={d.combine.emptyInventory}
                description={d.combine.recipeSelectPrompt}
              />
            ) : (
              <>
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-[var(--color-text-secondary)] mb-[var(--spacing-16)]">
                  {d.combine.recipeSelectPrompt}
                </p>
                <div className="flex flex-col gap-[var(--spacing-8)]">
                  {publicRecipes.map((r) => (
                    <button key={r.id} type="button" onClick={() => selectRecipe(r.id)} className="text-left w-full">
                      <Card
                        tone="inverse"
                        className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/70 active:scale-[0.99] transition-transform"
                      >
                        {t(d.combine.recipeLine, { count: r.slots.length })}
                      </Card>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          {/* 슬롯 채우기 */}
          <div className="px-[var(--spacing-16)] pb-[var(--spacing-24)]">
            <div className="flex items-center justify-between mb-[var(--spacing-16)]">
              <p className="text-[length:var(--text-caption)] text-text/50 uppercase tracking-widest">{d.combine.fillSlotsTitle}</p>
              <button type="button" onClick={backToRecipeList} className="text-[length:var(--text-body-sm)] text-[var(--color-text-secondary)] underline underline-offset-2">
                {d.combine.backToRecipeList}
              </button>
            </div>

            <div className="flex flex-col gap-[var(--spacing-16)]">
              {itemSlots.map((slot) => {
                const filledItemId = itemFills[slot.id]
                const candidateItems = slot.candidates.flatMap((c) => itemsByBadgeId.get(c.id) ?? [])
                return (
                  <div key={slot.id}>
                    {candidateItems.length === 0 ? (
                      <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-[var(--color-text-secondary)]">
                        {d.combine.itemSlotEmpty}
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
                        {candidateItems.map((item) => {
                          const isSelected = filledItemId === item.id
                          return (
                            <BadgeGridCard
                              key={item.id}
                              onClick={() => toggleSlotItem(slot.id, item.id)}
                              name={item.badge.name}
                              imageUrl={item.badge.image_url}
                              rarity={item.badge.rarity as import('@/types/database').BadgeRarity}
                              selected={isSelected}
                              className={isSelected ? '' : 'opacity-60'}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {conditionSlots.map((slot) => {
                const owned = slot.candidates.some((c) => ownedConditionSet.has(c.id))
                return (
                  <Card key={slot.id} tone="inverse" className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
                    <p className="text-text-inverse/70">
                      {conditionSlotTypeLabel[slot.badge_type as 'activity' | 'checkin']}
                      {' · '}
                      {slot.candidates.map((c) => c.name).join(', ')}
                    </p>
                    <p className={owned ? 'text-text-inverse' : 'text-text-inverse/40'}>
                      {owned ? d.combine.conditionSlotOwned : d.combine.conditionSlotMissing}
                    </p>
                  </Card>
                )
              })}
            </div>

            <button
              onClick={handleCombine}
              disabled={loading || !canSubmit}
              className="mt-[var(--spacing-24)] w-full py-4 rounded-[var(--radius-pill-buttons)] bg-text text-surface text-[length:var(--text-body)] active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {loading && <span className="w-4 h-4 border-2 border-surface border-t-transparent rounded-full animate-spin" />}
              {loading ? d.combine.combineButtonLoading : d.combine.combineButton}
            </button>
          </div>
        </>
      )}

      {/* 인벤토리 — 참고용 전체 목록(선택은 위 슬롯 채우기에서만) */}
      {!selectedRecipe && (
        <div className="flex-1 px-[var(--spacing-16)] py-[var(--spacing-24)]">
          <p className="text-[length:var(--text-caption)] text-text/50 uppercase tracking-widest mb-[var(--spacing-16)]">{d.combine.myItemsTitle}</p>
          {items.length === 0 ? (
            <EmptyState
              icon={<PackageIcon className="w-8 h-8" />}
              title={d.combine.emptyInventory}
              description={d.combine.emptyInventoryBody}
            />
          ) : (
            <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
              {items.map((item) => (
                <BadgeGridCard
                  key={item.id}
                  name={item.badge.name}
                  imageUrl={item.badge.image_url}
                  rarity={item.badge.rarity as import('@/types/database').BadgeRarity}
                  className="opacity-60"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
