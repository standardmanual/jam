'use client'

/*
 * transitions.dev — 개별 페이지용 JS 오케스트레이션 훅 (dev-pages 소유)
 *
 * 스킬 문서의 바닐라 스니펫을 React(useRef/useEffect)에 맞게 어댑트한 것입니다.
 * 리플로우 강제(`void el.offsetWidth` / `offsetHeight`)는 애니메이션 재생의
 * 필수 조건이므로 제거하지 마세요.
 *
 * 스타일은 `transitions-pages.css`에 있으며 각 컴포넌트에서 import 합니다.
 */

import { useEffect, useRef, useState } from 'react'

/** :root에 정의된 시간 토큰(ms)을 읽는다. 파싱 실패 시 fallback 사용. */
function readMs(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name)
  )
  return Number.isFinite(v) ? v : fallback
}

/**
 * 04 — Text states swap
 *
 * 3단계 시퀀스:
 *   1. `.is-exit` 추가          — 옛 텍스트가 위로 빠지며 블러 + 페이드 아웃
 *   2. --text-swap-dur 후 textContent 교체 + `.is-enter-start`(아래에서 대기, 트랜지션 없음)
 *      → 리플로우 강제
 *   3. `.is-enter-start` 제거   — 새 텍스트가 제자리로 애니메이션
 *
 * JSX에는 **최초 텍스트만** 렌더하고(그래서 SSR/하이드레이션이 안전하다)
 * 이후 교체는 전부 DOM 직접 조작으로 처리한다. React가 매 렌더마다 같은
 * 초기 문자열을 렌더하므로 커밋 단계에서 textContent를 덮어쓰지 않는다.
 */
export function useTextSwap<T extends HTMLElement>(text: string) {
  const ref = useRef<T | null>(null)
  const prevRef = useRef(text)
  const lastNode = useRef<T | null>(null)
  // 최초 렌더 시점의 값만 고정 보관한다(이후 갱신 없음) — JSX에 렌더할 상수.
  const [initialText] = useState(text)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 조건부 렌더로 노드가 새로 붙은 경우 — 그 사이 값이 바뀌었더라도
    // 애니메이션 없이 현재 값으로 동기화한다.
    if (lastNode.current !== el) {
      lastNode.current = el
      prevRef.current = text
      if (el.textContent !== text) el.textContent = text
      return
    }

    if (prevRef.current === text) return
    prevRef.current = text

    const dur = readMs('--text-swap-dur', 200)

    el.classList.add('is-exit')
    const timer = setTimeout(() => {
      el.textContent = text
      el.classList.remove('is-exit')
      el.classList.add('is-enter-start')
      void el.offsetHeight // 리플로우 강제 — 다음 클래스 제거가 트랜지션되도록
      el.classList.remove('is-enter-start')
    }, dur)

    return () => clearTimeout(timer)
  }, [text])

  return { ref, initialText }
}

/**
 * 02 — Number pop-in
 *
 * `.is-animating` 제거 → 자릿수 span 재생성 → 리플로우 강제 → `.is-animating` 재추가.
 * 마지막 두 글자에 data-stagger="1" / "2"를 붙여 1× / 2× --digit-stagger 만큼 늦게 들어온다.
 */
export function useDigitPopIn<T extends HTMLElement>(text: string | null) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const group = ref.current
    if (!group || text === null) return

    group.classList.remove('is-animating')
    group.replaceChildren()
    const chars = text.split('')
    chars.forEach((ch, i) => {
      const span = document.createElement('span')
      span.className = 't-digit'
      span.textContent = ch
      if (i === chars.length - 2) span.dataset.stagger = '1'
      else if (i === chars.length - 1) span.dataset.stagger = '2'
      group.appendChild(span)
    })
    void group.offsetHeight // 리플로우 강제
    group.classList.add('is-animating')
  }, [text])

  return ref
}

/**
 * 07 — Panel reveal 용 마운트 게이트
 *
 * 조건부 렌더로 붙었다 떨어지는 패널은 마운트 프레임에 곧바로
 * data-open="true"가 되면 트랜지션이 재생되지 않는다. 마운트 직후
 * 다음 프레임에서 열림 상태로 뒤집어 진입 애니메이션을 확보한다.
 */
export function useRevealOnMount<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !active) return

    // JSX는 항상 data-open="false"로 렌더하므로 React가 이 속성을 다시 건드리지 않는다.
    el.setAttribute('data-open', 'false')
    void el.offsetWidth // 리플로우 강제 — 닫힘 상태가 실제로 커밋되도록
    const raf = requestAnimationFrame(() => el.setAttribute('data-open', 'true'))
    return () => cancelAnimationFrame(raf)
  }, [active])

  return ref
}

/**
 * 12 — Error state shake
 *
 * `.is-error`(보더 상태)는 React state로 선언적으로 붙이고, `.is-shaking`만
 * 명령형으로 재생한다. 두 클래스를 분리해야 같은 오류가 연속으로 발생해도
 * 오류 상태를 깜빡이지 않고 흔들림만 다시 재생할 수 있다.
 *
 * @param errorKey 오류가 "새로" 발생했음을 나타내는 키. null이면 오류 없음.
 */
export function useErrorShake<T extends HTMLElement>(errorKey: string | null) {
  const ref = useRef<T | null>(null)
  const prevKey = useRef<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (errorKey === null) {
      prevKey.current = null
      return
    }
    if (prevKey.current === errorKey) return
    prevKey.current = errorKey

    // 깨끗한 baseline에서 흔들림을 다시 재생
    el.classList.remove('is-shaking')
    void el.offsetWidth // 리플로우 강제
    el.classList.add('is-shaking')

    const shakeMs = readMs('--shake-dur-a', 80) * 2 + readMs('--shake-dur-b', 60) * 2
    const timer = setTimeout(() => el.classList.remove('is-shaking'), shakeMs + 20)
    return () => clearTimeout(timer)
  }, [errorKey])

  return ref
}

/**
 * 14 — Skeleton loader and reveal
 *
 * 데이터가 도착하면 `.is-revealed`를 붙여 cross-fade를 시작하고,
 * --reveal-dur가 끝나면 `.is-settled`로 콘텐츠를 일반 흐름에 되돌린다.
 */
export function useSkeletonReveal<T extends HTMLElement>(ready: boolean) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !ready) return

    el.classList.add('is-revealed')
    const timer = setTimeout(
      () => el.classList.add('is-settled'),
      readMs('--reveal-dur', 400)
    )
    return () => clearTimeout(timer)
  }, [ready])

  return ref
}
