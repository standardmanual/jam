'use client'

import Button from '@/components/ui/Button'
import RarityBadge from '@/components/ui/Badge'
import type { BadgeRarity } from '@/types/database'

// 픽업 대상 배지 (DropsClient의 DropItem과 동일 형태)
export interface PickupDrop {
  id: string
  badge_id: string
  badge_name: string
  badge_rarity: string
  badge_image_url: string | null
  dropper_name: string | null
  is_ambient?: boolean
  dropped_at: string
}

interface BadgeDetailSheetProps {
  drop: PickupDrop
  poiName: string
  pickingUp: boolean
  onPickup: () => void
  onCancel: () => void
}

const KNOWN_RARITIES: BadgeRarity[] = ['common', 'rare', 'legendary', 'mythic']

// 기존 /badges/[id] 페이지의 상세 레이아웃을 오버레이(시트) 형태로 재사용.
// 페이지 이동이 아니라 /drops 위에 겹쳐 뜨므로 지도 상태가 보존된다.
export default function BadgeDetailSheet({ drop, poiName, pickingUp, onPickup, onCancel }: BadgeDetailSheetProps) {
  const rarity = (KNOWN_RARITIES.includes(drop.badge_rarity as BadgeRarity)
    ? (drop.badge_rarity as BadgeRarity)
    : 'common')

  return (
    <div className="absolute inset-0 z-30 bg-jam-teal overflow-y-auto overscroll-contain">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 flex flex-col gap-6 min-h-full">
        {/* 닫기 */}
        <button
          onClick={onCancel}
          className="self-start flex items-center gap-1 text-jam-ink/70 font-bold text-sm active:scale-95 transition-transform"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          뒤로
        </button>

        {/* 배지 이미지 (대형) */}
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-44 h-44 rounded-[2rem] bg-white border-[3px] border-jam-ink shadow-[5px_5px_0_0_#161616] flex items-center justify-center overflow-hidden">
            {drop.badge_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={drop.badge_image_url} alt={drop.badge_name} className="w-full h-full object-contain p-4" />
            ) : (
              <span className="text-7xl">🏅</span>
            )}
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black mb-2 text-jam-ink">{drop.badge_name}</h1>
            <RarityBadge rarity={rarity} />
          </div>
        </div>

        {/* 드랍 컨텍스트 */}
        <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] px-4 py-3">
          <h2 className="text-xs font-black text-jam-ink/40 uppercase tracking-wider mb-2">이 장소에 드랍됨</h2>
          <p className="text-sm text-jam-ink/80 font-semibold">
            {poiName}에 놓여 있는 아이템이에요.
          </p>
          <p className="text-xs text-jam-ink/50 mt-1 font-semibold">
            {drop.is_ambient ? '이 근처에서 발견됨' : `${drop.dropper_name ?? '익명'}이(가) 드랍`}
          </p>
        </div>

        {/* 액션 버튼 */}
        <div className="mt-auto flex flex-col gap-3">
          <Button fullWidth size="lg" loading={pickingUp} onClick={onPickup}>
            픽업하기
          </Button>
          <Button fullWidth size="lg" variant="secondary" onClick={onCancel} disabled={pickingUp}>
            취소
          </Button>
        </div>
      </div>
    </div>
  )
}
