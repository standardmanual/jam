'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import JamFillPanel from '@/components/jam/JamFillPanel'
import { d } from '@/lib/i18n'
import { cssDurationMs, prefersReducedMotion } from '@/lib/motion'
import { jamToGraphPercent, planFill } from './capsuleFillMath'
import JamGauge, { gaugeCircleDiameter } from './JamGauge'
import LevelUpOverlay, { type OverlayOrigin } from './LevelUpOverlay'

/**
 * 캡슐 채움 모듈 — 게이지·시트·챕터 오름 오버레이를 한 흐름으로 잇는다 (티켓 20261028_1516)
 *
 * 홈피드와 프로필이 같은 모듈을 쓰는 것을 전제로 한 프로토타입이다. 흐름은 다음과 같다.
 *  1. 진입: 그래프 2%(잼 0%) 원에서 시작해 캡슐에 든 잼만큼 차오른다.
 *  2. 게이지 전체를 누르면 바텀시트가 열린다.
 *  3. 시트의 «채우기»를 누르면 시트가 먼저 닫히고, 닫힘이 끝난 뒤 지정한 양만큼 차오른다.
 *  4. 100%에 닿으면 오버레이가 화면을 채우고 «닫기»까지 기다린다. 디졸브로 닫히면 게이지는 2% 원에서 다시 시작해
 *     남은 잼을 채운다(`planFill`이 구간을 나눈다. 한 번에 두 번 넘으면 이 과정이 두 번 돈다).
 * 움직이는 동안(`phase !== 'idle'`)에는 게이지를 눌러도 시트가 열리지 않는다.
 *
 * 서비스와 다른 점: 서비스의 `JamFillPanel`은 «남은 양»까지만 채우게 막는다(`maxFillAmount`). 이 프로토타입은 100%를 넘겨
 * 채우는 흐름을 보여 주려고 `remaining`에 가진 잼을 넘겨 상한을 가진 잼으로 푼다. 서비스에 옮기려면 서버 규칙부터 정해야 한다.
 */

export interface CapsuleState {
  /** 캡슐에 든 잼 */
  filled: number
  /** 가진 잼 */
  balance: number
  /** 챕터 */
  chapter: number
}

interface Props {
  /** 챕터 하나를 올리는 데 필요한 잼 — 캡슐 100% */
  capacity: number
  /** 마운트 때 한 번만 읽는다. 바꾸려면 key로 다시 마운트한다 */
  initial: CapsuleState
  onChange: (next: CapsuleState) => void
  /** 움직이는 중인지 — 바깥 화면이 탭 전환 같은 조작을 막는 데 쓴다 */
  onBusyChange: (busy: boolean) => void
}

type Phase = 'entering' | 'idle' | 'filling'

const GAUGE_HEIGHT_PX = 72
const FILL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** 진입 모션 — 원이 그려진 뒤 잠깐 두었다가 시작한다 */
const ENTRY_DELAY_MS = 260
const ENTRY_MS = 1500
/** 시트 닫힘이 끝난 뒤 채움이 시작되기까지의 숨 고르기 */
const AFTER_SHEET_MS = 140
/** 오버레이가 내려간 뒤 빈 게이지를 잠깐 보여 주는 시간 */
const AFTER_LEVEL_UP_MS = 260

/** 채우는 거리에 비례해 시간을 늘리되 너무 짧거나 길어지지 않게 한다 */
function fillDurationMs(fromJam: number, toJam: number, capacity: number): number {
  const distance = Math.abs(toJam - fromJam) / capacity
  return Math.round(Math.min(1800, Math.max(700, 700 + distance * 1100)))
}

/** 모션 줄이기를 켠 사용자에게는 시간을 0으로 준다 */
function motionMs(ms: number): number {
  return prefersReducedMotion() ? 0 : ms
}

export default function CapsuleFillModule({ capacity, initial, onChange, onBusyChange }: Props) {
  const [capsule, setCapsule] = useState<CapsuleState>(initial)
  const capsuleRef = useRef<CapsuleState>(initial)
  const [gauge, setGauge] = useState({ jam: 0, durationMs: 0 })
  const gaugeJamRef = useRef(0)
  const [pulseKey, setPulseKey] = useState(0)
  const [phase, setPhaseState] = useState<Phase>(initial.filled > 0 ? 'entering' : 'idle')
  const phaseRef = useRef<Phase>(initial.filled > 0 ? 'entering' : 'idle')
  const [sheetOpen, setSheetOpen] = useState(false)
  /** 시트를 열 때마다 올려 입력창이 기본값에서 다시 시작하게 한다 */
  const [sheetKey, setSheetKey] = useState(0)
  /** 챕터 오름 오버레이 — 열려 있는 동안만 값이 있다. 번호는 «닫기» 전이라 아직 오르지 않은 챕터에 1을 더한 값이다 */
  const [overlay, setOverlay] = useState<{ origin: OverlayOrigin; chapterNo: number } | null>(null)

  const fillRef = useRef<HTMLSpanElement>(null)
  const aliveRef = useRef(true)
  const timersRef = useRef(new Set<number>())
  const levelUpDoneRef = useRef<(() => void) | null>(null)
  const onChangeRef = useRef(onChange)
  const onBusyChangeRef = useRef(onBusyChange)
  useEffect(() => {
    onChangeRef.current = onChange
    onBusyChangeRef.current = onBusyChange
  })

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
    onBusyChangeRef.current(next !== 'idle')
  }, [])

  const commit = useCallback((patch: Partial<CapsuleState>) => {
    capsuleRef.current = { ...capsuleRef.current, ...patch }
    setCapsule(capsuleRef.current)
    onChangeRef.current(capsuleRef.current)
  }, [])

  const wait = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        timersRef.current.delete(id)
        resolve()
      }, ms)
      timersRef.current.add(id)
    })
  }, [])

  // 마운트 수명 — 떠난 뒤에는 남은 타이머와 이어질 단계를 멈춘다
  useEffect(() => {
    aliveRef.current = true
    const timers = timersRef.current
    return () => {
      aliveRef.current = false
      timers.forEach((id) => window.clearTimeout(id))
      timers.clear()
    }
  }, [])

  // 진입 모션: 2% 원 → 캡슐에 든 잼. 진입 목표는 마운트 때 값으로 고정한다(바꾸려면 key로 다시 마운트)
  const [entryTarget] = useState(initial.filled)
  useEffect(() => {
    if (entryTarget <= 0) return
    const duration = motionMs(ENTRY_MS)
    const start = window.setTimeout(() => {
      gaugeJamRef.current = entryTarget
      setGauge({ jam: entryTarget, durationMs: duration })
    }, ENTRY_DELAY_MS)
    const end = window.setTimeout(() => {
      if (!aliveRef.current) return
      setPulseKey((key) => key + 1)
      setPhase('idle')
    }, ENTRY_DELAY_MS + duration + 40)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(end)
    }
  }, [entryTarget, setPhase])

  /** 게이지를 `toJam`까지 움직이고 도착하면 번개를 튀긴다 */
  async function animateGauge(toJam: number): Promise<void> {
    const duration = motionMs(fillDurationMs(gaugeJamRef.current, toJam, capacity))
    gaugeJamRef.current = toJam
    setGauge({ jam: toJam, durationMs: duration })
    await wait(duration + 40)
    if (aliveRef.current) setPulseKey((key) => key + 1)
  }

  /** 오버레이를 열고 «닫기»와 디졸브가 끝날 때까지 기다린다 */
  function runLevelUp(): Promise<void> {
    const rect = fillRef.current?.getBoundingClientRect()
    if (!rect) return Promise.resolve()
    return new Promise<void>((resolve) => {
      levelUpDoneRef.current = resolve
      setOverlay({
        origin: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          circle: gaugeCircleDiameter(GAUGE_HEIGHT_PX),
        },
        chapterNo: capsuleRef.current.chapter + 1,
      })
    })
  }

  function handleGaugeClick() {
    if (phaseRef.current !== 'idle') return
    setSheetKey((key) => key + 1)
    setSheetOpen(true)
  }

  async function handleConfirmFill(amount: number) {
    if (phaseRef.current !== 'idle') return
    const current = capsuleRef.current
    const spend = Math.min(Math.max(0, Math.floor(amount)), current.balance)
    if (spend <= 0) return
    const plan = planFill({ filled: current.filled, amount: spend, capacity })

    setPhase('filling')
    setSheetOpen(false)
    // 시트가 완전히 닫힌 뒤에 채움이 시작된다 — 닫히는 시트가 움직임을 가리지 않게
    await wait(cssDurationMs('--panel-close-dur', 350) + AFTER_SHEET_MS)
    if (!aliveRef.current) return
    commit({ balance: current.balance - spend, filled: plan.filledAfter })

    for (const segment of plan.segments) {
      await animateGauge(segment.to)
      if (!aliveRef.current) return
      if (!segment.levelUp) continue
      await runLevelUp()
      if (!aliveRef.current) return
      await wait(motionMs(AFTER_LEVEL_UP_MS))
      if (!aliveRef.current) return
    }
    setPhase('idle')
  }

  /** «닫기»를 누른 즉시 — 디졸브가 비워진 게이지를 드러내도록 게이지를 먼저 2% 원으로 돌리고 챕터를 올린다 */
  function handleLevelUpDismiss() {
    gaugeJamRef.current = 0
    setGauge({ jam: 0, durationMs: 0 })
    commit({ chapter: capsuleRef.current.chapter + 1 })
  }

  function handleLevelUpClosed() {
    setOverlay(null)
    levelUpDoneRef.current?.()
    levelUpDoneRef.current = null
  }

  const noJam = capsule.balance <= 0

  return (
    <>
      <JamGauge
        graphPercent={jamToGraphPercent(gauge.jam, capacity)}
        durationMs={gauge.durationMs}
        easing={FILL_EASING}
        height={GAUGE_HEIGHT_PX}
        disabled={phase !== 'idle'}
        onClick={handleGaugeClick}
        ariaLabel={d.capsule.aria.filling}
        pulseKey={pulseKey}
        fillRef={fillRef}
      />

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={d.capsule.title}>
        {noJam ? (
          <p className="m-0 px-6 pb-6 pt-2 break-keep wrap-break-word text-pretty text-sm text-foreground">{d.capsule.sheet.noJam}</p>
        ) : (
          <div className="pb-6">
            <JamFillPanel key={sheetKey} remaining={capsule.balance} balance={capsule.balance} pending={false} onConfirm={handleConfirmFill} />
          </div>
        )}
      </BottomSheet>

      {overlay && (
        <LevelUpOverlay
          origin={overlay.origin}
          chapterNo={overlay.chapterNo}
          onDismiss={handleLevelUpDismiss}
          onClosed={handleLevelUpClosed}
        />
      )}
    </>
  )
}
