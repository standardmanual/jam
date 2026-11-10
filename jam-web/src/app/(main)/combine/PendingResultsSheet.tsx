'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import BottomSheet from '@/components/ui/BottomSheet'
import { SHEET_BUTTON_CLASS } from '@/components/ui/sheetClasses'
import SwapText from '@/components/ui/SwapText'
import { PackageIcon } from '@/components/ui/icons'
import { Button } from '@ds/components/buttons/Button'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { Skeleton } from '@ds/components/feedback/Skeleton'
import { d, t } from '@/lib/i18n'
// 타입만 가져온다 — `lib/combine/pending.ts`는 서버 전용이라 값을 가져오면 번들링에서 터진다.
import type { PendingResultView } from '@/lib/combine/pending'
import type { BadgeRarity } from '@/types/database'

/**
 * 받지 않은 믹스 결과 시트 (티켓 20261018_0055 2회, 채원 판정 2026-10-18)
 *
 * 빈칸이 모자라 받지 못한 믹스 결과를 목록으로 보여 주고 한 번에 받는다. 상태와 API 호출(GET·POST)은 `CombineClient`가 맡고
 * 이 파일은 그리기만 한다(`CapsuleWidget`·`CapsuleSheet` 분리와 같은 구조).
 *  - 열린 결과는 그림·이름, 잠긴 결과는 `LockedTile`·«잠긴 아이템 배지»·등급 칩만 보인다. 이름·그림은 DOM 어디에도 없다(운영 로직 7.3절).
 *  - 푸터: 빈칸이 충분하면 «받기», 모자라면 버튼 대신 부족 블록과 인벤토리 링크. 오류색·경고 아이콘을 쓰지 않는다.
 *  - 개별 선택·부분 받기는 없다(서버가 전부 한 번에 받는다).
 * 시트는 `BottomSheet`가 body 포털로 띄운다(z-50, 토스트·오버레이 z-60 아래). 카드 안에 카드를 넣지 않는다.
 */

export interface PendingSheetView {
  /** 목록을 읽는 중 / 읽지 못함 / 읽음 */
  status: 'loading' | 'error' | 'ready'
  items: PendingResultView[]
  /** 지금 인벤토리 빈칸 수 */
  freeSlots: number
  /** 받으려면 필요한 빈칸 수 — 받기 409(`insufficient_slots`)가 준 값으로 바뀔 수 있다 */
  neededSlots: number
  /** 받기 요청 진행 중 — 같은 요청을 두 번 보내지 않도록 버튼을 막는다 */
  claiming: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  view: PendingSheetView
  onClaim: () => void
  onRetry: () => void
}

const TITLE_CLASS = 'text-xl font-bold leading-6 break-keep wrap-break-word text-balance'
const TEXT_CLASS = 'm-0 break-keep wrap-break-word text-balance'

/** 받을 결과 한 장 — 인벤토리·컬렉션·배지 목록과 같은 `BadgeGridCard` 레이아웃이다(티켓 20261110_2150, 캔버스 «JAM! 바텀시트»). 잠긴 결과는 카드가 이름·그림을 숨긴다 */
function ResultTile({ item }: { item: PendingResultView }) {
  return (
    <li className="flex min-w-0">
      <BadgeGridCard
        className="w-full"
        name={item.locked ? undefined : item.name}
        imageUrl={item.locked ? undefined : item.imageUrl}
        rarity={item.rarity as BadgeRarity}
        locked={item.locked}
      />
    </li>
  )
}

export default function PendingResultsSheet({ open, onClose, view, onClaim, onRetry }: Props) {
  const { status, items, freeSlots, neededSlots, claiming } = view
  const empty = status === 'ready' && items.length === 0
  const short = status === 'ready' && !empty && freeSlots < neededSlots

  let footer: ReactNode
  if (status === 'loading') {
    footer = (
      <Button variant="primary" fullWidth disabled className={`whitespace-nowrap ${SHEET_BUTTON_CLASS}`}>
        {d.combine.pendingSheet.claim}
      </Button>
    )
  } else if (empty) {
    footer = (
      <Button variant="secondary" fullWidth className={`whitespace-nowrap ${SHEET_BUTTON_CLASS}`} onClick={onClose}>
        {d.combine.pendingSheet.close}
      </Button>
    )
  } else if (short) {
    footer = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="m-0 break-keep wrap-break-word text-balance text-base font-bold text-foreground">{d.combine.pendingSheet.shortTitle}</p>
          <p className={`${TEXT_CLASS} text-sm text-foreground`}>
            {t(d.combine.pendingSheet.shortCount, { free: freeSlots, needed: neededSlots })}
          </p>
          <p className={`${TEXT_CLASS} text-sm text-foreground`}>{d.combine.pendingSheet.shortKept}</p>
        </div>
        <Link
          href="/inventory"
          className="inline-flex min-h-11 items-center self-start break-keep wrap-break-word whitespace-nowrap text-base text-[color:var(--link)] underline underline-offset-2"
        >
          {d.combine.pendingSheet.inventoryLink}
        </Link>
      </div>
    )
  } else if (status === 'ready') {
    footer = (
      <div className="flex flex-col gap-3">
        <p className={`${TEXT_CLASS} text-sm text-foreground text-center`}>
          {d.combine.pendingSheet.slotsLabel} <b>{t(d.combine.pendingSheet.slotsCount, { needed: neededSlots })}</b>
        </p>
        <Button
          variant="primary"
          fullWidth
          disabled={claiming}
          aria-busy={claiming || undefined}
          className={`whitespace-nowrap ${SHEET_BUTTON_CLASS}`}
          onClick={onClaim}
        >
          <SwapText value={claiming ? d.combine.pendingSheet.claiming : d.combine.pendingSheet.claim} />
        </Button>
      </div>
    )
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={d.combine.pendingSheet.title} titleClassName={TITLE_CLASS} footer={footer}>
      <div className="px-6 py-6" aria-busy={status === 'loading' || undefined}>
        {status === 'loading' && (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height="auto" borderRadius="var(--radius-2xl)" className="aspect-square" />
            ))}
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-start gap-3">
            <p className={`${TEXT_CLASS} text-sm text-foreground`}>{d.combine.claim.loadFailed}</p>
            <Button variant="ghost" className={`whitespace-nowrap ${SHEET_BUTTON_CLASS}`} onClick={onRetry}>
              {d.combine.pendingSheet.retry}
            </Button>
          </div>
        )}
        {empty && <EmptyState icon={<PackageIcon className="w-8 h-8" />} title={d.combine.claim.noPending} />}
        {status === 'ready' && !empty && (
          <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
            {items.map((item) => (
              <ResultTile key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  )
}
