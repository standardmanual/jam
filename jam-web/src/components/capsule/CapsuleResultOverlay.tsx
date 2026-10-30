'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@ds/components/buttons/Button'
import { JamBolt } from '@/components/capsule/CapsuleGauge'
import { originClip, toRootOrigin, type CapsuleResultView, type OverlayOrigin } from '@/lib/capsule/result-overlay-model'
import { d, t } from '@/lib/i18n'
import { prefersReducedMotion } from '@/lib/motion'
import { pushMainScrollLock, pushTabBarHidden } from '@/lib/uiOverlay'

/**
 * 합친 연출 오버레이 — 한 번의 적립 결과를 오렌지 채움이 화면 전체로 퍼지는 연출 한 번으로 보여 준다 (티켓 20261028_1740 1회, 채원 사전 판정)
 *
 * 흐름: 채움이 있던 자리(`origin`)에서 시작해 `clip-path`가 오버레이 전체로 넓어진다(모서리 둥글기도 0으로 풀린다)
 *   → 문구와 버튼이 차례로 나타난다 → 버튼을 누르면 디졸브(투명도)로 닫힌다.
 * 프로토타입 `LevelUpOverlay`(`app/spike/capsule-fill`, 4회차에 삭제)의 `Phase` 구조를 옮겼다.
 * 프로토타입과 달라진 점: ① 색은 토큰 ② 서비스 컬럼 폭(430px)에 맞추고 `origin`을 루트 기준 좌표로 바꾼다(`toRootOrigin`)
 * ③ `pushTabBarHidden` ④ 제목을 서버값(표시 모델)에서 받는다 ⑤ 버튼이 둘이라 Tab을 가두지 않고 둘 사이로 순환시킨다.
 *
 * 호출부는 세 시점을 받는다.
 *  - `onViewRewards`: «획득한 배지 보기»를 눌렀을 때(디졸브 시작 직전). 보상 캐러셀은 `onClosed` 뒤에 열어야 두 오버레이가 겹치지 않는다(3회차).
 *  - `onDismiss`: «닫기»·Escape·보상 보기 모두에서 디졸브 시작 직전. 이때 뒤의 게이지를 2% 원 상태로 붙들어 두었다면 풀면 된다.
 *  - `onClosed`: 디졸브가 끝나 오버레이를 내려도 되는 시점.
 *
 * 레이어: `document.body` 포털, z 60(최상위 피드백 층, `BadgeRevealOverlay`와 같은 층). 연출이 열린 동안 토스트를 띄우지 않는 호출부 규칙이 같은 층 동률을 피한다.
 * 스크롤 컨테이너는 body가 아니라 `<main>`이라 `pushMainScrollLock`을 쓴다. 숫자는 챕터 번호뿐이고 점수·퍼센트·보상 개수는 그리지 않는다.
 * 모션 줄이기: 퍼짐·번개 확대·문구 상승 없이 160ms 페이드만 쓴다.
 */

interface Props {
  /** 표시 모델(`buildCapsuleResultView`)의 출력. `null`이면 이 컴포넌트를 마운트하지 않는다 */
  view: CapsuleResultView
  /** 오렌지 채움의 뷰포트 기준 자리(px). 게이지가 없는 화면이면 화면 가운데 2% 크기 원을 호출부가 넘긴다(3회차) */
  origin: OverlayOrigin
  onViewRewards: () => void
  onDismiss: () => void
  onClosed: () => void
}

/** 배지 획득 오버레이(zIndex 60)와 같은 층 */
const OVERLAY_Z_INDEX = 60
/** 서비스 컬럼 폭에 맞춘 오버레이 박스 — fixed + inset:0 + 좌우 auto 마진으로 가운데 정렬된다(`ChapterRiseOverlay`와 같다) */
const COLUMN_STYLE = { maxWidth: 430, marginLeft: 'auto', marginRight: 'auto' } as const

// 이 연출 전용 수치라 모션 토큰을 새로 만들지 않고 여기에 둔다
const EXPAND_MS = 720
const EXPAND_EASING = 'cubic-bezier(0.7, 0, 0.2, 1)'
const BOLT_OUT_MS = 420
const BOLT_OUT_SCALE = 2.4
const DISSOLVE_MS = 650
const REDUCED_MS = 160
/** 문구는 퍼짐이 이 비율만큼 진행됐을 때 나타나기 시작한다 */
const REVEAL_AT = 0.7
const REVEAL_MS = 480
const REVEAL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** 응원 줄 → 제목 → 버튼 묶음 순으로 이 간격만큼 늦게 나타난다 */
const REVEAL_STEP_MS = 110
const ACTION_REVEAL_DELAY_MS = 260

const TEXT_BASE = 'm-0 break-keep wrap-break-word text-balance'
const TEXT_COLOR = { color: 'var(--capsule-fill-foreground)' } as const

type Phase = 'expanding' | 'revealed' | 'dissolving'

/** Tab으로 옮겨 갈 버튼 자리. 버튼 사이를 순환한다. `current`가 -1이면 버튼 밖에 있다 */
export function nextTrapIndex(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return -1
  if (current < 0) return backwards ? count - 1 : 0
  return backwards ? (current - 1 + count) % count : (current + 1) % count
}

function subscribeNoop(): () => void {
  return () => {}
}

function CapsuleResultDialog({ view, origin, onViewRewards, onDismiss, onClosed }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const boltRef = useRef<HTMLDivElement>(null)
  const actionRef = useRef<HTMLDivElement>(null)
  const closingRef = useRef(false)
  const [reduced] = useState(() => prefersReducedMotion())
  const [phase, setPhase] = useState<Phase>('expanding')
  // 퍼짐은 열릴 때의 자리에서 한 번만 시작한다. 부모가 새 객체를 넘겨도 다시 돌지 않는다
  const [startOrigin] = useState(origin)

  const onViewRewardsRef = useRef(onViewRewards)
  const onDismissRef = useRef(onDismiss)
  const onClosedRef = useRef(onClosed)
  useEffect(() => {
    onViewRewardsRef.current = onViewRewards
    onDismissRef.current = onDismiss
    onClosedRef.current = onClosed
  }, [onViewRewards, onDismiss, onClosed])

  // 스크롤 잠금·탭바 숨김과 포커스 복귀 — 열려 있는 동안 뒤 화면이 움직이지 않고, 닫히면 열기 전 자리로 돌아간다
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const releaseScroll = pushMainScrollLock()
    const releaseTabBar = pushTabBarHidden()
    return () => {
      releaseScroll()
      releaseTabBar()
      previous?.focus?.()
    }
  }, [])

  // 퍼짐: 채움 자리 → 오버레이 전체. 레이아웃 효과라 첫 그림 전에 시작 모양이 잡혀 전체 오렌지가 번쩍이지 않는다
  useLayoutEffect(() => {
    const root = rootRef.current
    const bg = bgRef.current
    if (!root || !bg) return

    if (reduced) {
      const fade = root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_MS, fill: 'both' })
      const timer = setTimeout(() => setPhase('revealed'), REDUCED_MS)
      return () => {
        clearTimeout(timer)
        fade.cancel()
      }
    }

    // 원 좌표는 뷰포트 기준이고 오버레이는 430px 컬럼이라 루트 기준으로 바꾼다
    const rootRect = root.getBoundingClientRect()
    const local = toRootOrigin(startOrigin, rootRect)
    const bolt = boltRef.current
    if (bolt) {
      bolt.style.left = `${local.left + local.width - local.circle}px`
      bolt.style.top = `${local.top + local.height / 2 - local.circle / 2}px`
      bolt.style.width = `${local.circle}px`
      bolt.style.height = `${local.circle}px`
    }
    const expand = bg.animate(
      [{ clipPath: originClip(local, rootRect.width, rootRect.height) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
      { duration: EXPAND_MS, easing: EXPAND_EASING, fill: 'forwards' }
    )
    // 게이지에서 넘겨받은 번개는 퍼지기 시작하면 커지며 사라진다
    const boltOut = bolt?.animate(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: `scale(${BOLT_OUT_SCALE})` },
      ],
      { duration: BOLT_OUT_MS, easing: 'ease-out', fill: 'forwards' }
    )
    const timer = setTimeout(() => setPhase('revealed'), Math.round(EXPAND_MS * REVEAL_AT))
    return () => {
      clearTimeout(timer)
      expand.cancel()
      boltOut?.cancel()
    }
  }, [reduced, startOrigin])

  // 문구가 나타나면 첫 버튼으로 포커스를 옮긴다(공지는 대화상자 이름이 대신한다)
  useEffect(() => {
    if (phase !== 'revealed') return
    actionRef.current?.querySelector('button')?.focus()
  }, [phase])

  // 디졸브: 투명도만 풀어 뒤 화면을 드러낸다
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

  const close = useCallback(
    (viaRewards: boolean) => {
      // 퍼지는 동안은 누를 수 없고, 한 번 닫기 시작하면 다시 받지 않는다
      if (phase !== 'revealed' || closingRef.current) return
      closingRef.current = true
      if (viaRewards) onViewRewardsRef.current()
      onDismissRef.current()
      setPhase('dissolving')
    },
    [phase]
  )
  const dismiss = useCallback(() => close(false), [close])
  const viewRewards = useCallback(() => close(true), [close])

  // Escape는 «닫기»와 같고, Tab은 두 버튼 사이를 돈다(오버레이 밖으로 나가지 않는다)
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
      } else if (event.key === 'Tab') {
        event.preventDefault()
        if (phase !== 'revealed') return
        const buttons = Array.from(actionRef.current?.querySelectorAll('button') ?? [])
        const next = nextTrapIndex(buttons.length, buttons.indexOf(document.activeElement as HTMLButtonElement), event.shiftKey)
        buttons[next]?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [dismiss, phase])

  const shown = phase !== 'expanding'
  const reveal = (delayMs: number): CSSProperties => ({
    opacity: shown ? 1 : 0,
    transform: shown ? 'none' : 'translateY(14px)',
    transition: reduced ? 'none' : `opacity ${REVEAL_MS}ms ${REVEAL_EASING} ${delayMs}ms, transform ${REVEAL_MS}ms ${REVEAL_EASING} ${delayMs}ms`,
  })

  const isChapter = view.titleKind === 'chapter'
  const title = isChapter ? t(d.chapter.rise.title, { chapterNo: view.chapterNo }) : d.capsule.result.title
  const announce = isChapter ? t(d.chapter.rise.announce, { chapterNo: view.chapterNo }) : d.capsule.result.announceFull
  // 줄이 둘(응원·제목)이면 한 줄씩 늦게 나타나고, 줄이 하나면 제목이 먼저다
  const titleDelay = isChapter ? REVEAL_STEP_MS : 0

  return (
    <div
      ref={rootRef}
      data-capsule-result
      role="dialog"
      aria-modal="true"
      aria-label={announce}
      className="fixed inset-0"
      style={{ ...COLUMN_STYLE, zIndex: OVERLAY_Z_INDEX, height: '100dvh' }}
    >
      <div ref={bgRef} data-capsule-result-bg aria-hidden="true" className="absolute inset-0" style={{ background: 'var(--capsule-fill)' }} />

      {/* 게이지의 번개가 있던 자리에 같은 번개를 두어 넘겨받는다. 모션 줄이기에서는 그리지 않는다 */}
      {!reduced && (
        <div
          ref={boltRef}
          data-capsule-result-bolt
          aria-hidden="true"
          className="pointer-events-none absolute grid place-items-center"
          style={{ width: startOrigin.circle, height: startOrigin.circle }}
        >
          <JamBolt size={Math.round(startOrigin.circle * 0.42)} />
        </div>
      )}

      {/* 가로 방향에서 버튼이 잘리지 않도록 이 안에서만 스크롤한다. 배경과 번개는 스크롤하지 않도록 이 바깥에 둔다 */}
      <div className="relative h-full overflow-y-auto">
        <div
          className="flex min-h-full flex-col items-center justify-center text-center"
          style={{
            gap: 'var(--spacing-40)',
            paddingTop: 'var(--spacing-24)',
            paddingLeft: 'var(--spacing-32)',
            paddingRight: 'var(--spacing-32)',
            paddingBottom: 'calc(var(--spacing-24) + var(--spacing-safe-bottom))',
          }}
        >
          <div className="flex flex-col" style={{ gap: 'var(--spacing-8)' }}>
            {isChapter && (
              <p className={`${TEXT_BASE} text-xl font-bold leading-snug`} style={{ ...TEXT_COLOR, ...reveal(0) }}>
                {d.chapter.rise.cheer}
              </p>
            )}
            <h2 className={`${TEXT_BASE} text-3xl font-bold leading-tight`} style={{ ...TEXT_COLOR, ...reveal(titleDelay) }}>
              {title}
            </h2>
          </div>
          <div
            ref={actionRef}
            data-capsule-result-actions
            className="flex w-full max-w-60 flex-col"
            style={{ gap: 'var(--spacing-12)', ...reveal(ACTION_REVEAL_DELAY_MS), pointerEvents: phase === 'revealed' ? 'auto' : 'none' }}
          >
            {/* primary(초록)는 오렌지 바탕에서 색이 부딪혀서 중립색 secondary를 쓴다. 보상이 있으면 «닫기»는 보조라 한 단계 낮추되,
                ghost의 --link 글자는 오렌지 위에서 1.58:1이라 글자가 --foreground인 outline(5.21:1)으로 대신한다 */}
            {view.hasRewards && (
              <Button variant="secondary" fullWidth onClick={viewRewards}>
                {d.capsule.result.viewRewards}
              </Button>
            )}
            <Button variant={view.hasRewards ? 'outline' : 'secondary'} fullWidth onClick={dismiss}>
              {d.common.close}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CapsuleResultOverlay(props: Props) {
  // SSR에는 `document`가 없다. 서버 값은 false, 클라이언트 값은 true라서 포털은 클라이언트에서만 마운트된다
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false)
  if (!mounted) return null
  return createPortal(<CapsuleResultDialog {...props} />, document.body)
}
