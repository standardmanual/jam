'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@ds/components/buttons/Button'
import { LabelChip } from '@ds/components/cards/LabelChip'
import { LockedTile } from '@ds/components/cards/LockedTile'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { ItemSerialCode } from '@ds/components/patterns/ItemSerialCode'
import LocalDate from '@/components/LocalDate'
import JamBalance from '@/components/jam/JamBalance'
import JamFillPanel from '@/components/jam/JamFillPanel'
import SafeImage from '@/components/SafeImage'
import BottomSheet from '@/components/ui/BottomSheet'
import SwapText from '@/components/ui/SwapText'
import TopNav from '@/components/ui/TopNav'
import { MedalIcon } from '@/components/ui/icons'
import { useToast } from '@/components/ui/Toast'
import { runLockedFill, runLockedOpen, type LockedItemEffect } from '@/lib/inventory/lockedItemFill-flow'
import { lockedFillPercent, type LockedItemOpenPayload, type LockedItemRarity } from '@/lib/inventory/lockedItemFill-contract'
import { d, t } from '@/lib/i18n'

/**
 * 잠긴 아이템 배지 상세 — `/inventory/[itemId]`가 잠긴 개체일 때 그린다 (티켓 20261018_0054 2회, 채원 판정 2026-10-18)
 *
 * 열기 전에는 등급·필요한 양·채운 양·얻은 날과 경로만 보여 준다. 이름·그림·설명·컬렉션·트라이브·일련번호·배지 id는 이 컴포넌트가 받는 props에도
 * 없다(서버 페이지가 내리지 않는다, 운영 로직 7.3절). 채우기는 캡슐과 같은 `JamFillPanel`을 시트로 띄워 하고, 열기는 같은 화면에서 제자리로 바뀐다.
 *  - 제자리 전환: 타일이 그림으로(크로스페이드, 그림은 scale .96 → 1), 제목과 설명은 `SwapText`, 게이지·가진 잼 줄은 높이와 투명도로 접힌다.
 *    «잠김» 칩은 사라지고 등급 칩은 그대로다. 열린 뒤에는 일련번호·컬렉션·트라이브와 «배지 상세 보기» 링크를 보여 준다(배지 상세를 다시 만들지 않는다).
 *  - 열기 응답의 `item`이 null이면(열기는 확정, 정보 조회만 실패) 전환 없이 `router.refresh()`로 서버 페이지의 리다이렉트에 맡긴다.
 *  - 이용 정지(403)는 일반 실패가 아니라 info 토스트다. 버튼은 미리 막지 않고 서버 응답으로 판단한다.
 * 상태가 서버 값과 어긋났을 수 있는 거절(`exceeds_remaining`·`not_locked` 등)은 안내 뒤 `router.refresh()`로 서버 값을 다시 읽는다.
 * 상세 안 텍스트는 크림 면 위라 보조 문구도 `--foreground`를 쓴다(`--muted`는 흰 면 위에서만).
 */

export interface LockedItemDetailProps {
  itemId: string
  rarity: LockedItemRarity | null
  /** 여는 데 필요한 잼 — 서버가 읽은 값 */
  required: number
  /** 지금까지 채운 잼 — 서버가 읽은 값 */
  filled: number
  /** 유저가 가진 잼 */
  balance: number
  /** 얻은 시각(ISO)과 경로 — 열기 전에도 보여 주는 값 */
  obtainedAt: string
  obtainedBy: string
}

/** 얻은 경로 문구 — 이력 시트(`InventoryItemHistorySheet`)와 같은 매핑이다 */
function obtainLabel(obtainedBy: string): string {
  if (obtainedBy === 'drop') return d.inventory.obtainByDrop
  if (obtainedBy === 'drop_event') return d.inventory.obtainByDropEvent
  if (obtainedBy === 'pickup') return d.inventory.obtainByPickup
  return d.inventory.obtainBySystem
}

/** 큰 정사각 타일·그림의 한 변(px) */
const HERO_SIZE_PX = 160

/** 모션 — 토큰으로만 쓰고 reduced-motion이면 즉시 교체한다 */
const CROSSFADE = 'transition-[opacity,transform] duration-[var(--duration-medium)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none'
const COLLAPSE = 'transition-[grid-template-rows,opacity] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none'

export default function LockedItemDetail({ itemId, rarity, required, filled, balance, obtainedAt, obtainedBy }: LockedItemDetailProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [gauge, setGauge] = useState({ filled, balance })
  const [fillOpen, setFillOpen] = useState(false)
  const [pending, setPending] = useState<'fill' | 'open' | null>(null)
  const [opened, setOpened] = useState<LockedItemOpenPayload | null>(null)
  /** 크로스페이드 시작 신호 — 열린 직후 한 프레임 뒤에 켜서 전환이 보이게 한다 */
  const [revealed, setRevealed] = useState(false)
  const frameRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    },
    []
  )

  // 열린 뒤 화면은 개체 정보가 있을 때만 그린다(`item`이 null인 응답은 전환하지 않고 서버 페이지에 맡긴다)
  const view = opened !== null && opened.item !== null ? { payload: opened, item: opened.item } : null
  const isOpened = view !== null
  const remaining = Math.max(0, required - gauge.filled)
  const openable = remaining === 0
  const hasJam = gauge.balance > 0

  const applyEffect = useCallback(
    (effect: LockedItemEffect) => {
      if (effect === 'refresh') router.refresh()
      else if (effect === 'inventory') router.push('/inventory')
    },
    [router]
  )

  async function handleConfirmFill(amount: number) {
    if (pending) return
    setPending('fill')
    const outcome = await runLockedFill(itemId, amount)
    setPending(null)

    if (outcome.kind === 'filled') {
      // 응답이 새 값이다 — 게이지가 차오르고 시트가 닫힌다
      setGauge({ filled: outcome.payload.filled, balance: outcome.payload.balance })
      setFillOpen(false)
      return
    }
    toast(outcome.notice.message, outcome.notice.type)
    // 거절이면 입력의 근거(남은 양·가진 잼)가 달라졌을 수 있다 — 시트를 닫고 서버 값을 다시 읽는다
    if (outcome.effect !== 'none') setFillOpen(false)
    applyEffect(outcome.effect)
  }

  async function handleOpen() {
    if (pending) return
    setPending('open')
    const outcome = await runLockedOpen(itemId)
    setPending(null)

    if (outcome.kind === 'opened') {
      if (outcome.payload.item === null) {
        // 열기는 확정이고 정보 조회만 실패했다 — 전환 없이 서버 페이지가 열린 개체를 배지 상세로 보내게 한다
        router.refresh()
        return
      }
      setOpened(outcome.payload)
      toast(d.lockedItem.detail.openedToast, 'success')
      frameRef.current = requestAnimationFrame(() => setRevealed(true))
      return
    }
    toast(outcome.notice.message, outcome.notice.type)
    applyEffect(outcome.effect)
  }

  const title = view ? view.item.name : d.lockedItem.card.name
  const description = view ? view.item.description : t(d.lockedItem.card.description, { n: required })
  const displayRarity = view ? (view.item.rarity ?? rarity) : rarity
  const serialCode =
    view && view.payload.serialNumber !== null && view.payload.serialPrefix !== null
      ? `${view.payload.serialPrefix}${String(view.payload.serialNumber).padStart(6, '0')}`
      : null

  return (
    <div className="min-h-full text-foreground">
      <TopNav backHref="/inventory" />

      <div className="flex flex-col gap-4 px-6 pb-10 pt-4">
        {/* 히어로 — 이 화면에서 가운데 정렬은 타일 하나뿐이다. 타일과 그림이 같은 자리에서 크로스페이드한다 */}
        <div className="relative mx-auto shrink-0" style={{ width: HERO_SIZE_PX, height: HERO_SIZE_PX }}>
          <div className={`absolute inset-0 ${CROSSFADE} ${isOpened ? 'opacity-0' : 'opacity-100'}`}>
            <LockedTile size={HERO_SIZE_PX} />
          </div>
          {view && (
            <div className={`absolute inset-0 ${CROSSFADE} ${revealed ? 'scale-100 opacity-100' : 'scale-[0.96] opacity-0'}`}>
              <SafeImage
                src={view.item.imageUrl}
                alt={view.item.name}
                width={HERO_SIZE_PX}
                height={HERO_SIZE_PX}
                className="h-full w-full object-contain p-2"
                fallback={<MedalIcon className="mx-auto h-16 w-16 text-muted" />}
              />
            </div>
          )}
        </div>

        {/* 등급 칩은 열려도 그대로고, «잠김» 칩만 사라진다 */}
        <div className="flex items-center gap-2">
          {displayRarity !== null && <RarityBadge rarity={displayRarity} size="md" />}
          {!isOpened && <LabelChip>{d.lockedItem.detail.chip}</LabelChip>}
        </div>

        <h1 className="m-0 break-keep wrap-break-word text-balance text-2xl font-bold text-foreground">
          <SwapText value={title} />
        </h1>
        {description !== '' && (
          <p className="m-0 break-keep wrap-break-word text-pretty text-base text-foreground">
            <SwapText value={description} />
          </p>
        )}

        {/* 게이지와 가진 잼 줄 — 열리면 높이와 투명도로 접힌다 */}
        <div
          className={`grid ${COLLAPSE} ${isOpened ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
          aria-hidden={isOpened || undefined}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-4">
              {/* 게이지는 색과 외곽선만으로 읽히지 않게 같은 정보를 글자(스크린리더 이름)로도 준다. 진행 숫자와 퍼센트는 어디에도 없다 */}
              <div role="img" aria-label={d.lockedItem.detail.gaugeAria[openable ? 'ready' : 'filling']}>
                <ProgressBar
                  outlined
                  percent={lockedFillPercent(gauge.filled, required)}
                  fillMode="track-gradient"
                  trackColor="var(--background)"
                  height={10}
                  labelType="none"
                />
              </div>
              <JamBalance balance={gauge.balance} />
            </div>
          </div>
        </div>

        {view ? (
          <div className="flex flex-col gap-3">
            {serialCode !== null && (
              <div className="flex justify-start">
                <ItemSerialCode code={serialCode} height={50} animate={false} />
              </div>
            )}
            {view.item.collection && (
              <p className="m-0 break-keep wrap-break-word text-base text-foreground">{t(d.lockedItem.detail.opened.collection, { name: view.item.collection.name })}</p>
            )}
            {view.item.tribe && (
              <p className="m-0 break-keep wrap-break-word text-base text-foreground">{t(d.lockedItem.detail.opened.tribe, { name: view.item.tribe.name })}</p>
            )}
            {view.payload.pointsAwarded > 0 && (
              <p className="m-0 break-keep wrap-break-word text-base text-foreground">
                {t(d.lockedItem.detail.opened.points, { points: view.payload.pointsAwarded.toLocaleString('ko-KR') })}
              </p>
            )}
          </div>
        ) : null}

        <p className="m-0 break-keep wrap-break-word text-sm text-foreground">
          {d.inventory.obtainedAt} <LocalDate iso={obtainedAt} korean={{ year: true }} /> · {obtainLabel(obtainedBy)}
        </p>

        {view ? (
          <Link
            href={`/badges/${view.payload.badgeId}?item=${encodeURIComponent(itemId)}&from=inventory`}
            className="inline-flex min-h-11 items-center self-start break-keep wrap-break-word whitespace-nowrap text-base text-[color:var(--link)]"
          >
            {d.lockedItem.detail.opened.badgeLink}
          </Link>
        ) : openable ? (
          <Button variant="primary" fullWidth disabled={pending === 'open'} aria-busy={pending === 'open' || undefined} className="whitespace-nowrap" onClick={handleOpen}>
            <SwapText value={pending === 'open' ? d.lockedItem.detail.opening : d.lockedItem.detail.openCta} />
          </Button>
        ) : (
          <>
            <Button variant="primary" fullWidth disabled={!hasJam} className="whitespace-nowrap" onClick={() => setFillOpen(true)}>
              {d.lockedItem.detail.fillCta}
            </Button>
            {!hasJam && (
              <p className="m-0 break-keep wrap-break-word text-pretty text-sm text-foreground">{d.capsule.sheet.noJam}</p>
            )}
          </>
        )}
      </div>

      {/* 채우기 입력은 캡슐과 같은 JamFillPanel이다 — 시트가 열릴 때마다 새로 그려 기본값에서 시작한다 */}
      <BottomSheet
        open={fillOpen}
        onClose={() => {
          if (!pending) setFillOpen(false)
        }}
        title={d.lockedItem.detail.fillTitle}
        titleClassName="text-base break-keep wrap-break-word text-balance"
      >
        {fillOpen && (
          <>
            <JamFillPanel remaining={remaining} balance={gauge.balance} pending={pending === 'fill'} onConfirm={handleConfirmFill} />
            <div className="px-6 pb-6">
              <Button variant="ghost" fullWidth disabled={pending === 'fill'} className="whitespace-nowrap" onClick={() => setFillOpen(false)}>
                {d.lockedItem.detail.cancel}
              </Button>
            </div>
          </>
        )}
      </BottomSheet>
    </div>
  )
}
