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

/**
 * 20260826_001 — 화면 **하단**을 점유하는 오버레이(현재는 `BottomSheet`)가 떠 있는지.
 *
 * 토스트는 기본적으로 하단(safe-area+88px)에 뜨는데, 이 위치는 시트 footer 버튼
 * (`footerBottomInset='tabbar'` 기준 safe+92~140px)과 거의 완전히 포개진다. 토스트 사각형은
 * 탭-투-디스미스를 위해 `pointer-events-auto`라서, 겹친 영역을 누르면 토스트만 닫히고 아래
 * 버튼은 눌리지 않는다. 그래서 하단 오버레이가 떠 있는 동안 토스트를 상단 앵커로 돌린다.
 *
 * `useTabBarHidden`과 달리 **구독(listener)을 두지 않는다.** 토스트는 뜨는 "순간"의 값만
 * 스냅샷해서 자기 앵커를 정하고 사라질 때까지 유지한다 — 구독해서 살아 있는 토스트의 앵커를
 * 실시간으로 바꾸면, `toast(성공)` 직후 시트를 닫는 흔한 흐름(`PoiCarouselModal.executePickup`)에서
 * 이미 화면에 떠 있는 토스트가 상단→하단으로 순간이동한다.
 */
let bottomOverlayCount = 0

/** 하단 오버레이가 열리는 시점에 호출. 반환된 함수를 닫히는 시점(정리 함수)에 호출한다. */
export function pushBottomOverlay(): () => void {
  bottomOverlayCount += 1
  return () => {
    bottomOverlayCount = Math.max(0, bottomOverlayCount - 1)
  }
}

/** 렌더 중이 아니라 이벤트 핸들러에서 호출하는 명령형 getter (구독 없음). */
export function isBottomOverlayOpen(): boolean {
  return bottomOverlayCount > 0
}
