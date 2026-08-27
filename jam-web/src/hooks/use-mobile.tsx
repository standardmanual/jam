import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * 20260827_020: 기존 구현은 초기값 `undefined`로 시작해 이펙트에서 실제 폭을 setState 했다.
 * 이펙트 안의 동기 setState는 캐스케이딩 렌더를 만들고(react-hooks/set-state-in-effect),
 * 모바일에서 첫 렌더에 항상 `false`(=데스크톱)를 반환해 한 프레임 잘못된 레이아웃이 그려졌다.
 * `useSyncExternalStore`로 바꿔 첫 클라이언트 렌더부터 실제 폭을 읽는다
 * (`components/ui/BottomSheet.tsx`의 마운트 게이트와 같은 방식).
 */
function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

/** SSR·하이드레이션 렌더에서는 뷰포트를 알 수 없으므로 기존 동작(첫 렌더 false)을 유지한다. */
function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
