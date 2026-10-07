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

/** 카드 모양(`shape`)·노출 대상(`exposure_tags`)이 필수인 항목 종류(티켓 20261001_1152). */
export const OPS_HOME_FEED_CARD_KIND: OpsItemKind = 'home_feed_card'

/** 뺀 항목(`excluded_items`)의 `stage` 허용값. 뺀 단계: 세계관 검수 · 밸런스 점검(티켓 20261001_1152). */
export const OPS_EXCLUDED_ITEM_STAGES = ['world_review', 'balance_check'] as const

export type OpsExcludedItemStage = (typeof OPS_EXCLUDED_ITEM_STAGES)[number]

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

/** 승인 이후 상태 5개(승인됨·준비중·예약됨·게재중·종료). 밸런스 R4의 기준 시각과 조합 뽑기(티켓 20261007_2221)가 같은 목록을 쓴다. */
export const OPS_POST_APPROVAL_ITEM_STATUSES: readonly OpsItemStatus[] = ['approved', 'preparing', 'scheduled', 'live', 'ended']

/** 새로 저장하는 항목의 상태. */
export const OPS_ITEM_INITIAL_STATUS: OpsItemStatus = 'arrived'

/**
 * 결정 기록의 `action` 값. 제출은 1816, 승인·반려·수정·되돌림은 1818이 쓰고, 예약 등록(`execute`)과 실패로 닫기(`fail`)는
 * 예약 등록 실행 API(티켓 20261002_1123), 공개 전 취소(`cancel`)는 취소 API(티켓 20261002_1256)가 쓴다(뒤 티켓이 값을 더한다).
 * `end`(운영툴 밖에서 지워진 게재 중 자원)와 `external_change`(밖에서 바뀐 시각·비활성)는 상태 맞추기(티켓 20261002_1813)가 쓴다.
 */
export const OPS_DECISION_ACTION_SUBMIT = 'submit'
export const OPS_DECISION_ACTION_APPROVE = 'approve'
export const OPS_DECISION_ACTION_REJECT = 'reject'
export const OPS_DECISION_ACTION_EDIT = 'edit'
export const OPS_DECISION_ACTION_REVERT = 'revert'
/** 색 채우기(티켓 20261007_1145). 검토중 카드의 「색 대기」를 풀며 `image_spec.bg`·`end`와 `colors.*`를 채운다. 되돌리기 대상이 아니다. */
export const OPS_DECISION_ACTION_FILL_COLOR = 'fill_color'
export const OPS_DECISION_ACTION_EXECUTE = 'execute'
export const OPS_DECISION_ACTION_FAIL = 'fail'
export const OPS_DECISION_ACTION_CANCEL = 'cancel'
export const OPS_DECISION_ACTION_END = 'end'
export const OPS_DECISION_ACTION_EXTERNAL_CHANGE = 'external_change'

/** 상태 맞추기(티켓 20261002_1813)가 남기는 결정 기록의 행위자. 관리자 ID가 아니라 시스템이다. */
export const OPS_RECONCILE_ACTOR = 'system:reconcile'

/** 상태 맞추기가 결정 기록 사유와 슬랙 글에 싣는 고정 문장(티켓 20261002_1813 가정 3). */
export const OPS_RECONCILE_REASONS = {
  /** 예약됨 → 취소, 게재중 → 종료: 자원이 운영툴 밖에서 지워졌다. */
  deletedOutside: '운영툴 밖에서 지워졌어요',
  /** 준비중으로 10분이 지났다. */
  preparingStalled: '예약 등록이 끝나지 않았어요',
  /** 멈춘 준비중을 닫으면서 만든 자원을 지우지 못했다. 앞 문장 뒤에 덧붙인다. */
  resourceRemains: '만든 자원이 남아 있어요',
  /** 자원이 공개되지 못하고 끝났는데 `observe`가 문장을 주지 않았다. */
  notPublished: '자원이 공개되지 못했어요',
} as const

/** 반려·수정 사유 길이 상한(글자). */
export const MAX_DECISION_REASON_CHARS = 500
