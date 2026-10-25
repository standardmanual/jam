'use client'

import Link from 'next/link'
import { MixerSlot } from '@ds/components/patterns/MixerSlot'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { getRarityLabel } from '@ds/components/cards/RarityBadge'
import BottomSheet from '@/components/ui/BottomSheet'
import InlineNotice from '@/components/ui/InlineNotice'
import { PackageIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import BagItemCell from './BagItemCell'
import { TierUpCollectionRow, TierUpCollectionSheetContent } from './TierUpCollectionPicker'
import {
  tierUpRarityNote,
  type TierUpCollectionView,
  type TierUpMaterial,
  type TierUpSheetCell,
  type TierUpSheetView,
} from './tierUpClient'

/**
 * 등급 올리기 화면 본문 (티켓 20261022_2119 3회, 채원 사전 판정 2026-10-23) — 서비스 전용 조립 컴포넌트, MODULAR 승격은 하지 않는다.
 *
 * 그리기만 한다. 담은 칸·시트 열림·제출 중 상태와 `/api/combine/tier-up` 호출은 `CombineClient`가 갖는다(`PendingResultsSheet`와 같은 분리).
 * 위에서 아래로 설명 문단, «확률 안내» 링크, 슬롯 5칸(3+2), 등급 안내 한 줄, «받을 컬렉션» 행(티켓 20261023_1648 3회), (조건부) 안내, 제출 버튼,
 * 재료 시트, 컬렉션 시트 순이다. 컬렉션 행·시트 본문은 `TierUpCollectionPicker`가 그리고 여기서는 슬롯 아래에 끼우기만 한다.
 * 확률 숫자·퍼센트는 어디에도 쓰지 않는다 — 링크 이름 하나만 둔다(UX 라이팅 §3.3).
 */

/** 한국어 줄바꿈(UX 라이팅 §3.2) — 문단은 `text-pretty`, 짧은 안내는 `text-balance`를 더한다 */
const TEXT = 'text-sm text-foreground break-keep wrap-break-word text-pretty'
const PARAGRAPH = `m-0 ${TEXT}`

interface Props<T extends TierUpMaterial> {
  /** 칸 순서대로 5개 — 목록에서 찾을 수 없는 개체는 호출부가 이미 null로 걸렀다 */
  slots: (T | null)[]
  /** 담을 수 있는 아이템 배지가 하나도 없으면 빈 칸이 잠긴 모양(locked)이다 */
  noMaterials: boolean
  /** 첫 재료를 담은 뒤에만 값이 있다. 줄 자리는 항상 잡아 둔다 */
  rarityNote: string | null
  /** 5개 이상 가진 등급이 하나도 없다 */
  showNoEnoughNotice: boolean
  canSubmit: boolean
  submitting: boolean
  pendingBlocked: boolean
  onOpenSheet: (slotIndex: number) => void
  onRemove: (slotIndex: number) => void
  onSubmit: () => void
  sheetOpen: boolean
  onCloseSheet: () => void
  sheet: TierUpSheetView<T>
  onPick: (itemId: string) => void
  /** 받을 컬렉션 행·시트가 그릴 모양. `showNoEnoughNotice`일 때는 행을 그리지 않는다(올릴 수 없는데 «재료를 넣으면»이라고 말하면 거짓이 된다) */
  collection: TierUpCollectionView
  collectionSheetOpen: boolean
  onOpenCollectionSheet: () => void
  onCloseCollectionSheet: () => void
  /** 시트의 줄을 눌렀다 — 호출부가 고르고 시트를 닫는다 */
  onPickCollection: (collectionId: string) => void
  /** 읽기 실패 안내의 «다시 불러오기» */
  onRetryCollections: () => void
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
          onClick={() => state === 'active' && onPick(item.id)}
        />
      ))}
    </div>
  )
}

/** 재료 시트 본문 — 묶음 보기, 등급 고정 보기, 비어 있음 세 갈래. 시트 틀(`BottomSheet`)은 `TierUpPanel`이 그린다 */
export function TierUpSheetContent<T extends TierUpMaterial>({
  sheet,
  onPick,
}: {
  sheet: TierUpSheetView<T>
  onPick: (itemId: string) => void
}) {
  if (sheet.kind === 'empty') {
    return <EmptyState icon={<PackageIcon className="w-8 h-8" />} title={d.combine.tierUp.sheetEmpty} />
  }
  if (sheet.kind === 'locked') {
    return (
      <div className="flex flex-col gap-2">
        <p className={PARAGRAPH}>{tierUpRarityNote(sheet.rarity)}</p>
        <SheetCells cells={sheet.cells} onPick={onPick} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {sheet.groups.map((group) => {
        const headingId = `tier-up-group-${group.rarity}`
        return (
          <section key={group.rarity} aria-labelledby={headingId} className="flex flex-col gap-2">
            <h3 id={headingId} className={PARAGRAPH}>
              {t(d.combine.tierUp.groupTitle, { rarity: getRarityLabel(group.rarity) ?? '', count: group.count })}
            </h3>
            {!group.enough && <p className={PARAGRAPH}>{d.combine.tierUp.groupShort}</p>}
            <SheetCells cells={group.cells} onPick={onPick} />
          </section>
        )
      })}
    </div>
  )
}

export default function TierUpPanel<T extends TierUpMaterial>({
  slots,
  noMaterials,
  rarityNote,
  showNoEnoughNotice,
  canSubmit,
  submitting,
  pendingBlocked,
  onOpenSheet,
  onRemove,
  onSubmit,
  sheetOpen,
  onCloseSheet,
  sheet,
  onPick,
  collection,
  collectionSheetOpen,
  onOpenCollectionSheet,
  onCloseCollectionSheet,
  onPickCollection,
  onRetryCollections,
}: Props<T>) {
  return (
    <>
      <div className="px-4 pt-4">
        <p className={PARAGRAPH}>{d.combine.tierUp.description}</p>
      </div>

      {/* 확률 안내 링크 — 설명 바로 아래, 슬롯을 채우기 전에 읽고 가는 순서. 모양은 캡슐 시트의 같은 이름 링크(`CapsuleSheet.tsx`)와 같다.
          누르면 /probability로 이동하고 돌아오면 채운 칸이 비워진다(화면 상태가 클라이언트에만 있다). 숫자와 퍼센트는 쓰지 않는다 */}
      <div className="px-4">
        <Link
          href="/probability"
          className="inline-flex min-h-11 items-center self-start break-keep wrap-break-word whitespace-nowrap text-sm text-muted underline underline-offset-2 active:opacity-60 transition-opacity duration-[var(--duration-micro)]"
        >
          {d.capsule.sheet.probabilityLink}
        </Link>
      </div>

      <div className="flex-1 px-4 pt-2 pb-6">
        {/* 5칸은 레시피 믹서와 같이 3열(3+2)이다. 제출 중에는 칸을 건드릴 수 없다(MixerSlot에 disabled가 없어 핸들러를 넘기지 않는다) */}
        <div className="grid grid-cols-3 gap-2">
          {slots.map((item, index) => (
            <MixerSlot
              key={index}
              status={item ? 'filled' : noMaterials ? 'locked' : 'empty'}
              name={item?.badge.name}
              imageUrl={item?.badge.image_url}
              onClick={item || submitting ? undefined : () => onOpenSheet(index)}
              onRemove={item && !submitting ? () => onRemove(index) : undefined}
            />
          ))}
        </div>

        {/* 등급 안내 한 줄 — 줄이 생겨도 레이아웃이 밀리지 않게 자리를 항상 잡는다. 진행률 문구는 쓰지 않는다 */}
        <p aria-live="polite" className={`${TEXT} mt-2 min-h-5`}>
          {rarityNote}
        </p>

        {/* 받을 컬렉션 — 재료 등급이 정해져야 고를 목록이 정해지므로 재료 뒤 단계다. 행이 갈래마다 바뀌는 것을 스크린리더가 읽도록 래퍼 하나가
            aria-live(polite)다. 5개 모인 등급이 없어 아래 안내가 뜨는 때는 이 블록 전체를 그리지 않는다 */}
        {!showNoEnoughNotice && (
          <div aria-live="polite" className="mt-2">
            <TierUpCollectionRow view={collection} submitting={submitting} onOpen={onOpenCollectionSheet} onRetry={onRetryCollections} />
          </div>
        )}

        {showNoEnoughNotice && (
          <InlineNotice className="mt-2">{d.combine.tierUp.noEnoughNotice}</InlineNotice>
        )}
      </div>

      {/* CTA — 레시피 믹서의 CTA(`CombineClient.tsx`, `max-w-[220px]` 버튼)와 같은 모양이다. 기존 `CombineClient.test.tsx`가 믹서 트리에서 이 버튼을
          요소 그대로 찾아 부르므로 컴포넌트로 추출하면 시험이 깨진다 — 추출을 취소하고 복사한다(채원 판정의 취소 조건). 믹서 쪽을 고치면 이쪽도 맞춘다 */}
      <div className="px-4 pb-6 flex flex-col items-center gap-2">
        <button
          onClick={onSubmit}
          disabled={submitting || !canSubmit || pendingBlocked}
          aria-describedby={pendingBlocked ? 'tier-up-pending-note' : undefined}
          className="w-full max-w-[220px] py-4 rounded-full bg-foreground text-background text-base active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {submitting && <span className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />}
          {submitting ? d.combine.tierUp.submitLoading : d.combine.tierUp.submit}
        </button>
        {/* 제출이 막힌 이유 — 말 없이 막지 않는다. 읽혀야 하는 정보라 muted가 아니라 foreground로 둔다 */}
        {pendingBlocked && (
          <p id="tier-up-pending-note" className={`${PARAGRAPH} self-stretch`}>
            {d.combine.tierUp.pendingBlockedNote}
          </p>
        )}
        <p className="m-0 text-xs text-muted text-center break-keep wrap-break-word text-balance">{d.combine.tierUp.burnNotice}</p>
      </div>

      {/* 재료 시트 — 칸 하나를 눌러 열고 5개까지 이어서 담는다. 5칸이 차면 호출부가 닫는다 */}
      <BottomSheet open={sheetOpen} onClose={onCloseSheet} title={d.combine.bagTitle}>
        <div className="px-4 pt-2 pb-6">
          <TierUpSheetContent sheet={sheet} onPick={onPick} />
        </div>
      </BottomSheet>

      {/* 컬렉션 시트 — 줄 하나를 누르면 호출부가 고르고 바로 닫는다. 재료 시트와 동시에 열리지 않게 호출부가 한쪽을 열 때 다른 쪽을 닫는다 */}
      <BottomSheet open={collectionSheetOpen} onClose={onCloseCollectionSheet} title={d.combine.tierUp.collectionPicker.sheetTitle} detent="compact">
        <div className="px-4 pt-2 pb-6">
          {collection.kind === 'ready' && (
            <TierUpCollectionSheetContent choices={collection.choices} selectedId={collection.selectedId} onPick={onPickCollection} />
          )}
        </div>
      </BottomSheet>
    </>
  )
}
