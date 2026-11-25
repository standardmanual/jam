/**
 * 앱 내부 히스토리 깊이 추적기와 안전한 뒤로가기 헬퍼 (티켓 20261125_1136).
 *
 * `window.history.length > 1`은 외부 사이트(카카오톡·구글·슬랙 등)에서 유입된 탭에서도 참이 되므로
 * "뒤로 가면 앱 내부 화면인가"를 판정할 수 없다. 반대로 `backHref`를 무조건 `router.push`로 밀면
 * 직전 화면의 탭·필터·검색·스크롤이 초기화되고 히스토리 핑퐁이 생긴다.
 *
 * 이 모듈은 `history.state`에 비파괴 키(`__jamNavIdx`)를 기록해 현재 탭 세션에서 앱 내부 이동이
 * 몇 단계 쌓였는지 정확히 추적한다.
 * - 직접 링크·새 탭(Ctrl/Cmd+클릭 포함)·외부 유입: 깊이 0 (`canGoBackInApp() === false`) → 폴백 경로로 이동
 * - 앱 내부 이동(`Link`·`router.push`): 깊이 +1 (`canGoBackInApp() === true`) → `router.back()`으로 직전 상태 복원
 * - `replaceState`(탭·필터 URL 동기화): 깊이 유지
 * - 새로고침(F5): 브라우저가 보존한 `history.state.__jamNavIdx`를 그대로 읽어 직전 목록 복귀 유지
 */

export const JAM_NAV_IDX_KEY = '__jamNavIdx'

const NEXT_INTERNAL_STATE_KEYS = new Set(['__NA', '_N', '__PRIVATE_NEXTJS_INTERNALS_TREE'])

let currentIdx = 0
let installed = false

/** `history.state`에서 앱 내 히스토리 깊이(`__jamNavIdx`)를 읽는다. 유효한 0 이상 정수만 인정한다. */
export function readNavIdx(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as Record<string, unknown>)[JAM_NAV_IDX_KEY]
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * `history.state`에서 Next.js 내부 키(`__NA`, `_N`, `__PRIVATE_NEXTJS_INTERNALS_TREE`)를 제외한
 * 커스텀 키만 복사한다.
 *
 * Next.js 16 App Router의 `history.replaceState`·`pushState` 패치는 `data.__NA || data._N`이
 * 없을 때만 내부 상태를 복사하고 `useSearchParams()`를 동기화한다. 이 함수로 커스텀 키(`__jamNavIdx` 등)만
 * 넘겨주면 서버 재요청 없이 URL 쿼리와 `useSearchParams()`가 동기화되면서 앱 히스토리 깊이도 유지된다.
 */
export function extractCustomHistoryState(state: unknown): Record<string, unknown> | null {
  if (!state || typeof state !== 'object') return null
  const custom: Record<string, unknown> = {}
  let count = 0
  for (const [key, value] of Object.entries(state as Record<string, unknown>)) {
    if (NEXT_INTERNAL_STATE_KEYS.has(key)) continue
    custom[key] = value
    count += 1
  }
  return count > 0 ? custom : null
}

/** 기존 `data`의 키(Next.js 내부 키 포함)를 유지한 채 `__jamNavIdx`만 덧붙인 새 상태 객체를 돌려준다. */
export function attachNavIdx(data: unknown, idx: number): Record<string, unknown> {
  if (data && typeof data === 'object') {
    return { ...(data as Record<string, unknown>), [JAM_NAV_IDX_KEY]: idx }
  }
  return { [JAM_NAV_IDX_KEY]: idx }
}

/**
 * 최초 로드 시점의 앱 내 히스토리 깊이를 계산한다.
 * - 이미 `__jamNavIdx`가 찍혀 있으면(F5 새로고침·bfcache 복원) 그 값을 그대로 쓴다.
 * - 그렇지 않으면 같은 오리진 referrer + `history.length > 1`(새 탭 Cmd+클릭은 length 1)일 때만 1, 나머지는 0.
 */
export function computeInitialNavIdx(
  state: unknown,
  referrer: string,
  origin: string,
  historyLength: number,
): number {
  const existing = readNavIdx(state)
  if (existing !== null) return existing

  if (historyLength > 1 && referrer) {
    try {
      if (new URL(referrer).origin === origin) return 1
    } catch {
      // 잘못된 referrer 문자열은 외부 유입으로 취급한다
    }
  }
  return 0
}

/** 현재 탭 세션에 되돌아갈 앱 내부 히스토리가 있는지 판정한다. */
export function canGoBackInApp(): boolean {
  if (typeof window === 'undefined') return false
  const fromState = readNavIdx(window.history.state)
  if (fromState !== null) return fromState > 0
  return currentIdx > 0
}

export interface BackRouterLike {
  back: () => void
  push: (href: string) => void
}

/**
 * 앱 내부 히스토리가 있으면 `router.back()`으로 직전 화면(탭·필터·스크롤)을 복원하고,
 * 직접 진입(새 탭·공유 링크·외부 유입)이면 `fallbackHref`로 이동한다.
 */
export function goBackOrPush(router: BackRouterLike, fallbackHref: string): void {
  if (canGoBackInApp()) {
    router.back()
    return
  }
  router.push(fallbackHref)
}

/**
 * 루트 레이아웃(`AppHistoryTracker`)에서 한 번만 설치한다.
 * `pushState`·`replaceState`·`popstate`를 감시해 모든 히스토리 항목에 `__jamNavIdx`를 유지한다.
 */
export function installAppHistoryTracker(): () => void {
  if (typeof window === 'undefined' || installed) return () => {}
  installed = true

  const originalPushState = window.history.pushState.bind(window.history)
  const originalReplaceState = window.history.replaceState.bind(window.history)

  currentIdx = computeInitialNavIdx(
    window.history.state,
    document.referrer,
    window.location.origin,
    window.history.length,
  )

  try {
    // URL 인자를 생략해 주소나 Next.js 라우터 상태를 흔들지 않고 현재 항목에만 깊이를 기록한다
    originalReplaceState(attachNavIdx(window.history.state, currentIdx), '')
  } catch {
    // 일부 제한된 환경에서 replaceState가 실패해도 메모리 currentIdx로 동작을 이어간다
  }

  window.history.pushState = function patchedPushState(data, unused, url) {
    currentIdx += 1
    return originalPushState(attachNavIdx(data, currentIdx), unused, url)
  }

  window.history.replaceState = function patchedReplaceState(data, unused, url) {
    return originalReplaceState(attachNavIdx(data, currentIdx), unused, url)
  }

  const onPopState = (event: PopStateEvent) => {
    const idx = readNavIdx(event.state ?? window.history.state)
    currentIdx = idx ?? 0
  }

  window.addEventListener('popstate', onPopState)

  return () => {
    window.history.pushState = originalPushState
    window.history.replaceState = originalReplaceState
    window.removeEventListener('popstate', onPopState)
    installed = false
  }
}

/** 테스트 전용 내부 상태 초기화 */
export function __resetAppHistoryForTest(idx = 0): void {
  currentIdx = idx
  installed = false
}
