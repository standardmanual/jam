/**
 * 개발 요청 상수 (티켓 20261026_2027 1회차, 어드민 상황판 PRD §8)
 *
 * 허용값과 길이 상한은 `ops_dev_requests`의 CHECK(SQL 297)와 같은 값이다.
 */
export const DEV_REQUEST_ORIGINS = ['ops', 'eco', 'other'] as const

export type DevRequestOrigin = (typeof DEV_REQUEST_ORIGINS)[number]

/** 화면에 보이는 출처 이름. */
export const DEV_REQUEST_ORIGIN_LABELS: Record<DevRequestOrigin, string> = {
  ops: '운영에서',
  eco: '생태계에서',
  other: '그 밖',
}

export const DEV_REQUEST_STATUSES = ['requested', 'ticketed', 'dismissed'] as const

export type DevRequestStatus = (typeof DEV_REQUEST_STATUSES)[number]

/** 제목 길이 상한(글자, 앞뒤 공백 제외). */
export const DEV_REQUEST_MAX_TITLE = 80
/** 내용 길이 상한(글자). */
export const DEV_REQUEST_MAX_DETAIL = 2000
/** 정책 ID 길이 상한(글자). */
export const DEV_REQUEST_MAX_POLICY_ID = 100
/** 요청 생성·수정 본문 상한(바이트). */
export const DEV_REQUEST_MAX_BODY_BYTES = 16384
/** 목록 한 번에 읽는 최대 개수. */
export const DEV_REQUEST_LIST_LIMIT = 200
