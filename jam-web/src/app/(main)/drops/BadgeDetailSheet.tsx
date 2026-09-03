'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import { Card } from '@ds/components/cards/Card'
import BottomSheet from '@/components/ui/BottomSheet'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { ItemSerialCode } from '@ds/components/patterns/ItemSerialCode'
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
  /** 20260829_2101 — 개체 정체성 모델: poi_drops가 항상 이미 발급된 개체를 가리키므로
   * 픽업 전에도 일련번호가 이미 확정돼 있다. 마이그레이션 이전 완료된 과거 드랍은 null일 수 있다. */
  serial: string | null
}

interface BadgeDetailSheetProps {
  drop: PickupDrop
  poiName: string
  pickingUp: boolean
  onPickup: () => void
  onCancel: () => void
}

const KNOWN_RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/** 스크롤 영역 아래 여백(safe-area 제외) — 플로팅 탭바(16+64) 위 12px. BottomSheet footer와 같은 관례. */
const ACTION_BOTTOM_GAP_PX = 16 + 64 + 12

// 기존 /badges/[id] 페이지의 상세 레이아웃을 오버레이(시트) 형태로 재사용.
// 페이지 이동이 아니라 /drops 위에 겹쳐 뜨므로 지도 상태가 보존된다.
export default function BadgeDetailSheet({ drop, poiName, pickingUp, onPickup, onCancel }: BadgeDetailSheetProps) {
  const rarity = (KNOWN_RARITIES.includes(drop.badge_rarity as BadgeRarity)
    ? (drop.badge_rarity as BadgeRarity)
    : 'common')

  // 실측 대상 DOM은 ref가 아니라 **상태**로 받는다. BottomSheet는 마운트 게이트
  // (useSyncExternalStore) 때문에 첫 렌더에서 null을 반환하므로, 이 컴포넌트의 첫 effect가
  // 도는 시점에는 시트 내부 DOM이 아직 없다 — ref였다면 그때 null이라 측정이 영영 건너뛰어진다.
  // 콜백 ref + state로 두면 DOM이 실제로 붙는 시점에 effect가 다시 돌아 확실히 측정된다.
  /** 스크롤 영역 안의 한 페이지 래퍼 — 아래 padding에서 safe-area 실제값을 역산한다. */
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null)
  /** 픽업/취소 버튼 행 — 하단 점유 높이를 실측하는 기준 박스. */
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null)

  // 20260826_005: 이 시트는 BottomSheet의 footer prop을 쓰지 않고 스크롤 영역 맨 아래에 직접
  // 픽업/취소 버튼을 놓는다. 그래서 BottomSheet가 대신 신고해줄 수 없어 여기서 "화면 하단부터
  // 버튼 상단까지의 높이"를 직접 신고한다 — 픽업 실패 토스트가 이 버튼들과 거의 완전히 포개져
  // 버튼 탭이 토스트 디스미스로 먹히던 문제를 막는다(Toast.tsx / uiOverlay.ts 참고).
  //
  // 값은 **계산하지 않고 실측한다.** 2차 구현은 버튼 높이를 Button의 min-h-11(44px)로 추정했는데
  // 실제 렌더 높이는 py-[14px]×2 + 16px×1.5 = 52px이라 신고값이 8px 부족했고, 그만큼 간격이
  // 통째로 소진됐다. 라벨이 두 줄이 되거나 Button의 패딩·타이포 토큰이 바뀌어도 자동으로
  // 따라가야 하므로 DOM 박스를 잰다(BottomSheet가 footer에 쓰는 실측 방식과 동일한 관례).
  useEffect(() => {
    const actions = actionsEl
    const content = contentEl
    if (!actions || !content) return

    let release: (() => void) | null = null

    const report = () => {
      // 신고 규약은 "env(safe-area-inset-bottom) **위로** 점유하는 높이"다.
      // safe-area 실제값은 content의 resolve된 padding-bottom(= safe-area + ACTION_BOTTOM_GAP_PX)에서
      // 역산한다(BottomSheet의 footer 실측과 같은 방식).
      const resolvedPaddingPx = parseFloat(window.getComputedStyle(content).paddingBottom) || 0
      const safeAreaPx = Math.max(0, resolvedPaddingPx - ACTION_BOTTOM_GAP_PX)

      // 화면 하단 ~ 버튼 행 상단까지의 점유 높이 = (a) 버튼 행 상단부터 콘텐츠 끝(아래 여백 포함)
      // + (b) 스크롤 영역 아래로 시트가 더 두고 있는 여백.
      //
      // offsetTop/offsetHeight만 쓰는 이유: getBoundingClientRect는 시트 열림 트랜지션의
      // translateY와 스크롤 위치에 함께 흔들리지만, offset 계열은 레이아웃 값이라 둘 다에
      // 영향받지 않는다. 화면이 작아 콘텐츠가 넘칠 때도 "스크롤을 끝까지 내렸을 때"(= 버튼을
      // 눌러야 하는 상태)의 기하를 그대로 돌려준다.
      const sameOrigin = actions.offsetParent === content.offsetParent
      const actionsTopInContent = sameOrigin ? actions.offsetTop - content.offsetTop : actions.offsetTop
      // (a) — content의 padding-bottom(safe-area + ACTION_BOTTOM_GAP_PX)과 버튼 행 실제 높이가 함께 잡힌다.
      const tailPx = content.offsetHeight - actionsTopInContent
      // (b) — BottomSheet가 footer 없는 시트의 스크롤 영역 아래에 두는 여백
      //       (env(safe-area-inset-bottom, 1rem)). 상수로 재현하면 또 추정이 되므로 실측한다.
      const scroller = content.parentElement
      const sheet = scroller?.offsetParent as HTMLElement | null
      const belowScrollerPx =
        sheet && scroller
          ? Math.max(0, sheet.offsetHeight - scroller.offsetTop - scroller.offsetHeight)
          : 0
      // 레이아웃이 아직 없거나(0) 구조 가정이 깨진 경우엔 최소한 버튼 행 + 아래 여백만큼은 신고한다.
      const occupied =
        Number.isFinite(tailPx) && tailPx > 0
          ? tailPx + belowScrollerPx
          : ACTION_BOTTOM_GAP_PX + actions.offsetHeight

      release?.()
      release = pushBottomOverlay(occupied - safeAreaPx)
    }

    report()

    // 버튼 행 높이(웹폰트 로드·라벨 줄바꿈·loading 상태)나 시트 높이(dvh 변동)가 바뀌면 다시 신고한다.
    // ResizeObserver 콜백은 레이아웃 확정 후에 불리므로 열림 트랜지션 중 측정 문제도 함께 해소된다.
    const observer = new ResizeObserver(report)
    observer.observe(actions)
    observer.observe(content)

    return () => {
      observer.disconnect()
      release?.()
    }
  }, [actionsEl, contentEl])

  return (
    <BottomSheet open onClose={onCancel} detent="full">
      <div
        ref={setContentEl}
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
          {/* 20260829_2101 — 픽업은 소유권 이전일 뿐 재발급이 아니라서 드랍 상태에서도
              이미 확정된 일련번호가 존재한다. 20260903_1423 — ItemSerialCode로 교체(타이틀 텍스트
              없이 컴포넌트만 배치, 다른 두 화면과 동일 원칙). 이 시트는 좁은 카드라 배지 상세
              페이지(height=50)보다 작게, 컴포넌트가 지원하는 최소값(height=40)을 쓴다. */}
          {drop.serial && (
            <div className="flex justify-center mt-3 pt-3 border-t border-text/10">
              <ItemSerialCode code={drop.serial} height={40} />
            </div>
          )}
        </Card>

        {/* 액션 버튼 — 콘텐츠와 같은 스크롤 영역 안, 페이지 맨 끝에 위치.
            부모의 padding-bottom(탭바 높이만큼)이 이미 확보돼 있어
            스크롤 끝까지 내리면 탭바 위에서 항상 보이고 눌린다. */}
        <div ref={setActionsEl} className="mt-auto flex gap-[var(--spacing-16)]">
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
