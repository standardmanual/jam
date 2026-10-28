'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@ds/components/buttons/Button'
import { prefersReducedMotion } from '@/lib/motion'
import { pushMainScrollLock } from '@/lib/uiOverlay'
import { GAUGE_ICON, JAM_ORANGE, JamBolt } from './JamGauge'

/**
 * 챕터 오름 오버레이 — 100%에 닿은 오렌지 채움이 화면 전체로 퍼지고 축하 문구가 나온다 (티켓 20261028_1516)
 *
 * 흐름: 채움이 있던 자리(`origin`)에서 시작해 `clip-path`가 화면 전체로 넓어진다(모서리 둥글기도 0으로 풀린다)
 *   → 문구와 «닫기»가 차례로 나타난다 → «닫기»를 누르면 디졸브(투명도)로 닫힌다.
 * 호출부는 두 시점을 받는다. `onDismiss`는 «닫기»를 누른 즉시(디졸브 시작 전)라서, 이때 뒤의 게이지를 비워 두면
 * 디졸브가 비워진 게이지를 드러낸다. `onClosed`는 디졸브가 끝나 오버레이를 내려도 되는 시점이다.
 *
 * 레이어: `document.body` 포털, z 60(최상위 피드백 층, `BadgeRevealOverlay`와 같은 층 — DESIGN_RENEWAL_SPEC의 z-index 체계).
 * 이 오버레이가 열린 동안 토스트를 띄우지 않는 호출부 규칙이 같은 층 동률을 피하게 한다.
 * 모션 줄이기: 퍼짐 없이 페이드로 나타나고 디졸브만 짧게 한다.
 */

export interface OverlayOrigin {
  /** 오렌지 채움의 뷰포트 기준 자리(px) */
  top: number
  left: number
  width: number
  height: number
  /** 채움 오른쪽 끝 원의 지름(px) — 번개가 있던 자리 */
  circle: number
}

interface Props {
  origin: OverlayOrigin
  title: string
  body: string
  closeLabel: string
  /** «닫기»를 눌렀을 때(디졸브 시작 전) */
  onDismiss: () => void
  /** 디졸브가 끝났을 때 */
  onClosed: () => void
}

const EXPAND_MS = 720
const EXPAND_EASING = 'cubic-bezier(0.7, 0, 0.2, 1)'
const DISSOLVE_MS = 650
const REDUCED_MS = 160
/** 문구는 퍼짐이 이 비율만큼 진행됐을 때 나타나기 시작한다 */
const REVEAL_AT = 0.7
const REVEAL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

type Phase = 'expanding' | 'revealed' | 'dissolving'

function insetClip(origin: OverlayOrigin, viewportW: number, viewportH: number): string {
  const right = Math.max(0, viewportW - origin.left - origin.width)
  const bottom = Math.max(0, viewportH - origin.top - origin.height)
  return `inset(${origin.top}px ${right}px ${bottom}px ${origin.left}px round ${origin.height / 2}px)`
}

const FULL_CLIP = 'inset(0px 0px 0px 0px round 0px)'

export default function LevelUpOverlay({ origin, title, body, closeLabel, onDismiss, onClosed }: Props) {
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const boltRef = useRef<HTMLDivElement>(null)
  const actionRef = useRef<HTMLDivElement>(null)
  const [reduced] = useState(() => prefersReducedMotion())
  const [phase, setPhase] = useState<Phase>('expanding')
  // 시작 모양은 첫 그림부터 있어야 한다 — 늦으면 화면 전체 오렌지가 한 프레임 번쩍인다
  const [startClip] = useState(() =>
    insetClip(origin, document.documentElement.clientWidth, document.documentElement.clientHeight)
  )

  const onClosedRef = useRef(onClosed)
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onClosedRef.current = onClosed
    onDismissRef.current = onDismiss
  })

  // 스크롤 잠금과 포커스 복귀 — 열려 있는 동안 뒤 화면이 움직이지 않고, 닫히면 게이지로 돌아간다
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const release = pushMainScrollLock()
    return () => {
      release()
      previous?.focus?.()
    }
  }, [])

  // 퍼짐: 채움 자리 → 화면 전체
  useEffect(() => {
    const bg = bgRef.current
    const bolt = boltRef.current
    if (!bg) return

    if (reduced) {
      bg.style.clipPath = FULL_CLIP
      const fade = rootRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_MS, fill: 'both' })
      const timer = window.setTimeout(() => setPhase('revealed'), REDUCED_MS)
      return () => {
        window.clearTimeout(timer)
        fade?.cancel()
      }
    }

    const expand = bg.animate([{ clipPath: startClip }, { clipPath: FULL_CLIP }], {
      duration: EXPAND_MS,
      easing: EXPAND_EASING,
      fill: 'forwards',
    })
    // 게이지에서 넘겨받은 번개는 퍼지기 시작하면 커지며 사라진다
    const boltOut = bolt?.animate(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(2.4)' },
      ],
      { duration: 420, easing: 'ease-out', fill: 'forwards' }
    )
    const timer = window.setTimeout(() => setPhase('revealed'), EXPAND_MS * REVEAL_AT)
    return () => {
      window.clearTimeout(timer)
      expand.cancel()
      boltOut?.cancel()
    }
  }, [reduced, startClip])

  // 문구가 나타나면 «닫기»로 포커스를 옮긴다
  useEffect(() => {
    if (phase !== 'revealed') return
    actionRef.current?.querySelector('button')?.focus()
  }, [phase])

  // 디졸브: 투명도만 풀어 뒤 화면(비워진 게이지)을 드러낸다
  useEffect(() => {
    if (phase !== 'dissolving') return
    const root = rootRef.current
    if (!root) return
    let stopped = false
    const dissolve = root.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduced ? REDUCED_MS : DISSOLVE_MS,
      easing: 'ease-in-out',
      fill: 'forwards',
    })
    dissolve.finished.then(
      () => {
        if (!stopped) onClosedRef.current()
      },
      () => {}
    )
    return () => {
      stopped = true
      dissolve.cancel()
    }
  }, [phase, reduced])

  function dismiss() {
    if (phase !== 'revealed') return
    setPhase('dissolving')
    onDismissRef.current()
  }

  // 닫을 수 있는 건 «닫기» 하나뿐이라 Escape는 그 버튼과 같고, Tab은 포커스를 그 버튼에 붙들어 둔다
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
      } else if (event.key === 'Tab') {
        event.preventDefault()
        actionRef.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })

  const shown = phase !== 'expanding'
  const reveal = (delayMs: number): CSSProperties => ({
    opacity: shown ? 1 : 0,
    transform: shown ? 'none' : 'translateY(14px)',
    transition: reduced ? 'none' : `opacity 480ms ${REVEAL_EASING} ${delayMs}ms, transform 480ms ${REVEAL_EASING} ${delayMs}ms`,
  })

  const boltBox = origin.circle
  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 60 }}
    >
      <div ref={bgRef} aria-hidden="true" className="absolute inset-0" style={{ background: JAM_ORANGE, clipPath: startClip }} />

      {/* 게이지의 번개가 있던 자리에 같은 번개를 두어 넘겨받는다 */}
      <div
        ref={boltRef}
        aria-hidden="true"
        className="pointer-events-none absolute grid place-items-center"
        style={{
          left: origin.left + origin.width - boltBox,
          top: origin.top + origin.height / 2 - boltBox / 2,
          width: boltBox,
          height: boltBox,
        }}
      >
        <JamBolt size={Math.round(boltBox * 0.42)} />
      </div>

      <div className="relative flex flex-col items-center gap-10 px-8 text-center">
        <div className="flex flex-col gap-3">
          <h2
            id={titleId}
            className="m-0 break-keep text-3xl font-bold leading-tight text-balance"
            style={{ color: GAUGE_ICON, ...reveal(0) }}
          >
            {title}
          </h2>
          <p className="m-0 break-keep text-xl font-bold leading-snug text-balance" style={{ color: GAUGE_ICON, ...reveal(110) }}>
            {body}
          </p>
        </div>
        <div ref={actionRef} className="w-full max-w-60" style={{ ...reveal(260), pointerEvents: phase === 'revealed' ? 'auto' : 'none' }}>
          {/* primary(초록)는 오렌지 바탕에서 색이 부딪혀서 중립색 secondary를 쓴다 */}
          <Button variant="secondary" fullWidth onClick={dismiss}>
            {closeLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
