'use client'

import Image from 'next/image'
import { useEffect } from 'react'
import Button from '@/components/ui/Button'
import { Card } from '@ds/components/cards/Card'
import BottomSheet from '@/components/ui/BottomSheet'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { MedalIcon } from '@/components/ui/icons'
import type { BadgeRarity } from '@/types/database'
import { d, t } from '@/lib/i18n'
import { pushBottomOverlay } from '@/lib/uiOverlay'

// 픽업 대상 배지 (DropsClient의 DropItem과 동일 형태)
export interface PickupDrop {
  id: string
  badge_id: string
  badge_name: string
  badge_rarity: string
  badge_image_url: string | null
  dropper_name: string | null
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

/** 스크롤 영역 아래 여백(safe-area 제외) — 플로팅 탭바(16+64) 위 12px. BottomSheet footer와 같은 관례. */
const ACTION_BOTTOM_GAP_PX = 16 + 64 + 12
/** 액션 버튼 높이 — Button의 min-h-11(44px). */
const ACTION_BUTTON_HEIGHT_PX = 44

// 기존 /badges/[id] 페이지의 상세 레이아웃을 오버레이(시트) 형태로 재사용.
// 페이지 이동이 아니라 /drops 위에 겹쳐 뜨므로 지도 상태가 보존된다.
export default function BadgeDetailSheet({ drop, poiName, pickingUp, onPickup, onCancel }: BadgeDetailSheetProps) {
  const rarity = (KNOWN_RARITIES.includes(drop.badge_rarity as BadgeRarity)
    ? (drop.badge_rarity as BadgeRarity)
    : 'common')

  // 20260826_001: 이 시트는 BottomSheet의 footer prop을 쓰지 않고 스크롤 영역 맨 아래에 직접
  // 픽업/취소 버튼을 놓는다. 그래서 BottomSheet가 대신 신고해줄 수 없어 여기서 "화면 하단부터
  // 버튼 상단까지의 높이"를 직접 신고한다 — 픽업 실패 토스트가 이 버튼들과 거의 완전히 포개져
  // 버튼 탭이 토스트 디스미스로 먹히던 문제를 막는다(Toast.tsx / uiOverlay.ts 참고).
  useEffect(() => pushBottomOverlay(ACTION_BOTTOM_GAP_PX + ACTION_BUTTON_HEIGHT_PX), [])

  return (
    <BottomSheet open onClose={onCancel} detent="full" showCloseButton={false}>
      <div
        className="px-[var(--spacing-16)] pt-[var(--spacing-8)] flex flex-col gap-[var(--spacing-24)] min-h-full"
        /* footer를 따로 분리하지 않고 한 페이지(스크롤 영역)로 구성.
           맨 아래 버튼까지 탭바(safe-area+16px+64px) 높이만큼 여백을 둬서,
           화면이 작아 다 안 보이면 스크롤해서 버튼을 볼 수 있게 한다. */
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${ACTION_BOTTOM_GAP_PX}px)` }}
      >
        {/* 닫기 */}
        <button
          onClick={onCancel}
          className="self-start inline-flex items-center min-h-11 -ml-2 px-2 text-text/70 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] active:scale-95 transition-transform duration-100"
        >
          &larr; {d.common.back}
        </button>

        {/* 배지 이미지 (대형) */}
        <div className="flex flex-col items-center gap-[var(--spacing-16)] py-[var(--spacing-16)]">
          <div className="w-44 h-44 rounded-[var(--radius-cards)] bg-black/[0.04] flex items-center justify-center overflow-hidden">
            {drop.badge_image_url ? (
              <Image src={drop.badge_image_url} alt={drop.badge_name} width={176} height={176} className="w-full h-full object-contain p-[var(--spacing-16)]" />
            ) : (
              <MedalIcon className="w-16 h-16 text-text/40" />
            )}
          </div>
          <div className="text-center">
            <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] mb-2 text-text">{drop.badge_name}</h1>
            <RarityBadge rarity={rarity} />
          </div>
        </div>

        {/* 드랍 컨텍스트 */}
        <Card>
          <h2 className="text-[length:var(--text-caption)] uppercase text-text/40 mb-2">{d.badges.connectedLocationTitle}</h2>
          <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/80">
            {poiName}
          </p>
          <p className="text-[length:var(--text-caption)] text-text/50 mt-1">
            {t(d.drops.droppedBy, { name: drop.dropper_name ?? d.drops.anonymous })}
          </p>
        </Card>

        {/* 액션 버튼 — 콘텐츠와 같은 스크롤 영역 안, 페이지 맨 끝에 위치.
            부모의 padding-bottom(탭바 높이만큼)이 이미 확보돼 있어
            스크롤 끝까지 내리면 탭바 위에서 항상 보이고 눌린다. */}
        <div className="mt-auto flex gap-[var(--spacing-16)]">
          <Button fullWidth variant="outline" surface="main" onClick={onCancel} disabled={pickingUp}>
            {d.drops.cancel}
          </Button>
          <Button fullWidth surface="main" loading={pickingUp} onClick={onPickup}>
            {d.drops.pickupButton}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
