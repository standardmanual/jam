/**
 * 잠긴 아이템 배지 채우기·열기 흐름의 결정 — 응답을 화면 동작으로 옮기는 순수 로직 (티켓 20261018_0054 2회)
 *
 * `LockedItemDetail`이 부르고, 화면 반영(상태 바꾸기·토스트·이동)만 직접 한다. 어떤 응답에 어떤 안내와 후속 동작을 낼지는 여기서 정한다.
 * 캡슐 흐름(`capsule/capsule-flow.ts`)과 같은 짜임이다.
 *  - 이용 정지(403): 일반 실패가 아니라 info 안내다. 채우기는 `d.suspension.lockedItemFillBlocked`, 열기는 `d.suspension.lockedItemOpenBlocked`.
 *    버튼을 미리 막지 않고 서버 응답으로 판단한다(`strava/sync-flow`의 선례).
 *  - 거절: 서버가 코드에 맞춰 완성한 문구(`error`)를 그대로 보여 준다(UX 라이팅 §4.0). 화면의 값이 낡았을 수 있어 다시 읽는다(`refresh`).
 *    `not_locked`는 이미 열린 개체라 다시 읽으면 서버 페이지가 배지 상세로 보낸다. `item_not_found`는 인벤토리로 돌려보낸다(`inventory`).
 *  - 그 밖의 실패: 알려진 고정 문구(`d.lockedItem.fill.failed`·`open.failed`).
 *
 * 클라이언트·서버 경계: 순수 모듈이다. 요청 함수는 인자로 받는다(기본값은 클라이언트 래퍼).
 */
import {
  fillLockedItemRequest,
  openLockedItemRequest,
  type LockedItemCall,
} from '@/lib/inventory/lockedItemFill-client'
import type { LockedItemFillPayload, LockedItemOpenPayload } from '@/lib/inventory/lockedItemFill-contract'
import { d } from '@/lib/i18n'

export interface LockedItemNotice {
  message: string
  type: 'error' | 'info'
}

/** 안내 뒤의 후속 동작 — 없음 / 서버 값을 다시 읽기 / 인벤토리로 이동 */
export type LockedItemEffect = 'none' | 'refresh' | 'inventory'

export type LockedFillOutcome =
  /** 채웠다 — 응답이 새 값이다 */
  | { kind: 'filled'; payload: LockedItemFillPayload }
  | { kind: 'notice'; notice: LockedItemNotice; effect: LockedItemEffect }

export type LockedOpenOutcome =
  /** 열었다 — 응답이 열린 뒤의 개체 정보다. `item`이 null이면 열기는 확정이고 정보 조회만 실패한 경우다 */
  | { kind: 'opened'; payload: LockedItemOpenPayload }
  | { kind: 'notice'; notice: LockedItemNotice; effect: LockedItemEffect }

/** 거절 코드가 낳는 후속 동작 */
function effectOfRejection(code: string): LockedItemEffect {
  return code === 'item_not_found' ? 'inventory' : 'refresh'
}

export async function runLockedFill(
  itemId: string,
  amount: number,
  request: (itemId: string, amount: number) => Promise<LockedItemCall<LockedItemFillPayload>> = fillLockedItemRequest
): Promise<LockedFillOutcome> {
  const result = await request(itemId, amount)
  switch (result.kind) {
    case 'ok':
      return { kind: 'filled', payload: result.data }
    case 'suspended':
      return { kind: 'notice', notice: { message: d.suspension.lockedItemFillBlocked, type: 'info' }, effect: 'none' }
    case 'rejected':
      return { kind: 'notice', notice: { message: result.body.error, type: 'error' }, effect: effectOfRejection(result.body.code) }
    case 'failed':
      return { kind: 'notice', notice: { message: d.lockedItem.fill.failed, type: 'error' }, effect: 'none' }
  }
}

export async function runLockedOpen(
  itemId: string,
  request: (itemId: string) => Promise<LockedItemCall<LockedItemOpenPayload>> = openLockedItemRequest
): Promise<LockedOpenOutcome> {
  const result = await request(itemId)
  switch (result.kind) {
    case 'ok':
      return { kind: 'opened', payload: result.data }
    case 'suspended':
      return { kind: 'notice', notice: { message: d.suspension.lockedItemOpenBlocked, type: 'info' }, effect: 'none' }
    case 'rejected':
      return { kind: 'notice', notice: { message: result.body.error, type: 'error' }, effect: effectOfRejection(result.body.code) }
    case 'failed':
      return { kind: 'notice', notice: { message: d.lockedItem.open.failed, type: 'error' }, effect: 'none' }
  }
}
