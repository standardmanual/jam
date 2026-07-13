'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
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

const rarityCardBg: Record<string, string> = {
  common: 'bg-[#F0F0E8]',
  rare: 'bg-[#D8F0F8]',
  legendary: 'bg-[#F0E4FC]',
  mythic: 'bg-[#FCF4D0]',
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

  return (
    <div className="flex flex-col min-h-full">
      {/* 헤더 */}
      <div className="px-5 pt-4 pb-5">
        <p className="text-[#AAAAAA] text-sm font-medium">아이템 합성</p>
        <h1 className="text-4xl font-black text-[#111111] leading-tight">조합</h1>
      </div>

      {/* 결과 알림 */}
      {result && (
        <div className={`mx-5 mb-4 p-4 rounded-2xl font-bold text-center ${result.success ? 'bg-[#AEEA00] text-[#111111]' : 'bg-red-100 text-red-600'}`}>
          {result.success ? `🎉 ${result.name} 획득!` : result.reason}
        </div>
      )}

      {/* 선택 슬롯 */}
      <div className="px-5 pb-5">
        <p className="text-xs font-black text-[#AAAAAA] uppercase tracking-widest mb-3">
          선택한 아이템 ({selected.length}/3)
        </p>
        <div className="flex gap-3 mb-4">
          {[0, 1, 2].map((i) => {
            const itemId = selected[i]
            const item = items.find((it) => it.id === itemId)
            const bg = item ? (rarityCardBg[item.badge.rarity] ?? 'bg-[#F0F0E8]') : ''
            return (
              <div
                key={i}
                className={`flex-1 aspect-square rounded-2xl flex items-center justify-center ${
                  item
                    ? `${bg} cursor-pointer active:scale-95 transition-all`
                    : 'border-2 border-dashed border-black/10'
                }`}
                onClick={() => itemId && toggleItem(itemId)}
              >
                {item ? (
                  item.badge.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.badge.image_url} alt={item.badge.name} className="w-3/4 h-3/4 object-cover rounded-xl" />
                  ) : (
                    <span className="text-3xl">🏅</span>
                  )
                ) : (
                  <span className="text-black/15 text-2xl font-black">+</span>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={handleCombine}
          disabled={loading || selected.length < 2}
          className="w-full py-4 rounded-2xl bg-[#111111] text-white font-black text-base active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          합성하기
        </button>
      </div>

      <div className="h-px bg-black/6 mx-5" />

      {/* 힌트 */}
      {hints.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-[10px] font-black text-[#AAAAAA] uppercase tracking-widest mb-3">힌트</p>
          <div className="flex flex-col gap-2">
            {hints.map((h, i) => (
              <div key={i} className="bg-white border border-black/6 rounded-xl px-4 py-3">
                <p className="text-sm text-[#666666]">{h.hint_text ?? '???'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 공개 레시피 */}
      {publicRecipes.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-[10px] font-black text-[#AAAAAA] uppercase tracking-widest mb-3">공개 레시피</p>
          <div className="flex flex-col gap-2">
            {publicRecipes.map((r) => (
              <div key={r.id} className="bg-white border border-black/6 rounded-xl px-4 py-3 text-sm text-[#666666]">
                재료 {r.ingredient_badge_ids.length}개 → 결과 배지 · 성공률 {Math.round(r.success_rate * 100)}%
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-px bg-black/6 mx-5" />

      {/* 인벤토리 */}
      <div className="px-5 py-4 flex-1">
        <p className="text-[10px] font-black text-[#AAAAAA] uppercase tracking-widest mb-3">내 아이템</p>
        {items.length === 0 ? (
          <p className="text-[#AAAAAA] text-center py-8 font-bold">인벤토리가 비어 있어요.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {items.map((item) => {
              const isSelected = selected.includes(item.id)
              const cardBg = rarityCardBg[item.badge.rarity] ?? 'bg-[#F0F0E8]'
              return (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={[
                    'flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95',
                    isSelected
                      ? `${cardBg} ring-2 ring-[#111111]`
                      : `${cardBg} opacity-70`,
                  ].join(' ')}
                >
                  {item.badge.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.badge.image_url} alt={item.badge.name} className="w-14 h-14 object-cover rounded-xl" />
                  ) : (
                    <span className="text-3xl">🏅</span>
                  )}
                  <p className="text-[10px] text-[#111111] font-bold text-center leading-tight line-clamp-2">{item.badge.name}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
