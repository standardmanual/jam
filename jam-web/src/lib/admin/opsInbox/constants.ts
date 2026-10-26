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

/**
 * 읽기 토큰으로 쓰기가 허용되는 두 번째 경로: 루틴 「시작」 기록(티켓 20261026_2032, 어드민 상황판 PRD §5.3).
 * 제출 경로와 마찬가지로 **정확히 일치**로만 비교한다(접두사·끝 `/`·하위 경로는 다른 경로다). 메서드는 `OPS_INBOX_METHOD` 하나.
 */
export const OPS_ROUTINE_START_PATH = '/api/admin/ops-inbox/routine-start'

/** 토큰 쓰기가 열리는 경로 전체. 이 목록에 **정확히 같은** 경로만 통과한다(토큰 쓰기 판정이 이 목록을 읽는다). 늘리려면 보안 점검이 필요하다. */
export const OPS_INBOX_TOKEN_WRITE_PATHS: readonly string[] = [OPS_INBOX_PATH, OPS_ROUTINE_START_PATH]

/** 시작 기록 본문 상한(바이트). 한 줄짜리 기록이라 제출 본문(1MB)보다 훨씬 작다. */
export const MAX_ROUTINE_START_BODY_BYTES = 16 * 1024

/** 루틴 실행 식별자(`run_key`) 최대 글자 수. 시작 기록과 묶음의 `routine_run.run_key`가 이 값으로 이어진다. */
export const MAX_RUN_KEY_CHARS = 64

/** 시작 기록에 담는 에이전트 이름 개수 상한. */
export const MAX_ROUTINE_AGENTS = 8

/**
 * 시작 후 이 시간 안에 묶음이 이어지지 않으면 루틴이 멈춘 것으로 본다(단위: 시간, PRD §5.3 「기준 시간은 운영 설정 값」).
 * 판정은 `routineStart.ts`의 `isRoutineStalled`가 이 상수 하나를 읽는다.
 */
export const OPS_ROUTINE_STALL_HOURS = 3

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

/**
 * 에이전트 단계 기록(`routine_run.stages[].stage`)의 허용값(티켓 20261026_2021, 어드민 상황판 PRD §5.3).
 * 기획 단계(`plan`)에 뺀 항목의 단계 두 값을 이어 붙여 같은 이름을 쓴다.
 */
export const OPS_ROUTINE_STAGES = ['plan', ...OPS_EXCLUDED_ITEM_STAGES] as const

export type OpsRoutineStage = (typeof OPS_ROUTINE_STAGES)[number]

/** 기획 이유(`rationale[].kind`)의 허용값 다섯 개(어드민 상황판 PRD §5.2). */
export const OPS_RATIONALE_KINDS = ['trend', 'season', 'weather', 'signal', 'pattern'] as const

export type OpsRationaleKind = (typeof OPS_RATIONALE_KINDS)[number]

/** 읽은 트렌드(`trends[].outcome`)의 처리 결과: 기획에 반영 · 보류 · 자동 제외(어드민 상황판 PRD §5.4). */
export const OPS_TREND_OUTCOMES = ['used', 'held', 'excluded'] as const

export type OpsTrendOutcome = (typeof OPS_TREND_OUTCOMES)[number]

/** 기획 제목·기획 이유 길이 상한(글자)과 개수 상한(티켓 20261026_2021). */
export const MAX_TITLE_CHARS = 30
export const MAX_RATIONALE_LABEL_CHARS = 12
export const MAX_RATIONALE_NOTE_CHARS = 120
export const MAX_RATIONALES_PER_ITEM = 3
export const MAX_HIGHLIGHTS_PER_BUNDLE = 5
/** 트렌드 추이(`series`)는 최근 14일 값이다. */
export const MAX_TREND_SERIES_POINTS = 14

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
