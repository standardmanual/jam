/**
 * 트렌드 출처 상수 (티켓 20261026_2033 1회차, 어드민 상황판 PRD §6.4)
 *
 * 종류 값은 `ops_trend_sources.kind`의 CHECK와 같다. 길이 상한도 SQL(296)과 같은 값이다.
 */
export const OPS_TREND_SOURCE_KINDS = ['hashtag', 'channel', 'search_trend', 'manual_upload'] as const

export type OpsTrendSourceKind = (typeof OPS_TREND_SOURCE_KINDS)[number]

/** 화면에 보이는 종류 이름. */
export const OPS_TREND_SOURCE_KIND_LABELS: Record<OpsTrendSourceKind, string> = {
  hashtag: '해시태그',
  channel: '채널',
  search_trend: '검색어 추이',
  manual_upload: '직접 올린 자료',
}

/** 출처 이름 길이 상한(글자, 앞뒤 공백 제외). */
export const OPS_TREND_SOURCE_MAX_NAME = 60
/** 위치(주소·해시태그·검색어) 길이 상한(글자). */
export const OPS_TREND_SOURCE_MAX_LOCATION = 300
/** 출처 등록·수정 요청 본문 상한(바이트). */
export const OPS_TREND_SOURCE_MAX_BODY_BYTES = 8192
