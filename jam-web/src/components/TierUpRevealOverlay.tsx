'use client'

import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@ds/components/buttons/Button'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import SafeImage from '@/components/SafeImage'
import { d } from '@/lib/i18n'
import { splitDescriptionSentences } from '@/lib/splitDescriptionSentences'
import { pushMainScrollLock, pushTabBarHidden } from '@/lib/uiOverlay'

/**
 * 등급 올리기 결과 연출 오버레이 (티켓 20261112_2141) — 서비스 전용. MODULAR에 올리지 않는다(채원 사전 판정).
 *
 * 흐름(프로토타입 v7): 검은 층이 깔리면서 재료 6개가 슬롯 자리에 남는다 → JAM 로고가 올라오고 재료가 하나씩 로고 뒤로 작아지며 모인다 →
 * 로고가 위로 커지며 화면을 채우고 사라진다 → 새 배지가 팝업으로 나온다 → 등급 칩·이름·설명 문장이 한 줄씩 나온다 → 확인 버튼이 나온다 →
 * 확인을 누르면 모두 사라지고 검은 층이 걷힌 뒤 `onConfirm`이 불린다.
 *
 * 연출은 «단계 상태값»이 아니라 `playTierUpReveal`의 타임라인(Web Animations API + 약속 사슬)으로 구동한다. 상태는 확인 버튼이 눌리는지·닫는 중인지 둘뿐이다.
 * 정리 함수가 모든 애니메이션·타이머를 취소하므로 연타·언마운트·라우트 이동·StrictMode 이중 마운트에서도 남는 것이 없다.
 *
 * 쓰는 곳: `CombineClient`의 «잠기지 않은 성공 결과»만. 잠긴 결과와 받지 않은 결과는 `BadgeRevealOverlay`를 그대로 쓴다.
 * 층: z-index 60 — `BadgeRevealOverlay`와 같은 층이다(DESIGN_RENEWAL_SPEC «z-index 레이어 체계»). 두 오버레이가 동시에 열리지 않는 것은 호출부가 보장한다.
 */

/**
 * 연출 바탕 — 단색 블랙이 아니라 중심이 조금 밝은 원형 그라데이션이다(사용자 확정, 2026-11-12). 시선을 로고와 새 배지에 모으는 비네트일 뿐이라 다른 색을 더하지 않는다.
 * 가운뎃값 두 개(#343434·#1a1a1a)는 이 연출에만 쓰는 중간 회색이라 토큰을 새로 만들지 않고 여기 한 곳에만 둔다(채원 판정 승인 ①). 끝색은 토큰이다.
 * 결과 배지 뒤의 glow·후광은 두지 않는다.
 */
export const STAGE_BACKGROUND = 'radial-gradient(circle farthest-corner at 50% 42%, #343434 0%, #1a1a1a 38%, var(--base-black) 100%)'

/** 연출 시간과 곡선(ms) — 프로토타입 v7 원문 값. 문구 등장 시간은 사용자 확정값이라 임의로 바꾸지 않는다. motion.css 토큰은 쓰지 않는다 */
export const TIMING = {
  /** 1단계: 검은 층 페이드인 */
  background: { duration: 500, easing: 'ease-out' },
  /** 1단계 시작에서 2단계 시작까지 */
  toLogoStage: 600,
  /** 2단계: 로고가 아래에서 올라오며 나타난다 */
  logoIn: { duration: 300, easing: 'ease-out', fromY: 40, fromScale: 0.9 },
  /** 2단계: 재료 i번째는 delayBase + i*delayStep 뒤에 로고 중심으로 작아지며 모인다. 92% 지점까지 불투명이다 */
  material: { delayBase: 150, delayStep: 80, duration: 720, easing: 'cubic-bezier(.55,0,.75,.4)', endScale: 0.08, opaqueUntil: 0.92 },
  /** 2단계: 마지막 재료가 들어간 뒤 로고가 한 번 커졌다 돌아온다 */
  logoPulse: { duration: 260, easing: 'ease-out', scale: 1.05 },
  /** 로고 펄스가 끝난 뒤 3단계까지 */
  afterPulse: 380,
  /** 3단계: 로고가 위로 커지며 화면을 채우고 사라진다. 이동량은 프로토타입 화면 높이(780px) 대비 비율이라 실제 높이에 곱한다 */
  logoOut: { duration: 520, easing: 'cubic-bezier(.6,0,.8,.3)', holdAt: 0.7, midScale: 8, endScale: 11, midLift: 300 / 780, endLift: 380 / 780, toNext: 600 },
  /** 4단계: 결과 배지 팝업 */
  badge: { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)', fromScale: 0.2, overshootScale: 1.1, overshootAt: 0.65, toNext: 850 },
  /** 5단계: 등급 칩 → 이름 → 설명 문장이 위에서 내려오며 한 줄씩 나온다 */
  item: { duration: 700, easing: 'ease-out', step: 650, fromY: -14, afterLast: 250 },
  /** 6단계: 확인 버튼 */
  button: { duration: 500, easing: 'ease-out', fromY: 12 },
  /** 7단계: 확인을 누르면 요소가 사라지고, gap 뒤에 검은 층이 걷힌다 */
  exit: { fade: 380, easing: 'ease-in', gap: 420, background: 450, backgroundEasing: 'ease-out' },
  /** 모션 줄이기 — 크기·위치 변화 없이 짧은 페이드만 */
  reduced: { fade: 200, easing: 'ease-out' },
} as const

/** 슬롯 수 — 재료 지연 시간 계산에 쓴다(`TIER_UP_MATERIAL_COUNT`와 같다. 서버 모듈을 끌어오지 않으려고 따로 둔다) */
const MATERIAL_SLOT_COUNT = 6
/** 로고 그림 비율(2610×865) */
const LOGO_ASPECT = '2610 / 865'
/** 오버레이 층 — `BadgeRevealOverlay`와 같다 */
const OVERLAY_Z_INDEX = 60
/** 서비스 컬럼 폭 */
const COLUMN_MAX_WIDTH = 430
/** 결과 배지 지름 */
const BADGE_SIZE = 200
/** 확인 버튼 높이(DS `Button` md의 자연 높이) — 결과 컬럼이 버튼 밑으로 들어가지 않게 비워 두는 만큼을 셈할 때만 쓴다 */
const BUTTON_HEIGHT = 52
/** 하단 버튼 바깥 여백 */
const BUTTON_BOTTOM_GAP = 16

export type RevealRarity = 'common' | 'rare' | 'epic' | 'mystic'

/** 재료 한 장 — 제출하는 순간 슬롯 화면에서 잰 그림 주소와 화면(뷰포트) 좌표 */
export interface TierUpRevealMaterial {
  /** 슬롯 번호(0..5). 모이는 순서(지연)를 정한다 */
  slot: number
  imageUrl: string
  rect: { left: number; top: number; width: number; height: number }
}

export interface TierUpRevealResult {
  name: string
  rarity?: RevealRarity | null
  imageUrl?: string | null
  /** 새 배지의 설명문. 없거나 비어 있으면 설명 줄 없이 칩과 이름까지만 나온다 */
  description?: string | null
}

interface Props {
  open: boolean
  materials: TierUpRevealMaterial[]
  result: TierUpRevealResult | null
  /** 확인을 누르고 닫는 연출이 끝난 뒤 한 번 불린다 */
  onConfirm: () => void
}

/** 슬롯 화면의 재료 그림 좌표를 잰다 — `TierUpPanel`의 슬롯 래퍼(`data-tier-up-slot`)가 가진 `<img>`의 자리다. 그림이 없는 칸은 건너뛴다 */
export function measureTierUpMaterials(imageUrls: readonly (string | null | undefined)[]): TierUpRevealMaterial[] {
  if (typeof document === 'undefined') return []
  const found: TierUpRevealMaterial[] = []
  imageUrls.forEach((imageUrl, slot) => {
    if (!imageUrl) return
    const img = document.querySelector<HTMLElement>(`[data-tier-up-slot="${slot}"] img`)
    if (!img) return
    const { left, top, width, height } = img.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    found.push({ slot, imageUrl, rect: { left, top, width, height } })
  })
  return found
}

export interface RevealLines {
  /** 등급 칩을 그릴지 — Common·등급 없음은 칩이 없다 */
  chipRarity: RevealRarity | null
  name: string
  sentences: string[]
}

/** 순수 — 결과를 칩 / 이름 / 설명 문장 줄로 나눈다. 설명이 null·빈 문자열·공백뿐이면 문장 줄이 없다 */
export function buildRevealLines(result: TierUpRevealResult): RevealLines {
  const rarity = result.rarity ?? null
  return {
    chipRarity: rarity && rarity !== 'common' ? rarity : null,
    name: result.name,
    sentences: splitDescriptionSentences(result.description ?? ''),
  }
}

/* ───────────────────────── 타임라인 ───────────────────────── */

export interface RevealTargets {
  root: HTMLElement
  background: HTMLElement
  /** DOM 순서 = materials 배열 순서 */
  materials: HTMLElement[]
  logo: HTMLElement
  badge: HTMLElement
  /** 등급 칩(있으면) → 이름 → 설명 문장들 */
  items: HTMLElement[]
  button: HTMLElement
}

export interface RevealTimeline {
  /** 확인 눌림: 요소를 걷고 검은 층을 걷는다. 끝나면 풀린다. 취소되면 풀리지 않는다 */
  exit: () => Promise<void>
  /** 모든 애니메이션·타이머를 취소한다. 여러 번 불러도 된다 */
  cancel: () => void
}

class Cancelled extends Error {}

const center = (rect: DOMRect | { left: number; top: number; width: number; height: number }) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
})

/**
 * 연출 타임라인을 재생한다. 요소를 읽고 애니메이션을 거는 일만 하고 React 상태는 만지지 않는다(확인 버튼이 나오는 순간만 `onReady`로 알린다).
 * `slots`는 각 재료 요소가 가리키는 슬롯 번호(지연 계산용)다.
 */
export function playTierUpReveal(
  targets: RevealTargets,
  options: { reducedMotion: boolean; slots: number[]; onReady: () => void },
): RevealTimeline {
  let cancelled = false
  const animations: Animation[] = []
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = setTimeout(() => {
        timers.delete(id)
        resolve()
      }, ms)
      timers.add(id)
    })

  /** 애니메이션을 걸고 끝나면 풀리는 약속을 돌려준다. fill: both라 끝난 값이 유지된다 */
  const play = (el: HTMLElement, keyframes: Keyframe[], timing: KeyframeAnimationOptions): Promise<void> => {
    const animation = el.animate(keyframes, { fill: 'both', ...timing })
    animations.push(animation)
    return animation.finished.then(
      () => undefined,
      () => undefined,
    )
  }

  /** 기다린 뒤 취소됐으면 사슬을 끊는다 */
  const guard = async (pending: Promise<unknown>) => {
    await pending
    if (cancelled) throw new Cancelled()
  }

  const animated = [targets.background, ...targets.materials, targets.logo, targets.badge, ...targets.items, targets.button]
  const setWillChange = (els: HTMLElement[], on: boolean) => {
    for (const el of els) el.style.willChange = on ? 'transform, opacity' : ''
  }
  setWillChange(animated, true)

  const fadeIn = [{ opacity: 0 }, { opacity: 1 }]
  const fadeOut = [{ opacity: 1 }, { opacity: 0 }]
  const textItems = [targets.badge, ...targets.items]

  async function runReduced() {
    const { fade, easing } = TIMING.reduced
    for (const el of targets.materials) el.hidden = true
    await guard(play(targets.background, fadeIn, { duration: fade, easing }))
    await guard(Promise.all(textItems.map((el) => play(el, fadeIn, { duration: fade, easing }))))
    setWillChange(animated, false)
    // 확인 버튼은 기다리지 않고 바로 나온다
    void play(targets.button, fadeIn, { duration: 0 })
    options.onReady()
  }

  async function runFull() {
    const rootHeight = targets.root.clientHeight || 780

    // 1단계 — 검은 층. 재료는 슬롯 자리에 그대로 있다
    void play(targets.background, fadeIn, TIMING.background)
    await guard(sleep(TIMING.toLogoStage))

    // 2단계 — 로고가 올라오고 재료가 로고 중심으로 모인다. 좌표는 변환이 걸리기 전에 먼저 잰다
    const logoCenter = center(targets.logo.getBoundingClientRect())
    const m = TIMING.material
    targets.materials.forEach((el, k) => {
      const from = center(el.getBoundingClientRect())
      const dx = logoCenter.x - from.x
      const dy = logoCenter.y - from.y
      const slot = options.slots[k] ?? k
      void play(
        el,
        [
          { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0 },
          { transform: `translate(${dx}px, ${dy}px) scale(${m.endScale})`, opacity: 1, offset: m.opaqueUntil },
          { transform: `translate(${dx}px, ${dy}px) scale(0)`, opacity: 0, offset: 1 },
        ],
        { delay: m.delayBase + slot * m.delayStep, duration: m.duration, easing: m.easing },
      )
    })
    const li = TIMING.logoIn
    void play(
      targets.logo,
      [
        { opacity: 0, transform: `translateY(${li.fromY}px) scale(${li.fromScale})` },
        { opacity: 1, transform: 'translateY(0px) scale(1)' },
      ],
      { duration: li.duration, easing: li.easing },
    )
    await guard(sleep(m.delayBase + (MATERIAL_SLOT_COUNT - 1) * m.delayStep + m.duration))
    const lp = TIMING.logoPulse
    await guard(
      play(targets.logo, [{ transform: 'scale(1)' }, { transform: `scale(${lp.scale})` }, { transform: 'scale(1)' }], {
        duration: lp.duration,
        easing: lp.easing,
      }),
    )
    await guard(sleep(TIMING.afterPulse))

    // 3단계 — 로고가 위로 커지며 화면을 채우고 사라진다
    const lo = TIMING.logoOut
    void play(
      targets.logo,
      [
        { transform: 'translateY(0px) scale(1)', opacity: 1, offset: 0 },
        { transform: `translateY(${-lo.midLift * rootHeight}px) scale(${lo.midScale})`, opacity: 1, offset: lo.holdAt },
        { transform: `translateY(${-lo.endLift * rootHeight}px) scale(${lo.endScale})`, opacity: 0, offset: 1 },
      ],
      { duration: lo.duration, easing: lo.easing },
    )
    await guard(sleep(lo.toNext))
    setWillChange([...targets.materials, targets.logo], false)

    // 4단계 — 결과 배지 팝업
    const b = TIMING.badge
    void play(
      targets.badge,
      [
        { opacity: 0, transform: `scale(${b.fromScale})`, offset: 0 },
        { opacity: 1, transform: `scale(${b.overshootScale})`, offset: b.overshootAt },
        { opacity: 1, transform: 'scale(1)', offset: 1 },
      ],
      { duration: b.duration, easing: b.easing },
    )
    await guard(sleep(b.toNext))

    // 5단계 — 칩 → 이름 → 설명 문장이 한 줄씩
    const it = TIMING.item
    targets.items.forEach((el, i) => {
      void play(
        el,
        [
          { opacity: 0, transform: `translateY(${it.fromY}px)` },
          { opacity: 1, transform: 'translateY(0px)' },
        ],
        { delay: i * it.step, duration: it.duration, easing: it.easing },
      )
    })
    const lastIndex = Math.max(0, targets.items.length - 1)
    await guard(sleep(lastIndex * it.step + it.duration + it.afterLast))

    // 6단계 — 확인 버튼. 이때부터 누를 수 있다
    const bt = TIMING.button
    setWillChange(animated, false)
    void play(
      targets.button,
      [
        { opacity: 0, transform: `translateY(${bt.fromY}px)` },
        { opacity: 1, transform: 'translateY(0px)' },
      ],
      { duration: bt.duration, easing: bt.easing },
    )
    options.onReady()
  }

  const run = options.reducedMotion ? runReduced : runFull
  run().catch((error: unknown) => {
    if (!(error instanceof Cancelled)) throw error
  })

  async function runExit() {
    if (options.reducedMotion) {
      const { fade, easing } = TIMING.reduced
      await guard(Promise.all([targets.button, ...textItems].map((el) => play(el, fadeOut, { duration: fade, easing }))))
      await guard(play(targets.background, fadeOut, { duration: fade, easing }))
      return
    }
    const x = TIMING.exit
    await guard(Promise.all([targets.button, ...textItems].map((el) => play(el, fadeOut, { duration: x.fade, easing: x.easing }))))
    await guard(sleep(x.gap))
    await guard(play(targets.background, fadeOut, { duration: x.background, easing: x.backgroundEasing }))
  }

  /** 취소되면 끝내 풀리지 않는다 — 닫힘 뒤처리(`onConfirm`)가 언마운트된 화면에서 돌지 않게 한다 */
  const exit = () =>
    runExit().catch((error: unknown) => {
      if (error instanceof Cancelled) return new Promise<void>(() => {})
      throw error
    })

  return {
    exit,
    cancel: () => {
      cancelled = true
      for (const id of timers) clearTimeout(id)
      timers.clear()
      for (const animation of animations) animation.cancel()
      animations.length = 0
      setWillChange(animated, false)
    },
  }
}

/* ───────────────────────── 화면 ───────────────────────── */

const subscribeNothing = () => () => {}

export default function TierUpRevealOverlay({ open, ...rest }: Props) {
  // 서버 렌더·첫 하이드레이션에서는 포털을 그리지 않는다 — `document.body`는 클라이언트에만 있다
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false)
  if (!open || !mounted || !rest.result) return null
  return createPortal(<TierUpRevealStage materials={rest.materials} result={rest.result} onConfirm={rest.onConfirm} />, document.body)
}

/** 열려 있는 동안만 마운트되는 본체. 포털 없이 그리므로 서버 렌더로 마크업을 시험할 수 있다 */
export function TierUpRevealStage({ materials, result, onConfirm }: { materials: TierUpRevealMaterial[]; result: TierUpRevealResult; onConfirm: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<RevealTimeline | null>(null)
  const closingRef = useRef(false)
  const onConfirmRef = useRef(onConfirm)
  const [buttonReady, setButtonReady] = useState(false)
  const [closing, setClosing] = useState(false)
  const lines = useMemo(() => buildRevealLines(result), [result])
  const itemCount = (lines.chipRarity ? 1 : 0) + 1 + lines.sentences.length

  useEffect(() => {
    onConfirmRef.current = onConfirm
  })

  // 탭바 숨김·배경 스크롤 잠금 — 닫히면 정리 함수가 원복한다
  useEffect(() => pushTabBarHidden(), [])
  useEffect(() => pushMainScrollLock(), [])

  // 재료 자리 잡기 + 타임라인 시작. 첫 그림 전에 끝나야 해서 레이아웃 효과다
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const q = (name: string) => root.querySelector<HTMLElement>(`[data-reveal="${name}"]`)
    const background = q('background')
    const logo = q('logo')
    const badge = q('badge')
    const button = q('button')
    if (!background || !logo || !badge || !button) return

    const materialEls = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal="material"]'))
    // 슬롯 좌표(뷰포트)를 오버레이 루트 기준으로 바꾼다 — 데스크톱의 430px 컬럼에서도 같은 자리에 선다
    const rootRect = root.getBoundingClientRect()
    materialEls.forEach((el, k) => {
      const material = materials[k]
      if (!material) return
      el.style.left = `${material.rect.left - rootRect.left}px`
      el.style.top = `${material.rect.top - rootRect.top}px`
    })

    root.focus({ preventScroll: true })
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timeline = playTierUpReveal(
      {
        root,
        background,
        materials: materialEls,
        logo,
        badge,
        items: Array.from(root.querySelectorAll<HTMLElement>('[data-reveal="item"]')),
        button,
      },
      { reducedMotion, slots: materials.map((m) => m.slot), onReady: () => setButtonReady(true) },
    )
    timelineRef.current = timeline
    return () => {
      timeline.cancel()
      timelineRef.current = null
    }
  }, [materials, itemCount])

  // 확인 버튼이 나오면 포커스를 옮긴다
  useEffect(() => {
    if (!buttonReady) return
    rootRef.current?.querySelector<HTMLElement>('[data-reveal="button"] button')?.focus({ preventScroll: true })
  }, [buttonReady])

  function handleConfirm() {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    const timeline = timelineRef.current
    void (timeline ? timeline.exit() : Promise.resolve()).then(() => onConfirmRef.current())
  }

  const columnTop = `max(calc(35% - ${BADGE_SIZE / 2 + 12}px), calc(env(safe-area-inset-top, 0px) + 8px))`
  const buttonBottom = `max(${BUTTON_BOTTOM_GAP}px, calc(env(safe-area-inset-bottom, 0px) + ${BUTTON_BOTTOM_GAP}px))`
  const textStyle = { margin: 0, textAlign: 'center' as const }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={d.combine.tierUp.reveal.ariaLabel}
      tabIndex={-1}
      // 연출 중에는 확인 버튼 말고 눌러 볼 곳이 없다 — 포커스가 뒤 화면으로 새지 않게 막는다
      onKeyDown={(event) => {
        if (event.key === 'Tab') event.preventDefault()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        maxWidth: COLUMN_MAX_WIDTH,
        marginLeft: 'auto',
        marginRight: 'auto',
        zIndex: OVERLAY_Z_INDEX,
        overflow: 'hidden',
        outline: 'none',
      }}
    >
      <div data-reveal="background" aria-hidden="true" style={{ position: 'absolute', inset: 0, background: STAGE_BACKGROUND, opacity: 0 }} />

      {materials.map((material) => (
        <div
          key={material.slot}
          data-reveal="material"
          aria-hidden="true"
          style={{ position: 'absolute', width: material.rect.width, height: material.rect.height, pointerEvents: 'none' }}
        >
          <SafeImage src={material.imageUrl} alt="" className="object-contain" sizes={`${Math.round(material.rect.width)}px`} priority />
        </div>
      ))}

      {/* 로고 — 폭은 좌우 16px을 뺀 전체, 비율 유지, 세로 중심은 화면 높이의 약 88%. 위치 잡는 바깥 상자는 움직이지 않고 안쪽 상자만 애니메이션한다 */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 'var(--spacing-16)',
          right: 'var(--spacing-16)',
          top: 'calc(88% - env(safe-area-inset-bottom, 0px) / 2)',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}
      >
        <div data-reveal="logo" style={{ position: 'relative', width: '100%', aspectRatio: LOGO_ASPECT, opacity: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 정적 로고는 최적화 변환 없이 첫 프레임에 바로 떠야 하고, 크기가 8배까지 커져도 원본 그대로 써야 한다 */}
          <img src="/jam-logo-white.png" alt="" decoding="async" style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>
      </div>

      {/* 결과 컬럼 — 배지 중심이 화면 높이의 약 35%. 작은 화면에서는 컬럼 안에서 스크롤하고, 아래 버튼 영역만큼 비워 둔다 */}
      <div
        data-reveal="column"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: columnTop,
          bottom: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
          paddingLeft: 'var(--spacing-16)',
          paddingRight: 'var(--spacing-16)',
          paddingBottom: `calc(${BUTTON_HEIGHT}px + ${buttonBottom} + var(--spacing-24))`,
        }}
      >
        <div data-reveal="badge" style={{ position: 'relative', width: BADGE_SIZE, height: BADGE_SIZE, flexShrink: 0, opacity: 0 }}>
          <SafeImage src={result.imageUrl} alt={result.name} className="object-contain" sizes={`${BADGE_SIZE}px`} priority />
        </div>

        <div
          aria-live="polite"
          style={{
            marginTop: 'var(--spacing-24)',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {lines.chipRarity && (
            <div data-reveal="item" style={{ opacity: 0 }}>
              <RarityBadge rarity={lines.chipRarity} size="md" />
            </div>
          )}
          <p
            data-reveal="item"
            className="break-keep wrap-break-word text-balance"
            style={{
              ...textStyle,
              opacity: 0,
              color: 'var(--base-white)',
              fontSize: 'var(--text-2xl)',
              lineHeight: 'var(--text-2xl--line-height)',
              fontWeight: 700,
            }}
          >
            {lines.name}
          </p>
          {lines.sentences.map((sentence, index) => (
            <p
              key={index}
              data-reveal="item"
              className="break-keep wrap-break-word text-balance"
              style={{
                ...textStyle,
                opacity: 0,
                color: 'var(--muted-on-inverse)',
                fontSize: 'var(--text-base)',
                lineHeight: 'var(--text-base--line-height)',
              }}
            >
              {sentence}
            </p>
          ))}
        </div>
      </div>

      {/* 확인 버튼 — 나오기 전에는 보조기술과 포인터에서 모두 빠진다. DS Button md의 자연 높이가 52px이라 높이를 덮지 않는다 */}
      <div
        data-reveal="button"
        aria-hidden={!buttonReady}
        inert={!buttonReady}
        style={{ position: 'absolute', left: 'var(--spacing-16)', right: 'var(--spacing-16)', bottom: buttonBottom, opacity: 0 }}
      >
        <Button variant="primary" surface="dark" fullWidth disabled={closing} onClick={handleConfirm} className="whitespace-nowrap">
          {d.combine.tierUp.reveal.confirm}
        </Button>
      </div>
    </div>
  )
}
