'use client'

import Link from 'next/link'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { Button } from '@ds/components/buttons/Button'
import BottomSheet from '@/components/ui/BottomSheet'
import SwapText from '@/components/ui/SwapText'
import JamBalance from '@/components/jam/JamBalance'
import JamFillPanel from '@/components/jam/JamFillPanel'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'
import { capsulePercent, capsuleViewStatus } from '@/lib/capsule/capsule-view'
import { d, t } from '@/lib/i18n'

/**
 * 캡슐 시트 — 알약을 누르면 뜨는 시트 한 개 안에서 본문 단계와 채우기 단계를 오간다 (티켓 20261018_0054, 채원 판정 2026-10-18)
 *
 * 새 라우트나 스택 화면이 없다. 투데이와 내 프로필이 같은 시트를 쓴다. 상태와 API 호출은 `CapsuleWidget`이 맡고 이 파일은 그린다.
 *  - 본문 단계: 외곽선 게이지, 가진 잼(숫자), 상태별 푸터. 채우는 중이면 «채우기», 다 찼으면 «열기»,
 *    인벤토리 빈칸이 모자라면 버튼 대신 안내 블록과 «인벤토리 보기» 링크를 둔다.
 *  - 채우기 단계: 공용 `JamFillPanel`과 «취소». 시트 높이는 `BottomSheet`의 compact 디텐트 안에서 유지된다.
 * 열기 결과는 시트가 아니라 위젯이 시트를 닫은 뒤 `BadgeRevealOverlay`로 보여 준다.
 * 시트는 `BottomSheet`가 body 포털로 띄운다(z-50, 토스트·오버레이 z-60 아래). 카드 안에 카드를 넣지 않는다.
 */

export type CapsuleSheetStep = 'main' | 'fill'

interface Props {
  open: boolean
  onClose: () => void
  status: CapsuleStatus
  step: CapsuleSheetStep
  /** 진행 중인 요청. 같은 요청을 두 번 보내지 않도록 버튼을 막는다 */
  pending: 'fill' | 'open' | null
  onStartFill: () => void
  onCancelFill: () => void
  onConfirmFill: (amount: number) => void
  onOpen: () => void
}

export default function CapsuleSheet({ open, onClose, status, step, pending, onStartFill, onCancelFill, onConfirmFill, onOpen }: Props) {
  const view = capsuleViewStatus(status)
  const inFill = step === 'fill'
  const hasJam = status.balance > 0

  const footer = inFill ? undefined : (
    <div className="flex flex-col gap-3">
      {view === 'filling' && (
        <>
          <Button variant="primary" fullWidth disabled={!hasJam} className="whitespace-nowrap" onClick={onStartFill}>
            {d.capsule.sheet.fillCta}
          </Button>
          {!hasJam && (
            <p className="m-0 break-keep wrap-break-word text-pretty text-sm text-foreground">{d.capsule.sheet.noJam}</p>
          )}
        </>
      )}
      {view === 'ready' && (
        <Button variant="primary" fullWidth disabled={pending === 'open'} aria-busy={pending === 'open' || undefined} className="whitespace-nowrap" onClick={onOpen}>
          <SwapText value={pending === 'open' ? d.capsule.sheet.opening : d.capsule.sheet.openCta} />
        </Button>
      )}
      {view === 'noSlots' && (
        <>
          <div className="flex flex-col gap-1">
            <p className="m-0 break-keep wrap-break-word text-balance text-base font-bold text-foreground">{d.capsule.sheet.noSlotsTitle}</p>
            {status.freeSlots !== undefined && status.neededSlots !== undefined && (
              <p className="m-0 break-keep wrap-break-word text-pretty text-sm text-foreground">
                {t(d.capsule.sheet.noSlotsCount, { free: status.freeSlots, needed: status.neededSlots })}
              </p>
            )}
            <p className="m-0 break-keep wrap-break-word text-pretty text-sm text-foreground">{d.capsule.sheet.noSlotsKept}</p>
          </div>
          <Link
            href="/inventory"
            className="inline-flex min-h-11 items-center self-start break-keep wrap-break-word whitespace-nowrap text-base text-[color:var(--link)]"
          >
            {d.capsule.sheet.inventoryLink}
          </Link>
        </>
      )}
    </div>
  )

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={inFill ? d.capsule.sheet.fillTitle : d.capsule.title}
      titleClassName="text-base break-keep wrap-break-word text-balance"
      footer={footer}
    >
      {inFill ? (
        <>
          <JamFillPanel remaining={status.remaining} balance={status.balance} pending={pending === 'fill'} onConfirm={onConfirmFill} />
          <div className="px-6 pb-6">
            <Button variant="ghost" fullWidth disabled={pending === 'fill'} className="whitespace-nowrap" onClick={onCancelFill}>
              {d.capsule.sheet.cancel}
            </Button>
          </div>
        </>
      ) : (
        <div className="px-6 pb-4 pt-2 flex flex-col gap-4">
          {/* 게이지는 색과 외곽선만으로 읽히지 않게 같은 정보를 글자(스크린리더 이름)로도 준다. 진행 숫자와 퍼센트는 어디에도 없다 */}
          <div role="img" aria-label={d.capsule.aria[view]}>
            <ProgressBar outlined percent={capsulePercent(status)} fillMode="track-gradient" trackColor="var(--background)" height={10} labelType="none" />
          </div>
          <JamBalance balance={status.balance} />
        </div>
      )}
    </BottomSheet>
  )
}
