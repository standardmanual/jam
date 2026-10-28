/**
 * 트렌드 출처 상수 (티켓 20261026_2033 1회차, 어드민 상황판 PRD §6.4)
 *
 * 종류 값은 `ops_trend_sources.kind`의 CHECK와 같다. 길이 상한도 SQL(296)과 같은 값이다.
 */
export const OPS_TREND_SOURCE_KINDS = ['hashtag', 'channel', 'search_trend', 'manual_upload', 'repo_folder'] as const

export type OpsTrendSourceKind = (typeof OPS_TREND_SOURCE_KINDS)[number]

/** 화면에 보이는 종류 이름. */
export const OPS_TREND_SOURCE_KIND_LABELS: Record<OpsTrendSourceKind, string> = {
  hashtag: '해시태그',
  channel: '채널',
  search_trend: '검색어 추이',
  manual_upload: '직접 올린 자료',
  repo_folder: '저장소 폴더',
}

/**
 * 저장소 폴더 종류(`repo_folder`)의 위치로 받는 폴더 목록 (티켓 20261028_1426).
 * 서버는 배포본이라 저장소 파일을 열 수 없어서 글자 단위로 같은 값만 받는다. 폴더를 더하는 일은 코드 변경이다.
 */
export const OPS_TREND_SOURCE_FOLDERS = ['docs/operations/trendresearch/'] as const

export type OpsTrendSourceFolder = (typeof OPS_TREND_SOURCE_FOLDERS)[number]

/** 출처 이름 길이 상한(글자, 앞뒤 공백 제외). */
export const OPS_TREND_SOURCE_MAX_NAME = 60
/** 위치(주소·해시태그·검색어) 길이 상한(글자). */
export const OPS_TREND_SOURCE_MAX_LOCATION = 300
/** 출처 등록·수정 요청 본문 상한(바이트). */
export const OPS_TREND_SOURCE_MAX_BODY_BYTES = 8192
