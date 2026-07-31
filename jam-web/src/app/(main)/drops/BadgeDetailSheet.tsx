'use client'

import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import BottomSheet from '@/components/ui/BottomSheet'
import RarityBadge from '@/components/ui/Badge'
import { MedalIcon } from '@/components/ui/icons'
import type { BadgeRarity } from '@/types/database'
import { d, t } from '@/lib/i18n'

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
    <BottomSheet open onClose={onCancel} detent="full" showCloseButton={false}>
      <div className="px-[var(--spacing-16)] pt-[var(--spacing-8)] pb-[var(--spacing-32)] flex flex-col gap-[var(--spacing-24)] min-h-full">
        {/* 닫기 */}
        <button
          onClick={onCancel}
          className="self-start inline-flex items-center min-h-11 -ml-2 px-2 text-text-inverse/70 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] active:scale-95 transition-transform duration-100"
        >
          &larr; {d.drops.back}
        </button>

        {/* 배지 이미지 (대형) */}
        <div className="flex flex-col items-center gap-[var(--spacing-16)] py-[var(--spacing-16)]">
          <div className="w-44 h-44 rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-center overflow-hidden">
            {drop.badge_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={drop.badge_image_url} alt={drop.badge_name} className="w-full h-full object-contain p-[var(--spacing-16)]" />
            ) : (
              <MedalIcon className="w-16 h-16 text-text-inverse/40" />
            )}
          </div>
          <div className="text-center">
            <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] mb-2 text-text-inverse">{drop.badge_name}</h1>
            <RarityBadge rarity={rarity} />
          </div>
        </div>

        {/* 드랍 컨텍스트 */}
        <Card>
          <h2 className="text-[10px] uppercase text-text-inverse/40 mb-2">{d.badges.connectedLocationTitle}</h2>
          <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/80">
            {poiName}
          </p>
          <p className="text-[11px] text-text-inverse/50 mt-1">
            {drop.is_ambient ? d.drops.foundNearby : t(d.drops.droppedBy, { name: drop.dropper_name ?? d.drops.anonymous })}
          </p>
        </Card>

        {/* 액션 버튼 — 스크롤 영역 안에서 하단에 sticky로 고정.
            내용이 짧으면 mt-auto처럼 바로 아래에 붙고, 내용이 길어 넘치면
            스크롤해도 항상 화면 맨 아래에 붙어 있어 잘려 보이지 않는다. */}
        <div className="mt-auto sticky bottom-0 -mx-[var(--spacing-16)] px-[var(--spacing-16)] pt-[var(--spacing-16)] pb-[env(safe-area-inset-bottom,1rem)] bg-surface-inverse flex flex-col gap-[var(--spacing-16)]">
          <Button fullWidth surface="sub" loading={pickingUp} onClick={onPickup}>
            {d.drops.pickupButton}
          </Button>
          <Button fullWidth variant="outline" surface="sub" onClick={onCancel} disabled={pickingUp}>
            {d.drops.cancel}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
