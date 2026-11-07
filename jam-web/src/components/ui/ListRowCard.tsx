'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * 행 면 톤 (티켓 20261015_2133).
 * - `default`: 흰 면(`--surface`) + 1px `--border`. 크림 페이지 바탕 위에 직접 놓는 행.
 * - `tint`: `--background-secondary`, 테두리 없음. **이미 카드(흰 면 + 테두리) 안에 들어간 행** 전용 — 카드 속 카드의 이중 테두리를 막는다.
 *   크림 바탕 위 단독 행으로 쓰지 않는다(경계가 보이지 않는다).
 * - `inverse`: 어두운 반전 면(`--background-inverse`) + 같은 색 1px 테두리 + `--snow` 글자(티켓 20261105_1953). 경고성 안내 행 전용.
 *   홈 막힘 카드의 `Card tone="inverse"`와 같은 값이고 박스 크기는 `default`와 같다.
 *   `title`/`subtitle` 경로는 글자색이 `--foreground`·`--muted`로 고정이라 반전 면에서 읽히지 않는다 —
 *   알림 행처럼 `children`으로 글자색을 직접 정하는 행에서만 쓴다.
 */
export type ListRowCardTone = 'default' | 'tint' | 'inverse'

export interface ListRowCardProps {
  /** 행 면 톤. 기본 `default`(흰 면 + 1px 테두리) */
  tone?: ListRowCardTone
  /** 40×40 아이콘 영역 — 크기·형태·배경 모두 호출부에서 결정 */
  icon?: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  /** 전체 텍스트 영역 커스텀 렌더링 — 제공 시 title/subtitle 무시 */
  children?: ReactNode
  href?: string
  onClick?: () => void
  /**
   * href와 함께 쓸 때만 의미가 있는 클릭 핸들러 (20260902_0915).
   * Link 이동 직전에 부수효과(예: 잔존 location.hash 제거)를 실행하고 싶을 때 사용한다.
   */
  onNavigate?: () => void
  /**
   * `onClick`(button 변형)에서만 의미가 있다 — 마우스 클릭뿐 아니라 키보드 Tab/Enter도
   * 함께 차단한다(네이티브 `disabled` 속성). `className`으로 `opacity-40 pointer-events-none`만
   * 주면 시각적으로만 억제되고 키보드 포커스는 여전히 닿는다(티켓 20260908_0055 #3).
   */
  disabled?: boolean
  className?: string
  /**
   * 아코디언 헤더로 쓸 때의 펼침 상태 (20260827_018 프로필 피드 활동 묶음 카드).
   * `onClick`으로 button이 렌더될 때만 의미가 있다.
   */
  'aria-expanded'?: boolean
  /** 위 `aria-expanded`가 제어하는 패널의 id */
  'aria-controls'?: string
}

// 컬러 개편 2회차(티켓 20261107_2203): 카드 면(--card-bg #F7F7F7)을 흰 바탕 위에 외곽선·그림자 없이 둔다.
// 경계는 카드 사이 간격(gap)이 맡는다.
const BASE = 'flex items-center gap-4 rounded-2xl p-4'
const TONE_CLASS: Record<ListRowCardTone, string> = {
  default: 'bg-card-bg',
  tint: 'bg-background-secondary',
  inverse: 'bg-background-inverse border border-background-inverse text-snow',
}

/**
 * 행 제목 한 줄 — 미션 목록 카드 제목(16px·700·`--foreground`)과 같은 모양이다(티켓 20261104_2242).
 * `children`으로 텍스트 영역을 직접 그리는 행(제목 옆에 칩·숫자를 붙이는 레시피 행 등)은 제목을 따로 스타일하지 말고 이 컴포넌트를 쓴다.
 * 그래야 같은 종류의 행이 어디에서 그려져도 제목 굵기가 같다. `title` prop 경로(보통 굵기)는 바꾸지 않았다 — 그 경로를 쓰는 다른 화면은 이번 범위 밖이다.
 */
export function ListRowCardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={['text-base font-bold text-foreground truncate', className].filter(Boolean).join(' ')}>{children}</span>
}

export default function ListRowCard({
  tone = 'default',
  icon,
  title,
  subtitle,
  trailing,
  children,
  href,
  onClick,
  onNavigate,
  disabled = false,
  className = '',
  'aria-expanded': ariaExpanded,
  'aria-controls': ariaControls,
}: ListRowCardProps) {
  const interactive = !!(href || onClick)
  // 눌림은 공용 `.jam-press`(0.98배·80ms, 동작 줄이기 설정에서는 없음)다. 비활성(disabled) 버튼에는 붙이지 않는다 — 링크(`href`)는 `disabled`와 무관하다.
  const pressable = interactive && (href ? true : !disabled)
  const cls = [
    BASE,
    TONE_CLASS[tone] ?? TONE_CLASS.default,
    interactive && 'cursor-pointer',
    pressable && 'jam-press',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="flex-1 min-w-0">
        {children ?? (
          <>
            {title !== undefined && (
              <p className="text-base text-foreground truncate">
                {title}
              </p>
            )}
            {subtitle !== undefined &&
              (typeof subtitle === 'string' ? (
                <p className="text-base text-[var(--muted)] truncate mt-0.5">
                  {subtitle}
                </p>
              ) : (
                <div className="mt-0.5">{subtitle}</div>
              ))}
          </>
        )}
      </div>
      {trailing !== undefined && (
        <div className="shrink-0 flex items-center">{trailing}</div>
      )}
    </>
  )

  if (href) return (
    <Link href={href} onClick={onNavigate} className={`w-full text-left ${cls}`}>
      {content}
    </Link>
  )
  if (onClick) return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      className={`w-full text-left disabled:cursor-default ${cls}`}
    >
      {content}
    </button>
  )
  return <div className={cls}>{content}</div>
}
