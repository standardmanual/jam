'use client'

import { useSyncExternalStore } from 'react'

/**
 * 플로팅 탭바(`TabBar.tsx`)를 물리적으로 숨겨야 하는 전체화면 오버레이(예: 배지 공유
 * 미리보기 바텀시트)가 열려 있는 동안 구독하는 전역 스토어.
 *
 * `TabBar`는 `layout.tsx`(서버 컴포넌트)를 통해 각 페이지와 형제 관계로 렌더링되므로,
 * 페이지 깊숙이 있는 컴포넌트(예: `BadgeShareButton`)가 props/context로 직접 알릴 수 없다.
 * z-index로 위에 덮기만 하면 될 것 같지만, iOS Safari의 동적 툴바 상태에 따라 `dvh` 계산과
 * 실제 시각 뷰포트가 어긋나는 순간이 있어 탭바가 살짝 비쳐 보이는 사례가 있었다 — 그래서
 * "덮기"가 아니라 탭바 자체를 DOM에서 제거(`return null`)하는 방식으로 확실히 처리한다.
 *
 * 여러 오버레이가 동시에 열릴 가능성을 감안해 카운터로 관리한다(하나라도 열려 있으면 숨김).
 */
let openCount = 0
let hidden = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

/** 오버레이가 열리는 시점에 호출. 반환된 함수를 닫히는 시점(정리 함수)에 호출하면 카운트가 내려간다. */
export function pushTabBarHidden(): () => void {
  openCount += 1
  hidden = openCount > 0
  emit()
  return () => {
    openCount = Math.max(0, openCount - 1)
    hidden = openCount > 0
    emit()
  }
}

export function useTabBarHidden(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange)
      return () => listeners.delete(onStoreChange)
    },
    () => hidden,
    () => false
  )
}
