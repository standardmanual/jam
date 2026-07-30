'use client'

import { useId, useMemo, type CSSProperties } from 'react'
import './wandering-eyes.css'

interface WanderingEyesLoaderProps {
  className?: string
  /** 한 사이클(눈동자 이동 + 깜빡임) 길이 */
  duration?: string
  eyeColor?: string
  pupilColor?: string
}

// 눈동자 이동 키프레임의 중간 정지 지점(%) — 깜빡임 키프레임과 리듬을 맞춘 값
const MOVE_STOPS = [15, 30, 45, 60, 75, 88] as const

/** 중심에서 각도/반경이 랜덤한 오프셋 하나를 뽑는다 (단위: %, 눈 크기 기준) */
function randomOffset(maxPercent: number) {
  const angle = Math.random() * Math.PI * 2
  const radius = maxPercent * (0.55 + Math.random() * 0.45)
  return {
    x: Math.round(Math.cos(angle) * radius * 100) / 100,
    y: Math.round(Math.sin(angle) * radius * 100) / 100,
  }
}

/**
 * Wandering Eyes 로더 — 눈 안에서 눈동자가 돌아다니다가 주기적으로 깜빡이는
 * 대기 표시. 같은 컨셉을 프로젝트에서 직접 구현했다.
 *
 * 이동 경로(시작점 포함)는 마운트될 때마다 새로 랜덤 생성해서 매번 다르게
 * 움직인다 — 로더가 뜰 때마다(= 컴포넌트가 새로 마운트될 때마다) 새 경로.
 * 두 눈은 같은 경로를 공유해 "같은 곳을 보는" 느낌을 유지한다.
 */
export default function WanderingEyesLoader({
  className,
  duration = '8s',
  eyeColor = '#f8fafc',
  pupilColor = '#0f172a',
}: WanderingEyesLoaderProps) {
  const rawId = useId()
  const animName = `wandering-eyes-move-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`

  // 마운트 시 한 번만 계산 — 리렌더 중에는 같은 경로를 유지한다.
  const keyframesCss = useMemo(() => {
    // 시작점(=끝점, 매끄러운 루프용)과 중간 정지점들을 전부 랜덤으로.
    const start = randomOffset(34)
    const stops = MOVE_STOPS.map((stop) => ({ stop, ...randomOffset(38) }))
    const body = stops
      .map(({ stop, x, y }) => `  ${stop}% { transform: translate(${x}%, ${y}%); }`)
      .join('\n')
    return [
      `@keyframes ${animName} {`,
      `  0%, 100% { transform: translate(${start.x}%, ${start.y}%); }`,
      body,
      `}`,
    ].join('\n')
  }, [animName])

  return (
    <div
      className={['wandering-eyes', 'h-12', 'w-[108px]', className].filter(Boolean).join(' ')}
      style={
        {
          '--duration': duration,
          '--eye-color': eyeColor,
          '--pupil-color': pupilColor,
        } as CSSProperties
      }
      role="status"
      aria-label="로딩 중"
    >
      <style>{keyframesCss}</style>
      <span className="wandering-eyes-eye">
        <span className="wandering-eyes-pupil" style={{ animationName: animName }} />
      </span>
      <span className="wandering-eyes-eye">
        <span className="wandering-eyes-pupil" style={{ animationName: animName }} />
      </span>
    </div>
  )
}
