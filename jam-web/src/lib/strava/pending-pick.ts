/**
 * 동기화 보류 고르기 — 화면이 쓰는 순수 로직 (티켓 20261017_1425 2회)
 *
 * 고르기 오버레이(`PendingItemsPickOverlay`)와 프로바이더(`PendingItemsPickerProvider`)가 쓰는 규칙을 React에서 떼어 둔다.
 * 선택 토글, 확정 요청과 오류 해석, 고르기 요청 한 건의 수명(`createPickerSession`), 자동 재진입 시점 판단이 여기 있다.
 *
 * 클라이언트·서버 경계: 이 파일은 순수 모듈이다. `@/lib/i18n`(문구 사전)과 `pending-items-contract`(타입 전용)만 가져오고
 * `@/lib/supabase/server`·`next/headers`·`lib/strava/pending-items.ts`를 가져오지 않는다.
 */
import { d } from '@/lib/i18n'
import type { PendingItemsPayload } from '@/lib/strava/pending-items-contract'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'

/** 고르기가 끝난 결과. 'resolved' = 보류가 닫혔다(받음·받지 않음·이미 닫힘), 'dismissed' = 보류가 남았다 */
export type PickResult = 'resolved' | 'dismissed'

/** 선택을 토글한다. 이미 골랐으면 해제하고, 안 골랐는데 정한 개수를 다 채웠으면 그대로 둔다. */
export function toggleChoice(selected: readonly string[], id: string, chooseCount: number): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id)
  return selected.length >= chooseCount ? [...selected] : [...selected, id]
}

/** 고른 수가 정확히 맞는가. 덜 고르면 받을 수 있는 것을 잃고, 더 고르면 칸이 모자라 둘 다 확정할 수 없다. */
export function isExactChoice(selectedCount: number, chooseCount: number): boolean {
  return selectedCount === chooseCount
}

/** 목록 읽기. 실패·타임아웃은 null이다(던지지 않는다). */
export async function fetchPendingPayload(fetcher: typeof fetch, timeoutMs: number): Promise<PendingItemsPayload | null> {
  try {
    const res = await fetcher('/api/strava/pending-items', { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    return (await res.json()) as PendingItemsPayload
  } catch {
    return null
  }
}

export type SubmitOutcome =
  /** 고른 수가 맞지 않아 요청을 보내지 않았다 */
  | { kind: 'skipped' }
  | { kind: 'success'; granted: number }
  /** 409 `no_pending` — 이미 고르기를 마쳤다(중복 클릭·다른 기기) */
  | { kind: 'already_resolved' }
  /** 403 `user_suspended` — 이용 정지 중이라 받지 못했다. 토스트(info)로 알리고 고르기는 닫지 않는다. */
  | { kind: 'suspended' }
  /** 인라인 문구로 보여 줄 오류. `reload`가 true면 목록을 다시 읽고 선택을 비운다. */
  | { kind: 'error'; message: string; reload: boolean }

/** 고르기 POST 오류 응답을 화면 처리로 바꾼다. 문구는 `d.syncPending.*`에서만 가져온다. */
export function interpretSubmitError(status: number, code: string | undefined): SubmitOutcome {
  if (status === 403 && code === USER_SUSPENDED_CODE) return { kind: 'suspended' }
  if (status === 409 && code === 'no_pending') return { kind: 'already_resolved' }
  if (status === 400 && code === 'wrong_count') return { kind: 'error', message: d.syncPending.wrongCount, reload: false }
  if (status === 400 && code === 'invalid_selection') return { kind: 'error', message: d.syncPending.invalidSelection, reload: true }
  if (status === 404) return { kind: 'error', message: d.syncPending.inventoryNotFound, reload: false }
  return { kind: 'error', message: d.syncPending.resolveFailed, reload: false }
}

/**
 * 고르기를 확정한다. 고른 수가 `chooseCount`와 정확히 같을 때만 `POST /api/strava/pending-items`를 보낸다.
 * 던지지 않는다 — 네트워크 오류도 인라인 오류(`resolveFailed`)로 돌려준다.
 */
export async function submitChoice(fetcher: typeof fetch, chosenIds: readonly string[], chooseCount: number): Promise<SubmitOutcome> {
  if (!isExactChoice(chosenIds.length, chooseCount)) return { kind: 'skipped' }
  try {
    const res = await fetcher('/api/strava/pending-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chosenIds }),
    })
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { granted?: number } | null
      return { kind: 'success', granted: typeof body?.granted === 'number' ? body.granted : chosenIds.length }
    }
    const body = (await res.json().catch(() => null)) as { code?: string } | null
    return interpretSubmitError(res.status, body?.code)
  } catch {
    return { kind: 'error', message: d.syncPending.resolveFailed, reload: false }
  }
}

/**
 * 고르기 요청 한 건의 수명. 이미 열려 있을 때 다시 요청하면 같은 결과를 기다리게 하고(두 번 열지 않는다),
 * 끝나면 기다리던 쪽 모두에게 같은 결과를 알린다.
 */
export function createPickerSession() {
  let promise: Promise<PickResult> | null = null
  let resolver: ((result: PickResult) => void) | null = null
  // 이 세션에서 고르기를 한 번이라도 열었는가(수동·자동 경로 구분 없음). 새로고침 전까지 되돌리지 않는다.
  let engaged = false
  return {
    /** 새로 열어야 하면 `{ promise, started: true }`, 이미 열려 있으면 `started: false`와 같은 promise를 돌려준다 */
    request(): { promise: Promise<PickResult>; started: boolean } {
      if (promise) return { promise, started: false }
      engaged = true
      promise = new Promise<PickResult>((resolve) => {
        resolver = resolve
      })
      return { promise, started: true }
    },
    /** 결과를 알리고 비운다. 열려 있지 않으면 아무것도 하지 않는다. */
    finish(result: PickResult): void {
      const resolve = resolver
      promise = null
      resolver = null
      resolve?.(result)
    },
    isOpen(): boolean {
      return promise !== null
    },
    /** 이 세션에서 고르기를 한 번이라도 열었으면 true. 자동 재진입은 이 값이 true면 하지 않는다. */
    hasEngaged(): boolean {
      return engaged
    },
  }
}

/**
 * 앱을 열 때의 자동 재진입을 지금 해도 되는가.
 *  - 보류가 없으면 하지 않는다.
 *  - 이 세션에서 고르기를 한 번이라도 열었으면(`engaged`, `createPickerSession().hasEngaged()`) 하지 않는다. 수동(동기화 버튼·응답)·
 *    자동 경로 구분이 없어서, «나중에»로 닫은 뒤 `router.refresh()`로 보류 개수가 0에서 N으로 바뀌어도 새로고침 전까지 다시 열리지 않는다.
 *  - 주소에 `reveal=1`이 있으면(최초 Strava 연동 연출) 그 연출이 끝날 때까지 미룬다. 연출 오버레이가 탭바를 숨겼다가 다시
 *    보이면 끝난 것이고, 연출이 끝내 뜨지 않으면 시간 제한 뒤에 푼다.
 */
export function shouldAutoOpen(input: {
  pendingCount: number
  engaged: boolean
  revealPending: boolean
  sawRevealOverlay: boolean
  tabBarHidden: boolean
  revealTimedOut: boolean
}): boolean {
  if (input.engaged) return false
  if (input.pendingCount <= 0) return false
  if (!input.revealPending) return true
  return (input.sawRevealOverlay && !input.tabBarHidden) || input.revealTimedOut
}
