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

const KNOWN_RARITIES: BadgeRarity[] = ['common', 'rare', 'legend', 'mythic']

// 기존 /badges/[id] 페이지의 상세 레이아웃을 오버레이(시트) 형태로 재사용.
// 페이지 이동이 아니라 /drops 위에 겹쳐 뜨므로 지도 상태가 보존된다.
export default function BadgeDetailSheet({ drop, poiName, pickingUp, onPickup, onCancel }: BadgeDetailSheetProps) {
  const rarity = (KNOWN_RARITIES.includes(drop.badge_rarity as BadgeRarity)
    ? (drop.badge_rarity as BadgeRarity)
    : 'common')

  return (
    <BottomSheet open onClose={onCancel} detent="full" showCloseButton={false}>
      <div
        className="px-[var(--spacing-16)] pt-[var(--spacing-8)] flex flex-col gap-[var(--spacing-24)] min-h-full"
        /* footer를 따로 분리하지 않고 한 페이지(스크롤 영역)로 구성.
           맨 아래 버튼까지 탭바(safe-area+16px+64px) 높이만큼 여백을 둬서,
           화면이 작아 다 안 보이면 스크롤해서 버튼을 볼 수 있게 한다. */
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px + 64px + 12px)' }}
      >
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

        {/* 액션 버튼 — 콘텐츠와 같은 스크롤 영역 안, 페이지 맨 끝에 위치.
            부모의 padding-bottom(탭바 높이만큼)이 이미 확보돼 있어
            스크롤 끝까지 내리면 탭바 위에서 항상 보이고 눌린다. */}
        <div className="mt-auto flex gap-[var(--spacing-16)]">
          <Button fullWidth variant="outline" surface="sub" onClick={onCancel} disabled={pickingUp}>
            {d.drops.cancel}
          </Button>
          <Button fullWidth surface="sub" loading={pickingUp} onClick={onPickup}>
            {d.drops.pickupButton}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
