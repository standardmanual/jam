/**
 * 랭킹 규칙 목록의 정렬 규칙(티켓 20260924_0947) — 목록 페이지(서버)와 표의 정렬 드롭다운
 * (클라이언트)이 같은 값을 쓰도록 한 곳에 둔다. 서버가 모르는 값을 고를 수 없어야 한다.
 */
export const RANKING_MODE_SORT_OPTIONS = [
  { value: 'created_desc', label: '최근 등록순' },
  { value: 'title_asc', label: '제목 가나다순' },
  { value: 'title_desc', label: '제목 역순' },
] as const

export type RankingModeSort = (typeof RANKING_MODE_SORT_OPTIONS)[number]['value']

export const DEFAULT_RANKING_MODE_SORT: RankingModeSort = 'created_desc'

export function parseRankingModeSort(raw: string | undefined): RankingModeSort {
  return RANKING_MODE_SORT_OPTIONS.some((o) => o.value === raw) ? (raw as RankingModeSort) : DEFAULT_RANKING_MODE_SORT
}

/** 정렬 값 → [컬럼, 오름차순 여부] — `id`를 보조 정렬로 붙이는 것은 호출부가 한다 */
export const RANKING_MODE_SORT_COLUMN: Record<RankingModeSort, readonly [string, boolean]> = {
  created_desc: ['created_at', false],
  title_asc: ['title', true],
  title_desc: ['title', false],
}
