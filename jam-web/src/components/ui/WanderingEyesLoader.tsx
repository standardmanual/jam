'use client'

import type { CSSProperties } from 'react'
import './wandering-eyes.css'

interface WanderingEyesLoaderProps {
  className?: string
  /** 한 사이클(눈동자 이동 + 깜빡임) 길이 */
  duration?: string
  eyeColor?: string
  pupilColor?: string
}

/**
 * Wandering Eyes 로더 — 눈 안에서 눈동자가 돌아다니다가 주기적으로 깜빡이는
 * 대기 표시. loading-ui.com의 동명 컴포넌트와 같은 컨셉을 프로젝트에서
 * 직접 구현했다(원본 소스를 그대로 가져오지 않음).
 */
export default function WanderingEyesLoader({
  className,
  duration = '8s',
  eyeColor = '#f8fafc',
  pupilColor = '#0f172a',
}: WanderingEyesLoaderProps) {
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
      <span className="wandering-eyes-eye">
        <span className="wandering-eyes-pupil" />
      </span>
      <span className="wandering-eyes-eye">
        <span className="wandering-eyes-pupil" />
      </span>
    </div>
  )
}
