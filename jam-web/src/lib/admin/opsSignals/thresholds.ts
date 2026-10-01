/**
 * 운영 신호 기준값 한 곳 (티켓 20261001_1155, 상위 티켓 20260930_1502 사용자 결정 Q5).
 *
 * 신호 규칙이 쓰는 숫자·시각의 **기본값**은 전부 여기에만 둔다. 값 표는 운영툴 PRD §5.1 「신호 기준값」이고, 둘이 같은지는
 * `__tests__/thresholds.test.ts`가 문서 파일을 읽어 대조한다 — 기본값을 바꾸면 PRD 표도 같은 커밋에서 바꾼다.
 * S7(운영 설정)의 「신호 기준값」 구역(티켓 20260930_1459 조각 C)에서 바꾼 값만 DB(`ops_rules`, `rule_group = 'signal'`)에 남고 기본값 행은 DB에 없다.
 * `overrides.ts`가 바꾼 값을 읽어 이 기본값 위에 얹는다(`resolveThresholdValues`) — 바꾼 값이 기본값보다 우선한다.
 *
 * `notMeasured`가 참이면 「실측 아님」이다 — 혜린이 추정한 초기값(승인 마감 임박·예약 누락·루틴 실패·행동 횟수 급증의 값)으로,
 * 운영하며 실제 값을 보고 조정한다. 행동 횟수 급증의 지표별 최소 건수는 카즈하가 2026-10-01에 실제 주간 값(9월 완료 3주)을
 * 읽고 정했지만 확신도가 보통이라 10월 말에 다시 보고, 그때까지 실측 아님으로 둔다.
 *
 * 날짜·시각은 모두 KST다. 요일 번호는 0=일 … 6=토다.
 */
import type { OpsSignalKey } from '@/lib/admin/opsSignals/catalog'

export type OpsSignalThresholdValue = number | string | null

export interface OpsSignalThresholdEntry<T extends OpsSignalThresholdValue = OpsSignalThresholdValue> {
  value: T
  /** 값의 단위(PRD 표의 「단위」 열과 같다). */
  unit: string
  /** 참이면 「실측 아님」(추정한 초기값). */
  notMeasured: boolean
  /** 이 값을 쓰는 신호. */
  signal: OpsSignalKey
  /** 값이 무엇인지 한 줄로(PRD 표의 「뜻」 열과 같다). */
  label: string
  /** 값의 출처(PRD 표의 「출처」 열과 같다). */
  source: string
}

function entry<T extends OpsSignalThresholdValue>(
  value: T,
  unit: string,
  notMeasured: boolean,
  signal: OpsSignalKey,
  label: string,
  source: string
): OpsSignalThresholdEntry<T> {
  return { value, unit, notMeasured, signal, label, source }
}

const HYERIN_ESTIMATE = '혜린 추정(1502 Q5)'
const KAZUHA_MIN_COUNT = '카즈하 2026-10-01(1155 A10)'

export const OPS_SIGNAL_THRESHOLDS = {
  // 실행 실패
  failureLookbackDays: entry<number>(
    7,
    '일',
    false,
    'execution_failed',
    '「실패」로 바뀐 항목을 되돌아보는 기간',
    '1155 A2'
  ),
  // 예약 누락
  missedScheduleMinutes: entry<number>(
    30,
    '분',
    true,
    'missed_schedule',
    '공개 시각이 지난 뒤 누락으로 보기까지의 시간',
    HYERIN_ESTIMATE
  ),
  // 루틴 실패
  weeklyRoutineWeekday: entry<number>(2, '요일 번호', true, 'routine_failed', '주간 루틴 마감 요일(2=화요일)', HYERIN_ESTIMATE),
  weeklyRoutineDeadlineHour: entry<number>(
    12,
    '시',
    true,
    'routine_failed',
    '주간 루틴 마감 시각(마감 요일의 몇 시)',
    HYERIN_ESTIMATE
  ),
  monthlyRoutineDay: entry<number>(1, '일', true, 'routine_failed', '월간 루틴 마감 날짜(매월 며칠)', HYERIN_ESTIMATE),
  monthlyRoutineDeadlineHour: entry<number>(
    12,
    '시',
    true,
    'routine_failed',
    '월간 루틴 마감 시각(마감 날짜의 몇 시)',
    HYERIN_ESTIMATE
  ),
  routineCheckStartsAt: entry<string | null>(
    null,
    '시각(ISO 8601)',
    false,
    'routine_failed',
    '루틴 점검을 시작하는 시각(없으면 「아직 확인하지 않아요」, 1504가 첫 주간 루틴을 돌릴 때 채운다)',
    '1155 A1'
  ),
  // 승인 마감 임박
  approvalDeadlineHours: entry<number>(
    48,
    '시간',
    true,
    'approval_deadline',
    '공개 시각 몇 시간 전까지 승인되지 않으면 띄우는지',
    HYERIN_ESTIMATE
  ),
  // 비어 있는 컨텐츠(날짜 구성 신호 4종이 함께 쓰는 검사 범위 값도 여기 둔다)
  nextWeekCheckFromWeekday: entry<number>(
    5,
    '요일 번호',
    false,
    'empty_content',
    '다음 주 편성을 검사하기 시작하는 요일(5=금요일, 그 전에도 다음 주 기획이 도착했으면 검사한다)',
    '0912, 1502 가정 15'
  ),
  minLiveCards: entry<number>(3, '장', false, 'empty_content', '하루에 게재할 카드의 최소 장수(이보다 적으면 뜬다)', '07 4.2, 1502 가정 5'),
  maxLiveCards: entry<number>(5, '장', false, 'empty_content', '하루에 게재할 카드의 최대 장수(이보다 많으면 뜬다)', '07 4.2, 1502 가정 5'),
  // 새 컨텐츠가 없는 날
  minNewContentCards: entry<number>(
    1,
    '장',
    false,
    'no_new_content',
    '그날 새로 게재를 시작하는 홈피드 카드의 최소 장수(0장이면 뜬다)',
    'PRD §5.1, 1502 가정 4'
  ),
  // 겹침
  overlapImageShapeCards: entry<number>(
    3,
    '장',
    false,
    'overlap',
    '이미지가 있는 모양의 카드가 이만큼 이상이면 뜬다',
    '07 4.2, 1502 가정 5'
  ),
  minNonImageShapeCards: entry<number>(
    1,
    '장',
    false,
    'overlap',
    '이미지가 없는 모양의 카드 최소 장수(0장이면 뜬다)',
    '07 4.2, 1502 가정 5'
  ),
  maxNewUserCards: entry<number>(3, '장', false, 'overlap', '신규 유저에게 보이는 카드가 이보다 많으면 뜬다', '07 4.2, 1502 가정 5'),
  // 단조로운 흐름
  monotonyWindowDays: entry<number>(7, '일', false, 'monotony', '대표 카드를 되돌아보는 기간', 'PRD §5.1, 1502 가정 4'),
  monotonySamePatternCount: entry<number>(
    3,
    '번',
    false,
    'monotony',
    '기간 안에서 같은 패턴·트라이브가 이만큼 이상 나오면 뜬다',
    'PRD §5.1, 1502 가정 4'
  ),
  monotonySameShapeDays: entry<number>(
    3,
    '일',
    false,
    'monotony',
    '같은 모양이 이만큼 이상 연속 대표이면 뜬다',
    'PRD §5.1, 1502 가정 4'
  ),
  // 행동 횟수 급증
  actionSpikeMultiplier: entry<number>(
    2,
    '배',
    true,
    'action_spike',
    '최근 7일 합계가 직전 주평균의 몇 배 이상이면 뜨는지',
    HYERIN_ESTIMATE
  ),
  actionSpikeBaselineWeeks: entry<number>(4, '주', true, 'action_spike', '주평균을 내는 직전 기간', HYERIN_ESTIMATE),
  actionSpikeMinMixAttempt: entry<number>(5, '건', true, 'action_spike', '믹스 시도의 최소 건수(최근 7일 합계)', KAZUHA_MIN_COUNT),
  actionSpikeMinUserDrop: entry<number>(15, '건', true, 'action_spike', '유저 드랍의 최소 건수(최근 7일 합계)', KAZUHA_MIN_COUNT),
  actionSpikeMinPickup: entry<number>(23, '건', true, 'action_spike', '픽업의 최소 건수(최근 7일 합계)', KAZUHA_MIN_COUNT),
  actionSpikeMinMissionComplete: entry<number>(
    2,
    '건',
    true,
    'action_spike',
    '미션 완료의 최소 건수(최근 7일 합계)',
    KAZUHA_MIN_COUNT
  ),
  actionSpikeMinCollectionComplete: entry<number>(
    2,
    '건',
    true,
    'action_spike',
    '컬렉션 완성의 최소 건수(최근 7일 합계)',
    KAZUHA_MIN_COUNT
  ),
} as const

export type OpsSignalThresholdKey = keyof typeof OPS_SIGNAL_THRESHOLDS

/** 기준값만 모은 객체. 규칙 함수가 받는 모양이다. */
export type OpsSignalThresholdValues = {
  [K in OpsSignalThresholdKey]: (typeof OPS_SIGNAL_THRESHOLDS)[K]['value']
}

/** 기준값 키 목록(PRD 표와 같은 순서). */
export const OPS_SIGNAL_THRESHOLD_KEYS = Object.keys(OPS_SIGNAL_THRESHOLDS) as OpsSignalThresholdKey[]

/** 코드에 적힌 기준값. 시험이 값을 바꿔 보고 싶으면 `compute`에 덮어쓸 값만 넘긴다. */
export const DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES: OpsSignalThresholdValues = Object.fromEntries(
  OPS_SIGNAL_THRESHOLD_KEYS.map((key) => [key, OPS_SIGNAL_THRESHOLDS[key].value])
) as OpsSignalThresholdValues

/** 기준값에 덮어쓸 값을 얹는다. */
export function resolveThresholdValues(overrides?: Partial<OpsSignalThresholdValues>): OpsSignalThresholdValues {
  return { ...DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES, ...overrides }
}

/** PRD 값 표의 「값」 칸에 적는 글자. 값이 없으면 「없음」이다. */
export function formatThresholdValue(value: OpsSignalThresholdValue): string {
  return value === null ? '없음' : String(value)
}
