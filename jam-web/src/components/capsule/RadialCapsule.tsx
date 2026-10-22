'use client'

import { useEffect, useState } from 'react'

export interface RadialCapsuleProps {
  /** 잼 보유량 / 채움 퍼센트 (0 ~ 100) */
  percent: number
  /** 캡슐 높이 (px) - 96px 고정 */
  height?: number
  /** 풀라운드 버튼 문구 (기본: '채우기') */
  actionText?: string
  /** 풀라운드 버튼 클릭 핸들러 */
  onAction?: () => void
  /** 버튼을 캡슐 아래에 표시할지 여부 (기본: true) */
  showActionButton?: boolean
  /** 캡슐 바디 전체 클릭 핸들러 (옵션) */
  onClick?: () => void
  /** 페이지 진입 시 0%(2% 코어)에서 목표량까지 채워지는 모션 실행 여부 (기본: true) */
  animateOnMount?: boolean
  /** 애니메이션 지속 시간 (ms, 요구사항에 맞춰 2000ms = 2초 고정) */
  durationMs?: number
  /** 모션 재생 리셋을 위한 키 */
  replayKey?: string | number
  /** 비활성화 여부 */
  disabled?: boolean
  /** 추가 클래스 */
  className?: string
  /** 캡슐 위에 표시할 라벨 (선택 사항) */
  label?: string
  /** 서브 라벨 (선택 사항) */
  subLabel?: string
  /** 접근성 라벨 */
  ariaLabel?: string
}

const CAPSULE_BG = '#ECECEE'

/**
 * 방사형 잼 채움 캡슐 (Radial Gradient Jam Capsule)
 *
 * 서비스 정식 사양:
 * 1. 캡슐 높이 96px, 외곽 어두운 배경 없이 자연스러운 서피스 위에 배치
 * 2. 애니메이션 2초(2000ms), 뒤로 갈수록 느려지는 Expo Ease-Out 감속 곡선
 * 3. 캡슐 정중앙에 'CAPSULE' 볼드 텍스트 및 그 위에 'xx%' 큰 텍스트 볼드체 표기
 * 4. 두 가지 방사형 그라데이션 레이어 모두 중심에서 바깥으로 부드럽게 스케일 확장 모션
 * 5. 그라데이션 외곽은 캡슐 배경색(#ECECEE) 속으로 경계선 없이 부드럽게 블렌딩
 * 6. 100%일 때는 테두리와 내부 그림자 없이 캡슐 전체가 선명한 붉은 잼으로 꽉 참
 * 7. 캡슐 아래에 작은 풀라운드('rounded-full') 버튼으로 '채우기' 표기
 */
export default function RadialCapsule({
  percent,
  height = 96,
  actionText = '채우기',
  onAction,
  showActionButton = true,
  onClick,
  animateOnMount = true,
  durationMs = 2000,
  replayKey = 0,
  disabled = false,
  className = '',
  label,
  subLabel,
  ariaLabel = '캡슐',
}: RadialCapsuleProps) {
  const clampedTarget = Math.max(0, Math.min(100, isNaN(percent) ? 0 : Math.round(percent)))

  // 진입 모션 상태: 초기엔 null(0% 시작) -> 140ms 후 replayKey와 일치시키며 모션 트리거
  const [activeReplayKey, setActiveReplayKey] = useState<string | number | null>(() =>
    animateOnMount ? null : replayKey
  )

  useEffect(() => {
    if (!animateOnMount) return

    const timer = setTimeout(() => {
      setActiveReplayKey(replayKey)
    }, 140)

    return () => clearTimeout(timer)
  }, [animateOnMount, replayKey])

  // activeReplayKey가 일치할 때 목표 퍼센트 전개, 마운트 초기/리플레이 초기엔 0 적용
  const isTargetActive = !animateOnMount || activeReplayKey === replayKey
  const currentVal = isTargetActive ? clampedTarget : 0
  const is100 = currentVal >= 100

  // 모션 스케일 비율 (0%일 때 약 0.12의 최소 코어, 100%일 때 1.8로 캡슐 밖까지 완전히 채움)
  const outerScale = currentVal <= 0 ? 0.12 : is100 ? 1.8 : 0.12 + (currentVal / 100) * 1.15
  const coreScale = currentVal <= 0 ? 0.25 : is100 ? 2.0 : 0.25 + (currentVal / 100) * 1.1

  // 2초 감속 트랜지션 스타일: cubic-bezier(0.16, 1, 0.3, 1) [Expo Ease-Out]
  const transitionStyle = isTargetActive
    ? `all ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`
    : 'none'

  return (
    <div className={`relative w-full select-none flex flex-col items-center ${className}`}>
      {/* 선택적 상단 라벨 줄 */}
      {(label || subLabel) && (
        <div className="w-full flex items-center justify-between mb-2 px-2 text-xs font-medium text-muted">
          <span>{label}</span>
          <span>{subLabel}</span>
        </div>
      )}

      {/* 캡슐 본체 (높이 96px 고정) */}
      <button
        type="button"
        role="region"
        aria-label={ariaLabel}
        onClick={onClick}
        className={`jam-press relative w-full rounded-full overflow-hidden block text-center p-0 transition-all cursor-pointer ${
          onClick ? 'active:scale-[0.99]' : ''
        }`}
        style={{
          height: `${height}px`,
          backgroundColor: is100 ? '#FF1A00' : CAPSULE_BG,
          border: is100 ? '1px solid #FF1A00' : '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: is100
            ? '0 6px 24px -2px rgba(255, 30, 0, 0.4), inset 0 0 16px rgba(210, 20, 0, 0.5)'
            : 'inset 0 2px 4px rgba(255, 255, 255, 0.85), inset 0 -2px 4px rgba(0, 0, 0, 0.06), 0 4px 16px -2px rgba(0, 0, 0, 0.08)',
          touchAction: 'manipulation',
          transition: `background-color ${durationMs}ms ease, border-color ${durationMs}ms ease, box-shadow ${durationMs}ms ease`,
        }}
      >
        {/* 그라데이션 레이어 1: 외곽 방사형 잼 오라 (외곽이 캡슐 배경색 속으로 부드럽게 블렌딩) */}
        <span
          className="absolute left-1/2 top-1/2 pointer-events-none rounded-full block"
          style={{
            width: '120%',
            height: '140%',
            transform: `translate(-50%, -50%) scale(${outerScale})`,
            transformOrigin: 'center center',
            background: `radial-gradient(ellipse 65% 55% at 50% 50%, #FF1800 0%, #FF4218 28%, #F76B42 52%, #EAA08C 72%, rgba(236, 236, 238, 0.5) 86%, ${CAPSULE_BG} 100%)`,
            filter: 'blur(8px)',
            opacity: currentVal <= 0 ? 0.85 : 1,
            transition: transitionStyle,
          }}
        />

        {/* 그라데이션 레이어 2: 중심 핫 코어 (0%여도 2% 코어 유지 & 중심에서 확장 모션) */}
        <span
          className="absolute left-1/2 top-1/2 pointer-events-none rounded-full block"
          style={{
            width: '64px',
            height: '46px',
            transform: `translate(-50%, -50%) scale(${coreScale})`,
            transformOrigin: 'center center',
            background: is100
              ? 'radial-gradient(ellipse at center, #FF0A00 0%, #D80000 65%, rgba(216, 0, 0, 0) 90%)'
              : 'radial-gradient(ellipse at center, #FF1A00 0%, #FF3D00 48%, rgba(255, 61, 0, 0) 80%)',
            opacity: 0.95,
            filter: 'blur(4px)',
            transition: transitionStyle,
          }}
        />

        {/* 100% 완전 채움 시 테두리 없이 전체를 꽉 채우는 솔리드 블렌딩 레이어 */}
        <span
          className="absolute inset-0 pointer-events-none rounded-full block"
          style={{
            background: 'linear-gradient(135deg, #FF1A00 0%, #FF3D00 50%, #E62200 100%)',
            opacity: is100 ? 1 : 0,
            transition: `opacity ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          }}
        />

        {/* 캡슐 정중앙 텍스트: 상단 'xx%' (큰 볼드) + 하단 'CAPSULE' (볼드) */}
        <span className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none leading-none">
          <span
            className={`text-2xl sm:text-3xl font-black font-mono tracking-tight transition-colors duration-300 drop-shadow-xs ${
              is100 ? 'text-white' : 'text-neutral-900'
            }`}
            style={{
              textShadow: is100
                ? '0 1px 3px rgba(0, 0, 0, 0.3)'
                : '0 1px 2px rgba(255, 255, 255, 0.6)',
            }}
          >
            {clampedTarget}%
          </span>
          <span
            className={`text-[11px] font-black uppercase tracking-widest mt-1 transition-colors duration-300 ${
              is100 ? 'text-white/90' : 'text-neutral-800'
            }`}
            style={{
              letterSpacing: '0.14em',
              textShadow: is100
                ? '0 1px 2px rgba(0, 0, 0, 0.25)'
                : '0 1px 1px rgba(255, 255, 255, 0.5)',
            }}
          >
            CAPSULE
          </span>
        </span>
      </button>

      {/* 캡슐 아래 작은 풀라운드 버튼으로 '채우기' 표시 */}
      {showActionButton && actionText && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation()
              if (onAction) {
                onAction()
              } else if (onClick) {
                onClick()
              }
            }}
            className="group inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold tracking-tight transition-all duration-200 active:scale-95 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed bg-white border border-border text-foreground hover:border-foreground/30 hover:shadow-sm"
            style={{
              touchAction: 'manipulation',
            }}
            aria-label={actionText}
          >
            <span
              className="inline-block w-2 h-2 rounded-full bg-[#FF2A00]"
              style={{
                boxShadow: '0 0 6px rgba(255, 42, 0, 0.9)',
              }}
            />
            <span>{actionText}</span>
          </button>
        </div>
      )}
    </div>
  )
}
