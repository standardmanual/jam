'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ds/components/buttons/Button'
import { Card } from '@ds/components/cards/Card'
import { LabelChip } from '@ds/components/cards/LabelChip'
import { LockedTile } from '@ds/components/cards/LockedTile'
import { ItemSerialCode } from '@ds/components/patterns/ItemSerialCode'
import LocalDate from '@/components/LocalDate'
import SafeImage from '@/components/SafeImage'
import InlineNotice from '@/components/ui/InlineNotice'
import { ListRow } from '@/components/ui/ListRow'
import SwapText from '@/components/ui/SwapText'
import TopNav from '@/components/ui/TopNav'
import { BookIcon, CoinIcon, MedalIcon } from '@/components/ui/icons'
import BadgeHeroSection from '../../badges/[id]/BadgeHeroSection'
import { useToast } from '@/components/ui/Toast'
import { runLockedOpen, type LockedItemEffect } from '@/lib/inventory/lockedItemFill-flow'
import { resolveObtainRoute, type ObtainRouteKey } from '@/lib/inventory/obtainRoute'
import type { LockedItemOpenPayload, LockedItemRarity } from '@/lib/inventory/lockedItemFill-contract'
import { d, t } from '@/lib/i18n'
import { tPoint } from '@/lib/i18n/tPoint'

/**
 * 잠긴 아이템 배지 상세 — `/inventory/[itemId]`가 잠긴 개체일 때 그린다 (티켓 20261018_0054 2회, 20261028_1741 1회, 채원 판정 2026-10-30)
 *
 * 열기 전에는 등급·필요 포인트·가진 포인트·얻은 날과 경로만 보여 준다. 이름·그림·설명·컬렉션·트라이브·일련번호·배지 id는 이 컴포넌트가 받는 props에도
 * 없다(서버 페이지가 내리지 않는다, 운영 로직 7.3절). 잼을 채우는 단계는 없고 «열기» 버튼 하나로 포인트를 내고 연다. 버튼은 필요 포인트 카드 오른쪽에 있다(2026-11-09 사용자 지시, 필요 포인트를 읽지 못해 카드가 없으면 맨 아래 전체 폭 버튼). 열기는 같은 화면에서 제자리로 바뀐다.
 *  - 포인트 블록: 필요 포인트 N(>0)이면 «필요 포인트 / 가진 포인트» 두 줄을 보이고, 가진 포인트가 모자라면 `InlineNotice`로 까닭을 말하고 버튼을 막는다.
 *    0이면 «포인트 없이 열 수 있어요» 한 줄만 두고 막지 않는다. null(정책값을 못 읽음)이면 블록을 그리지 않고 버튼도 그대로 둔다 — 서버가 판정한다.
 *    게이지·분수·막대처럼 모으는 양으로 읽히는 표현은 쓰지 않는다. 포인트는 내는 값이다.
 *  - 제자리 전환: 타일이 그림으로(크로스페이드, 그림은 scale .96 → 1), 제목과 설명은 `SwapText`, 포인트 블록은 높이와 투명도로 접힌다.
 *    «잠김» 칩은 사라지고 등급 칩은 그대로다. 열린 뒤에는 일반 아이템 배지 상세와 같이 일련번호·획득 정보 카드·컬렉션 행만 보여 준다(트라이브·낸 포인트·받은 포인트·«배지 상세 보기» 링크는 두지 않는다, 2026-11-09 사용자 지시).
 *    열기는 획득이 아니라서(운영 로직 7.2절) 열기 문구에는 «획득»을 쓰지 않지만, 받은 일시·경로를 말하는 «획득 정보» 카드는 다른 배지 상세와 같은 «획득» 표현이다(2026-11-09 사용자 결정).
 *  - 열기 응답의 `item`이 null이면(열기는 확정, 정보 조회만 실패) 전환 없이 `router.refresh()`로 서버 페이지의 리다이렉트에 맡긴다.
 *  - 이용 정지(403)는 일반 실패가 아니라 info 토스트다. 버튼은 미리 막지 않고 서버 응답으로 판단한다.
 *  - 서버가 `insufficient_points`로 거절하면 응답의 두 값을 화면 상태에 바로 넣어 모자람 상태로 바꾸고, info 토스트 뒤 `router.refresh()`로 서버 값을 다시 읽는다.
 * 상태가 서버 값과 어긋났을 수 있는 그 밖의 거절(`not_locked` 등)도 안내 뒤 `router.refresh()`로 서버 값을 다시 읽는다.
 * 상세 안 텍스트는 크림 면 위라 보조 문구도 `--foreground`를 쓴다(`--muted`는 흰 면 위에서만).
 */

export interface LockedItemDetailProps {
  itemId: string
  rarity: LockedItemRarity | null
  /** 여는 데 필요한 포인트 — 서버가 읽은 값. 0이면 포인트 없이 열리고, null이면 정책값을 읽지 못한 것이라 화면이 말하지 않고 서버가 판정한다 */
  pointsRequired: number | null
  /** 유저가 가진 포인트 */
  pointBalance: number
  /** 얻은 시각(ISO)과 경로 — 열기 전에도 보여 주는 값 */
  obtainedAt: string
  obtainedBy: string
  /** 발급 기록(`item_issue_log.route`)의 경로. 캡슐에서 나온 개체를 활동 드랍과 가르는 값이다(없으면 `obtainedBy`로만 판단한다) */
  issueRoute?: string | null
  /** 미션 보상으로 받은 개체인가(`mission_item_rewards`에 개체가 있음). 발급 기록이 없을 때 «미션 보상»으로 보인다 */
  missionReward?: boolean
}

/** 획득 경로 문구 — 경로 키(`resolveObtainRoute`)마다 한 문구다 */
const OBTAIN_ROUTE_LABEL: Record<ObtainRouteKey, string> = {
  capsule: d.inventory.obtainByCapsule,
  activity: d.inventory.obtainByDrop,
  mission: d.inventory.obtainByMission,
  checkinPickup: d.inventory.obtainByPickup,
  event: d.inventory.obtainByDropEvent,
  system: d.inventory.obtainBySystem,
}

/** 큰 정사각 타일·그림의 한 변(px) — 일반 배지 상세 카드의 대표 이미지(`BadgeHeroSection`)와 같은 200이다 */
const HERO_SIZE_PX = 200

/** 모션 — 토큰으로만 쓰고 reduced-motion이면 즉시 교체한다 */
const CROSSFADE = 'transition-[opacity,transform] duration-[var(--duration-medium)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none'
const COLLAPSE = 'transition-[grid-template-rows,opacity] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none'

/**
 * 포인트 행의 서클 lead — 미션·배지 상세의 포인트 보상 행과 같은 서클이다(`--accent` 면 + `--accent-foreground` 코인 아이콘).
 */
function PointCircle() {
  return (
    <span className="flex h-full w-full items-center justify-center" style={{ background: 'var(--accent)' }}>
      <CoinIcon className="h-5 w-5" style={{ color: 'var(--accent-foreground)' }} />
    </span>
  )
}

export default function LockedItemDetail({ itemId, rarity, pointsRequired, pointBalance, obtainedAt, obtainedBy, issueRoute = null, missionReward = false }: LockedItemDetailProps) {
  const router = useRouter()
  const { toast } = useToast()
  /** 화면이 보여 주는 포인트 값 — 서버가 준 값에서 시작하고, `insufficient_points` 거절 응답이 바로 덮어쓴다 */
  const [pointsView, setPointsView] = useState({ required: pointsRequired, balance: pointBalance })
  const [pending, setPending] = useState(false)
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
  const { required, balance } = pointsView
  /** 모자란 포인트 — 필요 포인트를 알고 0보다 클 때만 따진다. 0이나 null은 막지 않는다(서버가 최종 판정한다) */
  const shortfall = required !== null && required > 0 && balance < required ? required - balance : 0
  const blocked = shortfall > 0

  const applyEffect = useCallback(
    (effect: LockedItemEffect) => {
      if (effect === 'refresh') router.refresh()
      else if (effect === 'inventory') router.push('/inventory')
    },
    [router]
  )

  async function handleOpen() {
    if (pending) return
    setPending(true)
    const outcome = await runLockedOpen(itemId)
    setPending(false)

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
    // 포인트가 모자라다는 거절이면 응답의 값으로 바로 모자람 상태를 보인다. 서버 값을 다시 읽어 달라지면 key가 바뀌어 새 값에서 다시 시작한다
    if (outcome.points) setPointsView({ required: outcome.points.required, balance: outcome.points.balance })
    toast(outcome.notice.message, outcome.notice.type)
    applyEffect(outcome.effect)
  }

  const title = view ? view.item.name : d.lockedItem.card.name
  const description = view ? view.item.description : d.lockedItem.detail.description
  const displayRarity = view ? (view.item.rarity ?? rarity) : rarity
  const serialCode =
    view && view.payload.serialNumber !== null && view.payload.serialPrefix !== null
      ? `${view.payload.serialPrefix}${String(view.payload.serialNumber).padStart(6, '0')}`
      : null

  /** «열기» 버튼 — 필요 포인트 카드가 있으면 그 카드 오른쪽에, 없으면(필요 포인트를 읽지 못함) 맨 아래에 놓는다 */
  const openButton = (compact: boolean) => (
    <Button
      variant="primary"
      size={compact ? 'sm' : 'md'}
      fullWidth={!compact}
      disabled={pending || blocked}
      aria-busy={pending || undefined}
      className="whitespace-nowrap"
      onClick={handleOpen}
    >
      <SwapText value={pending ? d.lockedItem.detail.opening : d.lockedItem.detail.openCta} />
    </Button>
  )

  // 히어로 카드가 읽는 배지 값 — 일반 아이템 배지 상세(`BadgeHeroSection`)와 같은 카드를 쓴다. 이름·설명·칩·이미지는 아래 슬롯이 정하고
  // 배경 값은 비운다(잠긴 상세는 배경 테마가 없다). 열기 전에는 가린 이름·등급만 들어간다.
  const heroBadge = {
    image_url: null,
    name: title,
    rarity: displayRarity,
    description: '',
    level: null,
    background_color: null,
    background_shader_id: null,
    background_image_url: null,
    background_animation: null,
  }

  return (
    <div className="min-h-full text-foreground">
      <TopNav backHref="/inventory" />

      {/* 일반 아이템 배지 상세와 같은 카드: 대표 이미지(타일 → 그림 크로스페이드), 등급 칩(+ «잠김» 칩), 이름, 설명이 한 카드에 있다 */}
      <BadgeHeroSection
        badge={heroBadge}
        hasEarned
        imageSlot={
          <div className="relative shrink-0" style={{ width: HERO_SIZE_PX, height: HERO_SIZE_PX }}>
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
                  className="h-full w-full object-contain"
                  fallback={<MedalIcon className="mx-auto h-16 w-16 text-muted" />}
                />
              </div>
            )}
          </div>
        }
        // 등급 칩은 열려도 그대로고, «잠김» 칩만 사라진다
        chipExtra={isOpened ? undefined : <LabelChip>{d.lockedItem.detail.chip}</LabelChip>}
        titleNode={<SwapText value={title} />}
        descriptionNode={description !== '' ? <SwapText value={description} /> : undefined}
      />

      {/* 열린 뒤의 일련번호 — 일반 아이템 배지 상세와 같은 자리(카드 바로 아래, 가운데)와 간격이고, 숫자가 릴처럼 돌아 멈추는 모션도 같다
          (2026-11-10 사용자 지시: 꺼 두었던 모션을 다시 켬). 열기 응답으로 이 칸이 처음 그려질 때 한 번 돈다. */}
      {serialCode !== null && (
        <div className="relative z-10 flex justify-center px-4 pt-3 pb-[32px]">
          <ItemSerialCode code={serialCode} height={50} />
        </div>
      )}

      <div className="relative z-10 flex flex-col gap-5 px-4 pb-6">
        {/* 포인트 블록 — 열리면 높이와 투명도로 접힌다. 필요 포인트를 모르면(null) 그리지 않는다 */}
        {required !== null && (
          <div
            className={`grid ${COLLAPSE} ${isOpened ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
            aria-hidden={isOpened || undefined}
            // 접히는 동안 안의 «열기» 버튼이 키보드로 눌리지 않게 막는다
            inert={isOpened ? true : undefined}
          >
            <div className="overflow-hidden">
              <div className="flex flex-col gap-3">
                {/* 필요 포인트 — 미션·배지 상세의 포인트 보상 행과 같은 모양(tint 행 + 서클 + «N 포인트»)이다(2026-11-09 사용자 지시) */}
                {required === 0 ? (
                  <ListRow tone="tint" leadShape="round" lead={<PointCircle />} title={d.lockedItem.detail.points.free} trail={openButton(true)} />
                ) : (
                  <ListRow
                    tone="tint"
                    leadShape="round"
                    lead={<PointCircle />}
                    title={tPoint(d.lockedItem.detail.points.requiredLine, { points: required.toLocaleString('ko-KR') })}
                    meta={t(d.lockedItem.detail.points.balanceLine, { balance: balance.toLocaleString('ko-KR') })}
                    trail={openButton(true)}
                  />
                )}
                {blocked && <InlineNotice>{tPoint(d.lockedItem.detail.points.shortage, { short: shortfall.toLocaleString('ko-KR') })}</InlineNotice>}
              </div>
            </div>
          </div>
        )}

        {/* 획득 정보 — 다른 배지 상세와 같은 카드: 제목 한 줄 + 라벨·값 행(획득 일시, 획득 경로) */}
        <Card>
          <p className="mb-1 text-base font-bold text-foreground">{d.badges.earnInfoTitle}</p>
          <div className="flex flex-col -mb-3">
            <ListRow
              tone="flat"
              titleVariant="label"
              titleLines={0}
              title={d.badges.earnedAt}
              value={<LocalDate iso={obtainedAt} stamp stampBreak />}
              valueNoWrap
            />
            <ListRow tone="flat" titleVariant="label" titleLines={0} title={d.badges.earnRoute} value={OBTAIN_ROUTE_LABEL[resolveObtainRoute(obtainedBy, issueRoute, missionReward)]} />
          </div>
        </Card>

        {/* 속한 컬렉션 — 일반 상세와 같은 행(타일 lead + 이름 + 쉐브론, 컬렉션 상세로 연결) */}
        {view?.item.collection && (
          <ListRow
            href={`/collections/${view.item.collection.id}`}
            leadShape="tile"
            lead={<BookIcon className="h-5 w-5 text-foreground" />}
            title={view.item.collection.name}
            chevron
          />
        )}

        {/* 필요 포인트를 읽지 못해 포인트 카드가 없을 때만 맨 아래에 전체 폭 «열기» 버튼을 둔다 */}
        {!view && required === null && openButton(false)}
      </div>
    </div>
  )
}
