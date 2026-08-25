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
 * 20260826_001 — 화면 **하단**을 점유하는 오버레이(바텀시트 등)가 "자기 점유 높이"를 신고하는 스토어.
 *
 * 토스트는 하단(safe-area+88px)에 뜨는데, 이 위치는 시트 하단 액션 버튼
 * (`footerBottomInset='tabbar'` 기준 safe+92~140px)과 거의 완전히 포개진다. 토스트 사각형은
 * 탭-투-디스미스를 위해 `pointer-events-auto`라서, 겹친 영역을 누르면 토스트만 닫히고 아래
 * 버튼은 눌리지 않는다(실제 발생 중이던 버그).
 *
 * 방어책은 "토스트를 그만큼 위로 올린다"이고, **의존 방향을 오버레이 → 토스트로 둔다.**
 * 시트가 자기 하단 점유 높이를 신고하므로 `Toast.tsx`에는 footer 높이 매직 넘버가 생기지 않고,
 * 값의 진실의 원천이 그 값을 실제로 쓰는 파일 한 곳에 남는다.
 *
 * `useTabBarHidden`과 달리 **여러 오버레이가 겹칠 수 있어 카운터가 아니라 항목 목록**으로 관리하고
 * 그 중 최대값을 노출한다(가장 높이 점유하는 오버레이 기준으로 피해야 안전).
 *
 * 이 값은 `useTabBarHidden`처럼 **구독**한다. 살아 있는 토스트(3초) 위로 시트가 열리는 역방향
 * 케이스에서도 위치가 갱신돼야 하기 때문이다 — 하단 앵커를 유지한 채 위로 밀려 올라가는 것뿐이라
 * 위치가 튀지 않는다.
 */
interface BottomOverlayEntry {
  id: number
  /** `env(safe-area-inset-bottom)` **위로** 이 오버레이가 점유하는 높이(px). */
  reserved: number
}

let bottomOverlayEntries: BottomOverlayEntry[] = []
let bottomOverlaySeq = 0
let bottomOverlayReserved = 0
const bottomOverlayListeners = new Set<() => void>()

/** 동시에 이만큼 많은 하단 오버레이가 열릴 일은 없다 — 넘으면 해제(정리 함수) 누수를 의심한다. */
const BOTTOM_OVERLAY_LEAK_THRESHOLD = 8

function recomputeBottomOverlayReserved() {
  const next = bottomOverlayEntries.reduce((max, entry) => Math.max(max, entry.reserved), 0)
  if (next === bottomOverlayReserved) return
  bottomOverlayReserved = next
  bottomOverlayListeners.forEach((listener) => listener())
}

/**
 * 하단 오버레이가 열리는 시점에 호출. 반환된 함수를 닫히는 시점(정리 함수)에 호출하면 해제된다.
 *
 * @param reservedBottomPx `env(safe-area-inset-bottom)` 위로 이 오버레이가 점유하는 높이(px).
 *   음수·NaN은 0으로 클램프한다. 반환된 해제 함수는 여러 번 호출해도 한 번만 반영된다
 *   (React StrictMode의 이중 effect 등에서 남의 항목까지 지워지지 않도록 id로 지운다).
 */
export function pushBottomOverlay(reservedBottomPx: number): () => void {
  const id = (bottomOverlaySeq += 1)
  const reserved = Number.isFinite(reservedBottomPx) ? Math.max(0, reservedBottomPx) : 0
  bottomOverlayEntries.push({ id, reserved })

  // 누수 방어: 해제되지 않은 항목이 쌓이면 "모든 토스트가 영구히 밀려 올라간" 상태로 조용히 망가진다.
  if (
    process.env.NODE_ENV !== 'production' &&
    bottomOverlayEntries.length > BOTTOM_OVERLAY_LEAK_THRESHOLD
  ) {
    console.warn(
      `[uiOverlay] 하단 오버레이 등록이 ${bottomOverlayEntries.length}건입니다. ` +
        'pushBottomOverlay()가 반환한 해제 함수를 정리 시점에 호출하지 않은 곳이 있는지 확인하세요.'
    )
  }

  recomputeBottomOverlayReserved()

  let released = false
  return () => {
    if (released) return
    released = true
    bottomOverlayEntries = bottomOverlayEntries.filter((entry) => entry.id !== id)
    recomputeBottomOverlayReserved()
  }
}

/** 현재 예약된 하단 점유 높이(px, safe-area 제외). 훅을 쓸 수 없는 곳·테스트용 getter. */
export function getBottomOverlayReserved(): number {
  return bottomOverlayReserved
}

/** 하단 오버레이 점유 높이를 구독한다(px, safe-area 제외). 아무것도 없으면 0. */
export function useBottomOverlayReserved(): number {
  return useSyncExternalStore(
    (onStoreChange) => {
      bottomOverlayListeners.add(onStoreChange)
      return () => bottomOverlayListeners.delete(onStoreChange)
    },
    () => bottomOverlayReserved,
    () => 0
  )
}
