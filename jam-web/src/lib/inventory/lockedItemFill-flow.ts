/**
 * 잠긴 아이템 배지 열기 흐름의 결정 — 응답을 화면 동작으로 옮기는 순수 로직 (티켓 20261018_0054 2회, 20261028_1741 1회)
 *
 * `LockedItemDetail`이 부르고, 화면 반영(상태 바꾸기·토스트·이동)만 직접 한다. 어떤 응답에 어떤 안내와 후속 동작을 낼지는 여기서 정한다.
 * 캡슐 흐름(`capsule/capsule-flow.ts`)과 같은 짜임이다. 잼 채우기 호출과 API는 티켓 20261028_1742 1회에서 걷었다.
 *  - 이용 정지(403): 일반 실패가 아니라 info 안내다 (`d.suspension.lockedItemOpenBlocked`).
 *    버튼을 미리 막지 않고 서버 응답으로 판단한다(`strava/sync-flow`의 선례).
 *  - 포인트 모자람(`insufficient_points`, 409): 사용자가 잘못한 일이 아니라서 info 안내다. 응답의 `required`·`balance`가 숫자이면 함께 돌려줘
 *    화면이 모자람 안내로 바로 바꾸게 하고, 서버 값을 다시 읽는다(`refresh`). 두 값 중 하나라도 숫자가 아니면 일반 거절로 처리한다.
 *  - 그 밖의 거절: 서버가 코드에 맞춰 완성한 문구(`error`)를 그대로 보여 준다(UX 라이팅 §4.0). 화면의 값이 낡았을 수 있어 다시 읽는다(`refresh`).
 *    `not_locked`는 이미 열린 개체라 다시 읽으면 서버 페이지가 배지 상세로 보낸다. `item_not_found`는 인벤토리로 돌려보낸다(`inventory`).
 *  - 그 밖의 실패: 알려진 고정 문구(`d.lockedItem.open.failed`).
 *
 * 클라이언트·서버 경계: 순수 모듈이다. 요청 함수는 인자로 받는다(기본값은 클라이언트 래퍼).
 */
import { openLockedItemRequest, type LockedItemCall } from '@/lib/inventory/lockedItemFill-client'
import type { LockedItemOpenPayload } from '@/lib/inventory/lockedItemFill-contract'
import { d } from '@/lib/i18n'

export interface LockedItemNotice {
  message: string
  type: 'error' | 'info'
}

/** 안내 뒤의 후속 동작 — 없음 / 서버 값을 다시 읽기 / 인벤토리로 이동 */
export type LockedItemEffect = 'none' | 'refresh' | 'inventory'

export type LockedOpenOutcome =
  /** 열었다 — 응답이 열린 뒤의 개체 정보다. `item`이 null이면 열기는 확정이고 정보 조회만 실패한 경우다 */
  | { kind: 'opened'; payload: LockedItemOpenPayload }
  | {
      kind: 'notice'
      notice: LockedItemNotice
      effect: LockedItemEffect
      /** `insufficient_points` 거절일 때만 — 서버가 알려 준 필요 포인트와 가진 포인트. 화면이 모자람 안내로 바로 바꾸는 데 쓴다 */
      points?: { required: number; balance: number }
    }

/** 거절 코드가 낳는 후속 동작 */
function effectOfRejection(code: string): LockedItemEffect {
  return code === 'item_not_found' ? 'inventory' : 'refresh'
}

/** 포인트 값으로 읽을 수 있는 숫자인가(0 이상의 유한한 수) */
function isPointValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
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
    case 'rejected': {
      const { body } = result
      if (body.code === 'insufficient_points' && isPointValue(body.required) && isPointValue(body.balance)) {
        return {
          kind: 'notice',
          notice: { message: body.error, type: 'info' },
          effect: 'refresh',
          points: { required: body.required, balance: body.balance },
        }
      }
      return { kind: 'notice', notice: { message: body.error, type: 'error' }, effect: effectOfRejection(body.code) }
    }
    case 'failed':
      return { kind: 'notice', notice: { message: d.lockedItem.open.failed, type: 'error' }, effect: 'none' }
  }
}
