'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import type { BadgeRow, CombinationRecipeRow, InventoryItemRow } from '@/types/database'

interface InventoryItemWithBadge extends Pick<InventoryItemRow, 'id' | 'badge_id' | 'serial_prefix' | 'serial_number'> {
  badge: Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>
}

interface PublicHint {
  hint_text: string | null
  result_badge_id: string
}

interface Props {
  items: InventoryItemWithBadge[]
  hints: PublicHint[]
  publicRecipes: CombinationRecipeRow[]
}

export default function CombineClient({ items, hints, publicRecipes }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; name?: string; reason?: string } | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  function toggleItem(itemId: string) {
    setSelected((prev) => {
      if (prev.includes(itemId)) return prev.filter((id) => id !== itemId)
      if (prev.length >= 3) return prev
      return [...prev, itemId]
    })
  }

  async function handleCombine() {
    if (selected.length < 2) {
      toast('아이템 2~3개를 선택해주세요.', 'error')
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
        setResult({ success: true, name: data.resultBadgeName })
        setSelected([])
        router.refresh()
      } else {
        const msgs: Record<string, string> = {
          no_recipe: '이 조합에 맞는 레시피가 없어요.',
          chance_fail: '조합에 실패했어요. 아이템이 소각됐습니다.',
          items_not_found: '아이템을 찾을 수 없어요.',
        }
        setResult({ success: false, reason: msgs[data.reason] ?? '조합 실패' })
      }
    } catch {
      toast('오류가 발생했어요.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const rarityColors: Record<string, string> = {
    common: 'border-white/20',
    rare: 'border-blue-400/40',
    legendary: 'border-purple-400/40',
    mythic: 'border-amber-400/50',
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* 결과 알림 */}
      {result && (
        <div className={`mx-5 mt-5 p-4 rounded-2xl border ${result.success ? 'border-[#AEEA00]/30 bg-[#AEEA00]/10' : 'border-red-500/30 bg-red-500/10'}`}>
          {result.success ? (
            <p className="text-[#AEEA00] font-bold text-center">🎉 조합 성공! <span className="text-white">{result.name}</span> 획득!</p>
          ) : (
            <p className="text-red-400 text-center text-sm">{result.reason}</p>
          )}
        </div>
      )}

      {/* 선택된 아이템 슬롯 */}
      <div className="px-5 pt-5 pb-4">
        <p className="text-xs text-white/40 mb-3">아이템 2~3개 선택 ({selected.length}/3)</p>
        <div className="flex gap-3 mb-4">
          {[0, 1, 2].map((i) => {
            const itemId = selected[i]
            const item = items.find((it) => it.id === itemId)
            return (
              <div key={i} className={`flex-1 aspect-square rounded-2xl border-2 border-dashed flex items-center justify-center ${item ? 'border-[#AEEA00]/40 bg-[#AEEA00]/5' : 'border-white/15'}`}>
                {item ? (
                  <button onClick={() => toggleItem(itemId)} className="w-full h-full flex items-center justify-center">
                    {item.badge.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.badge.image_url} alt={item.badge.name} className="w-3/4 h-3/4 object-cover rounded-xl" />
                    ) : (
                      <span className="text-2xl">🏅</span>
                    )}
                  </button>
                ) : (
                  <span className="text-white/20 text-2xl">+</span>
                )}
              </div>
            )
          })}
        </div>

        <Button
          variant="primary"
          size="lg"
          loading={loading}
          onClick={handleCombine}
          className="w-full"
          disabled={selected.length < 2}
        >
          합성하기
        </Button>
      </div>

      <div className="h-px bg-white/10 mx-5" />

      {/* 공개 레시피 힌트 */}
      {hints.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-3">힌트</p>
          <div className="flex flex-col gap-2">
            {hints.map((h, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                <p className="text-sm text-white/60">{h.hint_text ?? '???'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 공개 레시피 목록 */}
      {publicRecipes.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-3">공개 레시피</p>
          <div className="flex flex-col gap-2">
            {publicRecipes.map((r) => (
              <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/70">
                재료 {r.ingredient_badge_ids.length}개 → 결과 배지 (성공률 {Math.round(r.success_rate * 100)}%)
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-px bg-white/10 mx-5" />

      {/* 인벤토리 아이템 선택 */}
      <div className="px-5 py-4 flex-1">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-3">인벤토리</p>
        {items.length === 0 ? (
          <p className="text-white/30 text-center py-8 text-sm">인벤토리가 비어 있어요.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {items.map((item) => {
              const isSelected = selected.includes(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={[
                    'flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all active:scale-95',
                    isSelected
                      ? 'border-[#AEEA00] bg-[#AEEA00]/10'
                      : `${rarityColors[item.badge.rarity] ?? 'border-white/10'} bg-white/5 hover:border-white/30`,
                  ].join(' ')}
                >
                  {item.badge.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.badge.image_url} alt={item.badge.name} className="w-14 h-14 object-cover rounded-xl" />
                  ) : (
                    <span className="text-3xl">🏅</span>
                  )}
                  <p className="text-[10px] text-white/60 text-center leading-tight line-clamp-2">{item.badge.name}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
