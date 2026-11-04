'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Card } from '@ds/components/cards/Card'
import Button from '@/components/ui/Button'
import { cssDurationMs } from '@/lib/motion'
import { pushMainScrollLock } from '@/lib/uiOverlay'

/** 포커스 트랩이 순환 대상으로 삼는 요소 셀렉터 — 비활성 상태는 제외한다. */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const subscribeNoop = () => () => {}

interface ConfirmModalProps {
  open: boolean
  /** 닫기 — «취소» 버튼·백드롭 탭·Escape가 부른다. `loading` 중에는 부르지 않는다 */
  onClose: () => void
  /** 본문(한 문장 확인문) */
  body: ReactNode
  /** 왼쪽 취소류 버튼 글자 */
  cancelLabel: string
  /** 오른쪽 확정류 버튼 글자 */
  confirmLabel: string
  onConfirm: () => void
  /** 확정 요청이 진행 중이다 — 확정 버튼에 로딩이 걸리고, 취소·Escape·백드롭 탭은 막힌다 */
  loading?: boolean
}

/**
 * 가운데 확인 모달 (티켓 20261104_1810, 채원 사전 판정 2026-11-04) — 서비스 전용.
 *
 * 본문 한 문장과 [취소류(secondary)] [확정류(primary)] 두 버튼을 화면 가운데 흰 카드로 보인다. 하단 시트(`BottomSheet`)와 같은 층(z-50)이고
 * 토스트(z-60) 아래라서, 열린 채 실패 토스트가 위에 뜬다. 새 z 값은 만들지 않는다(DESIGN_RENEWAL_SPEC «z-index 레이어 체계»).
 *
 *  - `document.body` 포털이라 조상의 스태킹 컨텍스트에 영향받지 않는다.
 *  - `role="dialog"` `aria-modal` `aria-labelledby`(본문). 열리면 포커스가 취소 버튼으로 가고(파괴적이지 않은 쪽), Tab이 안에서 순환하며,
 *    닫히면 여는 요소로 돌아간다. Escape로 닫힌다.
 *  - 배경 스크롤은 `pushMainScrollLock`(참조 카운팅)으로 잠근다.
 *  - 모션은 `--modal-*` 토큰의 `.t-modal`·`.t-modal-backdrop`(transitions.css «프로젝트 확장»)이다. 모션 줄이기에서는 전환이 없다.
 *    루트는 `pointer-events-none`이고 백드롭과 패널만 열려 있을 때 탭을 받는다(닫힘 트랜지션 동안 뒷화면 탭을 먹지 않는다).
 * 두 번째 사용처(예: `StravaDisconnectSheet`을 시트에서 바꿀 때)가 생기면 MODULAR 승격 후보다.
 */
export default function ConfirmModal({ open, onClose, body, cancelLabel, confirmLabel, onConfirm, loading = false }: ConfirmModalProps) {
  const [lingering, setLingering] = useState(false)
  const [shown, setShown] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const loadingRef = useRef(loading)
  const bodyId = useId()
  // 포털은 서버 렌더에 `document`가 없어 마운트 게이트가 필요하다(`useEffect` + `setState`는 react-hooks/set-state-in-effect에 걸린다)
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  )

  useEffect(() => {
    onCloseRef.current = onClose
    loadingRef.current = loading
  })

  // 열림·닫힘 모양: 열릴 때는 마운트한 다음 프레임에 `shown`을 켜 전환이 돌게 하고, 닫힐 때는 전환이 끝난 뒤 내린다
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => {
        setLingering(true)
        setShown(true)
      })
      return () => cancelAnimationFrame(raf)
    }
    const raf = requestAnimationFrame(() => setShown(false))
    const timer = setTimeout(() => setLingering(false), cssDurationMs('--modal-close-dur', 150))
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [open])

  // 포커스 이동·순환·복귀와 Escape 닫기(BottomSheet와 같은 방식, 티켓 20260908_0040)
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const first = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    if (first) first.focus()
    else panel?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!loadingRef.current) onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const firstEl = focusable[0]
      const lastEl = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === firstEl || !panel.contains(active)) {
          e.preventDefault()
          lastEl.focus()
        }
      } else if (active === lastEl || !panel.contains(active)) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [open])

  // 떠 있는 동안 배경(main 스크롤 컨테이너) 스크롤을 잠근다 — 닫힘 전환이 끝날 때까지 유지한다
  useEffect(() => {
    if (!lingering) return
    return pushMainScrollLock()
  }, [lingering])

  if (!mounted) return null
  if (!open && !lingering) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none" style={{ maxWidth: 430, margin: '0 auto' }}>
      {/* 스크림은 --backdrop(검정 50%)이고 blur는 두지 않는다(티켓 20261015_2131) */}
      <div
        className="absolute inset-0 bg-backdrop t-modal-backdrop"
        data-open={shown}
        onClick={() => {
          if (!loading) onClose()
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={bodyId}
        tabIndex={-1}
        className="relative t-modal overflow-y-auto"
        data-open={shown}
        style={{ width: 'min(340px, calc(100% - 48px))', maxHeight: 'calc(100dvh - 48px)', borderRadius: 'var(--radius-2xl)' }}
      >
        <Card className="flex flex-col gap-6">
          <p id={bodyId} className="m-0 text-base text-foreground text-center break-keep wrap-break-word text-balance">
            {body}
          </p>
          <div className="flex gap-4">
            <Button fullWidth variant="secondary" surface="main" className="whitespace-nowrap break-keep" onClick={onClose} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button fullWidth surface="main" className="whitespace-nowrap break-keep" loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Card>
      </div>
    </div>,
    document.body
  )
}
