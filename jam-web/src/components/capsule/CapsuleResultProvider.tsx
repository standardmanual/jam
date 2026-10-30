'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import BadgeRevealOverlay from '@/components/BadgeRevealOverlay'
import { gaugeCircleDiameter, CAPSULE_GAUGE_HEIGHT_PX } from '@/components/capsule/CapsuleGauge'
import CapsuleResultOverlay from '@/components/capsule/CapsuleResultOverlay'
import { CapsuleResultContext, type CapsuleResultContextValue } from '@/components/capsule/capsuleResultContext'
import { toRevealRewards } from '@/components/capsule/capsuleReveal'
import { getBrowserStorage } from '@/components/chapter/ChapterRiseWatcher'
import { markUnseenSeen } from '@/lib/capsule/capsule-client'
import type { CapsuleChapterBadge, CapsuleOpenedItem, CapsuleUnseenResult } from '@/lib/capsule/capsule-contract'
import {
  beginClosing,
  createFlowState,
  finishClosing,
  finishSession,
  isGaugeHeld,
  isOverlayMounted,
  isResultPending,
  markViaRewards,
  pickResultOrigin,
  receiveResult,
  rememberShownChapter,
  startOverlay,
  type ResultFlowState,
} from '@/lib/capsule/result-flow'
import { buildCapsuleResultView } from '@/lib/capsule/result-overlay-model'
import { useTabBarHidden } from '@/lib/uiOverlay'

/**
 * 합친 연출 프로바이더 — 레이아웃 한 곳에서 보지 않은 캡슐 결과를 연출 한 번으로 보여 준다 (티켓 20261028_1740 3회, 채원 사전 판정)
 *
 * `(main)/layout.tsx`가 서버에서 한 번 읽은 결과(`initialResult`)를 받는다. 클라이언트는 따로 조회하지 않는다.
 * 동기화 뒤 `router.refresh()`가 레이아웃을 다시 읽히면 새 `ids`의 결과가 내려와 한 번 더 띄운다. 같은 `ids`는 다시 띄우지 않는다(`lib/capsule/result-flow.ts`).
 *
 * 흐름: 기다림(다른 오버레이가 열려 있으면 닫힐 때까지) → 오버레이(`CapsuleResultOverlay`) → 닫는 중 → «획득한 배지 보기»였으면 `BadgeRevealOverlay` → 끝.
 *  - 기다리는 동안 기기 저장과 «봤어요» 호출을 하지 않는다. 저장(합친 연출이 보여 줄 챕터를 «마지막으로 축하한 챕터»로)은 띄우기 직전에 한다 —
 *    같은 오름이 챕터 오름 카드로 또 뜨지 않는다. 저장이 막혀 있어도 연출은 띄운다.
 *  - «봤어요»는 오버레이를 닫기 시작하는 시점(`onDismiss`)에 한 번 보낸다. 실패해도 화면은 진행하고 로그만 남긴다(다음 접속에 다시 보인다).
 *  - 게이지(`CapsuleGauge`)는 기다림·오버레이 동안 2% 원에 붙들리고(`gaugeHeld`), 닫기 시작과 함께 풀려 지금 값까지 차오른다.
 *    연출이 번져 나갈 자리는 게이지의 채움이 화면에 보이면 그 자리, 없으면(게이지 없는 화면·화면 밖) 화면 가운데의 같은 크기 원이다.
 *  - 다른 오버레이 판단은 `useTabBarHidden()`이다. 기다림 단계에서만 보므로 이 프로바이더 자신의 오버레이(오버레이·보상 화면)가 연 탭바 숨김에 막히지 않는다.
 *  - 챕터가 없는 유저도 결과를 본다(챕터 조건에 묶지 않는다).
 */

interface Props {
  /** 레이아웃이 읽은 보지 않은 결과. 없거나 읽지 못했으면 null */
  initialResult: CapsuleUnseenResult | null
  userId: string
  children: ReactNode
}

const GAUGE_CIRCLE_PX = gaugeCircleDiameter(CAPSULE_GAUGE_HEIGHT_PX)

export default function CapsuleResultProvider({ initialResult, userId, children }: Props) {
  const [flow, setFlow] = useState<ResultFlowState>(() => receiveResult(createFlowState(), initialResult))
  // 레이아웃이 새 결과를 내려주면(refresh) 렌더 중에 받는다. 받을 것이 없으면 같은 값이라 다시 그리지 않는다
  const received = receiveResult(flow, initialResult)
  if (received !== flow) setFlow(received)

  const fillElementRef = useRef<HTMLElement | null>(null)
  const registerGaugeFill = useCallback((element: HTMLElement | null) => {
    fillElementRef.current = element
  }, [])

  const tabBarHidden = useTabBarHidden()
  const session = flow.session
  const stage = session?.stage ?? null
  const result = session?.result ?? null
  const ids = result?.ids
  const view = useMemo(
    () => (result ? buildCapsuleResultView<CapsuleOpenedItem, CapsuleChapterBadge>(result.events, result.chapterBadges) : null),
    [result]
  )
  const rewardBadges = useMemo(() => (view ? toRevealRewards(view.rewards) : []), [view])

  // 기다림 → 오버레이: 다른 오버레이가 닫혀 있을 때 한 번. 이펙트 본문에서 곧바로 setState를 부르면
  // react-hooks/set-state-in-effect에 걸려 마이크로태스크로 미룬다(ChapterRiseWatcher와 같은 방식)
  useEffect(() => {
    if (stage !== 'waiting' || tabBarHidden) return
    let alive = true
    void Promise.resolve().then(() => {
      if (!alive) return
      if (!view) {
        setFlow(finishSession)
        return
      }
      if (view.titleKind === 'chapter') rememberShownChapter(getBrowserStorage(), userId, view.chapterNo)
      const fill = fillElementRef.current?.getBoundingClientRect() ?? null
      const origin = pickResultOrigin(fill, { width: window.innerWidth, height: window.innerHeight }, GAUGE_CIRCLE_PX)
      setFlow((prev) => startOverlay(prev, origin))
    })
    return () => {
      alive = false
    }
  }, [stage, tabBarHidden, view, userId])

  const handleViewRewards = useCallback(() => setFlow(markViaRewards), [])
  const handleDismiss = useCallback(() => {
    setFlow(beginClosing)
    if (!ids || ids.length === 0) return
    // 실패해도 화면은 진행한다 — 결과는 서버에 남아 다음 접속에 다시 보인다
    markUnseenSeen(ids).then(
      (call) => {
        if (call.kind !== 'ok') console.error('[CapsuleResultProvider] «봤어요» 처리 실패', call.kind)
      },
      (error: unknown) => console.error('[CapsuleResultProvider] «봤어요» 처리 실패', error)
    )
  }, [ids])
  const handleClosed = useCallback(() => setFlow(finishClosing), [])
  const handleRewardsClose = useCallback(() => setFlow(finishSession), [])

  const resultPending = isResultPending(flow)
  const gaugeHeld = isGaugeHeld(flow)
  const contextValue = useMemo<CapsuleResultContextValue>(
    () => ({ resultPending, gaugeHeld, registerGaugeFill }),
    [resultPending, gaugeHeld, registerGaugeFill]
  )

  return (
    <CapsuleResultContext.Provider value={contextValue}>
      {children}
      {session && view && isOverlayMounted(flow) && session.origin && (
        <CapsuleResultOverlay
          key={session.key}
          view={view}
          origin={session.origin}
          onViewRewards={handleViewRewards}
          onDismiss={handleDismiss}
          onClosed={handleClosed}
        />
      )}
      {session && (
        <BadgeRevealOverlay open={stage === 'rewards'} items={rewardBadges} profileHref="/profile" onClose={handleRewardsClose} />
      )}
    </CapsuleResultContext.Provider>
  )
}
