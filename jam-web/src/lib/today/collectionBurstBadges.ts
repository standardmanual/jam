/**
 * 컬렉션 소개 카드(`collection_intro`)가 대표 그림 뒤로 퍼뜨릴 아이템 배지를 고르는 규칙 (티켓 20261121_0115, 20261122_2224 7회차).
 *
 * 홈(`cards.ts`의 `fetchCollectionsById`)과 어드민 서버(`feedCardServer.ts`의 그림 색 입력)가 같은 4개 배지를 보도록 선택 규칙을 이 한 곳에 둔다.
 * `cards.ts`는 Supabase 서버 모듈을 값으로 가져오고 `feedCardServer.ts`는 그것을 가져올 수 없어(번들 경계) 순수 함수만 따로 뺐다.
 */

/** 컬렉션 소개 카드가 쓰는 아이템 배지 그림의 최대 개수(둘레로 퍼지는 자리 수와 같다). */
export const COLLECTION_BURST_BADGE_LIMIT = 4

export interface CollectionItemBadgeRow {
  id: string
  item_book_id: string | null
  type?: string
  name: string | null
  image_url?: string | null
}

export interface PickedCollectionBadge {
  id: string
  name: string
  image_url: string
}

/**
 * 컬렉션마다 아이템 배지(`type` item) 그림을 최대 `COLLECTION_BURST_BADGE_LIMIT`개 고른다. 그림이 없는 배지와 이름이 같은 배지(등급형 컬렉션의 다른 등급)는 건너뛴다.
 * 조회 결과의 순서는 정해져 있지 않으므로 이름·id 순으로 정렬해 같은 컬렉션이 늘 같은 배지를 고르게 한다.
 */
export function pickCollectionItemBadges(rows: readonly CollectionItemBadgeRow[]): Map<string, PickedCollectionBadge[]> {
  const byBook = new Map<string, PickedCollectionBadge[]>()
  for (const row of rows) {
    const imageUrl = row.image_url?.trim()
    // 체크인 배지도 컬렉션 완성 판정의 분모라 같이 읽히지만 퍼지는 것은 아이템 배지만이다
    if (row.type !== 'item' || !row.item_book_id || !row.name || !imageUrl) continue
    const list = byBook.get(row.item_book_id) ?? []
    list.push({ id: row.id, name: row.name, image_url: imageUrl })
    byBook.set(row.item_book_id, list)
  }
  const result = new Map<string, PickedCollectionBadge[]>()
  for (const [bookId, list] of byBook) {
    const seen = new Set<string>()
    const picked: PickedCollectionBadge[] = []
    for (const item of list.sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id))) {
      if (seen.has(item.name)) continue
      seen.add(item.name)
      picked.push(item)
      if (picked.length >= COLLECTION_BURST_BADGE_LIMIT) break
    }
    result.set(bookId, picked)
  }
  return result
}
