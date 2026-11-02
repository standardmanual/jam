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
  id: string
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

/** 노출이 시작된 지 이 시간이 안 된 카드는 «새 카드»로 보고 맨 앞에 둔다(티켓 20261102_1720). */
export const NEW_CARD_WINDOW_MS = 24 * 3600_000

/** 문자열 → 32비트 부호 없는 정수 해시(FNV-1a). 섞기 키로만 쓴다. */
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

export interface HomeSortOptions {
  /** 섞기 씨앗. 홈은 `${유저id}:${KST날짜}`라 같은 유저는 하루 안에 순서가 같고 날짜·유저가 바뀌면 달라진다 */
  seed: string
  /** 새 카드 판정 기준 시각 */
  now: Date
}

/**
 * 홈 정렬 (티켓 20261102_1720). 두 묶음으로 나눈다.
 * ① 새 카드: 노출 시작 후 24시간이 안 된 카드. `starts_at` 내림차순, 같은 시각이면 같은 씨앗 순서로 섞는다.
 * ② 나머지: `seed + card.id` 해시 순으로 하루 단위 결정적 섞기. `sort_order`는 순서에 쓰지 않는다(맨 위 고정을 없애기 위해).
 * 같은 키일 때만 `sort_order` 오름차순, 그다음 `id`로 정한다 — 입력 순서와 무관하게 같은 결과가 나온다.
 * 입력을 바꾸지 않는다.
 */
export function sortHomeCards<T extends SortableHomeCard>(cards: readonly T[], options: HomeSortOptions): T[] {
  const nowMs = options.now.getTime()
  const byId = (a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const tiebreak = (a: T, b: T) => a.sort_order - b.sort_order || byId(a, b)

  const fresh: Array<{ card: T; key: number }> = []
  const rest: Array<{ card: T; key: number }> = []
  for (const card of cards) {
    const age = nowMs - Date.parse(card.starts_at)
    const entry = { card, key: fnv1a32(`${options.seed}:${card.id}`) }
    if (age >= 0 && age < NEW_CARD_WINDOW_MS) fresh.push(entry)
    else rest.push(entry)
  }

  // 새 카드 안에서도 같은 시각에 시작한 카드는 씨앗 순서로 섞는다. 한꺼번에 등록한 카드가 늘 같은 순서로 나오지 않게 한다.
  fresh.sort((a, b) => Date.parse(b.card.starts_at) - Date.parse(a.card.starts_at) || a.key - b.key || tiebreak(a.card, b.card))
  rest.sort((a, b) => a.key - b.key || tiebreak(a.card, b.card))
  return [...fresh, ...rest].map(({ card }) => card)
}
