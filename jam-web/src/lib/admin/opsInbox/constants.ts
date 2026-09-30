/**
 * 운영툴 받은 기획함(제출 경로) 상수 — 티켓 20260930_1816.
 *
 * `proxy.ts`(모든 요청이 지난다)·`auth.ts`·라우트·검증이 모두 불러오므로 **순수 상수만** 둔다
 * (서버 전용 모듈을 끌어오지 않는다). 토큰 쓰기 예외가 열리는 경로·메서드는 이 두 상수가 유일한
 * 원천이다 — proxy와 라우트가 같은 값을 쓰고, 접두사가 아니라 **정확히 일치**로만 비교한다.
 */

/** 읽기 토큰으로 쓰기가 허용되는 유일한 경로. 뒤에 `/`나 다른 글자가 붙으면 다른 경로다. */
export const OPS_INBOX_PATH = '/api/admin/ops-inbox'

/** 그 경로에서 토큰으로 허용되는 유일한 메서드. */
export const OPS_INBOX_METHOD = 'POST'

/** 제출 본문 상한(바이트). 카드 21~35장 기준 추정값(상위 티켓 가정 9). */
export const MAX_BODY_BYTES = 1_048_576

/** 묶음 하나에 담을 수 있는 항목 수 상한. */
export const MAX_ITEMS = 60

/** 최근 1시간에 받는 묶음 수 상한. 넘으면 429. */
export const MAX_SUBMISSIONS_PER_HOUR = 20

/** 항목 종류 7개(PRD §3). 허용값 밖이면 저장은 하되 형식 오류로 돌려준다. */
export const OPS_ITEM_KINDS = [
  'home_feed_card',
  'mission',
  'drop_schedule',
  'recipe',
  'jam_badge',
  'collection_launch',
  'pattern_proposal',
] as const

export type OpsItemKind = (typeof OPS_ITEM_KINDS)[number]

/** 항목 상태 10개(PRD §7). 새로 도착한 항목은 `arrived`다. */
export const OPS_ITEM_STATUSES = [
  'arrived',
  'reviewing',
  'approved',
  'preparing',
  'scheduled',
  'live',
  'ended',
  'rejected',
  'cancelled',
  'failed',
] as const

export type OpsItemStatus = (typeof OPS_ITEM_STATUSES)[number]

/** 새로 저장하는 항목의 상태. */
export const OPS_ITEM_INITIAL_STATUS: OpsItemStatus = 'arrived'

/** 결정 기록의 `action` 값. 이 티켓은 `submit`만 쓴다(뒤 티켓이 값을 더한다). */
export const OPS_DECISION_ACTION_SUBMIT = 'submit'
