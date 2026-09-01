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
  /** true면 반투명 바 배경 대신 --color-surface-elevated 채움을 사용 (20260816_012 — 보더 제거) */
  outlined?: boolean
  className?: string
  tabClassName?: string
  'aria-label'?: string
}

const PALETTE: Record<'onSurface' | 'onCard', CSSProperties> = {
  // DS v2: 다크(검정) 배경 위 — 활성 pill은 흰색, 활성 라벨은 검정
  onSurface: {
    '--tabs-bar-bg': 'rgba(255, 255, 255, 0.1)',
    '--tabs-pill-bg': 'var(--color-surface-inverse)',
    '--tabs-text-muted': 'rgba(255, 255, 255, 0.45)',
    '--tabs-text-active': 'var(--color-text-inverse)',
    '--tabs-text-hover': 'rgba(255, 255, 255, 0.85)',
  } as CSSProperties,
  // DS v2: 라이트 카드(surface-inverse = white) 위 — 활성 pill은 primary(레드), 활성 라벨은 white
  onCard: {
    '--tabs-bar-bg': 'rgba(0, 0, 0, 0.06)',
    '--tabs-pill-bg': 'var(--color-primary)',
    '--tabs-text-muted': 'rgba(0, 0, 0, 0.4)',
    '--tabs-text-active': 'var(--color-text-on-primary)',
    '--tabs-text-hover': 'rgba(0, 0, 0, 0.7)',
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
  // 리사이즈 이펙트가 매 렌더의 최신 value를 읽기 위한 ref.
  // (아래 useEffect의 deps에서 value를 빼기 위함 — 이유는 해당 useEffect 주석 참고)
  const valueRef = useRef(value)
  useLayoutEffect(() => {
    valueRef.current = value
  })

  // 실시간 pill 겹침 추적 — 20260901, 프로필 통계탭 요청 대응.
  // pill이 300ms 슬라이드하며 경유하는 탭 버튼에 data-pill-over="true"를 붙인다.
  // 이 저장소 어디에도 이 속성을 읽는 CSS가 기본으로 없으므로(각 사용처가 필요할 때만
  // 자기 스코프에 `[data-pill-over]` 규칙을 추가) 다른 SlidingTabs 사용처는 영향이 없다.
  // 프로필 통계탭은 이 속성으로 "지금 이 순간 pill(레드) 배경 위에 있는 숫자만 흰색,
  // 나머지는 항상 포인트 강조색(레드)"을 구현한다(20260831_2201 레드온레드 버그의
  // 근본 원인인 "pill 경유 중에도 항상 레드"를 실측 겹침 여부로 대체 — 재발 없이 해결).
  const overlapRafRef = useRef<number | null>(null)
  const overlapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopOverlapTracking = useCallback(() => {
    if (overlapRafRef.current !== null) {
      cancelAnimationFrame(overlapRafRef.current)
      overlapRafRef.current = null
    }
    if (overlapTimeoutRef.current !== null) {
      clearTimeout(overlapTimeoutRef.current)
      overlapTimeoutRef.current = null
    }
    tabRefs.current.forEach((el) => el.removeAttribute('data-pill-over'))
  }, [])

  // 이름 있는 함수 표현식(tick)으로 자기 자신을 참조 — `const trackOverlap = useCallback(() =>
  // ... requestAnimationFrame(trackOverlap))`처럼 바깥 바인딩을 재귀 호출에 쓰면 "선언 전 접근"
  // 린트 오류가 난다.
  const trackOverlap = useCallback(function tick() {
    const pill = pillRef.current
    if (!pill) return
    const pillRect = pill.getBoundingClientRect()
    tabRefs.current.forEach((el) => {
      const tabRect = el.getBoundingClientRect()
      const overlapWidth = Math.min(pillRect.right, tabRect.right) - Math.max(pillRect.left, tabRect.left)
      // 경계에서 1px 스치는 정도는 제외하고, 실질적으로 겹칠 때만(30%+) 표시한다.
      if (overlapWidth > tabRect.width * 0.3) {
        el.setAttribute('data-pill-over', 'true')
      } else {
        el.removeAttribute('data-pill-over')
      }
    })
    overlapRafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => stopOverlapTracking, [stopOverlapTracking])

  // 16-tabs-sliding.md의 moveTo()를 React ref 기반으로 옮긴 것.
  // 활성 탭이 없으면(value가 items에 없는 경우) 배치하지 않고 false를 돌려준다 —
  // 프로필 기본뷰처럼 "아무 탭도 선택되지 않은" 상태에서는 pill을 숨겨야 한다.
  const moveTo = useCallback((key: K, animate: boolean): boolean => {
    const pill = pillRef.current
    const tab = tabRefs.current.get(key)
    if (!pill || !tab) return false

    if (!animate) {
      const prevPillTransition = pill.style.transition
      pill.style.transition = 'none'
      pill.style.transform = `translateX(${tab.offsetLeft}px)`
      pill.style.width = `${tab.offsetWidth}px`

      // pill과 같은 프레임에 .t-tab의 텍스트 color transition도 억제한다.
      // 억제하지 않으면 pill 배경은 이미 목표 탭에 도착했는데 그 위 텍스트 색만
      // muted→active로 300ms에 걸쳐 서서히 페이드돼, 그 사이 대비가 낮은 프레임이
      // 생긴다(딥링크로 첫 포지셔닝될 때만 발생 — 사용자가 직접 탭을 눌러 전환할 때는
      // animate=true 분기라 기존 페이드가 그대로 유지된다).
      const tabEls = Array.from(tabRefs.current.values())
      const prevTabTransitions = tabEls.map((el) => el.style.transition)
      tabEls.forEach((el) => {
        el.style.transition = 'none'
      })

      void pill.offsetWidth
      pill.style.transition = prevPillTransition
      tabEls.forEach((el, i) => {
        el.style.transition = prevTabTransitions[i]
      })
    } else {
      pill.style.transform = `translateX(${tab.offsetLeft}px)`
      pill.style.width = `${tab.offsetWidth}px`

      // reduced-motion이면 transition이 통째로 꺼져 있어(transitions.css) pill이 즉시
      // 순간이동한다 — 경유하는 중간 프레임 자체가 없으므로 추적을 시작할 필요가 없다.
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!reduceMotion) {
        if (overlapRafRef.current === null) {
          overlapRafRef.current = requestAnimationFrame(trackOverlap)
        }
        if (overlapTimeoutRef.current !== null) clearTimeout(overlapTimeoutRef.current)
        // --tabs-dur(300ms, transitions.css) + 여유 버퍼. 트랜지션이 끝나면 정확한
        // 값(도착한 탭만 aria-selected로 흰색 유지)으로 CSS가 이미 정착해 있으므로
        // 그 시점부턴 data-pill-over를 전부 지워도 안전하다.
        overlapTimeoutRef.current = setTimeout(stopOverlapTracking, 350)
      }
    }
    return true
  }, [trackOverlap, stopOverlapTracking])

  // 활성 탭 변경 — 첫 배치만 무애니메이션, 이후에는 트윈.
  useLayoutEffect(() => {
    const positioned = moveTo(value, hasPositionedRef.current)
    if (positioned) hasPositionedRef.current = true
  }, [value, moveTo])

  // 리사이즈 / 폰트 로드 / 컨테이너 폭 변화 — 항상 무애니메이션으로 재배치.
  //
  // 주의: deps에 `value`를 넣지 않는다. ResizeObserver.observe()는 호출 직후
  // 반드시 한 번 콜백을 발화하는 스펙 동작이 있어서, `value`가 바뀔 때마다
  // 이 이펙트가 재실행되어 observer를 다시 만들면 매 탭 전환 직후 무애니메이션
  // 재배치가 곧바로 따라붙어 방금 트리거된 트윈을 캔슬해버린다(순간이동처럼 보임).
  // 그래서 이 이펙트는 마운트 시 한 번만 구독하고, 최신 value는 ref로 읽는다.
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return

    const reposition = () => moveTo(valueRef.current, false)

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
  }, [moveTo])

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
