/**
 * 동기화 요청 흐름 — 보류 고르기와 이어 붙이는 순수 로직 (티켓 20261017_1425 2회)
 *
 * `SyncButton`이 쓴다. 규칙
 *  - 응답이 409 + `code: 'sync_pending_items'`이면 동기화가 시작되지 않은 것이다. 고르기를 먼저 보여 주고,
 *    'resolved'면 동기화를 **한 번만** 다시 요청한다. 'dismissed'거나 두 번째도 409면 멈춘다(무한 반복 방지).
 *  - 응답이 403 + `code: 'user_suspended'`이면 이용 정지 중이라 동기화가 막힌 것이다. 일반 실패와 가려 'suspended'로 돌려준다
 *    (호출부가 정지 안내를 'info'로 낸다, 티켓 20261017_1426). 고르기 뒤 다시 요청한 응답이 이 403이어도 같다.
 *  - 응답이 200이고 `pendingItems`가 0보다 크면 이번 동기화에서 새로 보류가 생긴 것이다. 고르기를 결과 연출보다 먼저 보여 주고,
 *    마치든 «나중에»로 닫든 결과로 이어간다.
 *  - `pendingItems`가 없는 이전 응답에서는 기존 동작 그대로다.
 *
 * 클라이언트·서버 경계: 순수 모듈이다. `pending-items-contract`(상수)·`suspended-block`(정지 403 판별)과 `pending-pick`(타입)만 가져온다.
 */
import { SYNC_PENDING_ITEMS_CODE } from '@/lib/strava/pending-items-contract'
import { isSuspendedBlock } from '@/lib/suspension/suspended-block'
import type { PickResult } from '@/lib/strava/pending-pick'

export type SyncFlowResult<T> =
  /** 보류가 남아 동기화하지 못했다(고르기를 닫았거나 다시 요청해도 막혔다) */
  | { kind: 'blocked' }
  /** 이용 정지 중이라 동기화가 막혔다(403 `user_suspended`). 일반 실패가 아니다. */
  | { kind: 'suspended' }
  /** 동기화 응답이 실패했다(409 `sync_pending_items`가 아닌 오류) */
  | { kind: 'failed' }
  /** 동기화가 끝났다. `pickedFirst`는 응답에 새 보류가 있어 고르기를 먼저 보여 줬다는 뜻이다. */
  | { kind: 'ok'; data: T; pickedFirst: boolean }

interface Deps {
  /** `POST /api/strava/sync` */
  fetchSync: () => Promise<Response>
  /** 고르기 오버레이를 열고 결과를 기다린다 */
  openPicker: () => Promise<PickResult>
  /** 고르기가 떠 있는 동안 버튼 스피너를 끈다(false) / 동기화를 다시 시작하면 켠다(true) */
  setLoading: (loading: boolean) => void
}

/** 409 + `code: 'sync_pending_items'`인가. 409의 본문만 읽는다. */
async function isPendingItemsBlock(res: Response): Promise<boolean> {
  if (res.status !== 409) return false
  const body = (await res.json().catch(() => null)) as { code?: string } | null
  return body?.code === SYNC_PENDING_ITEMS_CODE
}

export async function runSyncFlow<T extends { pendingItems?: number }>(deps: Deps): Promise<SyncFlowResult<T>> {
  let res = await deps.fetchSync()

  if (await isPendingItemsBlock(res)) {
    deps.setLoading(false)
    const picked = await deps.openPicker()
    if (picked === 'dismissed') return { kind: 'blocked' }
    deps.setLoading(true)
    res = await deps.fetchSync()
    if (await isPendingItemsBlock(res)) return { kind: 'blocked' }
  }

  if (await isSuspendedBlock(res)) return { kind: 'suspended' }

  if (!res.ok) return { kind: 'failed' }

  const data = (await res.json()) as T
  const pickedFirst = (data.pendingItems ?? 0) > 0
  if (pickedFirst) {
    deps.setLoading(false)
    await deps.openPicker()
  }
  return { kind: 'ok', data, pickedFirst }
}
