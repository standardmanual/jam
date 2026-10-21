/**
 * 계정을 지울 때 보관 표(`retained_records`)로 복사하는 기록의 종류와 기간(티켓 20261021_1249 1회, 운영 로직 17장).
 *
 * 복사와 기간 판정은 DB 함수 `prepare_account_deletion`(마이그레이션 263)이 한다. 이 파일의 기간은 미리보기에서
 * 복사될 건수를 세는 데만 쓰며, 함수의 `INTERVAL`과 같아야 한다 — 같은지는 `__tests__/retention.test.ts`가 SQL 파일을 읽어 확인한다.
 * 기간은 위치정보 이용약관 제5조(확인자료 6개월)와 개인정보 처리방침(부정 이용 탐지 기록 3개월)을 따른다.
 * 법무 확인(티켓 20260929_1303)에서 바뀌면 이 상수와 263의 함수를 함께 고친다.
 */

/** `retained_records.kind`와 같은 값 */
export const RETAINED_KINDS = ['checkin_earn', 'poi_view', 'poi_drop', 'poi_pickup', 'abuse_log'] as const

export type RetainedKind = (typeof RETAINED_KINDS)[number]

/** 위치정보 확인자료(체크인 배지 획득·장소 열람·드랍과 픽업)의 보관 개월 수 */
export const CONFIRMATION_RETENTION_MONTHS = 6

/** 부정 이용 탐지 기록의 보관 개월 수 */
export const ABUSE_LOG_RETENTION_MONTHS = 3

export const RETENTION_MONTHS: Record<RetainedKind, number> = {
  checkin_earn: CONFIRMATION_RETENTION_MONTHS,
  poi_view: CONFIRMATION_RETENTION_MONTHS,
  poi_drop: CONFIRMATION_RETENTION_MONTHS,
  poi_pickup: CONFIRMATION_RETENTION_MONTHS,
  abuse_log: ABUSE_LOG_RETENTION_MONTHS,
}

/** `now`에서 `months`개월 전 시각(ISO). 이 시각 이후의 기록만 보관 대상이다 */
export function retentionSince(now: Date, months: number): string {
  const since = new Date(now)
  since.setUTCMonth(since.getUTCMonth() - months)
  return since.toISOString()
}
