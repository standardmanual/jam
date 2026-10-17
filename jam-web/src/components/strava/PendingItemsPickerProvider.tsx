'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTabBarHidden } from '@/lib/uiOverlay'
import PendingItemsPickOverlay from '@/components/strava/PendingItemsPickOverlay'
import { createPickerSession, shouldAutoOpen, type PickResult } from '@/lib/strava/pending-pick'

/**
 * 동기화 보류 고르기 프로바이더 (티켓 20261017_1425 2회, 채원 판정 2026-10-17).
 *
 * 고르기 오버레이(`PendingItemsPickOverlay`)를 한 곳에서 열고 닫는다. 세 경로가 같은 오버레이를 연다.
 *   1. 앱을 열 때 — 첫 마운트에서 `initialPendingCount`가 0보다 크면 자동으로 연다(전체 로드·새로고침·앱 재실행이 «앱을 열 때»다).
 *      클라이언트 이동은 레이아웃이 유지돼 이 프로바이더가 다시 마운트되지 않으므로 페이지를 옮길 때마다 뜨지 않는다
 *      («나중에»로 닫은 뒤에도 같은 세션에서 다시 뜨지 않는다. sessionStorage는 쓰지 않는다). 새로고침하면 다시 뜬다.
 *   2. 동기화 버튼이 409(`sync_pending_items`)를 받았을 때 — `usePendingItemsPicker().openPicker()`.
 *   3. 동기화 응답의 `pendingItems`가 0보다 클 때 — 같은 `openPicker()`.
 *
 * 주소에 `reveal=1`이 있으면(최초 Strava 연동 연출) 자동 재진입을 그 연출이 끝날 때까지 미룬다. 연출 오버레이는 열려 있는 동안 탭바를
 * 숨기므로(`pushTabBarHidden`) «탭바가 숨겨졌다가 다시 보이면 연출이 끝났다»로 판단하고, 연출이 끝내 뜨지 않는 경우를 위해 짧은 시간 뒤에는 푼다.
 *
 * 프로바이더가 없는 곳(테스트·스토리)에서 훅은 `'dismissed'`를 돌려주는 안전 기본값을 쓴다.
 *
 * 클라이언트·서버 경계: 보류 개수는 서버 컴포넌트(`(main)/layout.tsx`)가 `countPendingItems`로 읽어 숫자 prop으로 내린다. 이 파일은
 * 서버 모듈을 가져오지 않는다(`PendingItemsPickOverlay`도 마찬가지다).
 */

export type { PickResult }

interface PickerApi {
  /** 고르기 오버레이를 연다. 이미 열려 있으면 같은 결과를 기다린다. 'resolved' = 보류가 닫힘, 'dismissed' = 보류가 남음 */
  openPicker: () => Promise<PickResult>
}

const SAFE_DEFAULT: PickerApi = { openPicker: async () => 'dismissed' }

const PickerContext = createContext<PickerApi | null>(null)

export function usePendingItemsPicker(): PickerApi {
  return useContext(PickerContext) ?? SAFE_DEFAULT
}

/** `reveal=1` 연출이 한 번도 오버레이를 열지 않을 때 자동 재진입을 푸는 시간(ms) */
const REVEAL_WAIT_FALLBACK_MS = 3000

export default function PendingItemsPickerProvider({
  initialPendingCount,
  children,
}: {
  /** 서버가 읽은 대기 중 보류 개수 */
  initialPendingCount: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [quiet, setQuiet] = useState(false)
  // 고르기 요청 한 건의 수명(이미 열려 있으면 같은 결과를 기다리게 한다). 한 번 만들고 유지한다.
  const [session] = useState(createPickerSession)
  const autoRequestedRef = useRef(false)

  // 첫 렌더에서 한 번만 읽는다. 화면에 그리는 값이 아니라 자동 재진입 시점만 정하므로 서버·클라이언트 불일치가 생기지 않는다.
  const [revealPending] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('reveal') === '1'
  )
  const tabBarHidden = useTabBarHidden()
  const [sawOverlay, setSawOverlay] = useState(false)
  const [revealTimedOut, setRevealTimedOut] = useState(false)
  // 렌더 중 상태 조정: 연출 오버레이가 탭바를 숨기는 것을 한 번 봤는지 기록한다
  if (revealPending && tabBarHidden && !sawOverlay) setSawOverlay(true)

  useEffect(() => {
    if (!revealPending || sawOverlay) return
    const timer = setTimeout(() => setRevealTimedOut(true), REVEAL_WAIT_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [revealPending, sawOverlay])

  const request = useCallback(
    (source: 'auto' | 'manual'): Promise<PickResult> => {
      const { promise, started } = session.request()
      if (started) {
        setQuiet(source === 'auto')
        setOpen(true)
      }
      return promise
    },
    [session]
  )

  const finish = useCallback(
    (result: PickResult) => {
      setOpen(false)
      session.finish(result)
    },
    [session]
  )

  // 앱을 열 때 자동 재진입 — 한 번만(닫은 뒤·읽기 실패 뒤에도 같은 세션에서는 다시 시도하지 않는다)
  const autoOpen = shouldAutoOpen({
    pendingCount: initialPendingCount,
    revealPending,
    sawRevealOverlay: sawOverlay,
    tabBarHidden,
    revealTimedOut,
  })
  useEffect(() => {
    if (!autoOpen || autoRequestedRef.current) return
    autoRequestedRef.current = true
    void request('auto')
  }, [autoOpen, request])

  const api = useMemo<PickerApi>(() => ({ openPicker: () => request('manual') }), [request])

  return (
    <PickerContext.Provider value={api}>
      {children}
      <PendingItemsPickOverlay open={open} quiet={quiet} onFinish={finish} />
    </PickerContext.Provider>
  )
}
