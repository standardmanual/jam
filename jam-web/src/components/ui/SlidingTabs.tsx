'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'

/**
 * SlidingTabs — 활성 pill이 탭 사이를 미끄러지는 세그먼트 컨트롤.
 *
 * transitions.dev `16-tabs-sliding.md`의 CSS를 그대로 사용합니다
 * (`src/components/transitions.css`의 "Tabs sliding" 블록).
 * JS는 활성 탭의 offsetLeft / offsetWidth를 pill에 써 주기만 하고,
 * 트윈은 전적으로 CSS가 소유합니다.
 *
 * 첫 페인트/리사이즈에서는 `transition: none` → reflow 강제 → 복원 순서로
 * 값을 써서, pill이 translateX(0)에서 날아 들어오는 흔한 버그를 막습니다.
 *
 * 앱 전역에서 재사용하는 공유 컴포넌트입니다. 새로운 탭 UI를 만들 때는
 * 직접 버튼 행을 구현하지 말고 이 컴포넌트를 사용하세요.
 */

export interface SlidingTabItem<K extends string = string> {
  key: K
  /** 버튼 안에 렌더링할 내용. 문자열뿐 아니라 숫자+라벨 2줄 구성도 가능합니다. */
  label: ReactNode
  /** label이 ReactNode일 때 스크린리더용 접근 이름 */
  ariaLabel?: string
}

export interface SlidingTabsProps<K extends string = string> {
  items: readonly SlidingTabItem<K>[]
  /** 현재 활성 탭 key */
  value: K
  onChange: (key: K) => void
  /**
   * 팔레트.
   * - `onSurface`(기본): 코발트 배경 위 — pill은 아이스, 활성 라벨은 코발트
   * - `onCard`: 아이스 카드 위 — pill은 코발트, 활성 라벨은 아이스
   */
  variant?: 'onSurface' | 'onCard'
  /** 탭 높이. md=30px(원본) / lg=44px(터치영역) / xl=콘텐츠 높이(2줄 라벨) */
  size?: 'md' | 'lg' | 'xl'
  /** 모서리. pill=48px(원본) / card=--radius-cards */
  shape?: 'pill' | 'card'
  /** true면 컨테이너 전체 폭을 균등 분할합니다. */
  block?: boolean
  /** 바 배경 대신 1px inset border만 사용 (앱 elevation 규칙) */
  outlined?: boolean
  className?: string
  tabClassName?: string
  'aria-label'?: string
}

const PALETTE: Record<'onSurface' | 'onCard', CSSProperties> = {
  // 코발트(--color-main) 배경 위 — 활성 pill은 아이스
  onSurface: {
    '--tabs-bar-bg': 'color-mix(in srgb, var(--color-sub) 12%, transparent)',
    '--tabs-bar-border': 'var(--color-border)',
    '--tabs-pill-bg': 'var(--color-sub)',
    '--tabs-text-muted': 'color-mix(in srgb, var(--color-sub) 60%, transparent)',
    '--tabs-text-active': 'var(--color-main)',
  } as CSSProperties,
  // 아이스(--color-sub) 카드 위 — 활성 pill은 코발트
  onCard: {
    '--tabs-bar-bg': 'color-mix(in srgb, var(--color-main) 8%, transparent)',
    '--tabs-bar-border': 'var(--color-border-inverse)',
    '--tabs-pill-bg': 'var(--color-main)',
    '--tabs-text-muted': 'color-mix(in srgb, var(--color-main) 60%, transparent)',
    '--tabs-text-active': 'var(--color-sub)',
  } as CSSProperties,
}

export default function SlidingTabs<K extends string = string>({
  items,
  value,
  onChange,
  variant = 'onSurface',
  size = 'lg',
  shape = 'pill',
  block = true,
  outlined = true,
  className,
  tabClassName,
  'aria-label': ariaLabel,
}: SlidingTabsProps<K>) {
  const barRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const tabRefs = useRef(new Map<K, HTMLButtonElement>())
  // 첫 페인트에서는 애니메이션 없이 스냅시켜야 합니다.
  const hasPositionedRef = useRef(false)

  // 16-tabs-sliding.md의 moveTo()를 React ref 기반으로 옮긴 것.
  // 활성 탭이 없으면(value가 items에 없는 경우) 배치하지 않고 false를 돌려준다 —
  // 프로필 기본뷰처럼 "아무 탭도 선택되지 않은" 상태에서는 pill을 숨겨야 한다.
  const moveTo = useCallback((key: K, animate: boolean): boolean => {
    const pill = pillRef.current
    const tab = tabRefs.current.get(key)
    if (!pill || !tab) return false

    if (!animate) {
      const prev = pill.style.transition
      pill.style.transition = 'none'
      pill.style.transform = `translateX(${tab.offsetLeft}px)`
      pill.style.width = `${tab.offsetWidth}px`
      void pill.offsetWidth
      pill.style.transition = prev
    } else {
      pill.style.transform = `translateX(${tab.offsetLeft}px)`
      pill.style.width = `${tab.offsetWidth}px`
    }
    return true
  }, [])

  // 활성 탭 변경 — 첫 배치만 무애니메이션, 이후에는 트윈.
  useLayoutEffect(() => {
    const positioned = moveTo(value, hasPositionedRef.current)
    if (positioned) hasPositionedRef.current = true
  }, [value, moveTo])

  // 리사이즈 / 폰트 로드 / 컨테이너 폭 변화 — 항상 무애니메이션으로 재배치.
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return

    const reposition = () => moveTo(value, false)

    const observer = new ResizeObserver(reposition)
    observer.observe(bar)
    window.addEventListener('resize', reposition)

    // 웹폰트 로드 후 탭 폭이 바뀌는 케이스
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready.then(reposition).catch(() => {})

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', reposition)
    }
  }, [value, moveTo])

  return (
    <div
      ref={barRef}
      className={[
        't-tabs',
        block ? 'jam-tabs-block' : '',
        outlined ? 'jam-tabs-outlined' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-size={size}
      data-shape={shape}
      style={PALETTE[variant]}
      role="tablist"
      aria-label={ariaLabel}
    >
      <span className="t-tabs-pill" aria-hidden="true" ref={pillRef} />
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={value === item.key}
          aria-label={item.ariaLabel}
          onClick={() => onChange(item.key)}
          ref={(el) => {
            if (el) tabRefs.current.set(item.key, el)
            else tabRefs.current.delete(item.key)
          }}
          className={[
            't-tab',
            'text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] whitespace-nowrap',
            tabClassName ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
