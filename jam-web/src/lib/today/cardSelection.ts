/**
 * 홈피드 카드 노출 판정 — 순수 함수 (티켓 20261026_2025 1회차).
 *
 * `getTodayCards`(`lib/today/cards.ts`)의 SQL(`is_active`·`starts_at`·`ends_at`·`overlaps('exposure_tags')`·정렬)과
 * 같은 규칙이다. 한쪽을 바꾸면 다른 쪽도 바꾼다. 어드민 홈피드 미리보기(`lib/admin/homePreview/load.ts`)가 날짜마다
 * 메모리에서 이 함수들로 카드를 고른다 — 미리보기 전용 판정을 따로 두지 않기 위해서다.
 *
 * 서버 전용 모듈을 가져오지 않는다(Supabase 의존 없음).
 */

/** 기간 판정에 쓰는 카드 칸 */
export interface LiveWindowCard {
  is_active: boolean
  starts_at: string
  ends_at: string
}

/** 정렬에 쓰는 카드 칸 */
export interface SortableHomeCard {
  sort_order: number
  starts_at: string
}

/**
 * 카드가 [startIso, endIso] 구간에 한 순간이라도 노출되는가.
 * `is_active`가 참이고 `starts_at ≤ endIso`이며 `ends_at ≥ startIso`다(경계 포함).
 * 홈 조회는 구간이 한 시점(now)이고, 미리보기는 KST 하루다.
 */
export function cardIsLiveDuring(card: LiveWindowCard, startIso: string, endIso: string): boolean {
  if (!card.is_active) return false
  return Date.parse(card.starts_at) <= Date.parse(endIso) && Date.parse(card.ends_at) >= Date.parse(startIso)
}

/**
 * 카드의 노출 태그가 유저 태그와 하나라도 겹치는가(OR, SQL `exposure_tags && tags`).
 * `all`은 유저 태그에 늘 들어 있으므로 `all`이 붙은 카드는 기간만 맞으면 보인다.
 * 카드 태그나 유저 태그가 비어 있으면 겹칠 수 없어 거짓이다.
 */
export function cardMatchesTags(cardTags: readonly string[] | null | undefined, viewerTags: readonly string[]): boolean {
  if (!cardTags || cardTags.length === 0 || viewerTags.length === 0) return false
  const set = new Set(viewerTags)
  return cardTags.some((tag) => set.has(tag))
}

/** 홈 정렬: `sort_order` 오름차순, 같으면 `starts_at` 내림차순. 입력을 바꾸지 않고, 같은 키는 원래 순서를 지킨다(안정 정렬). */
export function sortHomeCards<T extends SortableHomeCard>(cards: readonly T[]): T[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      if (a.card.sort_order !== b.card.sort_order) return a.card.sort_order - b.card.sort_order
      const byStart = Date.parse(b.card.starts_at) - Date.parse(a.card.starts_at)
      return byStart !== 0 ? byStart : a.index - b.index
    })
    .map(({ card }) => card)
}
