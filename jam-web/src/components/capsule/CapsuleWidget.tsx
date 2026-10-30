'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import BadgeRevealOverlay, { type RevealBadge } from '@/components/BadgeRevealOverlay'
import { useToast } from '@/components/ui/Toast'
import CapsulePill, { type CapsulePillStatus } from '@/components/capsule/CapsulePill'
import CapsuleSheet, { type CapsuleSheetStep } from '@/components/capsule/CapsuleSheet'
import { toRevealBadges } from '@/components/capsule/capsuleReveal'
import { fetchCapsule } from '@/lib/capsule/capsule-client'
import { subscribeCapsuleSheetOpen } from '@/lib/capsule/capsule-sheet-signal'
import { runFill, runOpen } from '@/lib/capsule/capsule-flow'
import type { CapsuleOpenPayload, CapsuleStatus } from '@/lib/capsule/capsule-contract'
import { capsulePercent, capsuleViewStatus, statusAfterOpen, withInsufficientSlots } from '@/lib/capsule/capsule-view'
import { cssDurationMs } from '@/lib/motion'
import { d } from '@/lib/i18n'

/**
 * 캡슐 위젯 — 투데이와 내 프로필이 같이 쓰는 클라이언트 컴포넌트 (티켓 20261018_0054, 채원 판정 2026-10-18)
 *
 * 서버가 준 초기값(`initial`)이 있으면 로딩 없이 바로 그리고, 없거나 조회가 실패하면 `GET /api/capsule`로 가져온다.
 * 알약을 누르면 `CapsuleSheet`가 뜨고, 채우기·열기는 그 시트 안에서 그 자리에서 한다.
 *  - 채우기 성공: 응답의 새 상태로 게이지가 차오르고 시트는 본문 단계로 돌아간다.
 *  - 열기 성공: 시트를 먼저 닫고, 닫힘이 끝난 뒤 `BadgeRevealOverlay`를 연다(시트 z-50과 오버레이·토스트 z-60이 겹치지 않게).
 *    오버레이를 닫으면 다음 캡슐 값으로 게이지가 옮겨 간다. 높은 등급 축하 연출은 없다(열기를 부추기지 않는다).
 *  - 이용 정지(403): 일반 실패가 아니라 info 토스트로 알린다. 버튼은 미리 막지 않고 서버 응답으로 판단한다.
 *  - 오버레이가 열려 있는 동안에는 이 위젯의 토스트를 띄우지 않는다(토스트와 오버레이는 같은 z 60이다).
 *  - 홈의 «JAM! 시작하기» 카드가 보내는 열기 신호(`capsule-sheet-signal`)를 받으면 알약을 누른 것과 같은 경로로 시트를 연다
 *    (조회에 실패한 상태면 다시 시도한다). 채우기가 끝나거나 열기 결과를 닫은 뒤에는 서버 화면을 새로 읽는다(`router.refresh()`) —
 *    같은 페이지의 카드가 캡슐 상태를 서버 값으로 읽기 때문이다. 열기 결과가 떠 있는 동안에는 새로 읽지 않는다(뒤 화면이 바뀌지 않게). 티켓 20261021_1248.
 * 모양은 `CapsulePill` 한 파일만 안다. 이 컴포넌트를 감싸는 곳은 z-index를 주지 않는다(시트가 탭바에 가려진 2026-08-25 사고).
 */

interface RevealState {
  open: boolean
  items: RevealBadge[]
  message: string
}

const CLOSED_REVEAL: RevealState = { open: false, items: [], message: '' }

export default function CapsuleWidget({ initial }: { initial?: CapsuleStatus | null }) {
  const { toast } = useToast()
  const router = useRouter()
  const [capsule, setCapsule] = useState<CapsuleStatus | null>(initial ?? null)
  const [load, setLoad] = useState<'ready' | 'loading' | 'error'>(initial ? 'ready' : 'loading')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [step, setStep] = useState<CapsuleSheetStep>('main')
  const [pending, setPending] = useState<'fill' | 'open' | null>(null)
  const [reveal, setReveal] = useState<RevealState>(CLOSED_REVEAL)
  /** 열기 직후 생긴 다음 캡슐 — 오버레이를 닫을 때 게이지에 반영한다 */
  const nextAfterRevealRef = useRef<CapsuleOpenPayload['next'] | null>(null)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 열린 오버레이 동안 토스트를 막는 판단을 콜백이 최신 값으로 하게 한다 */
  const revealOpenRef = useRef(false)
  useEffect(() => {
    revealOpenRef.current = reveal.open
  }, [reveal.open])

  const notify = useCallback(
    (message: string, type: 'error' | 'info') => {
      if (revealOpenRef.current) return
      toast(message, type)
    },
    [toast]
  )

  // 서버 초기값이 없을 때만 마운트 직후 한 번 가져온다
  useEffect(() => {
    if (initial) return
    let alive = true
    void fetchCapsule().then((result) => {
      if (!alive) return
      if (result.kind === 'ok') {
        setCapsule(result.data)
        setLoad('ready')
      } else {
        setLoad('error')
      }
    })
    return () => {
      alive = false
    }
  }, [initial])

  useEffect(
    () => () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
    },
    []
  )

  /** 조용한 재조회 — 성공하면 상태를 바꾸고, 실패하면 지금 화면을 그대로 둔다 */
  const refresh = useCallback(async () => {
    const result = await fetchCapsule()
    if (result.kind === 'ok') {
      setCapsule(result.data)
      setLoad('ready')
    }
  }, [])

  async function retryLoad() {
    setLoad('loading')
    const result = await fetchCapsule()
    if (result.kind === 'ok') {
      setCapsule(result.data)
      setLoad('ready')
    } else {
      setLoad('error')
    }
  }

  function handlePillClick() {
    if (load === 'error') {
      void retryLoad()
      return
    }
    setStep('main')
    setSheetOpen(true)
  }

  // 카드의 열기 신호 — 알약을 누른 것과 같은 경로다. 구독은 한 번만 하고, 신호가 올 때 최신 핸들러를 부른다.
  const sheetRequestRef = useRef<() => void>(() => {})
  useEffect(() => {
    sheetRequestRef.current = handlePillClick
  })
  useEffect(() => subscribeCapsuleSheetOpen(() => sheetRequestRef.current()), [])

  function handleCloseSheet() {
    // 요청이 오가는 동안 닫으면 응답이 닫힌 시트 위에서 처리되므로 막는다
    if (pending) return
    setSheetOpen(false)
    setStep('main')
  }

  async function handleConfirmFill(amount: number) {
    if (pending) return
    setPending('fill')
    const outcome = await runFill(amount)
    setPending(null)

    if (outcome.kind === 'filled') {
      // 응답이 새 상태다 — 게이지가 차오르고 시트는 본문 단계로 돌아간다
      // 채우기 응답은 옛 필드만 있다 — 보류·안내 값은 지금 상태 그대로 두고 옛 필드만 덮는다(위젯은 2회차에 다시 쓴다)
      setCapsule((prev) => (prev ? { ...prev, ...outcome.status } : prev))
      setStep('main')
      // 같은 페이지의 «JAM! 시작하기» 카드가 채워진 캡슐을 서버 값으로 다시 읽는다
      router.refresh()
      return
    }
    notify(outcome.notice.message, outcome.notice.type)
    if (outcome.backToMain) setStep('main')
    if (outcome.refresh) void refresh()
  }

  async function handleOpen() {
    if (pending) return
    setPending('open')
    const outcome = await runOpen()
    setPending(null)

    if (outcome.kind === 'opened') {
      nextAfterRevealRef.current = outcome.next
      setSheetOpen(false)
      setStep('main')
      const nextReveal: RevealState = { open: true, items: toRevealBadges(outcome.items), message: outcome.message }
      // 시트 닫힘이 끝난 뒤에 오버레이를 연다 — 두 레이어가 겹치는 구간 자체를 없앤다
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
      revealTimerRef.current = setTimeout(() => setReveal(nextReveal), cssDurationMs('--panel-close-dur', 350))
      return
    }
    notify(outcome.notice.message, outcome.notice.type)
    const slots = outcome.slots
    if (slots) setCapsule((prev) => (prev ? withInsufficientSlots(prev, slots) : prev))
    if (outcome.refresh) void refresh()
  }

  function handleCloseReveal() {
    setReveal(CLOSED_REVEAL)
    const next = nextAfterRevealRef.current
    nextAfterRevealRef.current = null
    // 열기 결과를 닫은 뒤에 서버 화면을 새로 읽는다 — 인벤토리와 캡슐 상태가 이 열기로 바뀐다(«JAM! 시작하기» 카드는 캡슐 열기가 단계가 아니라 이 열기로 바뀌지 않는다)
    router.refresh()
    if (next) {
      // 게이지가 다음 캡슐의 값으로 옮겨 간다. 빈칸 수 같은 나머지는 이어지는 조회가 정한다
      setCapsule((prev) => (prev ? statusAfterOpen(prev, next) : prev))
      void refresh()
    }
  }

  let pillStatus: CapsulePillStatus
  let percent = 0
  let statusText: string = d.capsule.title
  let actionText: string
  if (load === 'loading' || (load === 'ready' && !capsule)) {
    pillStatus = 'loading'
    actionText = ''
  } else if (load === 'error' || !capsule) {
    pillStatus = 'error'
    statusText = d.capsule.pill.loadFailed
    actionText = d.capsule.pill.retry
  } else {
    pillStatus = capsuleViewStatus(capsule)
    percent = capsulePercent(capsule)
    actionText = d.capsule.pill[pillStatus]
  }

  return (
    <>
      <CapsulePill status={pillStatus} percent={percent} statusText={statusText} actionText={actionText} onClick={handlePillClick} />

      {capsule && (
        <CapsuleSheet
          open={sheetOpen}
          onClose={handleCloseSheet}
          status={capsule}
          step={step}
          pending={pending}
          onStartFill={() => setStep('fill')}
          onCancelFill={() => setStep('main')}
          onConfirmFill={handleConfirmFill}
          onOpen={handleOpen}
        />
      )}

      <BadgeRevealOverlay
        open={reveal.open}
        items={reveal.items}
        profileHref="/profile"
        resultMessage={reveal.message}
        onClose={handleCloseReveal}
      />
    </>
  )
}
