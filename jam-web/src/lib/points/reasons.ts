/**
 * 어드민 포인트 지급/회수 사유 목록 (코드 고정 — 어드민 편집 테이블 아님)
 *
 * 근거(Phase12_04 §1): 지급/회수 사유는 확률·가중치처럼 튜닝하는 값이 아니라
 * "회계 분류 코드"에 가깝다. 자주 바뀌면 과거 원장의 admin_reason_label 집계가
 * 뒤섞여 감사가 어려워진다. 새 사유가 필요하면 코드 배포로 추가한다
 * (마이그레이션 CHECK 제약이 아니라 reason='admin_grant'/'admin_deduct' 안에서
 *  admin_reason_label로 구분하므로, 이 목록만 늘리면 되고 마이그레이션은 불필요).
 *
 * 지급·회수 어느 방향이든 같은 목록에서 고른다(방향은 금액 부호로 결정).
 */
import { d } from '@/lib/i18n'

export type AdminReasonValue =
  | 'cs_compensation'
  | 'error_correction'
  | 'event_promotion'
  | 'abuse_reclaim'
  | 'retroactive_adjustment'
  | 'other'

export interface AdminReasonOption {
  value: AdminReasonValue
  label: string
  /** 보통 쓰이는 방향(참고용 — 방향을 제한하지는 않음) */
  hint: string
}

export const ADMIN_REASONS: AdminReasonOption[] = [
  { value: 'cs_compensation', label: 'CS 보상', hint: '유저 불편·문의 대응 (지급)' },
  { value: 'error_correction', label: '오류 정정', hint: '과소/과다 지급 바로잡기 (지급 또는 회수)' },
  { value: 'event_promotion', label: '이벤트·프로모션 지급', hint: '지급' },
  { value: 'abuse_reclaim', label: '어뷰징 적발 회수', hint: '회수' },
  { value: 'retroactive_adjustment', label: '과거 데이터 소급 반영', hint: '마이그레이션 등 (지급 또는 회수)' },
  { value: 'other', label: '기타 (자유 입력)', hint: '지급 또는 회수 — 사유를 직접 입력' },
]

const ADMIN_REASON_VALUES = new Set<string>(ADMIN_REASONS.map((r) => r.value))

/** admin_reason_label 값이 허용 목록에 있는지 검증 (API 레벨 방어) */
export function isValidAdminReason(value: unknown): value is AdminReasonValue {
  return typeof value === 'string' && ADMIN_REASON_VALUES.has(value)
}

/** 사유 코드 → 사람이 읽는 라벨 (원장/대시보드 표시용) */
export function adminReasonLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return ADMIN_REASONS.find((r) => r.value === value)?.label ?? value
}

/**
 * 사유 코드 → **유저 노출용** 라벨 (20260824_021 2차 — PRD Notification §3 ⑧).
 *
 * `ADMIN_REASONS`의 라벨은 어드민 원장 전용이다. 「이벤트·프로모션 **지급**」·
 * 「어뷰징 적발 **회수**」에는 UX 가이드 §1-3이 유저 노출 화면에서 금지한 용어가
 * 그대로 들어 있어, 소식 #44 본문을 "들어왔어요/빠져나갔어요"로 고친 취지가
 * 괄호 안에서 무너진다. 그래서 두 맵을 분리하되 **같은 파일에 붙여 둔다** —
 * `Record<AdminReasonValue, …>`라 새 사유를 추가하면 유저 라벨을 빠뜨린 순간
 * 타입 에러가 난다.
 *
 * `null`은 "유저에게 보여줄 사유가 없음"이며 호출부는 괄호째 생략한다
 * (`other`는 자유 입력 분류라 코드만으로는 알려줄 정보가 없다).
 */
const USER_FACING_REASON_LABEL: Record<AdminReasonValue, string | null> = {
  cs_compensation: d.points.reasonCsCompensation,
  error_correction: d.points.reasonErrorCorrection,
  event_promotion: d.points.reasonEventPromotion,
  abuse_reclaim: d.points.reasonAbuseReclaim,
  retroactive_adjustment: d.points.reasonRetroactiveAdjustment,
  other: null,
}

/**
 * 유저 화면에 노출할 사유 라벨. 없으면 `null`(→ 호출부가 괄호를 뺀다).
 *
 * 모르는 코드는 **그대로 노출하지 않는다** — `adminReasonLabel()`은 감사 목적이라
 * 원문 코드를 폴백으로 쓰지만, 유저 화면에서는 코드가 새어 나가는 것보다
 * 사유를 생략하는 편이 낫다.
 */
export function userFacingReasonLabel(value: string | null | undefined): string | null {
  if (!value) return null
  if (!isValidAdminReason(value)) return null
  return USER_FACING_REASON_LABEL[value]
}

/**
 * 고액 지급/회수 기준액. 이 값(절대값) 이상이면:
 *  - 프론트: 확인 팝업
 *  - 서버 API: 요청 바디에 confirmed:true가 없으면 422 거부
 *  - 대시보드: "최근 고액 지급/회수" 목록에 노출(사후 감사)
 */
export const HIGH_VALUE_THRESHOLD = 1000
