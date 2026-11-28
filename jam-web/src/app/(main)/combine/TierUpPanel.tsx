'use client'

import { EmptyState } from '@/components/ui/EmptyState'
import { RarityBadge } from '@/components/ui/RarityBadge'
import BottomSheet from '@/components/ui/BottomSheet'
import InlineNotice from '@/components/ui/InlineNotice'
import { ArrowDownIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'
import type { Ref } from 'react'
import BagItemCell from './BagItemCell'
import TierUpGachaStage, { type TierUpGachaHandle } from './TierUpGachaStage'
import {
  tierUpRarityNote,
  type TierUpMaterial,
  type TierUpSheetCell,
  type TierUpSheetView,
} from './tierUpClient'

/**
 * 등급 UP 화면 본문 (티켓 20261022_2119 3회, 가차머신 리뉴얼 티켓 20261127_2225) — 서비스 전용 조립 컴포넌트, MODULAR 승격은 하지 않는다.
 *
 * 그리기만 한다. 고른 배지·시트 열림 상태와 `/api/combine/tier-up` 호출은 `CombineClient`가 갖는다(`PendingResultsSheet`와 같은 분리).
 * 가운데에 가차머신 무대(`TierUpGachaStage`)가 있고, «배지 넣기»가 재료 시트(`BottomSheet` + `TierUpSheetContent`)를 연다.
 * 머신 아래에 막힘 안내(`pendingBlockedNote`·`noEnoughNotice`)가 놓인다. 설명 문장·슬롯·제출 버튼·«넣은 배지는 사라져요»는 없다.
 * «확률 안내» 링크는 두지 않는다(사용자 지시 2026-11-10, 티켓 20261110_1510). 확률 안내는 푸터 링크로만 들어간다.
 * 받을 컬렉션은 유저가 고르지 않으므로 행도 시트도 없다(티켓 20261108_2322, 사용자 결정 2026-11-08).
 * 확률 숫자·퍼센트는 어디에도 쓰지 않는다(UX 라이팅 §3.3).
 */

/** 한국어 줄바꿈(UX 라이팅 §3.2) — 문단과 짧은 안내 모두 `text-balance`를 쓴다 */
const TEXT = 'text-sm text-foreground break-keep wrap-break-word text-balance'
const PARAGRAPH = `m-0 ${TEXT}`

interface Props<T extends TierUpMaterial> {
  stageRef: Ref<TierUpGachaHandle>
  /** 지금까지 고른 배지 수(0~6) */
  count: number
  /** 6개 이상 가진 등급이 하나도 없다 */
  showNoEnoughNotice: boolean
  pendingBlocked: boolean
  onOpenSheet: () => void
  sheetOpen: boolean
  onCloseSheet: () => void
  sheet: TierUpSheetView<T>
  onPick: (itemId: string) => void
  onAgain: () => void
  onHandoff: () => void
}

function SheetCells<T extends TierUpMaterial>({ cells, onPick }: { cells: TierUpSheetCell<T>[]; onPick: (itemId: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map(({ item, state }) => (
        <BagItemCell
          key={item.id}
          name={item.badge.name}
          imageUrl={item.badge.image_url}
          state={state}
          onClick={() => (state === 'active' || state === 'selected') && onPick(item.id)}
        />
      ))}
    </div>
  )
}

/** 재료 시트 본문 — 등급 묶음 보기와 비어 있음 두 갈래. 시트 틀(`BottomSheet`)은 `TierUpPanel`이 그린다 */
export function TierUpSheetContent<T extends TierUpMaterial>({
  sheet,
  onPick,
}: {
  sheet: TierUpSheetView<T>
  onPick: (itemId: string) => void
}) {
  if (sheet.kind === 'empty') {
    return <EmptyState icon={<ArrowDownIcon className="w-8 h-8" />} title={d.combine.tierUp.sheetEmpty} />
  }
  return (
    <div className="flex flex-col gap-4">
      {/* 첫 재료를 담은 뒤에만 — 다른 등급 묶음이 흐려진 까닭을 말한다. 묶음 위에 한 번 */}
      {sheet.locked && <p className={`${PARAGRAPH} text-center`}>{tierUpRarityNote(sheet.locked)}</p>}
      {sheet.groups.map((group) => {
        const headingId = `tier-up-group-${group.rarity}`
        return (
          <section key={group.rarity} aria-labelledby={headingId} className="flex flex-col gap-2">
            {/* 묶음 제목은 등급 칩 하나다(캔버스 «JAM! 바텀시트» 08번, 티켓 20261110_2150). 개수와 «6개부터 넣을 수 있어요» 줄은 지웠다 */}
            <h3 id={headingId} className="m-0 flex items-center justify-center">
              <RarityBadge rarity={group.rarity} size="md" showCommon />
            </h3>
            <SheetCells cells={group.cells} onPick={onPick} />
          </section>
        )
      })}
    </div>
  )
}

export default function TierUpPanel<T extends TierUpMaterial>({
  stageRef,
  count,
  showNoEnoughNotice,
  pendingBlocked,
  onOpenSheet,
  sheetOpen,
  onCloseSheet,
  sheet,
  onPick,
  onAgain,
  onHandoff,
}: Props<T>) {
  const notices = (pendingBlocked || showNoEnoughNotice) && (
    <div id="tier-up-notices" className="flex w-full flex-col gap-2">
      {/* «배지 넣기»가 막힌 이유 — 말 없이 막지 않는다 */}
      {pendingBlocked && <InlineNotice>{d.combine.tierUp.pendingBlockedNote}</InlineNotice>}
      {showNoEnoughNotice && <InlineNotice>{d.combine.tierUp.noEnoughNotice}</InlineNotice>}
    </div>
  )
  return (
    <>
      <TierUpGachaStage
        ref={stageRef}
        count={count}
        disabled={pendingBlocked || showNoEnoughNotice}
        sheetOpen={sheetOpen}
        onInsert={onOpenSheet}
        onAgain={onAgain}
        onHandoff={onHandoff}
        notice={notices}
        describedBy="tier-up-notices"
      />

      {/* 재료 시트 — «배지 넣기»로 열고 6개까지 이어서 고른다. 6개가 차면 호출부가 닫고 바로 제출한다. 고른 배지를 다시 누르면 빠진다 */}
      <BottomSheet open={sheetOpen} onClose={onCloseSheet} title={d.combine.bagTitle}>
        <div className="px-6 py-6">
          <TierUpSheetContent sheet={sheet} onPick={onPick} />
        </div>
      </BottomSheet>
    </>
  )
}
