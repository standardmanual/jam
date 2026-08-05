'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import Card from '@/components/ui/card'
import { MedalIcon } from '@/components/ui/icons'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'
import type { BadgeRow, CombinationRecipeRow, InventoryItemRow } from '@/types/database'

interface InventoryItemWithBadge extends Pick<InventoryItemRow, 'id' | 'badge_id' | 'serial_prefix' | 'serial_number'> {
  badge: Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>
}

interface PublicHint {
  hint_text: string | null
  result_badge_id: string | null
}

interface Props {
  items: InventoryItemWithBadge[]
  hints: PublicHint[]
  publicRecipes: CombinationRecipeRow[]
}

const rarityRing: Record<string, string> = {
  common: '',
  rare: 'text-jam-teal shadow-[inset_0_0_0_1px_var(--color-jam-teal)]',
  legendary: 'text-jam-purple shadow-[inset_0_0_0_1px_var(--color-jam-purple)]',
  mythic: 'text-jam-yellow shadow-[inset_0_0_0_1px_var(--color-jam-yellow)]',
}

const MAX_SELECT = 10

export default function CombineClient({ items, hints, publicRecipes }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; names?: string[]; reason?: string } | null>(null)
  const { toast } = useToast()
  const router = useRouter()

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

  function toggleItem(itemId: string) {
    setSelected((prev) => {
      if (prev.includes(itemId)) return prev.filter((id) => id !== itemId)
      if (prev.length >= MAX_SELECT) return prev
      return [...prev, itemId]
    })
  }

  async function handleCombine() {
    if (selected.length < 2) {
      toast(d.combine.selectRangeError, 'error')
      return
    }
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/combine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: selected }),
      })
      const data = await res.json()

      if (data.success) {
        const names = (data.resultBadges ?? []).map((b: { name: string }) => b.name)
        setResult({ success: true, names })
        setSelected([])
        router.refresh()
      } else {
        const msgs: Record<string, string> = {
          invalid_count: d.combine.selectRangeError,
          items_not_found: d.combine.itemsNotFound,
          recipe_fail: d.combine.recipeFail,
          fail: d.combine.recipeFail,
        }
        let reason = msgs[data.reason] ?? d.combine.genericFail
        if (data.pointsAwarded > 0) {
          reason += t(d.combine.consolationPoints, { points: data.pointsAwarded })
        }
        setResult({ success: false, reason })
        setSelected([])
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
        <Card className="mx-[var(--spacing-16)] mb-[var(--spacing-16)] text-center">
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
              <p>{t(d.combine.successResult, { names: (result.names ?? []).join(', ') })}</p>
            </div>
          ) : (
            result.reason
          )}
        </Card>
      )}

      {/* 선택 슬롯 */}
      <div className="px-[var(--spacing-16)] pb-[var(--spacing-24)]">
        <p className="text-[11px] text-text/50 uppercase tracking-widest mb-[var(--spacing-16)]">
          {t(d.combine.selectedCount, { count: selected.length, max: MAX_SELECT })}
        </p>
        <div className="grid grid-cols-5 gap-[var(--spacing-8)] mb-[var(--spacing-16)]">
          {Array.from({ length: MAX_SELECT }, (_, i) => i).map((i) => {
            const itemId = selected[i]
            const item = items.find((it) => it.id === itemId)
            return (
              <div
                key={i}
                className={[
                  'aspect-square rounded-[var(--radius-cards)] flex items-center justify-center transition-all',
                  item
                    ? `shadow-[inset_0_0_0_1px_var(--color-border)] cursor-pointer ${rarityRing[item.badge.rarity] ?? ''}`
                    : 'shadow-[inset_0_0_0_1px_var(--color-border)] opacity-30',
                ].join(' ')}
                onClick={() => itemId && toggleItem(itemId)}
              >
                {item ? (
                  item.badge.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.badge.image_url} alt={item.badge.name} className="w-3/4 h-3/4 object-contain" />
                  ) : (
                    <MedalIcon className="w-5 h-5 text-text/40" />
                  )
                ) : (
                  <span className="text-text/25 text-xl">+</span>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={handleCombine}
          disabled={loading || selected.length < 2}
          className="w-full py-4 rounded-[var(--radius-pill-buttons)] bg-text text-surface text-[length:var(--text-body)] active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {loading && <span className="w-4 h-4 border-2 border-surface border-t-transparent rounded-full animate-spin" />}
          {d.combine.combineButton}
        </button>
      </div>

      {/* 힌트 */}
      {hints.length > 0 && (
        <div className="px-[var(--spacing-16)] py-[var(--spacing-16)]">
          <p className="text-[10px] text-text/50 uppercase tracking-widest mb-[var(--spacing-16)]">{d.combine.hintsTitle}</p>
          <div className="flex flex-col gap-[var(--spacing-8)]">
            {hints.map((h, i) => (
              <Card key={i}>
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/70">{h.hint_text ?? d.combine.hintUnknown}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 공개 레시피 */}
      {publicRecipes.length > 0 && (
        <div className="px-[var(--spacing-16)] py-[var(--spacing-16)]">
          <p className="text-[10px] text-text/50 uppercase tracking-widest mb-[var(--spacing-16)]">{d.combine.recipesTitle}</p>
          <div className="flex flex-col gap-[var(--spacing-8)]">
            {publicRecipes.map((r) => (
              <Card key={r.id} className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/70">
                {t(d.combine.recipeLine, {
                  count: r.ingredient_badge_ids.length,
                  pct: Math.round(r.success_rate * 100),
                })}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 인벤토리 */}
      <div className="flex-1 px-[var(--spacing-16)] py-[var(--spacing-24)] shadow-[inset_0_1px_0_0_var(--color-border)]">
        <p className="text-[10px] text-text/50 uppercase tracking-widest mb-[var(--spacing-16)]">{d.combine.myItemsTitle}</p>
        {items.length === 0 ? (
          <p className="text-text/50 text-center py-[var(--spacing-32)]">{d.combine.emptyInventory}</p>
        ) : (
          <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
            {items.map((item) => {
              const isSelected = selected.includes(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={[
                    'flex flex-col items-center gap-1.5 p-[var(--spacing-8)] rounded-[var(--radius-cards)] transition-all active:scale-95',
                    isSelected
                      ? `shadow-[inset_0_0_0_1px_var(--color-border)] ${rarityRing[item.badge.rarity] ?? ''}`
                      : 'shadow-[inset_0_0_0_1px_var(--color-border)] opacity-60',
                  ].join(' ')}
                >
                  {item.badge.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.badge.image_url} alt={item.badge.name} className="w-14 h-14 object-contain" />
                  ) : (
                    <MedalIcon className="w-6 h-6 text-text/40" />
                  )}
                  <p className="text-[10px] text-text text-center leading-tight line-clamp-2">{item.badge.name}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
