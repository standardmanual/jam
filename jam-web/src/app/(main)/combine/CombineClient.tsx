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
  common: 'bg-white',
  rare: 'bg-jam-teal/30',
  legendary: 'bg-jam-purple/20',
  mythic: 'bg-jam-yellow/40',
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
    <div className="flex flex-col min-h-full bg-jam-pink">
      {/* 헤더 */}
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-5">
        <p className="text-jam-ink/60 text-sm font-bold">아이템 합성</p>
        <h1 className="text-4xl font-black text-jam-ink leading-tight">조합</h1>
      </div>

      {/* 결과 알림 */}
      {result && (
        <div
          className={`mx-5 mb-4 p-4 rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] font-black text-center ${result.success ? 'bg-jam-lime text-jam-ink' : 'bg-red-100 text-red-700'}`}
        >
          {result.success ? `🎉 ${result.name} 획득!` : result.reason}
        </div>
      )}

      {/* 선택 슬롯 */}
      <div className="px-5 pb-5">
        <p className="text-xs font-black text-jam-ink/50 uppercase tracking-widest mb-3">
          선택한 아이템 ({selected.length}/3)
        </p>
        <div className="flex gap-3 mb-4">
          {[0, 1, 2].map((i) => {
            const itemId = selected[i]
            const item = items.find((it) => it.id === itemId)
            const bg = item ? (rarityCardBg[item.badge.rarity] ?? 'bg-white') : ''
            return (
              <div
                key={i}
                className={`flex-1 aspect-square rounded-2xl flex items-center justify-center border-[3px] ${
                  item
                    ? `${bg} border-jam-ink shadow-[3px_3px_0_0_#161616] cursor-pointer active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all`
                    : 'border-dashed border-jam-ink/25 bg-white/20'
                }`}
                onClick={() => itemId && toggleItem(itemId)}
              >
                {item ? (
                  item.badge.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.badge.image_url} alt={item.badge.name} className="w-3/4 h-3/4 object-contain" />
                  ) : (
                    <span className="text-3xl">🏅</span>
                  )
                ) : (
                  <span className="text-jam-ink/25 text-2xl font-black">+</span>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={handleCombine}
          disabled={loading || selected.length < 2}
          className="w-full py-4 rounded-2xl bg-jam-ink text-white font-black text-base active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2 border-[3px] border-jam-ink shadow-[3px_3px_0_0_rgba(0,0,0,0.3)]"
        >
          {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          합성하기
        </button>
      </div>

      {/* 힌트 */}
      {hints.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-3">힌트</p>
          <div className="flex flex-col gap-2">
            {hints.map((h, i) => (
              <div key={i} className="bg-jam-cream border-[3px] border-jam-ink rounded-xl px-4 py-3">
                <p className="text-sm text-jam-ink/70 font-semibold">{h.hint_text ?? '???'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 공개 레시피 */}
      {publicRecipes.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-3">공개 레시피</p>
          <div className="flex flex-col gap-2">
            {publicRecipes.map((r) => (
              <div key={r.id} className="bg-jam-cream border-[3px] border-jam-ink rounded-xl px-4 py-3 text-sm text-jam-ink/70 font-semibold">
                재료 {r.ingredient_badge_ids.length}개 → 결과 배지 · 성공률 {Math.round(r.success_rate * 100)}%
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 인벤토리 */}
      <div className="flex-1 bg-jam-cream rounded-t-[2rem] border-t-[3px] border-jam-ink px-5 py-6">
        <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-3">내 아이템</p>
        {items.length === 0 ? (
          <p className="text-jam-ink/50 text-center py-8 font-bold">인벤토리가 비어 있어요.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {items.map((item) => {
              const isSelected = selected.includes(item.id)
              const cardBg = rarityCardBg[item.badge.rarity] ?? 'bg-white'
              return (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={[
                    'flex flex-col items-center gap-1.5 p-3 rounded-2xl border-[3px] transition-all active:scale-95',
                    isSelected
                      ? `${cardBg} border-jam-ink shadow-[3px_3px_0_0_#161616]`
                      : `${cardBg} border-jam-ink/20 opacity-70`,
                  ].join(' ')}
                >
                  {item.badge.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.badge.image_url} alt={item.badge.name} className="w-14 h-14 object-contain" />
                  ) : (
                    <span className="text-3xl">🏅</span>
                  )}
                  <p className="text-[10px] text-jam-ink font-bold text-center leading-tight line-clamp-2">{item.badge.name}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
