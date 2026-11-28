'use client'

import {
  Fragment,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react'
import { flushSync } from 'react-dom'
import SafeImage from '@/components/SafeImage'
import Button from '@/components/ui/Button'
import { RarityBadge, type Rarity } from '@/components/ui/RarityBadge'
import { d } from '@/lib/i18n'
import { drawBall } from './gachaDraw'
import {
  BALL_SPAWN_INTERVAL_MS,
  DOME_CENTER,
  pickWinner,
  spawnGachaBall,
  stepGachaBalls,
  visualRadius,
  type GachaBall,
} from './gachaPhysics'
import { GACHA } from './gachaTheme'
import styles from './TierUpGachaStage.module.css'

/**
 * 등급 UP 가차머신 무대 (티켓 20261127_2225) — 서비스 전용 컴포넌트, 정본 후보가 아니다(사용자 지시 2026-11-27: 가차머신 디자인·버튼·텍스트는 DS에 넣지 않고 하드코딩).
 * 시각·모션 수치의 출처는 `docs/assets/prototypes/20261127_tier-up-gacha-prototype.html`이고, 색은 `gachaTheme.ts`, 돔 안 물리는 `gachaPhysics.ts`에 있다.
 *
 * 그리기와 연출만 맡는다. 고른 배지·바텀시트·`/api/combine/tier-up` 호출은 `CombineClient`가 갖고, 이 컴포넌트에는 두 가지 신호로만 닿는다.
 * - `play(images)` — 연출을 시작한다(공 생성 → 섞기, 최소 3초). 서버 응답이 올 때까지 계속 섞는다.
 * - `settle(outcome)` — 서버 응답의 결과. `reveal`은 중앙 공 → 진동 → 배지 공개, `handoff`는 진동 뒤 처음 상태로 돌아가 `onHandoff`를 부른다(잠김·받지 않음),
 *   `abort`는 즉시 멈추고 처음 상태로 돌아간다(소각 전 거절·네트워크 오류).
 * 언마운트·연타·`abort` 때 rAF·타이머·애니메이션을 모두 정리한다.
 */

export interface TierUpGachaBadge {
  name: string
  rarity: Rarity | null
  imageUrl: string | null
  /** 결과 배지 설명문 — 없거나 비어 있으면 설명 줄을 그리지 않는다 */
  description: string | null
}

export type TierUpGachaOutcome = { kind: 'reveal'; badge: TierUpGachaBadge } | { kind: 'handoff' } | { kind: 'abort' }

export interface TierUpGachaHandle {
  play: (images: (string | null)[]) => void
  settle: (outcome: TierUpGachaOutcome) => void
}

interface Props {
  ref?: Ref<TierUpGachaHandle>
  /** 지금까지 고른 배지 수(0~6) */
  count: number
  /** «배지 넣기»를 막는다(받지 않은 믹스 결과가 있거나 6개 이상 가진 등급이 없음) */
  disabled: boolean
  /** 바텀시트가 열려 있으면 행운 문구를 바꾸지 않는다 */
  sheetOpen: boolean
  onInsert: () => void
  /** «한 번 더»를 눌러 머신이 돌아온 뒤 */
  onAgain: () => void
  /** `handoff` 결과의 진동이 끝나 스테이지를 되돌린 뒤 — 기존 안내를 연다 */
  onHandoff: () => void
  /** 머신 아래 안내(InlineNotice) */
  notice?: ReactNode
  /** «배지 넣기»가 막힌 이유 안내의 id */
  describedBy?: string
}

type Phase = 'idle' | 'run' | 'result'
type StageBall = GachaBall & { color: string; img: HTMLImageElement | null }

const LUCK_COUNT = d.combine.tierUp.luck.length
const BALL_COUNT = 6
/** 중앙 공 지름 */
const WIN_DIAMETER = 150
/** 백그라운드 탭에서 돌아왔을 때 공이 튀지 않게 프레임 간격에 두는 상한(초) */
const MAX_DT = 0.033

const noopSubscribe = () => () => {}
const now = () => performance.now()
/** 결과 배지 등급색 — 정본 `RarityBadge`가 쓰는 의미 토큰이다(후광·빛살·섬광 링) */
const RARITY_VAR: Record<Rarity, string> = {
  common: 'var(--rarity-common)',
  rare: 'var(--rarity-rare)',
  epic: 'var(--rarity-epic)',
  mystic: 'var(--rarity-mystic)',
}
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia?.(REDUCED_QUERY)
  mq?.addEventListener?.('change', onChange)
  return () => mq?.removeEventListener?.('change', onChange)
}
function readReduced() {
  return window.matchMedia?.(REDUCED_QUERY)?.matches ?? false
}

/** 시간값 — 모션 줄이기면 줄인다(프로토타입 `T()`) */
function scaled(ms: number, reduced: boolean) {
  return reduced ? Math.round(ms * 0.45) : ms
}

function otherLuck(prev: number): number {
  if (LUCK_COUNT < 2) return 0
  let n = prev
  while (n === prev) n = Math.floor(Math.random() * LUCK_COUNT)
  return n
}

function shuffled<T>(list: T[]): T[] {
  return list
    .map((v) => [Math.random(), v] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
}

/** 결과 글자 묶음이 배지 중심 아래로 떨어지는 거리(`.meta`의 top 오프셋과 같다) */
const META_OFFSET = 112
/** 설명이 길어 배지를 올릴 때 중심이 내려가지 않을 하한 — 배지가 화면 위로 잘리지 않게 한다 */
const MIN_CY = 110

export default function TierUpGachaStage({ ref, count, disabled, sheetOpen, onInsert, onAgain, onHandoff, notice, describedBy }: Props) {
  const reducedNow = useSyncExternalStore(subscribeReduced, readReduced, () => false)
  const reducedRef = useRef(reducedNow)
  useEffect(() => {
    reducedRef.current = reducedNow
  }, [reducedNow])

  const [phase, setPhase] = useState<Phase>('idle')
  // 진입 때 행운 문구를 무작위로 뽑는다. 서버 렌더는 첫 문구(0)라 하이드레이션 값이 어긋나지 않는다
  const [entryLuck] = useState(() => Math.floor(Math.random() * LUCK_COUNT))
  const entrySeed = useSyncExternalStore(noopSubscribe, () => entryLuck, () => 0)
  const [luckOverride, setLuckOverride] = useState<number | null>(null)
  const luckIdx = luckOverride ?? entrySeed
  const luckRef = useRef(luckIdx)
  useEffect(() => {
    luckRef.current = luckIdx
  }, [luckIdx])
  const [luckOut, setLuckOut] = useState(false)
  const [badge, setBadge] = useState<TierUpGachaBadge | null>(null)
  const [showAgain, setShowAgain] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [cy, setCy] = useState(0)
  // 3단계 직전 숨긴 측정용 글자 묶음(묶음+버튼 높이 실측용) — 잰 뒤 바로 지운다
  const [measureBadge, setMeasureBadge] = useState<TierUpGachaBadge | null>(null)
  const measureEl = useRef<HTMLDivElement>(null)

  const stageEl = useRef<HTMLDivElement>(null)
  const machineEl = useRef<HTMLDivElement>(null)
  const canvasEl = useRef<HTMLCanvasElement>(null)
  const fxEl = useRef<HTMLDivElement>(null)

  // 엔진 상태 — 렌더와 무관해 ref에 둔다
  const mounted = useRef(true)
  const runId = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const balls = useRef<StageBall[]>([])
  const blower = useRef(false)
  const looping = useRef(false)
  const raf = useRef(0)
  const lastT = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const anims = useRef(new Set<Animation>())
  const outcome = useRef<TierUpGachaOutcome | null>(null)
  const outcomeWaiter = useRef<(() => void) | null>(null)
  const imgCache = useRef(new Map<string, HTMLImageElement>())
  const callbacks = useRef({ onAgain, onHandoff })
  useEffect(() => {
    callbacks.current = { onAgain, onHandoff }
  }, [onAgain, onHandoff])

  const changePhase = (next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }

  // ---------- 행운 문구: 진입 때 새로 뽑고, 대기 중에만 4.2초마다 페이드로 바꾼다 ----------
  useEffect(() => {
    if (phase !== 'idle' || sheetOpen) return
    let swap: ReturnType<typeof setTimeout> | null = null
    const id = setInterval(() => {
      if (reducedRef.current) {
        setLuckOverride(otherLuck(luckRef.current))
        return
      }
      setLuckOut(true)
      swap = setTimeout(() => {
        setLuckOverride(otherLuck(luckRef.current))
        setLuckOut(false)
      }, 450)
    }, 4200)
    return () => {
      clearInterval(id)
      if (swap) clearTimeout(swap)
      setLuckOut(false)
    }
  }, [phase, sheetOpen])

  // ---------- 캔버스 ----------
  const sizeCanvas = () => {
    const canvas = canvasEl.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = canvas.clientWidth
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(w * dpr)
  }
  useEffect(() => {
    sizeCanvas()
    window.addEventListener('resize', sizeCanvas)
    return () => window.removeEventListener('resize', sizeCanvas)
  }, [])

  const draw = () => {
    const canvas = canvasEl.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const s = canvas.width / 256
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(s, 0, 0, s, 0, 0)
    ctx.save()
    ctx.beginPath()
    ctx.arc(DOME_CENTER, DOME_CENTER, 122, 0, Math.PI * 2)
    ctx.clip()
    // 뒤(z가 작은) 공부터 그려 앞 공이 뒤 공을 덮게 한다. 뒤 공은 조금 작고 어둡다
    const order = balls.current.slice().sort((a, b) => a.z - b.z)
    const clock = now()
    for (const b of order) {
      // 새로 생긴 공은 0.28초 동안 살짝 튀어나오듯 커진다
      const t = b.born ? Math.min(1, (clock - b.born) / 280) : 1
      const pop = t < 1 ? Math.max(0.01, 1 + 0.18 * Math.sin(t * Math.PI) - (1 - t) * (1 - t)) : 1
      ctx.globalAlpha = 0.72 + (0.28 * (b.z + 1)) / 2
      drawBall(ctx, b.x, b.y, visualRadius(b) * pop, b.rot, b.color, b.img)
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  const stopLoop = () => {
    looping.current = false
    cancelAnimationFrame(raf.current)
  }
  const frame = (t: number) => {
    if (!looping.current) return
    // 다음 프레임을 먼저 예약해, 한 프레임에서 오류가 나도 섞기 애니메이션이 멈추지 않게 한다
    raf.current = requestAnimationFrame(frame)
    const dt = Math.min(MAX_DT, (t - lastT.current) / 1000 || 0.016)
    lastT.current = t
    try {
      const n = 3
      for (let k = 0; k < n; k++) stepGachaBalls(balls.current, dt / n, blower.current, Math.random)
      draw()
    } catch (e) {
      console.error('[가차볼] 프레임 처리 오류', e)
    }
  }
  const startLoop = () => {
    if (looping.current) return
    looping.current = true
    lastT.current = now()
    raf.current = requestAnimationFrame(frame)
  }

  // ---------- 타이머·애니메이션 도우미 ----------
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = setTimeout(() => {
        timers.current.delete(id)
        resolve()
      }, ms)
      timers.current.add(id)
    })
  /** WAAPI 애니메이션. 지원하지 않는 환경이면 시간만 기다린다. 취소되면 끝내 resolve하지 않는다(호출한 연출이 멈춘다) */
  const animate = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) =>
    new Promise<void>((resolve) => {
      if (typeof el.animate !== 'function') {
        void wait(Number(options.duration ?? 0) + Number(options.delay ?? 0)).then(resolve)
        return
      }
      const a = el.animate(keyframes, options)
      anims.current.add(a)
      a.finished.then(
        () => resolve(),
        () => {},
      )
    })
  const loadImg = (src: string | null): HTMLImageElement | null => {
    if (!src) return null
    const cached = imgCache.current.get(src)
    if (cached) return cached
    const im = new Image()
    im.decoding = 'async'
    im.src = src
    imgCache.current.set(src, im)
    return im
  }

  /** 진행 중인 연출을 모두 끊고 머신을 처음 모양으로 되돌린다(상태 갱신은 부르는 쪽이 한다) */
  const haltEngine = () => {
    runId.current += 1
    timers.current.forEach(clearTimeout)
    timers.current.clear()
    anims.current.forEach((a) => a.cancel())
    anims.current.clear()
    stopLoop()
    balls.current = []
    blower.current = false
    outcome.current = null
    outcomeWaiter.current = null
    fxEl.current?.replaceChildren()
    draw()
  }

  useEffect(() => {
    mounted.current = true
    const timerSet = timers.current
    const animSet = anims.current
    const fx = fxEl.current
    return () => {
      mounted.current = false
      runId.current += 1
      timerSet.forEach(clearTimeout)
      timerSet.clear()
      animSet.forEach((a) => a.cancel())
      animSet.clear()
      looping.current = false
      cancelAnimationFrame(raf.current)
      fx?.replaceChildren()
    }
  }, [])

  // ---------- 중앙으로 나오는 공(캔버스 두 장: 투명 유리구 + 어두운 유리구) ----------
  const makeDomBall = (diameter: number, color: string, img: HTMLImageElement | null, glow: string) => {
    const el = document.createElement('div')
    el.className = styles.dball
    el.style.width = `${diameter}px`
    el.style.height = `${diameter}px`
    el.style.setProperty('--glow', glow)
    const inner = document.createElement('div')
    inner.className = styles.inner
    const glowEl = document.createElement('div')
    glowEl.className = styles.glow
    inner.appendChild(glowEl)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const layers: HTMLCanvasElement[] = []
    for (const frosted of [false, true]) {
      const cv = document.createElement('canvas')
      cv.width = Math.round(diameter * dpr)
      cv.height = Math.round(diameter * dpr)
      const c2 = cv.getContext('2d')
      if (c2) {
        c2.scale(dpr, dpr)
        drawBall(c2, diameter / 2, diameter / 2, diameter / 2 - 1, 0, color, img, frosted)
      }
      inner.appendChild(cv)
      layers.push(cv)
    }
    el.appendChild(inner)
    fxEl.current?.appendChild(el)
    return { el, layers }
  }

  const tf = (x: number, y: number, size: number, scale: number, rot = 0) =>
    `translate(${x - size / 2}px, ${y - size / 2}px) scale(${scale}) rotate(${rot}deg)`

  // ---------- 연출 순서 ----------
  const sequence = async (id: number, images: (string | null)[]) => {
    const alive = () => mounted.current && runId.current === id
    const reduced = reducedRef.current
    const T = (ms: number) => scaled(ms, reduced)
    const stage = stageEl.current
    const machine = machineEl.current
    const canvas = canvasEl.current
    if (!stage || !machine || !canvas) return

    sizeCanvas()
    const colors = shuffled([...GACHA.ball, ...GACHA.ball]).slice(0, BALL_COUNT)
    startLoop()
    // 1) 고른 배지가 가차볼이 되어 돔 안 위쪽에 하나씩 생겨나 떨어진다
    for (let i = 0; i < BALL_COUNT; i++) {
      const base = spawnGachaBall(i, Math.random, now())
      balls.current.push({ ...base, color: colors[i % colors.length], img: loadImg(images[i] ?? null) })
      await wait(T(BALL_SPAWN_INTERVAL_MS))
      if (!alive()) return
    }
    await wait(T(320))
    if (!alive()) return

    // 2) 돔 안에서 최소 3초 섞는다. 서버 응답이 늦으면 응답이 올 때까지 계속 섞는다
    blower.current = true
    const shuffleEnd = now() + (reduced ? 900 : 3000)
    if (!outcome.current) await new Promise<void>((resolve) => (outcomeWaiter.current = resolve))
    if (!alive()) return
    const remain = shuffleEnd - now()
    if (remain > 0) await wait(remain)
    if (!alive()) return
    const result = outcome.current
    if (!result || result.kind === 'abort') return

    // 3) 공 하나가 화면 중앙(무대 높이 40%)으로 나오고 머신은 아래로 내려가며 사라진다
    const stageRect = stage.getBoundingClientRect()
    // 이상값은 무대 높이의 40%. 결과 글자 묶음(+«한 번 더»)이 무대 하단 여백(탭바 자리) 위에 못 들어가면 넘치는 만큼 올린다(하한 MIN_CY)
    let centerY = Math.round(stageRect.height * 0.4)
    if (result.kind === 'reveal') {
      flushSync(() => setMeasureBadge(result.badge))
      const metaHeight = measureEl.current?.offsetHeight ?? 0
      flushSync(() => setMeasureBadge(null))
      const padBottom = parseFloat(getComputedStyle(stage).paddingBottom) || 0
      const fit = Math.floor(stageRect.height - padBottom - META_OFFSET - metaHeight)
      centerY = Math.max(Math.min(centerY, fit), Math.min(centerY, MIN_CY))
    }
    setCy(centerY)
    const wi = pickWinner(balls.current)
    if (wi < 0) {
      // 공을 고르지 못했다(공이 늘 6개라 정상 흐름에서는 일어나지 않는다, 티켓 20261128_0001).
      // 멈춘 채 두지 않고 처음 상태로 돌아가 호출부가 제출 잠금을 풀게 한다 — 잠김·받지 않음은 기존 안내를 열고, 성공은 «한 번 더»와 같이 비운다
      resetToIdle(false)
      if (result.kind === 'handoff') callbacks.current.onHandoff()
      else callbacks.current.onAgain()
      return
    }
    const w = balls.current.splice(wi, 1)[0]
    const toRarity = result.kind === 'reveal' ? (result.badge.rarity ?? 'common') : 'common'
    const canvasRect = canvas.getBoundingClientRect()
    const k = canvasRect.width / 256
    const fromX = canvasRect.left - stageRect.left + w.x * k
    const fromY = canvasRect.top - stageRect.top + w.y * k
    const win = makeDomBall(WIN_DIAMETER, w.color, w.img, RARITY_VAR[toRarity])
    const s0 = (visualRadius(w) * 2 * k) / WIN_DIAMETER
    const rot0 = (w.rot * 180) / Math.PI
    win.el.style.transform = tf(fromX, fromY, WIN_DIAMETER, s0, rot0)
    const cx = stageRect.width / 2
    const moveDone = animate(
      win.el,
      [
        { transform: tf(fromX, fromY, WIN_DIAMETER, s0, rot0), easing: 'cubic-bezier(.2,.7,.2,1)' },
        { transform: tf((fromX + cx) / 2, Math.min(fromY, centerY) - 40, WIN_DIAMETER, 0.75, rot0 + 200), offset: 0.45, easing: 'cubic-bezier(.3,0,.2,1)' },
        { transform: tf(cx, centerY, WIN_DIAMETER, 1, Math.round((rot0 + 360) / 360) * 360) },
      ],
      { duration: T(900), fill: 'forwards' },
    )
    // 하나만 남은 공은 중앙으로 오는 동안 불투명한 어두운 유리구로 바뀌고, 안에 있던 배지는 사라진다
    void animate(win.layers[1], [{ opacity: 0 }, { opacity: 1 }], { duration: T(650), delay: T(300), fill: 'forwards', easing: 'ease-in-out' })
    void animate(win.layers[0], [{ opacity: 1 }, { opacity: 0 }], { duration: T(200), delay: T(900), fill: 'forwards' })
    win.layers[1].style.opacity = '0'
    const machineDone = animate(
      machine,
      [
        { transform: 'translateY(0)', opacity: 1 },
        { transform: 'translateY(180px)', opacity: 0 },
      ],
      { duration: T(850), delay: T(120), fill: 'forwards', easing: 'cubic-bezier(.5,0,.75,0)' },
    )
    await Promise.all([moveDone, machineDone])
    if (!alive()) return
    blower.current = false
    stopLoop()
    balls.current = []
    draw()

    // 4) 잔 진동
    win.el.classList.add(styles.charging)
    await wait(T(1150))
    if (!alive()) return

    if (result.kind === 'handoff') {
      // 잠김·받지 않음: 스테이지를 처음 상태로 되돌리고 기존 안내를 연다
      resetToIdle(true)
      callbacks.current.onHandoff()
      return
    }

    // 5) 배지 공개 — 공은 작아지고 흐려지며 뒤로 사라진다
    win.el.classList.remove(styles.charging)
    setBadge(result.badge)
    changePhase('result')
    void animate(
      win.el,
      [
        { transform: tf(cx, centerY, WIN_DIAMETER, 1), opacity: 1, filter: 'blur(0px)' },
        { transform: tf(cx, centerY, WIN_DIAMETER, 0.42), opacity: 0, filter: 'blur(6px)' },
      ],
      { duration: T(380), fill: 'forwards', easing: 'cubic-bezier(.4,0,1,1)' },
    )
    // 6) 작은 «한 번 더» 버튼
    await wait(T(900))
    if (!alive()) return
    setShowAgain(true)
  }

  /** 대기 상태로 돌아간다. `fadeIn`이면 머신이 페이드 인으로 다시 나타난다 */
  const resetToIdle = (fadeIn: boolean) => {
    haltEngine()
    setBadge(null)
    setShowAgain(false)
    setLeaving(false)
    setLuckOverride(otherLuck(luckRef.current))
    changePhase('idle')
    const machine = machineEl.current
    if (fadeIn && machine && typeof machine.animate === 'function') {
      const a = machine.animate(
        [
          { opacity: 0, transform: 'scale(.94)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: scaled(560, reducedRef.current), easing: 'cubic-bezier(.2,.8,.2,1)' },
      )
      anims.current.add(a)
    }
  }

  useImperativeHandle(ref, () => ({
    play(images) {
      if (phaseRef.current !== 'idle') return
      haltEngine()
      const id = runId.current
      changePhase('run')
      void sequence(id, images).catch((e) => console.error('[가차머신] 연출 오류', e))
    },
    settle(next) {
      if (phaseRef.current !== 'run') return
      if (next.kind === 'abort') {
        resetToIdle(false)
        return
      }
      outcome.current = next
      outcomeWaiter.current?.()
      outcomeWaiter.current = null
    },
  }))

  const handleAgain = async () => {
    if (leaving || phaseRef.current !== 'result') return
    const id = ++runId.current
    setLeaving(true)
    await wait(scaled(320, reducedRef.current))
    if (!mounted.current || runId.current !== id) return
    resetToIdle(true)
    callbacks.current.onAgain()
  }

  const T = (ms: number) => scaled(ms, reducedNow)
  const rarityVar = RARITY_VAR[badge?.rarity ?? 'common']
  const idle = phase === 'idle'
  const luckLines = d.combine.tierUp.luck[luckIdx % LUCK_COUNT].split('\n')
  const fade = leaving ? styles.fadeOut : ''

  return (
    <div ref={stageEl} className={styles.stage}>
      <div ref={machineEl} className={styles.machine}>
        <div className={styles.dome}>
          <svg className={styles.layer} viewBox="0 0 256 256" aria-hidden="true">
            <defs>
              <radialGradient id="tug-dome-fill" cx="50%" cy="46%" r="55%">
                <stop offset="0" stopColor={GACHA.domeFill[0]} />
                <stop offset="0.62" stopColor={GACHA.domeFill[1]} />
                <stop offset="0.9" stopColor={GACHA.domeFill[2]} />
                <stop offset="1" stopColor={GACHA.domeFill[3]} />
              </radialGradient>
            </defs>
            <circle cx="128" cy="128" r="124" fill="url(#tug-dome-fill)" />
          </svg>
          {/* 행운 문구는 공 뒤 레이어다 — 공이 지나가도 글자가 읽힌다 */}
          <div className={styles.luck} style={{ opacity: idle ? 1 : 0 }}>
            <span className={[styles.luckText, luckOut ? styles.luckOut : ''].join(' ')} style={{ backgroundImage: GACHA.luckGradient }}>
              {luckLines.map((line, i) => (
                <Fragment key={i}>
                  {i > 0 && <br />}
                  {line}
                </Fragment>
              ))}
            </span>
          </div>
          <canvas ref={canvasEl} className={styles.layer} aria-hidden="true" />
          <svg className={styles.layer} viewBox="0 0 256 256" aria-hidden="true">
            <defs>
              <clipPath id="tug-dome-clip">
                <circle cx="128" cy="128" r="123" />
              </clipPath>
              <linearGradient id="tug-crescent" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={GACHA.crescent[0]} stopOpacity="0.95" />
                <stop offset="0.55" stopColor={GACHA.crescent[1]} stopOpacity="0.55" />
                <stop offset="1" stopColor={GACHA.crescent[1]} stopOpacity="0" />
              </linearGradient>
              <linearGradient id="tug-glint" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={GACHA.glint[0]} stopOpacity="0" />
                <stop offset="0.5" stopColor={GACHA.glint[1]} stopOpacity="0.32" />
                <stop offset="1" stopColor={GACHA.glint[0]} stopOpacity="0" />
              </linearGradient>
              <linearGradient id="tug-rim" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={GACHA.rim[0]} />
                <stop offset="1" stopColor={GACHA.rim[1]} />
              </linearGradient>
            </defs>
            <g clipPath="url(#tug-dome-clip)">
              {/* 왼쪽 위 초승달 반사 */}
              <path d="M30 118 C 30 62 70 20 128 14 C 84 30 52 66 46 118 Z" fill="url(#tug-crescent)" />
              {/* 오른쪽 아래 약한 반사 */}
              <path d="M226 150 C 222 190 196 220 160 234 C 188 214 206 186 212 150 Z" fill={GACHA.reflect} opacity="0.22" />
              {/* 스-윽 지나가는 반사광 */}
              <g transform="rotate(24 128 128)">
                <rect className={styles.glint} x="-150" y="-60" width="70" height="380" fill="url(#tug-glint)" />
                <rect className={[styles.glint, styles.glint2].join(' ')} x="-112" y="-60" width="18" height="380" fill="url(#tug-glint)" />
              </g>
            </g>
            <circle cx="128" cy="128" r="124" fill="none" stroke="url(#tug-rim)" strokeWidth="2" opacity="0.9" />
            <circle cx="128" cy="128" r="120.5" fill="none" stroke={GACHA.rimInner} strokeOpacity="0.35" strokeWidth="3" />
          </svg>
          <div className={styles.count} style={{ background: GACHA.countBg, opacity: idle ? 1 : 0 }}>
            <span className={styles.countNum}>
              <b style={{ color: GACHA.accent }}>{count}</b>
              <span className={styles.countSep} style={{ color: GACHA.muted }}>
                /
              </span>
              <span>{BALL_COUNT}</span>
            </span>
            <span className={styles.countLabel} style={{ color: GACHA.muted }}>
              {d.combine.tierUp.countLabel}
            </span>
          </div>
        </div>

        <svg className={styles.base} viewBox="0 0 200 56" aria-hidden="true">
          <defs>
            <linearGradient id="tug-base" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={GACHA.baseSide[0]} />
              <stop offset="0.5" stopColor={GACHA.baseSide[1]} />
              <stop offset="1" stopColor={GACHA.baseSide[2]} />
            </linearGradient>
            <linearGradient id="tug-knob" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={GACHA.knob[0]} />
              <stop offset="1" stopColor={GACHA.knob[1]} />
            </linearGradient>
          </defs>
          <path d="M40 4 Q42 0 48 0 H152 Q158 0 160 4 L200 56 H0 Z" fill="url(#tug-base)" />
          <path d="M114 0 H136 L172 56 H144 Z" fill={GACHA.baseShine} opacity="0.07" />
          <path d="M40 4 Q42 0 48 0 H152 Q158 0 160 4 L162.9 8 H37.1 Z" fill={GACHA.baseLip} opacity="0.7" />
          <circle cx="100" cy="31" r="13" fill="url(#tug-knob)" />
          <rect x="88" y="28.5" width="24" height="5" rx="2.5" fill={GACHA.knobBar} opacity="0.85" />
        </svg>

        <div className={styles.cabinet} style={{ background: GACHA.cabinetBg, boxShadow: GACHA.cabinetShadow }}>
          <span className={styles.sheen} style={{ background: GACHA.cabinetSheen }} aria-hidden="true" />
          <span className={styles.foot} style={{ background: GACHA.cabinetFoot }} aria-hidden="true" />
          <div className={styles.logoWrap} style={{ filter: GACHA.logoShadow }} role="img" aria-label="JAM!">
            <div className={styles.logoMetal} style={{ background: GACHA.logoMetal }} />
          </div>
          <div className={styles.ctaWrap}>
            <Button
              variant="primary"
              disabled={disabled || !idle}
              aria-describedby={disabled ? describedBy : undefined}
              onClick={onInsert}
              style={{ paddingInline: 28, whiteSpace: 'nowrap', boxShadow: disabled || !idle ? undefined : GACHA.ctaShadow }}
            >
              {d.combine.tierUp.insert}
            </Button>
          </div>
        </div>
      </div>

      {idle && notice}

      {badge && (
        <div
          role="region"
          aria-label={d.combine.tierUp.resultRegion}
          className={[styles.reveal, fade].join(' ')}
          style={{ '--cy': `${cy}px`, '--rc': rarityVar } as CSSProperties}
        >
          {/* 결과가 나왔다는 알림은 한 번만 읽힌다 */}
          <p role="status" className="sr-only">
            {d.combine.tierUp.resultAnnounce}
          </p>
          <div className={styles.hold}>
            <div
              className={styles.rays}
              style={
                {
                  '--to': 0.35,
                  animation: reducedNow
                    ? `${styles.fadeTo} ${T(900)}ms ${T(120)}ms both`
                    : `${styles.fadeTo} ${T(900)}ms ${T(120)}ms both, ${styles.spin} 18s linear infinite`,
                } as CSSProperties
              }
            />
            <div className={styles.halo} style={{ '--to': 1, animation: `${styles.fadeTo} ${T(500)}ms both` } as CSSProperties} />
            <div className={styles.flash} style={{ animation: `${styles.flashOut} ${T(620)}ms cubic-bezier(.2,.7,.3,1) both` }} />
            <div className={styles.badge} style={{ animation: `${styles.badgeIn} ${T(560)}ms ${T(80)}ms cubic-bezier(.2,.8,.3,1) both` }}>
              <SafeImage src={badge.imageUrl} alt="" width={180} height={180} priority />
            </div>
          </div>
          <TierUpGachaResultMeta badge={badge} T={T} again={{ visible: showAgain, onClick: handleAgain }} />
        </div>
      )}

      {measureBadge && (
        <div ref={measureEl} className={styles.measure} aria-hidden="true">
          <TierUpGachaResultMeta badge={measureBadge} T={T} again={{ visible: false, onClick: () => {} }} />
        </div>
      )}

      <div ref={fxEl} className={styles.fx} aria-hidden="true" />
    </div>
  )
}

/**
 * 결과 배지 아래 글자 묶음 — 등급 칩, 배지 이름, 배지 설명(티켓 20261127_2225).
 * 설명은 응답의 `description`이고, 없거나 공백뿐이면 설명 줄을 그리지 않는다. 시험이 결과 상태를 만들지 않고 이 갈래를 보도록 따로 내보낸다.
 */
export function TierUpGachaResultMeta({
  badge,
  T,
  again,
}: {
  badge: TierUpGachaBadge
  T: (ms: number) => number
  /** 주면 묶음의 마지막 항목으로 «한 번 더»를 그린다. `visible`이 거짓이면 자리만 잡고 보이지 않는다(높이 실측·늦은 등장) */
  again?: { visible: boolean; onClick: () => void }
}) {
  const description = badge.description?.trim()
  return (
    <div className={styles.meta}>
      {badge.rarity && (
        <div className={styles.metaItem} style={{ animation: `${styles.riseIn} ${T(380)}ms ${T(420)}ms ease-out both` }}>
          <RarityBadge rarity={badge.rarity} size="md" showCommon />
        </div>
      )}
      <p
        className={`${styles.name} ${styles.metaItem} text-snow break-keep wrap-break-word text-balance`}
        style={{ animation: `${styles.riseIn} ${T(380)}ms ${T(510)}ms ease-out both` }}
      >
        {badge.name}
      </p>
      {description && (
        <p
          data-tier-up-description
          className={`${styles.sub} ${styles.metaItem} break-keep wrap-break-word text-balance`}
          style={{ color: GACHA.muted, animation: `${styles.riseIn} ${T(380)}ms ${T(600)}ms ease-out both` }}
        >
          {description}
        </p>
      )}
      {again && (
        <div
          className={styles.metaItem}
          style={{
            visibility: again.visible ? 'visible' : 'hidden',
            // 결과 영역(.reveal)이 터치를 받지 않으므로 버튼 자리만 다시 받는다(티켓 20261128_1258)
            pointerEvents: again.visible ? 'auto' : 'none',
            animation: again.visible ? `${styles.riseIn} ${T(320)}ms ease-out both` : undefined,
          }}
        >
          <Button
            variant="secondary"
            surface="dark"
            size="sm"
            onClick={again.onClick}
            tabIndex={again.visible ? undefined : -1}
            style={{ minHeight: 44, borderColor: GACHA.againBorder }}
          >
            {d.combine.tierUp.again}
          </Button>
        </div>
      )}
    </div>
  )
}
